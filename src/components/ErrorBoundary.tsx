import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global error boundary so a single broken component never white-screens
 * the whole app. Renders a recoverable fallback with a refresh button.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-6">
          <div className="max-w-md text-center space-y-4">
            <h1 className="text-2xl font-semibold text-foreground">Something went wrong</h1>
            <p className="text-sm text-muted-foreground">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
            <div className="flex flex-wrap justify-center gap-2 pt-2">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
              >
                Try again
              </button>
              <button
                onClick={() => window.location.assign("/")}
                className="px-4 py-2 rounded-md border border-border text-sm"
              >
                Go home
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-md border border-border text-sm"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
