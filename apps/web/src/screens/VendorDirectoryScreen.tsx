import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ReviewBody } from '../components/ReviewBody';
import { usePageMeta } from '../lib/page-meta';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { PublicVendor, RatingSummary, Review, Vehicle, Vendor } from '@karu/shared';
import { api, type Page } from '../lib/api';
import { CATEGORY_LABEL, CITY_LABEL } from '../lib/format';
import { Badge, Card, CarCard, Rating } from '../ds';
import { EmptyState, ErrorNote, Spinner } from '../ui';
import { SkeletonCard } from '../components/Skeleton';
import { useCurrency } from '../lib/currency';
import { Button } from '../ds';
import { DOUALA, KaruMap, locateMe, type MapMarker } from '../components/KaruMap';

type VendorWithRating = Vendor & { rating: RatingSummary };
type DirectoryVendor = PublicVendor & { rating: RatingSummary };

/** Public directory of verified providers — trust is the product. */
export function VendorDirectoryScreen() {
  const { t } = useTranslation();
  usePageMeta({
    title: t('seo.vendors.title'),
    description: t('seo.vendors.description'),
  });
  const navigate = useNavigate();
  // 0034: "who's near me". Position stays in memory; it goes to our API to be
  // sorted against and nowhere else.
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState(false);
  const { data, isLoading, error } = useQuery({
    queryKey: ['vendors-public', near?.lat, near?.lng],
    queryFn: () =>
      api<DirectoryVendor[]>(
        near ? `/vendors?near_lat=${near.lat.toFixed(4)}&near_lng=${near.lng.toFixed(4)}` : '/vendors',
      ),
  });

  const markers = useMemo<MapMarker[]>(
    () => [
      ...(data ?? [])
        .filter((v) => v.approx_lat != null && v.approx_lng != null)
        .map((v) => ({
          id: v.id,
          lat: v.approx_lat!,
          lng: v.approx_lng!,
          // Short enough to sit on a pin, long enough to tell two apart.
          label: v.business_name.length <= 16 ? v.business_name : `${v.business_name.slice(0, 15)}…`,
          title: v.business_name,
          onClick: () => navigate(`/vendors/${v.id}`),
        })),
      ...(near ? [{ id: 'you', lat: near.lat, lng: near.lng, label: '●', title: t('location.you'), tone: 'you' as const }] : []),
    ],
    [data, near, navigate, t],
  );

  const findNearMe = async () => {
    setLocating(true);
    setLocateError(false);
    try {
      setNear(await locateMe());
    } catch {
      setLocateError(true);
    } finally {
      setLocating(false);
    }
  };

  if (isLoading && !data) {
    return (
      <div>
        <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 40 }}>
          Verified providers
        </h1>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18, marginTop: 24 }}>
          <SkeletonCard lines={3} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    );
  }
  if (error) return <ErrorNote>{(error as Error).message}</ErrorNote>;

  return (
    <div>
      <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 40 }}>
        {t('providers.title')}
      </h1>
      <p style={{ fontFamily: 'var(--font-ui)', fontSize: 15, color: 'var(--gray-500)', marginTop: 6 }}>
        {t('providers.sub')}
      </p>

      <div style={{ marginTop: 20 }}>
        <KaruMap
          center={near ?? DOUALA}
          zoom={near ? 13 : 12}
          markers={markers}
          height={300}
          ariaLabel={t('location.directoryMapAria')}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
          <Button size="sm" variant="outline" loading={locating} onClick={findNearMe}>
            {near ? t('location.nearMeOn') : t('location.nearMe')}
          </Button>
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-500)' }}>
            {locateError ? t('location.denied') : t('location.approxNote')}
          </span>
        </div>
      </div>

      {data?.length === 0 && <EmptyState title={t('providers.none')} />}
      <div className="karu-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18, marginTop: 24 }}>
        {data?.map((v) => (
          <Link key={v.id} to={`/vendors/${v.id}`} className="karu-card-link" style={{ borderRadius: 'var(--radius-md)' }}>
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 10 }}>
                <div>
                  <div style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 20, color: 'var(--ink)' }}>
                    {v.business_name}
                  </div>
                  <div style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--gray-500)', marginTop: 4 }}>
                    {CITY_LABEL[v.city]}
                    {v.distance_km != null && ` · ${t('location.kmAway', { km: v.distance_km })}`}
                  </div>
                  <div style={{ marginTop: 8 }}>
                    {v.rating?.average != null ? (
                      <Rating value={v.rating.average} count={v.rating.count} />
                    ) : (
                      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 13, color: 'var(--gray-400)' }}>
                        {t('providers.noReviews')}
                      </span>
                    )}
                  </div>
                </div>
                {v.status === 'verified' && <Badge variant="success">{t('providers.verified')}</Badge>}
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
  const { t } = useTranslation();
  const { id = '' } = useParams();
  const { data: vendors, isLoading: loadingVendors } = useQuery({
    queryKey: ['vendors-public'],
    queryFn: () => api<VendorWithRating[]>('/vendors'),
  });
  const vendor = vendors?.find((v) => v.id === id);

  const { data: cars, isLoading } = useQuery({
    queryKey: ['vendor-cars', id],
    queryFn: () => api<Page<Vehicle>>(`/vehicles?vendor_id=${id}&limit=50`).then((p) => p.items),
  });

  if (loadingVendors) return <Spinner label={t('common.loading')} />;
  // An unknown id must say so, not render an empty fleet as if the provider existed.
  if (!vendor) {
    return (
      <EmptyState
        title={t('providers.notFound')}
        hint={t('providers.notFoundHint')}
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
              {/*
                No phone here: this header renders to logged-out visitors, and
                the provider signup page promises that a vendor's number stays
                private with contact routed through Karu. The API no longer
                sends it either (vendors.service listPublic).
              */}
              {CITY_LABEL[vendor.city]}
            </p>
            <div style={{ marginTop: 10 }}>
              {vendor.rating?.average != null ? (
                <Rating value={vendor.rating.average} count={vendor.rating.count} color="var(--white)" size={18} />
              ) : (
                <span style={{ fontFamily: 'var(--font-ui)', fontSize: 14, color: 'var(--text-on-dark-muted)' }}>
                  {t('providers.noReviews')}
                </span>
              )}
            </div>
          </div>
          {vendor.status === 'verified' && (
            <Badge variant="solid">{t('providers.verifiedProvider')}</Badge>
          )}
        </div>
      )}

      {vendor.bio && (
        <p
          style={{
            margin: '20px 0 0',
            fontFamily: 'var(--font-ui)',
            fontSize: 15,
            lineHeight: 1.6,
            color: 'var(--gray-600)',
          }}
        >
          {vendor.bio}
        </p>
      )}

      <VendorReviews vendorId={id} />

      <h2 style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 22, margin: '28px 0 14px' }}>
        {t('providers.availableCars')}
      </h2>
      {isLoading && <Spinner />}
      {cars?.length === 0 && <EmptyState title={t('providers.noCars')} />}
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
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: ['vendor-reviews', vendorId],
    queryFn: () => api<Review[]>(`/vendors/${vendorId}/reviews`),
  });
  if (!data || data.length === 0) return null;

  return (
    <>
      <h2 style={{ fontFamily: 'var(--font-sans)', fontWeight: 700, fontSize: 22, margin: '28px 0 14px' }}>
        {t('providers.whatCustomersSaid')}
      </h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {data.map((r) => (
          <Card key={r.id}>
            <Rating value={r.rating} />
            <ReviewBody review={r} />
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
  const { t } = useTranslation();
  const { secondary } = useCurrency();
  return (
    <Link to={`/cars/${v.id}`}>
      <CarCard
        image={v.photos[0]}
        name={`${v.make} ${v.model}`}
        category={`${t('search.orSimilar', { category: CATEGORY_LABEL[v.category] })}${v.year ? ` · ${v.year}` : ''}`}
        seats={v.seats ? t('common.seats', { count: v.seats }) : '—'}
        transmission={v.transmission === 'automatic' ? t('common.automatic') : t('common.manual')}
        extra={CITY_LABEL[v.city]}
        price={v.daily_rate_xaf}
        subPrice={t('common.allFeesIn')}
                perDayLabel={t('common.perDay')}
        secondaryPrice={secondary(v.daily_rate_xaf)}
      />
    </Link>
  );
}
