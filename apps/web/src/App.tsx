import { useEffect, useState } from 'react';

/**
 * Placeholder shell. This is intentionally minimal — the real UI code drops in
 * here. It pings the API health endpoint so you can confirm web → API wiring.
 */
export default function App() {
  const [apiStatus, setApiStatus] = useState<'checking' | 'ok' | 'down'>('checking');

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/health`)
      .then((r) => (r.ok ? setApiStatus('ok') : setApiStatus('down')))
      .catch(() => setApiStatus('down'));
  }, []);

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Karu</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Verified car-rental marketplace — application scaffold
        </p>

        <div className="mt-6 flex items-center gap-2 text-sm">
          <span
            className={
              'inline-block h-2.5 w-2.5 rounded-full ' +
              (apiStatus === 'ok'
                ? 'bg-green-500'
                : apiStatus === 'down'
                  ? 'bg-red-500'
                  : 'bg-amber-400')
            }
          />
          <span className="text-neutral-600">
            API:{' '}
            {apiStatus === 'checking'
              ? 'checking…'
              : apiStatus === 'ok'
                ? 'connected'
                : 'not reachable (start @karu/api)'}
          </span>
        </div>

        <p className="mt-6 text-xs text-neutral-400">
          Drop your UI code into <code className="font-mono">apps/web/src</code>.
        </p>
      </div>
    </main>
  );
}
