import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Filter, Loader2, LayoutGrid } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IssueCard } from '@/components/issues/IssueCard';
import { RoleActionButton } from '@/components/ui/role-action-button';
import { useAuth } from '@/contexts/AuthContext';
import { getUserIssues } from '@/services/api';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export default function Dashboard() {
  const { user, hasRole } = useAuth();
  const [issues, setIssues] = useState<Tables<'issues'>[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    if (!user) return;

    const refreshIssues = () => {
      getUserIssues(user.id)
        .then(setIssues)
        .catch(() => setIssues([]));
    };

    getUserIssues(user.id)
      .then(data => { setIssues(data); })
      .catch(() => { setIssues([]); })
      .finally(() => setLoading(false));

    const channel = supabase
      .channel('user-issues')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'issues', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            const updated = payload.new as Tables<'issues'>;
            setIssues((prev) => prev.map((issue) => (issue.id === updated.id ? updated : issue)));
          } else if (payload.eventType === 'INSERT') {
            const inserted = payload.new as Tables<'issues'>;
            setIssues((prev) => [inserted, ...prev.filter((issue) => issue.id !== inserted.id)]);
          } else if (payload.eventType === 'DELETE') {
            const removedId = (payload.old as { id?: string }).id;
            if (removedId) {
              setIssues((prev) => prev.filter((issue) => issue.id !== removedId));
            }
          }

          // Keep a server source-of-truth refresh as a fallback.
          refreshIssues();
        }
      )
      .subscribe();

    const intervalId = window.setInterval(refreshIssues, 30_000);
    const onFocus = () => refreshIssues();
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocus);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const filtered = filter === 'all' ? issues : issues.filter(i => i.status === filter);

  const isFirstLoad = loading && issues.length === 0;

  return (
    <div className="container py-10">
      <div className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold tracking-tight">My Reported Issues</h1>
          <p className="mt-1.5 text-muted-foreground">Track Issue Status &amp; View Resolution Updates</p>
        </div>
        <RoleActionButton className="rounded-xl shadow-sm border-0 shadow-primary/20 gradient-bg hover:shadow-lg hover:shadow-primary/25 transition-all" />
      </div>

      <Tabs value={filter} onValueChange={setFilter}>
        <TabsList className="mb-8 h-10 rounded-xl bg-muted/60 p-1">
          <TabsTrigger value="all" className="rounded-lg text-xs">All ({issues.length})</TabsTrigger>
          <TabsTrigger value="pending" className="rounded-lg text-xs">Pending</TabsTrigger>
          <TabsTrigger value="assigned" className="rounded-lg text-xs">Assigned</TabsTrigger>
          <TabsTrigger value="in_progress" className="rounded-lg text-xs">In Progress</TabsTrigger>
          <TabsTrigger value="resolved" className="rounded-lg text-xs">Resolved</TabsTrigger>
        </TabsList>

        <TabsContent value={filter}>
          {isFirstLoad ? (
            <div className="flex min-h-[30vh] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-24 text-center">
              <div className="mb-4 rounded-2xl bg-muted/60 p-4">
                <LayoutGrid className="h-8 w-8 text-muted-foreground/50" />
              </div>
              <p className="text-sm text-muted-foreground">
                {issues.length === 0 ? 'No issues reported yet. Start by reporting one!' : 'No issues match this filter.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map(issue => <IssueCard key={issue.id} issue={issue} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
