import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import type { RatingSummary, Review, Vehicle, Vendor } from '@karu/shared';
import { api } from '../lib/api';
import { CATEGORY_LABEL, CITY_LABEL } from '../lib/format';
import { Badge, Card, CarCard, Rating } from '../ds';
import { EmptyState, ErrorNote, Spinner } from '../ui';

type VendorWithRating = Vendor & { rating: RatingSummary };

/** Public directory of verified providers — trust is the product. */
export function VendorDirectoryScreen() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['vendors-public'],
    queryFn: () => api<VendorWithRating[]>('/vendors'),
  });

  if (isLoading) return <Spinner label="Loading providers…" />;
  if (error) return <ErrorNote>{(error as Error).message}</ErrorNote>;

  return (
    <div>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 40 }}>
        Verified providers
      </h1>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 15, color: 'var(--gray-500)', marginTop: 6 }}>
        Every provider on Karu has passed document verification — business registration, carte grise, insurance.
      </p>

      {data?.length === 0 && <EmptyState title="No providers yet" />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18, marginTop: 24 }}>
        {data?.map((v) => (
          <Link key={v.id} to={`/vendors/${v.id}`}>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 20, color: 'var(--ink)' }}>
                    {v.business_name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 4 }}>
                    {CITY_LABEL[v.city]}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {v.rating?.average != null ? (
                      <Rating value={v.rating.average} count={v.rating.count} />
                    ) : (
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-400)' }}>
                        No reviews yet
                      </span>
                    )}
                  </div>
                </div>
                <Badge variant="success">✓ Verified</Badge>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}

/** One provider's page: profile + their bookable fleet. */
export function VendorProfileScreen() {
  const { id = '' } = useParams();
  const { data: vendors, isLoading: loadingVendors } = useQuery({
    queryKey: ['vendors-public'],
    queryFn: () => api<VendorWithRating[]>('/vendors'),
  });
  const vendor = vendors?.find((v) => v.id === id);

  const { data: cars, isLoading } = useQuery({
    queryKey: ['vendor-cars', id],
    queryFn: () => api<Vehicle[]>(`/vehicles?vendor_id=${id}`),
  });

  if (loadingVendors) return <Spinner label="Loading provider…" />;
  // An unknown id must say so, not render an empty fleet as if the provider existed.
  if (!vendor) {
    return (
      <EmptyState
        title="Provider not found"
        hint="This provider may have been removed, or is no longer verified."
      />
    );
  }

  return (
    <div>
      {vendor && (
        <div
          style={{
            background: 'var(--bg-gradient)',
            borderRadius: 'var(--radius-lg)',
            padding: '36px 44px',
            color: 'var(--white)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 14,
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 38 }}>
              {vendor.business_name}
            </h1>
            <p style={{ margin: '6px 0 0', fontFamily: 'var(--font-ui)', color: 'var(--text-on-dark-muted)' }}>
              {CITY_LABEL[vendor.city]}
              {vendor.contact_phone ? ` · ${vendor.contact_phone}` : ''}
            </p>
            <div style={{ marginTop: 10 }}>
              {vendor.rating?.average != null ? (
                <Rating value={vendor.rating.average} count={vendor.rating.count} color="var(--white)" size={18} />
              ) : (
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--text-on-dark-muted)' }}>
                  No reviews yet
                </span>
              )}
            </div>
          </div>
          <Badge variant="solid">✓ Verified provider</Badge>
        </div>
      )}

      <VendorReviews vendorId={id} />

      <h2 style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 22, margin: '28px 0 14px' }}>
        Available cars
      </h2>
      {isLoading && <Spinner />}
      {cars?.length === 0 && <EmptyState title="No cars listed right now" />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {cars?.map((v) => (
          <CarCardLink key={v.id} vehicle={v} />
        ))}
      </div>
    </div>
  );
}

/** What customers said about this provider. */
function VendorReviews({ vendorId }: { vendorId: string }) {
  const { data } = useQuery({
    queryKey: ['vendor-reviews', vendorId],
    queryFn: () => api<Review[]>(`/vendors/${vendorId}/reviews`),
  });
  if (!data || data.length === 0) return null;

  return (
    <>
      <h2 style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 22, margin: '28px 0 14px' }}>
        What customers said
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {data.map((r) => (
          <Card key={r.id}>
            <Rating value={r.rating} />
            {r.comment && (
              <p style={{ fontFamily: 'var(--font-ui)', fontSize: 14, marginTop: 8, lineHeight: 1.5 }}>
                &ldquo;{r.comment}&rdquo;
              </p>
            )}
            <p style={{ fontFamily: 'var(--font-ui)', fontSize: 12, color: 'var(--gray-400)', marginTop: 8 }}>
              {new Date(r.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </Card>
        ))}
      </div>
    </>
  );
}

function CarCardLink({ vehicle: v }: { vehicle: Vehicle }) {
  return (
    <Link to={`/cars/${v.id}`}>
      <CarCard
        image={v.photos[0]}
        name={`${v.make} ${v.model}`}
        category={`or similar ${CATEGORY_LABEL[v.category]}${v.year ? ` · ${v.year}` : ''}`}
        seats={v.seats ? `${v.seats} Seats` : '—'}
        transmission={v.transmission === 'automatic' ? 'Automatic' : 'Manual'}
        extra={CITY_LABEL[v.city]}
        price={v.daily_rate_xaf}
        subPrice="all fees in"
      />
    </Link>
  );
}
