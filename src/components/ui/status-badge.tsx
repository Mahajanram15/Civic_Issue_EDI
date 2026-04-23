import { cn } from '@/lib/utils';
import { CheckCircle2, Clock, Loader, Pin, XCircle } from 'lucide-react';

/* ── Labels ──────────────────────────────────────────────────────────── */

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  assigned: 'Assigned',
  in_progress: 'In Progress',
  resolved: 'Resolved',
  rejected: 'Rejected',
};

/* ── Gradient + glow per status ──────────────────────────────────────── */

const statusStyles: Record<string, string> = {
  pending:
    'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/30',
  assigned:
    'bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-blue-500/30',
  in_progress:
    'bg-gradient-to-r from-violet-500 to-purple-500 text-white shadow-violet-500/30',
  resolved:
    'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-emerald-500/30',
  rejected:
    'bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-rose-500/30',
};

/* ── Icon per status ─────────────────────────────────────────────────── */

const StatusIcon = ({ status }: { status: string }) => {
  const cls = 'h-3 w-3';
  switch (status) {
    case 'pending':   return <Clock className={cls} />;
    case 'assigned':  return <Pin className={cls} />;
    case 'in_progress': return <Loader className={cls} />;
    case 'resolved':  return <CheckCircle2 className={cls} />;
    case 'rejected':  return <XCircle className={cls} />;
    default:          return null;
  }
};

/* ── Component ───────────────────────────────────────────────────────── */

export type IssueStatus = 'pending' | 'assigned' | 'in_progress' | 'resolved' | 'rejected';

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-md',
        'transition-transform duration-200 hover:scale-105',
        statusStyles[status] || 'bg-muted text-muted-foreground',
        className,
      )}
    >
      <StatusIcon status={status} />
      {STATUS_LABELS[status] || status}
    </span>
  );
}
