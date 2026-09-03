import { useEffect } from 'react';

const SUFFIX = 'Karu';

/**
 * Per-route <title> and description for a client-rendered app.
 *
 * Every route used to serve the shell's `<title>Karu</title>`, which made
 * tabs, history and bookmarks indistinguishable (SEO-3). A hook is enough
 * here — react-helmet would add a dependency to do the same two DOM writes,
 * and without SSR neither one helps a crawler that does not run JS.
 *
 * `noindex` exists for the soft-404 case: the SPA rewrite answers every
 * unknown path with 200 and the app's own not-found body, so the only signal
 * available to a crawler is a robots meta tag.
 */
export function usePageMeta({
  title,
  description,
  noindex = false,
}: {
  title?: string;
  description?: string;
  noindex?: boolean;
}) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${SUFFIX}` : SUFFIX;
    return () => {
      document.title = previous;
    };
  }, [title]);

  useEffect(() => {
    if (!description) return;
    const tag = ensureMeta('name', 'description');
    const previous = tag.getAttribute('content');
    tag.setAttribute('content', description);
    return () => {
      if (previous === null) tag.remove();
      else tag.setAttribute('content', previous);
    };
  }, [description]);

  useEffect(() => {
    if (!noindex) return;
    const tag = ensureMeta('name', 'robots');
    tag.setAttribute('content', 'noindex, follow');
    return () => tag.remove();
  }, [noindex]);
}

function ensureMeta(attr: 'name' | 'property', value: string): HTMLMetaElement {
  const existing = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${value}"]`);
  if (existing) return existing;
  const created = document.createElement('meta');
  created.setAttribute(attr, value);
  document.head.appendChild(created);
  return created;
}
