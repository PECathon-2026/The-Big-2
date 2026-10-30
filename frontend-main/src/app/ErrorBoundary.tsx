/**
 * Render-error containment. A bug in one chapter must not take the sky, the HUD or the other chapters down:
 * a page that throws shows a calm card with "try again" and "return to the sky"; a layer (canvas, HUD) that
 * throws simply disappears. `resetKey` (the pathname) clears the error when the user navigates elsewhere.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Director } from '@/scene/Director';
import { Button, Card } from '@/ui';

interface Props {
  children: ReactNode;
  /** what to show instead of the broken subtree; omit for "render nothing" */
  fallback?: (retry: () => void, error: Error) => ReactNode;
  resetKey?: string;
  name: string;
}

export class ErrorBoundary extends Component<Props, { error: Error | null; key?: string }> {
  state: { error: Error | null; key?: string } = { error: null, key: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(props: Props, state: { error: Error | null; key?: string }) {
    return props.resetKey !== state.key ? { error: null, key: props.resetKey } : null;
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name}] render error`, error, info.componentStack);
  }

  retry = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return this.props.fallback ? this.props.fallback(this.retry, this.state.error) : null;
  }
}

export function PageCrash({ retry, error }: { retry: () => void; error: Error }) {
  const nav = useNavigate();
  // a chunk that failed to download (new deploy, flaky network) only comes back with a fresh page load
  const chunk = /dynamically imported module|Importing a module script failed|Loading chunk/i.test(error.message);
  return (
    <div className="pg-root" data-cursor="off">
      <div className="pg-scroll">
        <div className="pg-content" style={{ paddingTop: 140 }}>
          <Card brand={{ kanji: '乱', text: 'Something went wrong' }}>
            <p className="pg-lede" style={{ marginTop: 8 }}>
              This chapter stumbled while drawing itself. The rest of Tsukuyomi is fine.
            </p>
            <p className="pg-quiet" style={{ wordBreak: 'break-word' }}>{error.message}</p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 16 }}>
              <Button variant="gold" onClick={chunk ? () => window.location.reload() : retry}>
                Try again
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  nav('/');
                  void Director.back();
                }}
              >
                ← Return to the sky
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
