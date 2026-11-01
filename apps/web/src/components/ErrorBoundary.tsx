import { RotateCcw, TriangleAlert } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Catches a render crash in one screen and shows a friendly fallback with a
 * retry, instead of a blank white page. Ported from the starter pack (which
 * used Next.js's error.tsx convention); here it is a class boundary because
 * Vite + React Router has no file convention for it.
 *
 * `resetKey` (the pathname) clears the error when the user navigates away.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; resetKey?: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Logged for diagnosis; never shown to the user.
    console.error('[error-boundary]', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    if (this.state.error) return <Fallback onRetry={() => this.setState({ error: null })} />;
    return this.props.children;
  }
}

function Fallback({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="karu-rise-in mx-auto flex max-w-md flex-col items-center px-6 py-20 text-center">
      <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-danger/10">
        <TriangleAlert aria-hidden="true" className="h-6 w-6 text-danger" />
      </span>
      <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{t('errorBoundary.title')}</h1>
      <p className="mt-2 text-sm text-slate-500">{t('errorBoundary.body')}</p>
      <button
        type="button"
        onClick={onRetry}
        className="karu-btn mt-6 inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand"
      >
        <RotateCcw aria-hidden="true" className="h-4 w-4" />
        {t('errorBoundary.retry')}
      </button>
    </div>
  );
}
