import { useState, useEffect } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Building2, Calendar, Loader2, Brain, Tag, Gauge, Eye, ShieldCheck, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { StatusTimeline } from '@/components/issues/StatusTimeline';
import { StatusBadge } from '@/components/ui/status-badge';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { ImageModal, useImageModal } from '@/components/ui/ImageModal';
import { ImageComparisonSlider } from '@/components/issues/ImageComparisonSlider';
import { getIssueById } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { MapFullScreenModal } from '@/components/maps/MapFullScreenModal';

const ISSUE_TYPE_LABELS: Record<string, string> = {
  pothole: 'Pothole', garbage: 'Garbage Overflow', broken_streetlight: 'Broken Streetlight',
  water_leak: 'Water Leakage', road_damage: 'Road Damage', other: 'Other',
};

export default function IssueDetail() {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [issue, setIssue] = useState<Tables<'issues'> | null>(null);
  const [loading, setLoading] = useState(true);
  const [proofModalOpen, setProofModalOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const { role } = useAuth();

  // Fullscreen image modal
  const { modalSrc, modalAlt, isOpen, openModal, closeModal } = useImageModal();

  // Role checks
  const isAdmin = role === 'admin';
  const isWorker = role === 'worker';

  useEffect(() => {
    if (issue?.status === 'resolved' && issue?.verified_by_admin && searchParams.get('proof') === 'true') {
      setProofModalOpen(true);
      setSearchParams({}, { replace: true });
    }
  }, [issue, searchParams, setSearchParams]);

  useEffect(() => {
    if (!id) return;

    const refreshIssue = () => {
      getIssueById(id).then(setIssue).catch(() => {}).finally(() => setLoading(false));
    };

    refreshIssue();

    const channel = supabase
      .channel(`issue-detail-${id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'issues', filter: `id=eq.${id}` },
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            setIssue(payload.new as Tables<'issues'>);
          }
        }
      )
      .subscribe();

    const intervalId = window.setInterval(refreshIssue, 30_000);
    const onFocus = () => refreshIssue();
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      supabase.removeChannel(channel);
    };
  }, [id]);

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!issue) return (
    <div className="container py-24 text-center">
      <p className="text-muted-foreground">Issue not found.</p>
      <Button asChild variant="outline" className="mt-4 rounded-xl"><Link to="/dashboard">Back to Dashboard</Link></Button>
    </div>
  );

  const issueType = issue.issue_type || 'other';
  const priorityScore = issue.priority_score ?? 0;
  const department = issue.department || 'Under Processing';

  // Back link depends on role
  const backPath = isAdmin ? '/admin' : isWorker ? '/worker' : '/dashboard';
  const backLabel = isAdmin ? 'Back to Admin Dashboard' : isWorker ? 'Back to Assigned Tasks' : 'Back to Dashboard';

  return (
    <div className="container max-w-4xl py-10">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Button asChild variant="ghost" className="gap-2 rounded-lg text-sm text-muted-foreground hover:text-foreground">
          <Link to={backPath}><ArrowLeft className="h-4 w-4" /> {backLabel}</Link>
        </Button>
        {issue.status === 'resolved' && issue.verified_by_admin && (
          <Button onClick={() => setProofModalOpen(true)} className="gap-2 rounded-lg gradient-bg shadow-sm hover:opacity-90">
            <Eye className="h-4 w-4" /> View Resolution Proof
          </Button>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Image — clickable for fullscreen */}
        <div
          className="glass-card overflow-hidden rounded-2xl relative cursor-pointer group"
          onClick={() => openModal(issue.image_url, 'Reported Issue')}
        >
          <img src={issue.image_url} alt="Issue" decoding="async" className="h-72 w-full object-cover md:h-full transition-transform duration-300 group-hover:scale-105" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
          <div className="absolute bottom-3 left-3 rounded-md bg-black/60 px-2 py-1 text-[10px] font-medium text-white/80 backdrop-blur-sm opacity-0 group-hover:opacity-100 transition-opacity">
            Click to view full screen
          </div>
        </div>

        <div className="space-y-5">
          {/* Details */}
          <div className="glass-card rounded-2xl p-6">
            <div className="mb-4 flex items-center justify-between">
              <Badge variant="secondary" className="rounded-full">{ISSUE_TYPE_LABELS[issueType] || issueType}</Badge>
              {/* Admin sees score + badge, users/workers see badge only */}
              <PriorityBadge score={priorityScore} showScore={isAdmin} />
            </div>

            {/* Workers see truncated description, others see full */}
            {isWorker ? (
              <p className="mb-5 text-sm leading-relaxed text-foreground/80">
                {issue.description.length > 80 ? issue.description.slice(0, 80).trimEnd() + '…' : issue.description}
              </p>
            ) : (
              <p className="mb-5 text-sm leading-relaxed text-foreground/80">{issue.description}</p>
            )}

            <div className="space-y-3">
              {/* Department — visible only to admin */}
              {isAdmin && (
                <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4 shrink-0" /><span>{department}</span>
                </div>
              )}
              <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <MapPin className="h-4 w-4 shrink-0" /><span>{issue.latitude.toFixed(4)}, {issue.longitude.toFixed(4)}</span>
              </div>
              <div className="flex items-center gap-2.5 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4 shrink-0" /><span>Reported {new Date(issue.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </div>

          {/* AI Analysis — visible ONLY to admin */}
          {isAdmin && issue.ai_confidence && (
            <div className="glass-card rounded-2xl p-6">
              <div className="mb-4 flex items-center gap-2">
                <div className="rounded-lg bg-primary/10 p-2"><Brain className="h-4 w-4 text-primary" /></div>
                <h3 className="text-sm font-semibold">AI Classification Analysis</h3>
              </div>
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5 text-muted-foreground"><Gauge className="h-3.5 w-3.5" /> Confidence</span>
                  <span className="font-semibold">{Math.round(issue.ai_confidence * 100)}%</span>
                </div>
                {issue.ai_keywords?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {issue.ai_keywords.map((kw, i) => (
                      <span key={i} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                        <Tag className="h-2.5 w-2.5" />{kw}
                      </span>
                    ))}
                  </div>
                ) : null}
                {issue.ai_sentiment && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Sentiment</span>
                    <span className="capitalize font-medium">{issue.ai_sentiment}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status Timeline */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className="mb-4 text-sm font-semibold">Track Issue Status</h3>
            <StatusTimeline currentStatus={issue.status as any} />
          </div>

          {/* Location */}
          <div className="glass-card rounded-2xl p-6">
            <h3 className="mb-4 text-sm font-semibold">Location</h3>
            <div
              className="h-60 cursor-pointer overflow-hidden rounded-xl bg-muted/50"
              onClick={() => setMapOpen(true)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setMapOpen(true);
              }}
              aria-label="Open full-screen map"
            >
              <MapContainer
                center={[issue.latitude, issue.longitude]}
                zoom={16}
                scrollWheelZoom={false}
                className="h-full w-full"
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[issue.latitude, issue.longitude]}>
                  <Popup>
                    {issue.title || 'Reported Issue'}
                    <br />
                    {issue.latitude.toFixed(5)}, {issue.longitude.toFixed(5)}
                  </Popup>
                </Marker>
              </MapContainer>
            </div>
          </div>
        </div>
      </div>

      <MapFullScreenModal
        open={mapOpen}
        onOpenChange={setMapOpen}
        latitude={issue.latitude}
        longitude={issue.longitude}
        title={issue.title || 'Reported Issue'}
      />

      {issue.status === 'resolved' && issue.verified_by_admin && (
        <Dialog open={proofModalOpen} onOpenChange={setProofModalOpen}>
          <DialogContent className="rounded-2xl sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-success" />
                Verified Resolution
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-6 pt-2">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Badge className="bg-success hover:bg-success text-white rounded-full">✅ Verified by Admin</Badge>
                {issue.verified_at && (
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" /> 
                    {new Date(issue.verified_at).toLocaleDateString()}
                  </span>
                )}
              </div>
              
              <p className="font-medium text-foreground text-lg">{issue.title || 'Issue Resolution Proof'}</p>
              
              <ImageComparisonSlider 
                beforeSrc={issue.image_url} 
                afterSrc={issue.resolution_image_url || null}
                onImageClick={openModal}
              />

              {issue.resolution_image_url && (
                <div className="flex justify-end pt-4 border-t border-border/50">
                  <Button asChild variant="outline" className="gap-2 rounded-lg">
                    <a href={issue.resolution_image_url} target="_blank" rel="noopener noreferrer" download="resolution-proof.jpg">
                      <Download className="h-4 w-4" /> Download After Image
                    </a>
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Fullscreen Image Modal */}
      <ImageModal src={modalSrc} alt={modalAlt} open={isOpen} onClose={closeModal} />
    </div>
  );
}
