import { useState, useEffect, useCallback, useRef } from 'react';
import { Wrench, MapPin, AlertTriangle, Loader2, ClipboardList, Clock, CheckCircle2, Upload, X, Camera } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { ImageModal, useImageModal } from '@/components/ui/ImageModal';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext';
import { getWorkerIssues, workerUpdateStatus, createNotification, uploadIssueImage } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import type { Tables } from '@/integrations/supabase/types';

const ISSUE_TYPE_LABELS: Record<string, string> = {
  pothole: 'Pothole', garbage: 'Garbage Overflow', broken_streetlight: 'Broken Streetlight',
  water_leak: 'Water Leakage', road_damage: 'Road Damage', other: 'Other',
};

const WORKER_STATUS_LABELS: Record<string, string> = {
  in_progress: 'In Progress',
  work_done: 'Work Done',
};

/** Truncate text to a max length with ellipsis */
function truncate(text: string, maxLen = 80): string {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + '…';
}

export default function WorkerDashboard() {
  const { user, profile } = useAuth();
  const [tasks, setTasks] = useState<Tables<'issues'>[]>([]);
  const [loading, setLoading] = useState(true);

  // Fullscreen image modal
  const { modalSrc, modalAlt, isOpen, openModal, closeModal } = useImageModal();

  // Modal state for proof upload
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [proofIssueId, setProofIssueId] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [proofComment, setProofComment] = useState('');
  const [proofSubmitting, setProofSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadTasks = useCallback(() => {
    if (!user) {
      setTasks([]);
      setLoading(false);
      return;
    }

    getWorkerIssues(user.id, profile?.id)
      .then(setTasks)
      .catch(() => {
        setTasks([]);
        toast.error('Failed to load assigned tasks');
      })
      .finally(() => setLoading(false));
  }, [profile?.id, user]);

  useEffect(() => {
    loadTasks();
    if (!user) return;

    const workerIds = profile?.id && profile.id !== user.id ? [user.id, profile.id] : [user.id];

    const channel = supabase.channel('worker-tasks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'issues' }, (payload) => {
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
          const next = payload.new as Tables<'issues'>;
          const belongsToWorker = !!next.assigned_worker_id && workerIds.includes(next.assigned_worker_id);

          if (belongsToWorker) {
            setTasks((prev) => {
              const remaining = prev.filter((task) => task.id !== next.id);
              return [next, ...remaining];
            });
          } else {
            setTasks((prev) => prev.filter((task) => task.id !== next.id));
          }
        }

        if (payload.eventType === 'DELETE') {
          const removedId = (payload.old as { id?: string }).id;
          if (removedId) {
            setTasks((prev) => prev.filter((task) => task.id !== removedId));
          }
        }

        loadTasks();
      })
      .subscribe();

    const intervalId = window.setInterval(loadTasks, 30_000);
    const onFocus = () => loadTasks();
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      supabase.removeChannel(channel);
    };
  }, [loadTasks, profile?.id, user]);

  const handleWorkerStatusChange = async (issueId: string, workerStatus: 'in_progress' | 'work_done') => {
    // For work_done, open the proof upload modal instead of direct submit
    if (workerStatus === 'work_done') {
      setProofIssueId(issueId);
      setProofFile(null);
      setProofPreview(null);
      setProofComment('');
      setProofModalOpen(true);
      return;
    }

    try {
      const issue = tasks.find(t => t.id === issueId);
      if (!user) return;

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Authentication required');

      await workerUpdateStatus({ issue_id: issueId, worker_status: workerStatus }, accessToken);

      const { data: adminProfiles } = await supabase.from('profiles').select('user_id').eq('role', 'admin');
      if (adminProfiles) {
        for (const admin of adminProfiles) {
          await createNotification({
            user_id: admin.user_id,
            message: `Worker updated task progress to ${WORKER_STATUS_LABELS[workerStatus]}: "${issue!.description.slice(0, 50)}..."`,
            issue_id: issueId,
          });
        }
      }

      toast.success('Work progress updated');
      loadTasks();
    } catch { toast.error('Failed'); }
  };

  const handleProofImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setProofFile(file);
      const reader = new FileReader();
      reader.onload = () => setProofPreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleProofSubmit = async () => {
    if (!proofFile || !proofIssueId || !user) return;
    setProofSubmitting(true);

    try {
      const issue = tasks.find(t => t.id === proofIssueId);

      // 1. Upload proof image to Supabase Storage
      const afterImageUrl = await uploadIssueImage(proofFile, user.id);

      // 2. Get access token
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error('Authentication required');

      // 3. Update status with after_image_url
      await workerUpdateStatus({
        issue_id: proofIssueId,
        worker_status: 'work_done',
        after_image_url: afterImageUrl,
      }, accessToken);

      // 4. Notify admins
      const { data: adminProfiles } = await supabase.from('profiles').select('user_id').eq('role', 'admin');
      if (adminProfiles) {
        const commentNote = proofComment.trim() ? ` Worker note: "${proofComment.trim().slice(0, 100)}"` : '';
        for (const admin of adminProfiles) {
          await createNotification({
            user_id: admin.user_id,
            message: `Worker marked task as work done with proof image: "${issue!.description.slice(0, 50)}..." — awaiting your verification.${commentNote}`,
            issue_id: proofIssueId,
          });
        }
      }

      toast.success('Proof uploaded! Marked as work done. Waiting for admin approval.');
      setProofModalOpen(false);
      loadTasks();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to submit proof';
      toast.error(message);
    } finally {
      setProofSubmitting(false);
    }
  };

  const isFirstLoad = loading && tasks.length === 0;

  return (
    <div className="container py-10">
      <div className="mb-10 flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-bg text-primary-foreground shadow-sm">
          <Wrench className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">Assigned Tasks</h1>
          <p className="text-muted-foreground">Pending Field Work &amp; Completion Tracking</p>
        </div>
      </div>

      {isFirstLoad ? (
        <div className="mb-8 grid grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse rounded-2xl bg-muted/60 h-24" />
          ))}
        </div>
      ) : (
        <div className="mb-8 grid grid-cols-3 gap-4">
          <StatCard label="Total Assigned Tasks" value={tasks.length} icon={ClipboardList} color="text-primary" />
          <StatCard label="Active Field Work" value={tasks.filter(t => t.worker_status === 'in_progress').length} icon={Clock} color="text-warning" />
          <StatCard label="Submitted for Approval" value={tasks.filter(t => t.worker_status === 'work_done' && t.status !== 'resolved').length} icon={CheckCircle2} color="text-success" />
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center py-24 text-center">
          <div className="mb-4 rounded-2xl bg-muted/60 p-4">
            <ClipboardList className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-sm text-muted-foreground">No tasks assigned yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map(task => {
            const issueType = task.issue_type || 'other';
            const priorityScore = task.priority_score ?? 0;
            return (
              <div key={task.id} className="glass-card overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-0.5">
                <div className="flex flex-col sm:flex-row">
                  {/* Before Image — clickable for fullscreen */}
                  <div
                    className="relative h-40 w-full sm:h-auto sm:w-52 overflow-hidden cursor-pointer group"
                    onClick={() => openModal(task.image_url, 'Before Image')}
                  >
                    <img src={task.image_url} alt={ISSUE_TYPE_LABELS[issueType] || 'Issue'} loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent sm:bg-gradient-to-r sm:from-transparent sm:via-black/10 sm:to-black/40" />
                    <div className="absolute bottom-2 left-2 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium text-white/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
                      Click to enlarge
                    </div>
                  </div>

                  <div className="flex flex-1 flex-col justify-between p-5">
                    <div>
                      {/* Issue type + status + priority */}
                      <div className="mb-3 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="rounded-full text-xs">{ISSUE_TYPE_LABELS[issueType] || issueType}</Badge>
                          <PriorityBadge score={priorityScore} />
                        </div>
                        <StatusBadge status={task.status} />
                      </div>

                      {/* Worker status info */}
                      {task.worker_status === 'work_done' && task.status !== 'resolved' && (
                        <p className="mb-2 text-xs font-medium text-info">Waiting for Admin Approval</p>
                      )}
                      {task.resolution_image_url && task.worker_status === 'work_done' && (
                        <div className="mb-2 flex items-center gap-2 text-xs text-success">
                          <Camera className="h-3 w-3" />
                          <button
                            className="underline underline-offset-2 hover:no-underline cursor-pointer"
                            onClick={() => openModal(task.resolution_image_url!, 'Completion Proof')}
                          >
                            View uploaded proof image
                          </button>
                        </div>
                      )}

                      {/* Truncated summary — workers only see a brief overview */}
                      <p className="mb-3 text-sm leading-relaxed text-foreground/80">
                        {truncate(task.description, 80)}
                      </p>

                      {/* Location only (no department for workers) */}
                      <div className="flex items-center gap-5 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {task.latitude.toFixed(4)}, {task.longitude.toFixed(4)}
                        </span>
                      </div>
                    </div>

                    {/* Action buttons — no "View Details" link for workers */}
                    <div className="mt-4 flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-lg"
                        onClick={() => handleWorkerStatusChange(task.id, 'in_progress')}
                        disabled={task.worker_status === 'work_done'}
                      >
                        Mark In Progress
                      </Button>
                      <Button
                        size="sm"
                        className="rounded-lg gap-1.5"
                        onClick={() => handleWorkerStatusChange(task.id, 'work_done')}
                        disabled={task.worker_status === 'work_done'}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Upload Completion Proof
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Proof Upload Modal ─────────────────────────────────────── */}
      <Dialog open={proofModalOpen} onOpenChange={setProofModalOpen}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5 text-primary" />
              Upload Completion Proof
            </DialogTitle>
            <DialogDescription>
              Upload a photo showing the completed work before marking this task as done.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {/* Image upload */}
            <div>
              <Label className="mb-2 block text-sm font-medium">After Image <span className="text-destructive">*</span></Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleProofImageChange}
              />
              {proofPreview ? (
                <div className="relative">
                  <img src={proofPreview} alt="Proof preview" className="w-full h-52 object-cover rounded-xl border border-border/60" />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute top-2 right-2 h-7 w-7 rounded-full p-0"
                    onClick={() => { setProofFile(null); setProofPreview(null); }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border/60 bg-muted/30 p-8 transition-all duration-300 hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="mb-3 rounded-xl bg-muted p-3">
                    <Upload className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-foreground/70">Click to upload proof image</p>
                  <p className="mt-1 text-xs text-muted-foreground">PNG, JPG up to 10MB</p>
                </button>
              )}
            </div>

            {/* Optional comment */}
            <div>
              <Label htmlFor="proof-comment" className="mb-2 block text-sm font-medium">Comment <span className="text-muted-foreground text-xs">(optional)</span></Label>
              <Textarea
                id="proof-comment"
                placeholder="Any notes about the completed work..."
                value={proofComment}
                onChange={e => setProofComment(e.target.value)}
                rows={3}
                className="rounded-xl border-border/60 bg-muted/30 resize-none focus:bg-card"
              />
            </div>

            {/* Submit */}
            <Button
              className="w-full gap-2 rounded-xl h-11"
              disabled={!proofFile || proofSubmitting}
              onClick={handleProofSubmit}
            >
              {proofSubmitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Uploading &amp; Submitting...</>
              ) : (
                <><CheckCircle2 className="h-4 w-4" /> Submit Proof &amp; Mark Done</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Fullscreen Image Modal ─────────────────────────────────── */}
      <ImageModal src={modalSrc} alt={modalAlt} open={isOpen} onClose={closeModal} />
    </div>
  );
}
