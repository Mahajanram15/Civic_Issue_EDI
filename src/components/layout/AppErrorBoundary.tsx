import { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface AppErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error('App crashed during render:', error);
    this.setState({ error });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="container flex min-h-screen items-center justify-center py-16">
          <div className="max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <h1 className="mb-2 text-lg font-semibold">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              A runtime error prevented this page from rendering. Refresh the page, or check the browser console for details.
            </p>

            {this.state.error && (
              <pre className="mt-4 max-h-56 overflow-auto rounded-xl bg-muted p-3 text-left text-xs text-muted-foreground">
                {this.state.error.stack || this.state.error.message}
              </pre>
            )}

            <button
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:opacity-90 transition-opacity"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
