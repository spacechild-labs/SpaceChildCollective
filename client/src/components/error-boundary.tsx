import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

/**
 * App-wide error boundary so a render-time error in one view shows a recovery UI
 * instead of unmounting the whole SPA to a blank page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ hasError: false, error: undefined });
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex min-h-screen w-full flex-col items-center justify-center gap-4 p-6 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive" />
        <div>
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            An unexpected error occurred while rendering this view. You can try again, or reload the page.
          </p>
        </div>
        {this.state.error?.message && (
          <pre className="max-w-md overflow-auto rounded-md bg-muted p-3 text-left text-xs text-muted-foreground">
            {this.state.error.message}
          </pre>
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={this.handleReset}>Try again</Button>
          <Button onClick={() => window.location.assign("/")}>Go home</Button>
        </div>
      </div>
    );
  }
}
