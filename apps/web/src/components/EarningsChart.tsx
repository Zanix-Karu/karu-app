import { useTranslation } from 'react-i18next';
import { xaf } from '../lib/format';

/**
 * Earnings over the last 30 days as a plain inline SVG area chart. A whole
 * charting dependency for one sparkline is not worth the bundle; this reads
 * the same series the dashboard already fetches.
 */
export function EarningsChart({ series }: { series: Array<{ day: string; xaf: number }> }) {
  const { t, i18n } = useTranslation();
  const W = 640;
  const H = 160;
  const PAD = 8;
  const max = Math.max(...series.map((p) => p.xaf), 1);
  const step = series.length > 1 ? (W - PAD * 2) / (series.length - 1) : 0;

  const pointAt = (i: number, v: number) => {
    const x = PAD + i * step;
    const y = H - PAD - (v / max) * (H - PAD * 2);
    return [x, y] as const;
  };

  const line = series.map((p, i) => pointAt(i, p.xaf).join(',')).join(' ');
  const area = `${PAD},${H - PAD} ${line} ${W - PAD},${H - PAD}`;
  const total = series.reduce((s, p) => s + p.xaf, 0);
  const label = (i: number) =>
    new Date(`${series[i].day}T00:00:00`).toLocaleDateString(
      i18n.language === 'fr' ? 'fr-FR' : 'en-GB',
      { day: 'numeric', month: 'short' },
    );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-500)' }}>
          {t('vendor.chart.last30')}
        </span>
        <span style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 18 }}>
          {xaf(total)}
        </span>
      </div>

      {total === 0 ? (
        <p
          style={{
            fontFamily: 'var(--font-ui)',
            fontSize: 14,
            color: 'var(--gray-400)',
            padding: '32px 0',
            textAlign: 'center',
          }}
        >
          {t('vendor.chart.empty')}
        </p>
      ) : (
        <>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height={H}
            role="img"
            aria-label={`Earnings for the last 30 days, total ${xaf(total)}`}
            style={{ marginTop: 8, display: 'block' }}
          >
            <polygon points={area} fill="var(--yellow)" opacity="0.18" />
            <polyline
              points={line}
              fill="none"
              stroke="var(--gold-500)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {series.map((p, i) =>
              p.xaf > 0 ? (
                <circle key={p.day} cx={pointAt(i, p.xaf)[0]} cy={pointAt(i, p.xaf)[1]} r="3" fill="var(--gold-600)">
                  <title>{`${label(i)}: ${xaf(p.xaf)}`}</title>
                </circle>
              ) : null,
            )}
          </svg>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontFamily: 'var(--font-ui)',
              fontSize: 12,
              color: 'var(--gray-400)',
            }}
          >
            <span>{label(0)}</span>
            <span>{label(series.length - 1)}</span>
          </div>
        </>
      )}
    </div>
  );
}
