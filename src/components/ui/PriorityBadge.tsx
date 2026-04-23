import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PriorityBadgeProps {
  score: number;
  /** When true, also show the numeric score alongside the label */
  showScore?: boolean;
  className?: string;
}

function getPriorityInfo(score: number) {
  if (score >= 80) {
    return {
      label: 'High',
      style: 'bg-gradient-to-r from-rose-500 to-red-500 text-white shadow-rose-500/30',
      dotColor: 'bg-red-400',
    };
  }
  if (score >= 50) {
    return {
      label: 'Medium',
      style: 'bg-gradient-to-r from-amber-500 to-yellow-500 text-white shadow-amber-500/30',
      dotColor: 'bg-amber-400',
    };
  }
  return {
    label: 'Low',
    style: 'bg-gradient-to-r from-emerald-500 to-green-500 text-white shadow-emerald-500/30',
    dotColor: 'bg-green-400',
  };
}

export function PriorityBadge({ score, showScore = false, className }: PriorityBadgeProps) {
  const { label, style } = getPriorityInfo(score);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold shadow-md',
        'transition-transform duration-200 hover:scale-105',
        style,
        className,
      )}
    >
      <AlertTriangle className="h-3 w-3" />
      {label}
      {showScore && <span className="opacity-80">({score})</span>}
    </span>
  );
}

/** Utility to get priority label text only */
export function getPriorityLabel(score: number): string {
  return getPriorityInfo(score).label;
}
