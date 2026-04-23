import { Check, Clock, User, Wrench, XCircle } from 'lucide-react';
import { IssueStatus, STATUS_LABELS } from '@/types';
import { cn } from '@/lib/utils';

const steps: { status: IssueStatus; icon: React.ElementType }[] = [
  { status: 'pending', icon: Clock },
  { status: 'assigned', icon: User },
  { status: 'in_progress', icon: Wrench },
  { status: 'resolved', icon: Check },
];

const statusOrder: Record<IssueStatus, number> = {
  pending: 0, assigned: 1, in_progress: 2, resolved: 3, rejected: 3,
};

export function StatusTimeline({ currentStatus }: { currentStatus: IssueStatus }) {
  if (currentStatus === 'rejected') {
    return (
      <div className="flex items-center gap-2 text-destructive">
        <XCircle className="h-5 w-5" />
        <span className="text-sm font-medium">{STATUS_LABELS.rejected}</span>
      </div>
    );
  }

  const currentIndex = statusOrder[currentStatus];

  return (
    <div className="flex items-center gap-2">
      {steps.map((step, i) => {
        const Icon = step.icon;
        const isActive = i <= currentIndex;
        const isCurrent = i === currentIndex;
        return (
          <div key={step.status} className="flex items-center gap-2">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl border-2 transition-all duration-300',
                  isActive
                    ? 'border-primary gradient-bg text-primary-foreground shadow-sm'
                    : 'border-border bg-muted/50 text-muted-foreground',
                  isCurrent && 'ring-4 ring-primary/10'
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              <span className={cn('text-[10px] font-medium', isActive ? 'text-primary' : 'text-muted-foreground')}>
                {STATUS_LABELS[step.status]}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={cn('mb-5 h-0.5 w-8 rounded-full transition-colors', isActive ? 'gradient-bg' : 'bg-border')} />
            )}
          </div>
        );
      })}
    </div>
  );
}
