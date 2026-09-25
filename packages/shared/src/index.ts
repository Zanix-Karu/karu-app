/**
 * @karu/shared — types & enums shared by the NestJS API and the React web app.
 * Keep this in lockstep with supabase/migrations. These string-literal unions
 * mirror the Postgres enums one-to-one.
 */

// Generated 1:1 mirror of the live Postgres schema — use for typing the
// Supabase client (createClient<Database>). Hand-written entity shapes below
// remain the API's public contract.
export type { Database, Json, Tables, TablesInsert, TablesUpdate } from './database.types.js';

export type UserRole = 'customer' | 'vendor' | 'admin';
export type City = 'douala' | 'yaounde' | 'other';

export type VendorStatus = 'pending' | 'verified' | 'rejected' | 'suspended';
// national_id / passport: identity verification for operators without an RCCM
// (the onboarding doc's "non-registered business" branch).
export type DocumentType =
  | 'rccm'
  | 'national_id'
  | 'passport'
  | 'carte_grise'
  | 'insurance'
  | 'roadworthiness';
export type DocumentStatus = 'pending' | 'approved' | 'rejected';

/** Document types that belong to one car rather than to the vendor. */
export const VEHICLE_DOCUMENT_TYPES: DocumentType[] = [
  'carte_grise',
  'insurance',
  'roadworthiness',
];

export type VehicleCategory = 'economy' | 'sedan' | 'suv' | 'pickup' | 'van' | 'luxury';
export type Transmission = 'manual' | 'automatic';
export type VehicleStatus = 'draft' | 'active' | 'inactive';

export type BookingStatus =
  | 'requested'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'
  | 'in_progress'
  | 'completed';

// 'card' = UK card service (Stripe/Wise) for the MVP deposit;
// 'manual' = recorded by the team outside any provider.
export type PaymentProvider = 'mtn_momo' | 'orange_money' | 'card' | 'manual';
export type PaymentStatus = 'pending' | 'held' | 'released' | 'refunded' | 'failed';

export type ReviewTarget = 'customer' | 'vendor';

/**
 * Allowed booking status transitions. The API validates every status change
 * against this map so the booking state machine can't be driven into an
 * illegal state. Source of truth — keep server-side guards reading from here.
 */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  requested: ['confirmed', 'rejected', 'cancelled'],
  confirmed: ['in_progress', 'cancelled'],
  in_progress: ['completed'],
  completed: [],
  rejected: [],
  cancelled: [],
};

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[from].includes(to);
}

/**
 * REQ-10: a booking's active lists (customer, vendor, admin) should show
 * requested/confirmed/in_progress and nothing else — completed, rejected and
 * cancelled trips are done, and clutter the list they're trying to act on.
 * "Archived" is derived from the state machine itself (a terminal status has
 * no outgoing transitions) rather than a separate flag, so there's nothing
 * to keep in sync if a transition rule ever changes.
 */
export function isBookingArchived(status: BookingStatus): boolean {
  return BOOKING_TRANSITIONS[status].length === 0;
}

/**
 * Allowed vendor status transitions — same idea as BOOKING_TRANSITIONS, so a
 * fat-fingered admin click can't drive a vendor into a state that makes no
 * sense (e.g. rejected → suspended). Re-verification after a rejection or a
 * suspension is deliberate: fixed paperwork gets the vendor back.
 */
export const VENDOR_TRANSITIONS: Record<VendorStatus, VendorStatus[]> = {
  pending: ['verified', 'rejected'],
  verified: ['suspended'],
  rejected: ['verified'],
  suspended: ['verified'],
};

export function canTransitionVendor(from: VendorStatus, to: VendorStatus): boolean {
  return VENDOR_TRANSITIONS[from].includes(to);
}

/**
 * Deposit charged at booking time (MVP: the rest is settled at pick-up).
 * 15% — the top of the 10–15% band agreed in the MVP plan, pending the
 * final payment-provider decision.
 */
export const DEPOSIT_RATE = 0.15;

/** Deposit in whole XAF for a given booking total. */
export function computeDepositXaf(totalXaf: number): number {
  return Math.ceil(totalXaf * DEPOSIT_RATE);
}

/** Nights are irrelevant here — a rental is charged per calendar day, inclusive. */
export function rentalDays(startDate: string, endDate: string): number {
  const ms = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
}

export interface BookingQuoteInput {
  startDate: string;
  endDate: string;
  dailyRateXaf: number;
  /** Vendor's weekly rate; null/absent = no weekly pricing. */
  weeklyRateXaf?: number | null;
  /** Vendor's monthly rate; null/absent = no monthly pricing. */
  monthlyRateXaf?: number | null;
  withDriver: boolean;
  driverDailyRateXaf: number | null;
  deliveryType: DeliveryType;
  /** Vendor's address-delivery fee; null when they don't deliver. */
  deliveryFeeXaf: number | null;
  /** Vendor's airport fee; null when they don't do airport meets. */
  airportFeeXaf: number | null;
}

export interface BookingQuote {
  days: number;
  vehicleXaf: number;
  driverXaf: number;
  deliveryXaf: number;
  totalXaf: number;
  depositXaf: number;
}

/**
 * Vehicle cost for a stay of `days`, honouring the vendor's longer-term rates
 * (spec: daily / weekly / monthly pricing). Greedy decomposition — months,
 * then weeks, then days — but never more than plain daily x days, so a vendor
 * whose weekly rate is *worse* than seven dailies can't accidentally overcharge.
 */
export function vehicleRentalCost(
  days: number,
  dailyRateXaf: number,
  weeklyRateXaf?: number | null,
  monthlyRateXaf?: number | null,
): number {
  let remaining = days;
  let cost = 0;
  if (monthlyRateXaf) {
    const months = Math.floor(remaining / 30);
    cost += months * monthlyRateXaf;
    remaining -= months * 30;
  }
  if (weeklyRateXaf) {
    const weeks = Math.floor(remaining / 7);
    cost += weeks * weeklyRateXaf;
    remaining -= weeks * 7;
  }
  cost += remaining * dailyRateXaf;
  return Math.min(cost, days * dailyRateXaf);
}

/**
 * The price of a rental, in one place.
 *
 * The server computes this authoritatively and never trusts a client total,
 * but the customer has to see the same breakdown *before* they commit — a
 * quote that doesn't match the confirmation is how a marketplace loses trust.
 * Sharing the function is what keeps the two honest.
 */
export function quoteBooking(input: BookingQuoteInput): BookingQuote {
  const days = rentalDays(input.startDate, input.endDate);
  const vehicleXaf = vehicleRentalCost(
    days,
    input.dailyRateXaf,
    input.weeklyRateXaf,
    input.monthlyRateXaf,
  );
  const driverXaf = input.withDriver ? (input.driverDailyRateXaf ?? 0) * days : 0;
  const deliveryXaf =
    input.deliveryType === 'airport'
      ? (input.airportFeeXaf ?? 0)
      : input.deliveryType === 'address'
        ? (input.deliveryFeeXaf ?? 0)
        : 0;
  const totalXaf = vehicleXaf + driverXaf + deliveryXaf;
  return {
    days,
    vehicleXaf,
    driverXaf,
    deliveryXaf,
    totalXaf,
    depositXaf: computeDepositXaf(totalXaf),
  };
}

// ---- Entity shapes (the columns the API returns to clients) ---------------

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  locale: 'en' | 'fr';
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Vendor {
  id: string;
  profile_id: string;
  business_name: string;
  rccm_number: string | null;
  city: City;
  contact_person: string | null;
  contact_phone: string | null;
  /** Often not the number that answers calls — WhatsApp is the primary business channel. */
  whatsapp_number: string | null;
  contact_email: string | null;
  /** Free-text street / quarter; `city` stays the coarse search enum. */
  address: string | null;
  /** When the vendor accepted the onboarding declaration. Null for legacy vendors. */
  declaration_accepted_at: string | null;
  /** Fee to deliver a car to an address. Null when delivery isn't offered. */
  delivery_fee_xaf: number | null;
  /** Fee to meet a customer at the airport. Null when not offered. */
  airport_fee_xaf: number | null;
  status: VendorStatus;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * What an unauthenticated caller may see about a vendor.
 *
 * SECURITY: deliberately omits `contact_person`, `contact_phone`,
 * `contact_email`, `whatsapp_number`, `address` and the internal `profile_id`.
 * The "List your car" page promises a provider that "your phone number stays
 * private … all contact runs through Karu", and `GET /api/vendors` is public —
 * so the public projection has to keep that promise. Contact details reach a
 * customer only through a booking they are party to.
 */
export type PublicVendor = Omit<
  Vendor,
  | 'profile_id'
  | 'contact_person'
  | 'contact_phone'
  | 'contact_email'
  | 'whatsapp_number'
  | 'address'
  | 'rccm_number'
>;

export interface VendorDocument {
  id: string;
  vendor_id: string;
  /** Null = vendor-scoped (RCCM, identity docs, and pre-0018 paperwork). */
  vehicle_id: string | null;
  type: DocumentType;
  file_path: string;
  status: DocumentStatus;
  /** Expiry date (insurance / roadworthiness). Null = does not expire or unknown. */
  expires_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
}

export type FuelType = 'petrol' | 'diesel' | 'hybrid' | 'electric';
export const FUEL_TYPES: FuelType[] = ['petrol', 'diesel', 'hybrid', 'electric'];

/**
 * The six photos every listing must have before it can go live (onboarding
 * spec §5). Order here is display order.
 */
export type PhotoAngle = 'front' | 'rear' | 'left' | 'right' | 'dashboard' | 'seats';
export const PHOTO_ANGLES: PhotoAngle[] = ['front', 'rear', 'left', 'right', 'dashboard', 'seats'];

/** Angles a listing still needs before it may be activated. */
export function missingPhotoAngles(angles: Partial<Record<PhotoAngle, string>>): PhotoAngle[] {
  return PHOTO_ANGLES.filter((a) => !angles[a]);
}

/**
 * The photo that leads a listing: the front view when it exists (it's the
 * shot that sells a car), else whatever was uploaded first.
 */
export function primaryPhoto(v: {
  photos: string[];
  photo_angles?: Partial<Record<PhotoAngle, string>> | null;
}): string | undefined {
  return v.photo_angles?.front ?? v.photos[0];
}

/**
 * Gallery in presentation order: the six required angles first (front, rear,
 * left, right, dashboard, seats), then any extra shots in upload order.
 */
export function orderedPhotos(v: {
  photos: string[];
  photo_angles?: Partial<Record<PhotoAngle, string>> | null;
}): string[] {
  const angles = v.photo_angles ?? {};
  const slotUrls = PHOTO_ANGLES.map((a) => angles[a]).filter((u): u is string => !!u);
  const slotSet = new Set(slotUrls);
  return [...slotUrls, ...v.photos.filter((p) => !slotSet.has(p))];
}

/** Whether a car can be rented with a driver — and whether it must be. */
export type DriverOption = 'none' | 'optional' | 'required';

/** Where the customer takes delivery of the car. */
export type DeliveryType = 'pickup_point' | 'airport' | 'address';

export const DRIVER_OPTIONS: DriverOption[] = ['none', 'optional', 'required'];
export const DELIVERY_TYPES: DeliveryType[] = ['pickup_point', 'airport', 'address'];

export interface Vehicle {
  id: string;
  vendor_id: string;
  make: string;
  model: string;
  year: number | null;
  category: VehicleCategory;
  seats: number | null;
  transmission: Transmission;
  /** Number plate as printed; matched by admins against the carte grise. */
  registration_number: string | null;
  fuel_type: FuelType | null;
  daily_rate_xaf: number;
  /** Optional longer-term rates. Null = the car simply charges daily x days. */
  weekly_rate_xaf: number | null;
  monthly_rate_xaf: number | null;
  /**
   * Most rentals in Douala and Yaounde are chauffeur-driven, so a car that
   * cannot be booked with a driver is the exception rather than the default.
   */
  driver_option: DriverOption;
  /** Driver cost per day, on top of daily_rate_xaf. Null when driver_option is 'none'. */
  driver_daily_rate_xaf: number | null;
  city: City;
  pickup_locations: string[];
  /** Ordered gallery — every photo on the listing, required angles included. */
  photos: string[];
  /** Required-angle slots (spec §5). All six must be filled to activate. */
  photo_angles: Partial<Record<PhotoAngle, string>>;
  description: string | null;
  status: VehicleStatus;
  created_at: string;
  updated_at: string;
}

/**
 * A car page needs the provider's delivery pricing to quote a total, but must
 * never leak their phone or email — contact isolation is the point of the
 * marketplace. This is the safe subset.
 */
export interface VehicleVendorSummary {
  id: string;
  business_name: string;
  city: City;
  status: VendorStatus;
  delivery_fee_xaf: number | null;
  airport_fee_xaf: number | null;
}

/**
 * What an unauthenticated caller may see about a car.
 *
 * SECURITY: omits `registration_number`. The plate is printed on the car and
 * matched by admins against the carte grise — it identifies a specific
 * vehicle and its owner to anyone who scrapes the public browse endpoint, and
 * a renter has no need of it until pickup.
 */
export type PublicVehicle = Omit<Vehicle, 'registration_number'>;

export interface VehicleDetail extends PublicVehicle {
  vendor: VehicleVendorSummary;
}

export interface Booking {
  id: string;
  vehicle_id: string;
  customer_id: string;
  vendor_id: string;
  start_date: string;
  end_date: string;
  pickup_location: string | null;
  with_driver: boolean;
  /** Driver cost for the whole rental, frozen at request time. Included in total_xaf. */
  driver_fee_xaf: number;
  delivery_type: DeliveryType;
  /** Street address, or the terminal/flight detail for an airport meet. */
  delivery_address: string | null;
  /** Delivery or airport fee, frozen at request time. Included in total_xaf. */
  delivery_fee_xaf: number;
  /** HH:MM — a flight lands at a time, not a date. */
  pickup_time: string | null;
  status: BookingStatus;
  daily_rate_xaf: number;
  total_xaf: number;
  /** Deposit actually charged (10–15% of total); null until payment phase. */
  deposit_xaf: number | null;
  /** Human-readable reference, e.g. KARU-20260719-0042. */
  reference: string | null;
  currency: string;
  customer_note: string | null;
  vendor_note: string | null;
  requested_at: string;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  /** Set when a customer or provider asked Karu to step in (0023). */
  assistance_requested_at: string | null;
  assistance_requested_by: string | null;
  assistance_note: string | null;
  /** Set when an admin marked that request handled. */
  assistance_resolved_at: string | null;
}

/**
 * One message in a booking's chat thread. All customer↔vendor communication
 * runs through Karu: the API strips contact details from non-admin messages
 * before storing them (`redacted` records that it happened), and admins can
 * read and join any thread.
 */
export interface BookingMessage {
  id: string;
  booking_id: string;
  sender_id: string;
  /** Snapshotted at send time; 'admin' renders as Karu Support. */
  sender_role: UserRole;
  body: string;
  /** True when contact details were removed from the original text. */
  redacted: boolean;
  created_at: string;
}

export interface Review {
  id: string;
  booking_id: string;
  author_id: string;
  /** Who is being reviewed: 'vendor' = the customer reviewed the provider. */
  target: ReviewTarget;
  rating: number;
  comment: string | null;
  /** What the author wrote in. Null for reviews predating 0024. */
  language: 'en' | 'fr' | null;
  created_at: string;
}

/** Aggregate reputation shown on cards, listings and provider profiles. */
export interface RatingSummary {
  average: number | null;
  count: number;
}

// ---- Currency -------------------------------------------------------------

export type DisplayCurrency = 'XAF' | 'EUR' | 'GBP';

/**
 * The CFA franc BEAC is pegged to the euro at a FIXED rate — this is not a
 * market rate and does not move, so EUR conversion is exact rather than
 * indicative.
 */
export const XAF_PER_EUR = 655.957;

/**
 * GBP genuinely floats against the euro, so there is no honest constant for
 * it. This is a fallback used only when no live rate has been supplied, and
 * anything shown from it must be labelled approximate.
 */
export const FALLBACK_XAF_PER_GBP = 780;

export interface ConversionResult {
  amount: number;
  currency: DisplayCurrency;
  /** False only for EUR, which is a fixed peg. */
  approximate: boolean;
}

/**
 * Convert an XAF price for display alongside the original. The XAF figure
 * always remains the price actually charged — this is a courtesy for diaspora
 * customers reading in a currency they think in.
 */
export function convertFromXaf(
  amountXaf: number,
  currency: DisplayCurrency,
  xafPerGbp: number = FALLBACK_XAF_PER_GBP,
): ConversionResult {
  if (currency === 'XAF') return { amount: amountXaf, currency, approximate: false };
  if (currency === 'EUR') {
    return { amount: amountXaf / XAF_PER_EUR, currency, approximate: false };
  }
  return { amount: amountXaf / xafPerGbp, currency, approximate: true };
}
