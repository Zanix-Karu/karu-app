import type { CSSProperties } from 'react';

/**
 * Content-shaped loading placeholders. A skeleton that matches the shape of
 * what is coming reads as "this is loading"; a bare spinner in the middle of
 * a page reads as "something is wrong".
 */

export function Skeleton({
  width = '100%',
  height = 16,
  radius = 'var(--radius-sm)',
  style = {},
}: {
  width?: number | string;
  height?: number | string;
  radius?: string;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      className="karu-skeleton"
      style={{ display: 'block', width, height, borderRadius: radius, ...style }}
    />
  );
}

/** A card-shaped placeholder for list rows (bookings, providers). */
export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div
      style={{
        background: 'var(--white)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        padding: 24,
      }}
    >
      <Skeleton width="35%" height={12} />
      <Skeleton width="60%" height={20} style={{ marginTop: 12 }} />
      {Array.from({ length: Math.max(0, lines - 2) }).map((_, i) => (
        <Skeleton key={i} width={i % 2 ? '45%' : '70%'} height={13} style={{ marginTop: 10 }} />
      ))}
    </div>
  );
}

/** The search-result row shape: image | details | price. */
export function SkeletonCarCard() {
  return (
    <div
      className="karu-car-card"
      style={{
        background: 'var(--white)',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-card)',
        padding: 24,
      }}
    >
      <Skeleton height={150} radius="var(--radius-sm)" />
      <div>
        <Skeleton width="55%" height={26} />
        <Skeleton width="35%" height={14} style={{ marginTop: 10 }} />
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <Skeleton width={90} height={38} />
          <Skeleton width={90} height={38} />
          <Skeleton width={90} height={38} />
        </div>
      </div>
      <div className="karu-car-card-actions">
        <Skeleton width={120} height={16} />
        <Skeleton width={140} height={28} style={{ marginTop: 8 }} />
        <Skeleton width={110} height={40} radius="var(--radius-md)" style={{ marginTop: 12 }} />
      </div>
    </div>
  );
}

/** Stat-card row placeholder for the dashboards. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            background: 'var(--white)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-card)',
            padding: 24,
          }}
        >
          <Skeleton width="60%" height={13} />
          <Skeleton width="45%" height={34} style={{ marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}
