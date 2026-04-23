import { lazy, Suspense, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Routes, Route, Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { AppErrorBoundary } from "@/components/layout/AppErrorBoundary";
import { AdminRoute, ProtectedRoute, UserRoute, WorkerRoute } from "@/components/auth/ProtectedRoute";
import { PageTransition } from "@/components/layout/PageTransition";
import { roleHomePath, useAuth } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/theme-provider";

// ─── Lazy-loaded pages ──────────────────────────────────────────
const Home = lazy(() => import("./pages/Home"));
const Login = lazy(() => import("./pages/Login"));
const Register = lazy(() => import("./pages/Register"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ReportIssue = lazy(() => import("./pages/ReportIssue"));
const IssueDetail = lazy(() => import("./pages/IssueDetail"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const WorkerDashboard = lazy(() => import("./pages/WorkerDashboard"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

// ─── Preload important chunks after first paint ─────────────────
function usePreloadPages() {
  useEffect(() => {
    const id = setTimeout(() => {
      import("./pages/Dashboard");
      import("./pages/AdminDashboard");
      import("./pages/WorkerDashboard");
      import("./pages/ReportIssue");
    }, 500);
    return () => clearTimeout(id);
  }, []);
}

// ─── Lightweight inline loader (never blocks the whole screen) ──
function InlineLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

// ─── Post-login redirect (non-blocking) ─────────────────────────
function RoleLandingRoute() {
  const { user, role } = useAuth();

  if (!user) return <Navigate to="/auth" replace />;

  if (!role) {
    return (
      <div className="flex h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Preparing your dashboard…
      </div>
    );
  }

  return <Navigate to={roleHomePath(role)} replace />;
}

// ─── Route tree ─────────────────────────────────────────────────
function AppRoutes() {
  usePreloadPages();

  return (
    <Suspense fallback={<InlineLoader />}>
      <Routes>
        <Route element={<AppLayout />}>
          {/* Public */}
          <Route path="/" element={<PageTransition><Home /></PageTransition>} />
          <Route path="/auth" element={<PageTransition><Login /></PageTransition>} />
          <Route path="/login" element={<PageTransition><Login /></PageTransition>} />
          <Route path="/register" element={<PageTransition><Register /></PageTransition>} />

          {/* Citizen */}
          <Route path="/dashboard" element={
            <UserRoute><PageTransition><Dashboard /></PageTransition></UserRoute>
          } />
          <Route path="/report" element={
            <UserRoute><PageTransition><ReportIssue /></PageTransition></UserRoute>
          } />
          <Route path="/issue/:id" element={
            <ProtectedRoute><PageTransition><IssueDetail /></PageTransition></ProtectedRoute>
          } />

          {/* Admin */}
          <Route path="/admin" element={
            <AdminRoute><PageTransition><AdminDashboard /></PageTransition></AdminRoute>
          } />
          <Route path="/admin-dashboard" element={
            <AdminRoute><PageTransition><AdminDashboard /></PageTransition></AdminRoute>
          } />

          {/* Worker */}
          <Route path="/worker" element={
            <WorkerRoute><PageTransition><WorkerDashboard /></PageTransition></WorkerRoute>
          } />
          <Route path="/worker-dashboard" element={
            <WorkerRoute><PageTransition><WorkerDashboard /></PageTransition></WorkerRoute>
          } />

          {/* Post-login & 404 */}
          <Route path="/post-login" element={<RoleLandingRoute />} />
          <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
        </Route>
      </Routes>
    </Suspense>
  );
}

// ─── Root ───────────────────────────────────────────────────────
const App = () => (
  <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AppRoutes />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </AppErrorBoundary>
);

export default App;