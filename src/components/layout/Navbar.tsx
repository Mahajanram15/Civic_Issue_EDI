import { useState, useEffect, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Bell, Menu, MapPin, User, LogOut, Shield, Wrench, LayoutDashboard, Sun, Moon } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import type { Tables } from '@/integrations/supabase/types';
import { RoleActionButton } from '@/components/ui/role-action-button';

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}

export function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, profile, hasRole, signOut, loading } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifications, setNotifications] = useState<Tables<'notifications'>[]>([]);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 10);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (user) {
      let cancelled = false;
      let channel: { unsubscribe?: () => void } | null = null;

      const loadNotifications = async () => {
        try {
          const { getNotifications } = await import('@/services/api');
          const data = await getNotifications(user.id);
          if (!cancelled) setNotifications(data);
        } catch (err) {
          console.error(err);
        }
      };

      if ('requestIdleCallback' in window) {
        window.requestIdleCallback(loadNotifications);
      } else {
        setTimeout(loadNotifications, 0);
      }

      (async () => {
        try {
          const { supabase } = await import('@/integrations/supabase/client');
          channel = supabase
            .channel('notifications-navbar')
            .on('postgres_changes', {
              event: 'INSERT', schema: 'public', table: 'notifications',
              filter: `user_id=eq.${user.id}`,
            }, (payload) => {
              setNotifications(prev => [payload.new as Tables<'notifications'>, ...prev]);
            })
            .subscribe();
        } catch (err) {
          console.error(err);
        }
      })();

      return () => {
        cancelled = true;
        if (channel) {
          import('@/integrations/supabase/client')
            .then(({ supabase }) => {
              // @ts-expect-error supabase channel types are not exported
              supabase.removeChannel(channel);
            })
            .catch(() => {});
        }
      };
    }
  }, [user]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications]);

  const navLinks = useMemo(() => [
    { to: '/', label: 'Home' },
    ...(user && !hasRole('admin') && !hasRole('worker') ? [{ to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] : []),
    ...(hasRole('admin') ? [{ to: '/admin', label: 'Admin', icon: Shield }] : []),
    ...(hasRole('worker') ? [{ to: '/worker', label: 'My Tasks', icon: Wrench }] : []),
  ], [hasRole, user]);

  const handleNotificationsOpenChange = (open: boolean) => {
    if (!open || !user || unreadCount === 0) return;

    // Immediately hide badge (optimistic UI)
    setNotifications(prev => prev.map(n => (n.is_read ? n : { ...n, is_read: true })));

    // Persist in Supabase in background
    import('@/services/api')
      .then(({ markAllNotificationsRead }) => markAllNotificationsRead(user.id))
      .catch(() => {});
  };

  const handleNotificationClick = async (n: Tables<'notifications'>) => {
    if (!n.is_read) {
      import('@/services/api').then(({ markNotificationRead }) => {
        markNotificationRead(n.id).catch(() => {});
      });
      setNotifications(prev => prev.map(notif => notif.id === n.id ? { ...notif, is_read: true } : notif));
    }
    
    if (n.issue_id) {
      navigate(`/issue/${n.issue_id}?proof=true`);
    }
  };

  return (
    <header className={cn(
      'sticky top-0 z-50 transition-all duration-300',
      scrolled ? 'glass border-b shadow-sm' : 'bg-transparent'
    )}>
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 font-heading text-lg font-bold text-foreground">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-bg text-primary-foreground shadow-sm">
            <MapPin className="h-4 w-4" />
          </div>
          <span>CivicFix</span>
        </Link>

        <nav className="hidden items-center gap-0.5 md:flex">
          {!loading && navLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                location.pathname === link.to
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
              )}
            >
              {link.label}
            </Link>
          ))}
          {!loading && user && (
            <div className="ml-2 pl-2 border-l border-border/50">
              <RoleActionButton size="sm" className="rounded-lg shadow-sm" />
            </div>
          )}
        </nav>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          {!loading && user && (
            <DropdownMenu onOpenChange={handleNotificationsOpenChange}>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-lg">
                  <Bell className="h-4 w-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full gradient-bg text-[9px] font-bold text-primary-foreground">
                      {unreadCount}
                    </span>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80 rounded-xl p-0">
                <div className="border-b p-3 font-heading text-sm font-semibold">Notifications</div>
                {notifications.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">No notifications yet</div>
                ) : (
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.slice(0, 5).map(n => (
                      <DropdownMenuItem
                        key={n.id}
                        className="flex flex-col items-start gap-1 rounded-none border-b border-border/50 p-3 last:border-0 cursor-pointer"
                        onClick={() => handleNotificationClick(n)}
                      >
                        <p className={cn('text-sm leading-snug', !n.is_read && 'font-medium')}>{n.message}</p>
                        <span className="text-xs text-muted-foreground">
                          {new Date(n.created_at).toLocaleDateString()}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </div>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {!loading && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <User className="h-3.5 w-3.5" />
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-xl">
                <div className="px-3 py-2">
                  <p className="text-sm font-medium">{profile?.name}</p>
                  <p className="text-xs text-muted-foreground">{profile?.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={async () => { await signOut(); navigate('/'); }} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (!loading && (
            <div className="flex gap-2">
              <Button asChild variant="ghost" size="sm" className="rounded-lg text-sm"><Link to="/login">Login</Link></Button>
              <Button asChild size="sm" className="rounded-lg gradient-bg border-0 text-sm shadow-sm hover:opacity-90"><Link to="/register">Sign Up</Link></Button>
            </div>
          ))}

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg md:hidden"><Menu className="h-4 w-4" /></Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72 p-0">
              <div className="flex items-center justify-between border-b p-4">
                <span className="font-heading text-sm font-semibold">Menu</span>
              </div>
              <nav className="flex flex-col gap-1 p-3">
                {!loading && navLinks.map(link => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setMobileOpen(false)}
                    className={cn(
                      'rounded-lg px-4 py-2.5 text-sm font-medium transition-colors',
                      location.pathname === link.to ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
                {!loading && user && (
                  <div className="mt-2 px-1">
                    <RoleActionButton 
                      className="w-full justify-start rounded-lg" 
                      onClick={() => setMobileOpen(false)} 
                    />
                  </div>
                )}
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
