import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MapPin, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/ui/status-badge';
import { PriorityBadge } from '@/components/ui/PriorityBadge';
import { ImageModal } from '@/components/ui/ImageModal';
import type { Tables } from '@/integrations/supabase/types';

const ISSUE_TYPE_LABELS: Record<string, string> = {
  pothole: 'Pothole', garbage: 'Garbage Overflow', broken_streetlight: 'Broken Streetlight',
  water_leak: 'Water Leakage', road_damage: 'Road Damage', other: 'Other',
};

export function IssueCard({ issue }: { issue: Tables<'issues'> }) {
  const issueType = issue.issue_type || 'other';
  const priorityScore = issue.priority_score ?? 0;

  const [imageModalOpen, setImageModalOpen] = useState(false);

  const linkUrl = issue.status === 'resolved' && issue.verified_by_admin 
    ? `/issue/${issue.id}?proof=true` 
    : `/issue/${issue.id}`;

  return (
    <>
      <Link to={linkUrl}>
        <div className="glass-card group overflow-hidden rounded-2xl transition-all duration-300 hover:-translate-y-1">
          <div className="relative h-44 overflow-hidden">
            <img
              src={issue.image_url}
              alt={ISSUE_TYPE_LABELS[issueType] || 'Issue'}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setImageModalOpen(true);
              }}
            />
            {/* Strong gradient overlay for text contrast */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent pointer-events-none" />
            <div className="absolute left-3 top-3 drop-shadow-lg">
              <StatusBadge status={issue.status} />
            </div>
          </div>
          <div className="p-4">
            {issue.worker_status === 'work_done' && issue.status !== 'resolved' && issue.status !== 'rejected' && (
              <p className="mb-2 text-xs font-medium text-info">Under Verification</p>
            )}
            <div className="mb-2.5 flex items-center justify-between">
              <Badge variant="secondary" className="rounded-full text-xs font-medium">
                {ISSUE_TYPE_LABELS[issueType] || issueType}
              </Badge>
              <PriorityBadge score={priorityScore} />
            </div>
            <p className="mb-3 line-clamp-2 text-sm leading-relaxed text-foreground/80">{issue.description}</p>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              {/* Location coordinates instead of internal department mapping */}
              <span className="flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {issue.latitude.toFixed(4)}, {issue.longitude.toFixed(4)}
              </span>
              <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(issue.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>
      </Link>

      {/* Fullscreen image modal */}
      <ImageModal
        src={issue.image_url}
        alt="Reported Issue"
        open={imageModalOpen}
        onClose={() => setImageModalOpen(false)}
      />
    </>
  );
}
