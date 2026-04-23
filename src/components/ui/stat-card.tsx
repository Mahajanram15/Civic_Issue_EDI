import { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  color?: string;
  trend?: string;
}

export function StatCard({ label, value, icon: Icon, color = 'text-primary', trend }: StatCardProps) {
  return (
    <div className="glass-card group rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1.5 font-heading text-3xl font-bold tracking-tight">{value}</p>
          {trend && <p className="mt-1 text-xs text-success">{trend}</p>}
        </div>
        <div className={cn('rounded-xl bg-primary/8 p-2.5 transition-colors group-hover:bg-primary/12', color)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}
