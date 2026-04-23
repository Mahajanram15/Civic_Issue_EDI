import { useState, useEffect, useMemo } from 'react';
import { BarChart3, AlertTriangle, CheckCircle2, Clock, Loader2, Users, Eye, Send, XCircle, ShieldCheck, ImageIcon } from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { ImageModal, useImageModal } from '@/components/ui/ImageModal';
import { ImageComparisonSlider } from '@/components/issues/ImageComparisonSlider';
import { getAdminIssues, getWorkers, createNotification, assignIssue, adminUpdateStatus, sendResolutionToUser } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

const ISSUE_TYPE_LABELS: Record<string, string> = {
  pothole: 'Pothole', garbage: 'Garbage', broken_streetlight: 'Streetlight',
  water_leak: 'Water Leak', road_damage: 'Road Damage', other: 'Other',
};
const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending', assigned: 'Assigned', in_progress: 'In Progress', resolved: 'Resolved', rejected: 'Rejected',
};

const WORKER_STATUS_LABELS: Record<string, string> = {
  in_progress: 'In Progress',
  work_done: 'Work Done',
};

const PIE_COLORS = [
  'hsl(210, 80%, 55%)', 'hsl(150, 60%, 45%)', 'hsl(35, 90%, 55%)',
  'hsl(0, 70%, 55%)', 'hsl(270, 60%, 55%)', 'hsl(190, 70%, 45%)',
];

export default function AdminDashboard() {
  const { user } = useAuth();
  const [issues, setIssues] = useState<Tables<'issues'>[]>([]);
  const [workers, setWorkers] = useState<Tables<'profiles'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deptFilter, setDeptFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [assignDialogOpen, setAssignDialogOpen] = useState<string | null>(null);
  const [detailIssue, setDetailIssue] = useState<Tables<'issues'> | null>(null);
  const [sendingResolution, setSendingResolution] = useState(false);

  // Fullscreen image modal
  const { modalSrc, modalAlt, isOpen: imageModalOpen, openModal, closeModal: closeImageModal } = useImageModal();

  const loadData = async () => {
    try {
      setLoadError(null);
      const start = performance.now();
      const [issuesData, workersData] = await Promise.all([getAdminIssues(), getWorkers()]);
      console.info(`[Admin Dashboard] Data loaded in ${Math.round(performance.now() - start)}ms — ${issuesData.length} issues, ${workersData.length} workers`);
      setIssues(issuesData);
      setWorkers(workersData);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load dashboard data';
      setLoadError(message);
      toast.error(message);
      // Keep existing data if we have some (don't reset to empty on refresh failures)
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    const channel = supabase.channel('admin-issues')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'issues' }, () => loadData())
      .subscribe();

    const intervalId = window.setInterval(loadData, 30_000);
    const onFocus = () => loadData();
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      supabase.removeChannel(channel);
    };
  }, []);

  const issueTypeData = useMemo(() => {
    const counts: Record<string, number> = {};
    issues.forEach(i => {
      const issueType = i.issue_type || 'other';
      counts[issueType] = (counts[issueType] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name: ISSUE_TYPE_LABELS[name] || name, value,
    }));
  }, [issues]);

  const deptData = useMemo(() => {
    const counts: Record<string, { total: number; resolved: number; pending: number }> = {};
    issues.forEach(i => {
      const dept = i.department || 'Under Processing';
      if (!counts[dept]) counts[dept] = { total: 0, resolved: 0, pending: 0 };
      counts[dept].total++;
      if (i.status === 'resolved') counts[dept].resolved++;
      if (i.status === 'pending') counts[dept].pending++;
    });
    return Object.entries(counts).map(([name, data]) => ({
      name: name.replace(' Department', ''),
      ...data,
    }));
  }, [issues]);

  const handleAssign = async (issueId: string, workerId: string) => {
    try {
      const issue = issues.find(i => i.id === issueId);
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Authentication required');
      await assignIssue(issueId, workerId, accessToken);

      // Reflect assignment instantly in admin portal while realtime catches up.
      setIssues((prev) => prev.map((i) => (
        i.id === issueId ? { ...i, assigned_worker_id: workerId, status: 'assigned' } : i
      )));

      if (issue) {
        const results = await Promise.allSettled([
          createNotification({
            user_id: issue.user_id,
            message: `Your issue "${issue.description.slice(0, 50)}..." has been assigned to a worker.`,
            issue_id: issueId,
          }),
          createNotification({
            user_id: workerId,
            message: `You have been assigned a new task: "${issue.description.slice(0, 50)}..."`,
            issue_id: issueId,
          }),
        ]);

        if (results.some((r) => r.status === 'rejected')) {
          toast.warning('Issue assigned, but one or more notifications failed');
        }
      }

      toast.success('Worker assigned successfully');
      setAssignDialogOpen(null);
      loadData();
    } catch { toast.error('Failed to assign'); }
  };

  const handleStatusChange = async (issueId: string, status: 'pending' | 'assigned' | 'in_progress' | 'resolved' | 'rejected') => {
    try {
      if (!user) return;
      const issue = issues.find(i => i.id === issueId);

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Authentication required');

      const next = await adminUpdateStatus({ issue_id: issueId, status }, accessToken);
      setIssues((prev) => prev.map((i) => (i.id === issueId ? next : i)));

      // Also update the detail modal if it's open for this issue
      if (detailIssue?.id === issueId) {
        setDetailIssue(next);
      }

      const statusLabel = STATUS_LABELS[status];
      await createNotification({ user_id: issue!.user_id, message: `Your issue "${issue!.description.slice(0, 50)}..." status updated to ${statusLabel}.`, issue_id: issueId });
      toast.success('Status updated!');
      loadData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update';
      toast.error(message);
    }
  };

  const handleSendResolution = async (issue: Tables<'issues'>) => {
    setSendingResolution(true);
    try {
      await sendResolutionToUser(issue);
      toast.success('Resolution sent to user successfully!');
    } catch {
      toast.error('Failed to send resolution');
    } finally {
      setSendingResolution(false);
    }
  };

  const filtered = issues.filter(i => {
    if (deptFilter !== 'all' && i.department !== deptFilter) return false;
    if (statusFilter !== 'all' && i.status !== statusFilter) return false;
    return true;
  });

  const stats = {
    total: issues.length,
    pending: issues.filter(i => i.status === 'pending').length,
    inProgress: issues.filter(i => i.status === 'in_progress').length,
    resolved: issues.filter(i => i.status === 'resolved').length,
  };

  // Show dashboard layout immediately — with inline loader inside cards if still loading
  const showSkeleton = loading && issues.length === 0;

  return (
    <div className="container py-10">
      <div className="mb-10">
        <h1 className="font-heading text-3xl font-bold tracking-tight">Issue Management Dashboard</h1>
        <p className="mt-1.5 text-muted-foreground">Reported Issues Overview — AI Classification &amp; Worker Assignment</p>
      </div>

      {loadError && (
        <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 p-4 flex items-center justify-between">
          <p className="text-sm text-destructive">{loadError}</p>
          <Button size="sm" variant="outline" onClick={loadData}>Retry</Button>
        </div>
      )}

      {showSkeleton ? (
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse">
              <CardContent className="flex h-24 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Total Issues" value={stats.total} icon={BarChart3} color="text-primary" />
          <StatCard label="Pending" value={stats.pending} icon={Clock} color="text-warning" />
          <StatCard label="In Progress" value={stats.inProgress} icon={AlertTriangle} color="text-info" />
          <StatCard label="Resolved" value={stats.resolved} icon={CheckCircle2} color="text-success" />
        </div>
      )}

      {/* Charts Section */}
      <div className="mb-8 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">AI Classification Insights</CardTitle>
          </CardHeader>
          <CardContent>
            {issueTypeData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={issueTypeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="none"
                  >
                    {issueTypeData.map((_, idx) => (
                      <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.75rem',
                      fontSize: '0.8rem',
                      color: 'hsl(var(--card-foreground))',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}
                    labelStyle={{ color: 'hsl(var(--card-foreground))' }}
                    itemStyle={{ color: 'hsl(var(--card-foreground))' }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: '0.75rem' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg font-semibold">Department Workload Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {deptData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={deptData} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={false}
                    tickLine={false}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '0.75rem',
                      fontSize: '0.8rem',
                      color: 'hsl(var(--card-foreground))',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}
                    labelStyle={{ color: 'hsl(var(--card-foreground))' }}
                    itemStyle={{ color: 'hsl(var(--card-foreground))' }}
                  />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '0.75rem' }} />
                  <Bar dataKey="total" name="Total" fill="hsl(210, 80%, 55%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="resolved" name="Resolved" fill="hsl(150, 60%, 45%)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending" name="Pending" fill="hsl(35, 90%, 55%)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mb-6 flex flex-wrap gap-3">
        <Select value={deptFilter} onValueChange={setDeptFilter}>
          <SelectTrigger className="w-52 rounded-xl"><SelectValue placeholder="Department" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Departments</SelectItem>
            <SelectItem value="Roads Department">Roads</SelectItem>
            <SelectItem value="Waste Management">Waste Management</SelectItem>
            <SelectItem value="Electricity Department">Electricity</SelectItem>
            <SelectItem value="Water Supply Department">Water Supply</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-44 rounded-xl"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="assigned">Assigned</SelectItem>
            <SelectItem value="in_progress">In Progress</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="glass-card overflow-hidden rounded-2xl">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Type</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Description</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Department</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Priority</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Worker Status</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(issue => (
              <TableRow key={issue.id} className={cn('border-border/30 transition-colors hover:bg-muted/30', issue.worker_status === 'work_done' && 'bg-info/5')}>
                <TableCell>
                  <Badge variant="secondary" className="rounded-full text-xs font-medium">
                    {ISSUE_TYPE_LABELS[issue.issue_type || 'other'] || issue.issue_type || 'other'}
                  </Badge>
                </TableCell>
                <TableCell className="max-w-xs truncate text-sm text-foreground/80">{issue.description}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{issue.department || 'Under Processing'}</TableCell>
                <TableCell>
                  <PriorityBadge score={issue.priority_score ?? 0} showScore />
                </TableCell>
                <TableCell>
                  <Select defaultValue={issue.status} onValueChange={v => handleStatusChange(issue.id, v as 'pending' | 'assigned' | 'in_progress' | 'resolved' | 'rejected')}>
                    <SelectTrigger className="h-8 w-36 rounded-lg text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="assigned">Assigned</SelectItem>
                      <SelectItem value="in_progress">In Progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {issue.worker_status ? (
                    <Badge variant={issue.worker_status === 'work_done' ? 'default' : 'secondary'} className="rounded-full text-xs">
                      {WORKER_STATUS_LABELS[issue.worker_status] || issue.worker_status}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {/* View Details Button */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 rounded-md px-2 text-xs gap-1"
                      onClick={() => setDetailIssue(issue)}
                    >
                      <Eye className="h-3 w-3" /> Details
                    </Button>

                    {/* Assign Button */}
                    <Dialog open={assignDialogOpen === issue.id} onOpenChange={open => setAssignDialogOpen(open ? issue.id : null)}>
                      <DialogTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1.5 rounded-lg text-xs">
                          <Users className="h-3 w-3" /> {issue.assigned_worker_id ? 'Reassign' : 'Assign'}
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="rounded-2xl">
                        <DialogHeader><DialogTitle>Assign Worker</DialogTitle></DialogHeader>
                        <div className="space-y-2">
                          {workers.length === 0 ? (
                            <p className="py-4 text-center text-sm text-muted-foreground">No workers available.</p>
                          ) : workers.map(w => (
                            <Button key={w.user_id} variant="outline" className="w-full justify-start rounded-xl" onClick={() => handleAssign(issue.id, w.user_id)}>
                              <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                                {(w.name?.charAt(0) || '?').toUpperCase()}
                              </div>
                              <div className="text-left">
                                <p className="text-sm font-medium">{w.name}</p>
                                <p className="text-xs text-muted-foreground">{w.email}</p>
                              </div>
                            </Button>
                          ))}
                        </div>
                      </DialogContent>
                    </Dialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ── Issue Detail Modal ─────────────────────────────────────── */}
      <Dialog open={!!detailIssue} onOpenChange={open => { if (!open) setDetailIssue(null); }}>
        <DialogContent className="rounded-2xl sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          {detailIssue && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-primary" />
                  Issue Details
                </DialogTitle>
                <DialogDescription>
                  {ISSUE_TYPE_LABELS[detailIssue.issue_type || 'other'] || detailIssue.issue_type || 'Other'} — {detailIssue.department || 'Under Processing'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-6 pt-2">
                {/* Issue metadata */}
                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={detailIssue.status} />
                  {detailIssue.worker_status && (
                    <Badge variant={detailIssue.worker_status === 'work_done' ? 'default' : 'secondary'} className="rounded-full text-xs">
                      Worker: {WORKER_STATUS_LABELS[detailIssue.worker_status] || detailIssue.worker_status}
                    </Badge>
                  )}
                  {detailIssue.verified_by_admin && (
                    <Badge className="rounded-full text-xs bg-green-600 text-white gap-1">
                      <ShieldCheck className="h-3 w-3" /> Verified
                    </Badge>
                  )}
                  <span className={cn('text-sm font-bold flex items-center gap-1', (detailIssue.priority_score ?? 0) >= 80 ? 'text-priority-high' : (detailIssue.priority_score ?? 0) >= 50 ? 'text-priority-medium' : 'text-priority-low')}>
                    <AlertTriangle className="h-3.5 w-3.5" /> Priority: {detailIssue.priority_score ?? '-'}
                  </span>
                </div>

                <p className="text-sm leading-relaxed text-foreground/80">{detailIssue.description}</p>

                {/* Before / After Image Comparison */}
                <div>
                  <h3 className="mb-3 text-sm font-semibold flex items-center gap-2">
                    <ImageIcon className="h-4 w-4 text-primary" />
                    Before &amp; After Comparison
                  </h3>
                  <ImageComparisonSlider
                    beforeSrc={detailIssue.image_url}
                    afterSrc={detailIssue.resolution_image_url || null}
                    onImageClick={openModal}
                  />
                </div>

                {/* Admin Actions */}
                <div className="flex flex-wrap gap-2 border-t border-border/50 pt-4">
                  {/* Verify & Approve — only show when work_done and not yet resolved */}
                  {detailIssue.worker_status === 'work_done' && detailIssue.status !== 'resolved' && (
                    <>
                      <Button
                        size="sm"
                        className="gap-1.5 rounded-lg"
                        onClick={() => handleStatusChange(detailIssue.id, 'resolved')}
                      >
                        <CheckCircle2 className="h-4 w-4" /> Verify &amp; Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1.5 rounded-lg"
                        onClick={() => handleStatusChange(detailIssue.id, 'rejected')}
                      >
                        <XCircle className="h-4 w-4" /> Reject
                      </Button>
                    </>
                  )}

                  {/* Send Resolution to User — only when resolved */}
                  {detailIssue.status === 'resolved' && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 rounded-lg"
                      onClick={() => handleSendResolution(detailIssue)}
                      disabled={sendingResolution}
                    >
                      {sendingResolution ? (
                        <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                      ) : (
                        <><Send className="h-4 w-4" /> Send Resolution to User</>
                      )}
                    </Button>
                  )}
                </div>

                {/* Verified info */}
                {detailIssue.verified_by_admin && detailIssue.verified_at && (
                  <p className="text-xs text-muted-foreground">
                    ✅ Verified at {new Date(detailIssue.verified_at).toLocaleString()}
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Fullscreen Image Modal ─────────────────────────────────── */}
      <ImageModal src={modalSrc} alt={modalAlt} open={imageModalOpen} onClose={closeImageModal} />
    </div>
  );
}