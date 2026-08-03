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
export type DocumentType = 'rccm' | 'carte_grise' | 'insurance' | 'roadworthiness';
export type DocumentStatus = 'pending' | 'approved' | 'rejected';

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
 * Deposit charged at booking time (MVP: the rest is settled at pick-up).
 * 15% — the top of the 10–15% band agreed in the MVP plan, pending the
 * final payment-provider decision.
 */
export const DEPOSIT_RATE = 0.15;

/** Deposit in whole XAF for a given booking total. */
export function computeDepositXaf(totalXaf: number): number {
  return Math.ceil(totalXaf * DEPOSIT_RATE);
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
  contact_phone: string | null;
  contact_email: string | null;
  status: VendorStatus;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VendorDocument {
  id: string;
  vendor_id: string;
  type: DocumentType;
  file_path: string;
  status: DocumentStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface Vehicle {
  id: string;
  vendor_id: string;
  make: string;
  model: string;
  year: number | null;
  category: VehicleCategory;
  seats: number | null;
  transmission: Transmission;
  daily_rate_xaf: number;
  city: City;
  pickup_locations: string[];
  photos: string[];
  description: string | null;
  status: VehicleStatus;
  created_at: string;
  updated_at: string;
}

export interface Booking {
  id: string;
  vehicle_id: string;
  customer_id: string;
  vendor_id: string;
  start_date: string;
  end_date: string;
  pickup_location: string | null;
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
}

export interface Review {
  id: string;
  booking_id: string;
  author_id: string;
  /** Who is being reviewed: 'vendor' = the customer reviewed the provider. */
  target: ReviewTarget;
  rating: number;
  comment: string | null;
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
