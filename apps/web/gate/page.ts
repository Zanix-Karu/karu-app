/**
 * The coming-soon page the gate serves. Self-contained on purpose: every asset
 * of the deployment is behind the gate, so the page can't reference any of
 * them — styles are inline, the favicon is a data URI, and there is no script
 * (the form is a plain POST).
 *
 * Both languages are on the page, the browser's preferred one first. Colours
 * and type are the app's (src/ds/tokens.css): gold wordmark on warm ink,
 * Cormorant Garamond display, Outfit body.
 */

export type Locale = 'en' | 'fr';

const COPY = {
  en: {
    title: 'Coming soon',
    lede: 'Verified car rental for Cameroon, in Douala and Yaoundé. We’re putting the finishing touches on it.',
    more: 'Learn more at',
    team: 'Team access',
    code: 'Access code',
    enter: 'Enter',
    remember: 'This browser stays signed in for 30 days.',
    failed: 'That code isn’t right.',
  },
  fr: {
    title: 'Bientôt disponible',
    lede: 'La location de voitures vérifiée au Cameroun, à Douala et Yaoundé. Nous peaufinons les derniers détails.',
    more: 'En savoir plus sur',
    team: 'Accès équipe',
    code: 'Code d’accès',
    enter: 'Entrer',
    remember: 'Ce navigateur reste connecté pendant 30 jours.',
    failed: 'Ce code n’est pas le bon.',
  },
} satisfies Record<Locale, Record<string, string>>;

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%231c1006'/%3E%3Ctext x='32' y='46' text-anchor='middle' font-family='Georgia,serif' font-size='42' font-weight='700' fill='%23edb337'%3EK%3C/text%3E%3C/svg%3E";

const STYLES = `
:root {
  color-scheme: dark;
  --ink: #1c1006;
  --brown-800: #35200a;
  --brown-600: #53310f;
  --gold: #edb337;
  --yellow: #fbd301;
  --yellow-soft: #f6dc53;
  --cream: #f4efe7;
  --muted: rgba(244, 239, 231, 0.72);
  --faint: rgba(244, 239, 231, 0.52);
  --display: 'Cormorant Garamond', Georgia, 'Times New Roman', serif;
  --sans: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  grid-template-rows: 1fr auto;
  background: var(--ink) radial-gradient(120% 70% at 50% 0%, var(--brown-600) 0%, var(--brown-800) 42%, var(--ink) 100%) no-repeat;
  color: var(--cream);
  font: 400 1rem/1.6 var(--sans);
  text-align: center;
  -webkit-font-smoothing: antialiased;
}
main { align-self: center; width: 100%; max-width: 36rem; margin: 0 auto; padding: 4rem 1.25rem 2rem; }
.wordmark {
  margin: 0 0 2.75rem;
  font: 700 1.75rem/1 var(--display);
  letter-spacing: 0.3em;
  text-indent: 0.3em;
  text-transform: uppercase;
  color: var(--gold);
}
h1 { margin: 0; font: 700 clamp(3rem, 13vw, 4.75rem)/1 var(--display); letter-spacing: -0.01em; }
.lede { max-width: 32ch; margin: 1.125rem auto 0; font-size: 1.0625rem; color: var(--muted); }
.road {
  position: relative;
  width: 8.25rem;
  height: 2px;
  margin: 2.5rem auto;
  overflow: hidden;
  border-radius: 2px;
  background: rgba(237, 179, 55, 0.22);
}
.road::after {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 2.5rem;
  border-radius: 2px;
  background: var(--gold);
  animation: drive 3.2s cubic-bezier(0.65, 0, 0.35, 1) infinite;
}
@keyframes drive { from { transform: translateX(-2.5rem); } to { transform: translateX(8.25rem); } }
.second { margin: 0; font: 700 clamp(1.75rem, 7vw, 2.375rem)/1.1 var(--display); opacity: 0.9; }
.second + .lede { margin-top: 0.75rem; font-size: 1rem; }
.more { margin: 2.75rem 0 0; font-size: 0.9375rem; color: var(--faint); }
a { color: var(--gold); text-underline-offset: 3px; }
a:hover { color: var(--yellow); }
:focus-visible { outline: 2px solid var(--yellow); outline-offset: 3px; }
footer { padding: 1rem 1.25rem 2rem; }
summary {
  display: inline-block;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  cursor: pointer;
  list-style: none;
  font-size: 0.8125rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--faint);
}
summary::-webkit-details-marker { display: none; }
summary:hover, details[open] summary { color: var(--cream); }
form { width: 100%; max-width: 22rem; margin: 0.75rem auto 0; text-align: left; }
label { display: block; margin-bottom: 0.375rem; font-size: 0.875rem; color: var(--muted); }
.row { display: flex; gap: 0.5rem; }
input {
  flex: 1;
  min-width: 0;
  height: 2.75rem;
  padding: 0 0.875rem;
  border: 1px solid rgba(244, 239, 231, 0.28);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--cream);
  font: inherit;
}
input:focus { outline: none; border-color: var(--gold); box-shadow: 0 0 0 3px rgba(237, 179, 55, 0.25); }
button {
  height: 2.75rem;
  padding: 0 1.25rem;
  border: 0;
  border-radius: 10px;
  background: var(--yellow);
  color: var(--ink);
  font: 600 0.9375rem var(--sans);
  cursor: pointer;
}
button:hover { background: var(--yellow-soft); }
/* Above the field, not below: autofocus scrolls the field to the bottom edge
   of a short screen, which would hide anything under it. */
.failed { margin: 0 0 0.5rem; font-size: 0.875rem; color: #ffb4a8; }
.note { margin: 0.625rem 0 0; font-size: 0.8125rem; color: var(--faint); }
@media (prefers-reduced-motion: reduce) {
  .road::after { animation: none; transform: translateX(2.875rem); }
}
`;

export function renderComingSoon(view: {
  locale: Locale;
  /** Where the access form posts. */
  action: string;
  /** Same-origin path to land on after unlocking. */
  next: string;
  formOpen: boolean;
  failed: boolean;
}): string {
  const other: Locale = view.locale === 'en' ? 'fr' : 'en';
  const t = COPY[view.locale];
  const o = COPY[other];

  return `<!doctype html>
<html lang="${view.locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<meta name="theme-color" content="#1c1006">
<title>${t.title} · Karu</title>
<meta name="description" content="${escapeHtml(t.lede)}">
<meta property="og:site_name" content="Karu">
<meta property="og:title" content="${t.title} · Karu">
<meta property="og:description" content="${escapeHtml(t.lede)}">
<link rel="icon" href="${FAVICON}">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@700&family=Outfit:wght@400;600&display=swap">
<style>${STYLES}</style>
</head>
<body>
<main>
  <p class="wordmark">Karu</p>
  <h1>${t.title}</h1>
  <p class="lede">${t.lede}</p>
  <div class="road" aria-hidden="true"></div>
  <div lang="${other}">
    <p class="second">${o.title}</p>
    <p class="lede">${o.lede}</p>
  </div>
  <p class="more">${t.more} <a href="https://www.getkaru.io">getkaru.io</a></p>
</main>
<footer>
  <details${view.formOpen ? ' open' : ''}>
    <summary>${t.team}</summary>
    <form method="post" action="${escapeHtml(view.action)}">
      <input type="hidden" name="next" value="${escapeHtml(view.next)}">
      <label for="code">${t.code}</label>
      ${view.failed ? `<p class="failed" id="failed" role="alert">${t.failed}</p>` : ''}
      <div class="row">
        <input id="code" name="code" type="password" autocomplete="current-password" required${view.formOpen ? ' autofocus' : ''}${view.failed ? ' aria-invalid="true" aria-describedby="failed"' : ''}>
        <button type="submit">${t.enter}</button>
      </div>
      <p class="note">${t.remember}</p>
    </form>
  </details>
</footer>
</body>
</html>
`;
}
