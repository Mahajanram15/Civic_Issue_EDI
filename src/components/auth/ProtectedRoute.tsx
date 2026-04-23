import { Navigate, useLocation } from 'react-router-dom';
import { roleHomePath, useAuth } from '@/contexts/AuthContext';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'worker' | 'user';
}

export function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const location = useLocation();
  const { user, role, loading, hasRole, authError } = useAuth();

  // Brief inline loader (only during initial ~50ms auth sync)
  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace state={{ from: location.pathname }} />;

  if (user && authError && !role) {
    return (
      <div className="container flex min-h-[40vh] items-center justify-center py-10">
        <div className="max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h2 className="mb-2 text-lg font-semibold">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">{authError}</p>
          <Button className="mt-4" onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  // Role still loading in background — show lightweight inline message instead of redirecting
  if (user && !role) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing…
      </div>
    );
  }

  if (requiredRole && !hasRole(requiredRole)) {
    return <Navigate to={roleHomePath(role)} replace />;
  }

  return <>{children}</>;
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute requiredRole="admin">{children}</ProtectedRoute>;
}

export function WorkerRoute({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute requiredRole="worker">{children}</ProtectedRoute>;
}

export function UserRoute({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute requiredRole="user">{children}</ProtectedRoute>;
}
