import { useState } from 'react';
import { PhotoCarousel } from '../components/PhotoCarousel';
import { usePageMeta } from '../lib/page-meta';
import { useTranslation } from 'react-i18next';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import type { Booking, DeliveryType, VehicleDetail } from '@karu/shared';
import { orderedPhotos, primaryPhoto, quoteBooking, rentalDays } from '@karu/shared';
import { DOUALA, KaruMap, YAOUNDE, locateMe } from '../components/KaruMap';
import { api } from '../lib/api';
import { useAuth, useView } from '../lib/auth';
import { CAN_BOOK } from '../lib/roles';
import { useCurrency } from '../lib/currency';
import { CATEGORY_LABEL, CITY_LABEL, prettyDate, todayISO, xaf } from '../lib/format';
import { Button, Card, ErrorNote, Field, Input, Spinner } from '../ui';
import { CarCard } from '../ds';

interface Availability {
  available: boolean;
  conflicts: Array<{ start_date: string; end_date: string }>;
}

export function CarDetailScreen() {
  const { id = '' } = useParams();
  const [search] = useSearchParams();
  const { t } = useTranslation();
  const { session } = useAuth();
  const view = useView();
  const canBook = CAN_BOOK[view];
  const { secondary } = useCurrency();
  const navigate = useNavigate();

  const [from, setFrom] = useState(search.get('from') ?? '');
  const [to, setTo] = useState(search.get('to') ?? '');
  const [pickup, setPickup] = useState('');
  const [note, setNote] = useState('');
  const [withDriver, setWithDriver] = useState(false);
  const [deliveryType, setDeliveryType] = useState<DeliveryType>('pickup_point');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  // 0034: where to bring the car, as a pin, and directions in words.
  const [deliveryPin, setDeliveryPin] = useState<{ lat: number; lng: number } | null>(null);
  const [landmark, setLandmark] = useState('');

  const { data: car, isLoading } = useQuery({
    queryKey: ['vehicle', id],
    queryFn: () => api<VehicleDetail>(`/vehicles/${id}`),
  });

  // Title comes from the loaded car, so a shared link and a browser tab
  // both name the vehicle rather than reading 'Karu' like every other route.
  usePageMeta({
    title: car ? `${car.make} ${car.model}` : undefined,
    description: t('seo.car.description'),
  });

  const windowChosen = Boolean(from && to && from <= to);

  const { data: avail, isFetching: checking } = useQuery({
    queryKey: ['availability', id, from, to],
    queryFn: () => api<Availability>(`/vehicles/${id}/availability?from=${from}&to=${to}`),
    enabled: windowChosen,
  });

  const book = useMutation({
    mutationFn: () =>
      api<Booking>('/bookings', {
        method: 'POST',
        body: JSON.stringify({
          vehicle_id: id,
          start_date: from,
          end_date: to,
          pickup_location: pickup || undefined,
          customer_note: note || undefined,
          with_driver: withDriver,
          delivery_type: deliveryType,
          delivery_address: deliveryAddress || undefined,
          ...(deliveryType === 'address' && deliveryPin
            ? { delivery_lat: deliveryPin.lat, delivery_lng: deliveryPin.lng }
            : {}),
          delivery_landmark: deliveryType === 'address' ? landmark || undefined : undefined,
          pickup_time: pickupTime || undefined,
        }),
      }),
    onSuccess: (booking) =>
      navigate(`/bookings/${booking.id}/confirmed`, { state: { booking } }),
  });

  // The exact delivery fee for the pin, from the provider's real base (the
  // public one is rounded), so the quote here is the fee the booking stores.
  const quoteDays = from && to && from <= to ? rentalDays(from, to) : 1;
  const { data: deliveryQuote } = useQuery({
    queryKey: ['delivery-quote', id, deliveryPin?.lat, deliveryPin?.lng, quoteDays],
    queryFn: () =>
      api<{
        distance_km: number | null;
        fee_xaf: number;
        waived_xaf: number;
        out_of_range: boolean;
        free_delivery_min_days: number | null;
      }>(`/vehicles/${id}/delivery-quote?lat=${deliveryPin!.lat}&lng=${deliveryPin!.lng}&days=${quoteDays}`),
    enabled: deliveryType === 'address' && Boolean(deliveryPin),
  });

  if (isLoading) return <Spinner label={t('common.loading')} />;
  if (!car) return <ErrorNote>{t('car.notFound')}</ErrorNote>;
  const zoned = (car.vendor.delivery_zones?.length ?? 0) > 0;

  const driverAvailable = car.driver_option !== 'none';
  const driverRequired = car.driver_option === 'required';
  // A driver-only car is quoted with a driver from the first render — showing
  // a self-drive price the customer can never actually book is a bait price.
  const driverChosen = driverRequired || (driverAvailable && withDriver);

  // The same function the API uses, so the quote below is the quote stored.
  const quote = quoteBooking({
    startDate: from || todayISO(),
    endDate: to || from || todayISO(),
    dailyRateXaf: car.daily_rate_xaf,
    weeklyRateXaf: car.weekly_rate_xaf,
    monthlyRateXaf: car.monthly_rate_xaf,
    withDriver: driverChosen,
    driverDailyRateXaf: car.driver_daily_rate_xaf,
    deliveryType,
    // With a pin, the server's figure for it; otherwise the flat fee (or, for
    // a zoned provider, nothing until a pin is dropped).
    deliveryFeeXaf:
      deliveryType === 'address' && deliveryQuote
        ? deliveryQuote.fee_xaf
        : zoned
          ? 0
          : car.vendor.delivery_fee_xaf,
    airportFeeXaf: car.vendor.airport_fee_xaf,
    freeDeliveryMinDays: deliveryQuote ? null : car.vendor.free_delivery_min_days,
  });
  const days = windowChosen ? quote.days : 0;
  const total = quote.totalXaf;

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
      <div>
        <PhotoCarousel photos={orderedPhotos(car)} alt={`${car.make} ${car.model}`} />

        <h1 className="mt-6 font-display text-3xl font-bold">
          {car.make} {car.model} {car.year && <span className="text-karu-mute">{car.year}</span>}
        </h1>
        <p className="mt-1 text-sm text-karu-mute">
          {CITY_LABEL[car.city]} · {CATEGORY_LABEL[car.category]}
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            car.transmission === 'automatic' ? t('common.automatic') : t('common.manual'),
            ...(car.fuel_type ? [t(`common.fuel.${car.fuel_type}`)] : []),
            ...(car.seats ? [t('common.seats', { count: car.seats })] : []),
            // Pending vendors operate too — the badge only appears once the
            // paperwork has actually been approved.
            ...(car.vendor.status === 'verified' ? [t('car.verifiedProvider')] : []),
          ].map((f) => (
            <span
              key={f}
              className="rounded-full border border-karu-ink/15 bg-karu-surface px-3 py-1 text-xs font-semibold text-karu-brown"
            >
              {f}
            </span>
          ))}
        </div>

        {car.description && <p className="mt-5 max-w-prose text-sm leading-6">{car.description}</p>}

        {car.pickup_locations.length > 0 && (
          <div className="mt-5">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-karu-mute">
              {t('car.pickupLocations')}
            </h2>
            <ul className="mt-1 text-sm">
              {car.pickup_locations.map((p) => (
                <li key={p}>· {p}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-karu-mute">
            {t('car.aboutProvider')}
          </h2>
          <p className="mt-1 text-sm">
            <Link to={`/vendors/${car.vendor.id}`} className="font-semibold text-karu-gold hover:underline">
              {car.vendor.business_name}
            </Link>
          </p>
          {car.vendor.bio && <p className="mt-1 max-w-prose text-sm leading-6">{car.vendor.bio}</p>}
        </div>

        <OtherVendorsWithThisCar car={car} />

        {/* State only what is enforced today. A timed free-cancellation window
            needs the refund path from the payments phase before it can be
            promised — until then cancelling is always free because nothing
            has been charged. */}
        <div className="mt-6 rounded-xl bg-karu-yellow/15 px-4 py-3 text-xs text-karu-brown">
          {t('car.conditions')}
        </div>
      </div>

      <Card className="h-fit p-5">
        <p className="font-display text-2xl font-bold">
          {xaf(car.daily_rate_xaf)} <span className="text-sm font-normal text-karu-mute">/ {t('common.perDay')}</span>
        </p>
        {secondary(car.daily_rate_xaf) && (
          <p className="text-sm font-semibold text-karu-gold">{secondary(car.daily_rate_xaf)}</p>
        )}

        {/* Providers browse read-only — showing them a booking CTA the API
            would refuse (403 Requires role: customer | admin) is a dead
            control. Tell them why instead. Admins can book on a customer's
            behalf, so this never applies to them. */}
        {!canBook && (
          <div className="mt-4 rounded-lg border border-karu-ink/10 bg-karu-cream px-4 py-3 text-sm text-karu-brown">
            {t('car.readOnlyVendor')}
          </div>
        )}

        {canBook && (
        <>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label={t('search.pickUp')}>
            <Input type="date" min={todayISO()} value={from} onChange={(e) => setFrom(e.target.value)} />
          </Field>
          <Field label={t('search.return')}>
            <Input type="date" min={from || todayISO()} value={to} onChange={(e) => setTo(e.target.value)} />
          </Field>
        </div>

        {windowChosen && (
          <div className="mt-3 text-sm">
            {checking && <p className="text-karu-mute">{t('car.checking')}</p>}
            {avail && avail.available && (
              <p className="font-semibold text-green-700">
                ✓ {t('car.available', { from: prettyDate(from), to: prettyDate(to) })}
              </p>
            )}
            {avail && !avail.available && (
              <p className="font-semibold text-karu-terracotta">
                {t('car.notAvailable')}
              </p>
            )}
          </div>
        )}

        {windowChosen && avail?.available && (
          <>
            {driverAvailable && (
              <div className="mt-3 rounded-xl border border-karu-ink/10 p-3">
                <div className="text-sm font-semibold">{t('car.driverHeading')}</div>
                {driverRequired ? (
                  <p className="mt-1 text-xs text-karu-mute">
                    {t('car.driverRequired', {
                      rate: xaf(car.driver_daily_rate_xaf ?? 0),
                    })}
                  </p>
                ) : (
                  <div className="mt-2 grid gap-2">
                    {[false, true].map((v) => (
                      <label key={String(v)} className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="driver"
                          checked={withDriver === v}
                          onChange={() => setWithDriver(v)}
                        />
                        <span className="flex-1">
                          {v ? t('car.driverYes') : t('car.driverNo')}
                        </span>
                        <span className="text-karu-mute">
                          {v ? `+ ${xaf(car.driver_daily_rate_xaf ?? 0)}/${t('car.perDay')}` : ''}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-3 rounded-xl border border-karu-ink/10 p-3">
              <div className="text-sm font-semibold">{t('car.deliveryHeading')}</div>
              <div className="mt-2 grid gap-2">
                {(
                  [
                    ['pickup_point', null],
                    ['airport', car.vendor.airport_fee_xaf],
                    // A zoned provider delivers even with no flat fee set.
                    ['address', car.vendor.delivery_fee_xaf ?? ((car.vendor.delivery_zones?.length ?? 0) > 0 ? -1 : null)],
                  ] as Array<[DeliveryType, number | null]>
                )
                  // A provider who doesn't run cars out shouldn't advertise it.
                  .filter(([kind, fee]) => kind === 'pickup_point' || fee !== null)
                  .map(([kind, fee]) => (
                    <label key={kind} className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="delivery"
                        checked={deliveryType === kind}
                        onChange={() => setDeliveryType(kind)}
                      />
                      <span className="flex-1">{t(`car.delivery.${kind}`)}</span>
                      <span className="text-karu-mute">
                        {kind === 'address' && zoned
                          ? t('location.byDistance')
                          : fee ? `+ ${xaf(fee)}` : fee === 0 ? t('car.free') : ''}
                      </span>
                    </label>
                  ))}
              </div>
              {deliveryType === 'address' && (
                <div className="mt-3">
                  <p className="text-xs text-karu-mute">{t('location.dropPin')}</p>
                  <div className="mt-2">
                    <KaruMap
                      center={
                        deliveryPin ??
                        (car.vendor.approx_lat != null && car.vendor.approx_lng != null
                          ? { lat: car.vendor.approx_lat, lng: car.vendor.approx_lng }
                          : car.city === 'yaounde'
                            ? YAOUNDE
                            : DOUALA)
                      }
                      zoom={13}
                      height={220}
                      picked={deliveryPin}
                      onPick={setDeliveryPin}
                      ariaLabel={t('location.deliveryMapAria')}
                    />
                  </div>
                  <button
                    type="button"
                    className="mt-2 text-xs font-semibold text-karu-brown underline"
                    onClick={() => void locateMe().then(setDeliveryPin).catch(() => undefined)}
                  >
                    {t('location.useMine')}
                  </button>
                  {deliveryQuote && (
                    <p
                      className={`mt-2 text-xs font-semibold ${
                        deliveryQuote.out_of_range ? 'text-karu-terracotta' : 'text-karu-brown'
                      }`}
                    >
                      {deliveryQuote.out_of_range
                        ? t('location.outOfRange', { km: deliveryQuote.distance_km })
                        : deliveryQuote.waived_xaf > 0
                          ? t('location.freeLongRental', { km: deliveryQuote.distance_km })
                          : t('location.quoteLine', {
                              km: deliveryQuote.distance_km,
                              fee: deliveryQuote.fee_xaf ? xaf(deliveryQuote.fee_xaf) : t('car.free'),
                            })}
                    </p>
                  )}
                  {!deliveryQuote && car.vendor.free_delivery_min_days ? (
                    <p className="mt-2 text-xs text-karu-brown">
                      {t('location.freeFromBadge', { count: car.vendor.free_delivery_min_days })}
                    </p>
                  ) : null}
                  <Field label={t('location.landmark')} className="mt-3">
                    <Input
                      value={landmark}
                      onChange={(e) => setLandmark(e.target.value)}
                      maxLength={300}
                      placeholder={t('location.landmarkHint')}
                    />
                  </Field>
                  <Field label={t('car.deliveryAddress')} className="mt-3">
                    <Input
                      value={deliveryAddress}
                      onChange={(e) => setDeliveryAddress(e.target.value)}
                      maxLength={300}
                      placeholder={t('car.deliveryAddressHint')}
                    />
                  </Field>
                </div>
              )}
              {deliveryType === 'airport' && (
                <Field label={t('car.flightDetails')} className="mt-3">
                  <Input
                    value={deliveryAddress}
                    onChange={(e) => setDeliveryAddress(e.target.value)}
                    maxLength={300}
                    placeholder={t('car.flightDetailsHint')}
                  />
                </Field>
              )}
              {deliveryType !== 'pickup_point' && (
                <Field label={t('car.pickupTime')} className="mt-3">
                  <Input
                    type="time"
                    value={pickupTime}
                    onChange={(e) => setPickupTime(e.target.value)}
                  />
                </Field>
              )}
            </div>

            {deliveryType === 'pickup_point' && (
            <Field label={t('car.preferredPickup')} className="mt-3">
              <Input
                list="pickups"
                value={pickup}
                onChange={(e) => setPickup(e.target.value)}
                placeholder={car.pickup_locations[0] ?? 'e.g. airport'}
              />
              <datalist id="pickups">
                {car.pickup_locations.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
            )}
            <Field label={t('car.noteToProvider')} className="mt-3">
              <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
            </Field>

            <div className="mt-4 space-y-1 border-t border-karu-ink/10 pt-4 text-sm">
              <div className="flex justify-between">
                <span>
                  {xaf(car.daily_rate_xaf)} × {days} day{days > 1 ? 's' : ''}
                </span>
                <span>{xaf(quote.vehicleXaf)}</span>
              </div>
              {quote.driverXaf > 0 && (
                <div className="flex justify-between">
                  <span>
                    {t('car.driverLine')} × {days} day{days > 1 ? 's' : ''}
                  </span>
                  <span>{xaf(quote.driverXaf)}</span>
                </div>
              )}
              {quote.deliveryXaf > 0 && (
                <div className="flex justify-between">
                  <span>{t(`car.delivery.${deliveryType}`)}</span>
                  <span>{xaf(quote.deliveryXaf)}</span>
                </div>
              )}
              {deliveryType === 'address' && (deliveryQuote?.waived_xaf ?? quote.deliveryWaivedXaf) > 0 && (
                // The customer-positive bit: show what they're not paying.
                <div className="flex justify-between text-green-700">
                  <span>{t(`car.delivery.address`)}</span>
                  <span>
                    <s className="mr-1 text-karu-mute">{xaf(deliveryQuote?.waived_xaf ?? quote.deliveryWaivedXaf)}</s>
                    {t('car.free')}
                  </span>
                </div>
              )}
              <div className="flex justify-between font-semibold">
                <span>{t('car.totalAllFees')}</span>
                <span>
                  {xaf(total)}
                  {secondary(total) && (
                    <span className="ml-1 font-normal text-karu-mute">({secondary(total)})</span>
                  )}
                </span>
              </div>
              <div className="flex justify-between text-karu-brown">
                <span>{t('car.depositNow')}</span>
                <span>{xaf(quote.depositXaf)}</span>
              </div>
              <p className="pt-1 text-xs text-karu-mute">
                {t('car.depositNote')}
              </p>
            </div>
          </>
        )}
        </>
        )}

        {book.isError && (
          <div className="mt-3">
            <ErrorNote>{(book.error as Error).message}</ErrorNote>
          </div>
        )}

        {canBook && (
          <>
            <Button
              className="mt-4 w-full"
              disabled={
                !windowChosen ||
                !avail?.available ||
                book.isPending ||
                // The driver can't find an address that wasn't given.
                (deliveryType === 'address' && !deliveryAddress.trim() && !deliveryPin) ||
                // A zoned provider prices by the pin, and won't go beyond the last ring.
                (deliveryType === 'address' && zoned && (!deliveryPin || Boolean(deliveryQuote?.out_of_range)))
              }
              onClick={() => {
                if (!session) {
                  navigate('/auth', { state: { from: `/cars/${id}?from=${from}&to=${to}` } });
                  return;
                }
                book.mutate();
              }}
            >
              {book.isPending ? t('car.sending') : session ? t('car.requestToBook') : t('car.signInToBook')}
            </Button>
            <p className="mt-2 text-center text-xs text-karu-mute">
              {t('car.noCharge')}
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

/**
 * Other active listings matching this car's make/model(/year), cheapest
 * first — grouped by a normalized match (see `compare()`), so a vendor typo
 * won't surface a real match here. Renders nothing when there are none, not
 * an empty state — this is a bonus, not a section the page promises.
 */
function OtherVendorsWithThisCar({ car }: { car: VehicleDetail }) {
  const { t } = useTranslation();
  const { secondary } = useCurrency();
  const params = new URLSearchParams({ make: car.make, model: car.model, exclude_vehicle_id: car.id });
  if (car.year) params.set('year', String(car.year));

  const { data } = useQuery({
    queryKey: ['vehicles-compare', car.id],
    queryFn: () => api<VehicleDetail[]>(`/vehicles/compare?${params.toString()}`),
  });

  if (!data || data.length === 0) return null;

  return (
    <div className="mt-6">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-karu-mute">
        {t('car.otherVendors')}
      </h2>
      <div className="mt-2 flex flex-col gap-4">
        {data.map((v) => (
          <Link key={v.id} to={`/cars/${v.id}`}>
            <CarCard
              image={primaryPhoto(v)}
              name={`${v.make} ${v.model}`}
              category={`${CATEGORY_LABEL[v.category]}${v.year ? ` · ${v.year}` : ''}`}
              seats={v.seats ? t('common.seats', { count: v.seats }) : '—'}
              transmission={v.transmission === 'automatic' ? t('common.automatic') : t('common.manual')}
              extra={CITY_LABEL[v.city]}
              provider={v.vendor.business_name}
              price={v.daily_rate_xaf}
              subPrice={t('common.allFeesIn')}
              perDayLabel={t('common.perDay')}
              secondaryPrice={secondary(v.daily_rate_xaf)}
            />
          </Link>
        ))}
      </div>
    </div>
  );
}
