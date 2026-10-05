/**
 * Catches render-time errors so a bug in one component does not leave the
 * visitor staring at a blank page.
 *
 * Class component because that is still the only way to implement
 * `componentDidCatch`.
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Logged for whoever is debugging; never rendered, because a stack trace
    // tells a visitor nothing and can disclose internals.
    console.error('Unhandled render error:', error, info.componentStack);
  }

  private readonly reset = () => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <div className="grid min-h-dvh place-items-center px-6 py-20">
        <div className="max-w-md space-y-5 text-center">
          <p className="eyebrow eyebrow-plain justify-center">Error</p>
          <h1 className="fluid-heading font-semibold">This page could not be displayed</h1>
          <p className="text-muted">
            Something went wrong while rendering. Reloading usually clears it; if it keeps
            happening, please let the branch know.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
            >
              Reload the page
            </button>
            <a href="/" className="btn btn-secondary" onClick={this.reset}>
              Go to the homepage
            </a>
          </div>
        </div>
      </div>
    );
  }
}
