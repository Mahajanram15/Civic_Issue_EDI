import { Link } from 'react-router-dom';
import { MapPin, Camera, Zap, BarChart3, ArrowRight, CheckCircle2, AlertTriangle, Clock, TrendingUp, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { RoleActionButton } from '@/components/ui/role-action-button';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState } from 'react';

const features = [
  { icon: Camera, title: 'Snap & Report', desc: 'Upload a photo, add a description, and let AI do the rest.', color: 'from-primary/20 to-primary/5' },
  { icon: Zap, title: 'AI-Powered Routing', desc: 'Issues are automatically classified and sent to the right department.', color: 'from-warning/20 to-warning/5' },
  { icon: MapPin, title: 'Live Map View', desc: 'See all reported issues on an interactive city map.', color: 'from-success/20 to-success/5' },
  { icon: BarChart3, title: 'Track Progress', desc: 'Follow your issue from submission to resolution in real time.', color: 'from-info/20 to-info/5' },
];

export default function Home() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ totalReported: 0, resolved: 0, inProgress: 0, pending: 0 });

  useEffect(() => {
    let cancelled = false;
    let idleId: number | null = null;
    let timeoutId: number | null = null;

    const loadStats = async () => {
      try {
        const { getStats } = await import('@/services/api');
        const nextStats = await getStats();
        if (!cancelled) setStats(nextStats);
      } catch {
        // Keep default stats if backend is unavailable.
      }
    };

    const scheduleStatsLoad = () => {
      if ('requestIdleCallback' in window) {
        idleId = (window as any).requestIdleCallback(() => {
          void loadStats();
        }) as number;
        return;
      }
      const tid = setTimeout(() => {
        void loadStats();
      }, 1200) as any;
      timeoutId = tid;
    };

    if (document.readyState === 'complete') {
      scheduleStatsLoad();
    } else {
      window.addEventListener('load', scheduleStatsLoad, { once: true });
    }

    return () => {
      cancelled = true;
      window.removeEventListener('load', scheduleStatsLoad);
      if (idleId !== null && 'cancelIdleCallback' in window) {
        window.cancelIdleCallback(idleId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  const statCards = [
    { label: 'Issues Reported', value: stats.totalReported, icon: AlertTriangle, color: 'text-warning' },
    { label: 'Resolved', value: stats.resolved, icon: CheckCircle2, color: 'text-success' },
    { label: 'In Progress', value: stats.inProgress, icon: Clock, color: 'text-primary' },
    { label: 'Pending', value: stats.pending, icon: TrendingUp, color: 'text-info' },
  ];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden py-24 md:py-36">
        {/* Background effects */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.08),transparent_60%)]" />
        <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/5 blur-[100px]" />
        <div className="absolute -right-20 top-20 h-72 w-72 animate-float rounded-full bg-primary-glow/5 blur-[80px]" />
        <div className="absolute -left-20 bottom-20 h-72 w-72 animate-float rounded-full bg-primary/5 blur-[80px]" style={{ animationDelay: '3s' }} />

        <div className="container relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              AI-Powered Civic Platform
            </div>

            <h1 className="font-heading text-4xl font-extrabold leading-[1.1] tracking-tight md:text-6xl lg:text-7xl">
              Every report is a tiny <span className="gradient-text">revolution.</span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
              Report potholes, garbage, broken streetlights, and more. Our AI classifies and routes your issue to the right department instantly.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <RoleActionButton
                size="lg"
                className="h-12 rounded-xl shadow-lg border-0 shadow-primary/20 gradient-bg hover:shadow-xl hover:shadow-primary/30 transition-all duration-300 hover:-translate-y-0.5"
              />
              {user && (
                <Button asChild variant="outline" size="lg" className="h-12 rounded-xl border-border/60 px-8 text-base hover:bg-muted/60">
                  <Link to="/dashboard">View Dashboard</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="border-y bg-card/50 py-12">
        <div className="container">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {statCards.map((stat) => (
              <div key={stat.label}>
                <StatCard {...stat} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24">
        <div className="container">
          <div className="mx-auto mb-16 max-w-lg text-center">
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">How it works</p>
            <h2 className="font-heading text-3xl font-bold md:text-4xl">Four steps to a better city</h2>
            <p className="mt-4 text-muted-foreground">Simple, powerful, and built for everyone</p>
          </div>

          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <div key={f.title}>
                <div className="glass-card group h-full rounded-2xl p-6 text-center transition-all duration-300 hover:-translate-y-1">
                  <div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${f.color}`}>
                    <f.icon className="h-6 w-6 text-foreground/80" />
                  </div>
                  <h3 className="mb-2 font-heading text-base font-semibold">{f.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative overflow-hidden py-24">
        <div className="absolute inset-0 gradient-bg opacity-95" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.1),transparent_70%)]" />
        <div className="container relative z-10 text-center">
          <div>
            <h2 className="font-heading text-3xl font-bold text-primary-foreground md:text-4xl">
              Ready to Make a Difference?
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-primary-foreground/70">
              Join thousands of citizens building better urban infrastructure.
            </p>
            <RoleActionButton
              size="lg"
              className="mt-8 h-12 rounded-xl shadow-lg bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-semibold"
            />
          </div>
        </div>
      </section>
    </div>
  );
}
