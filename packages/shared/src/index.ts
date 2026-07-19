/**
 * @karu/shared — types & enums shared by the NestJS API and the React web app.
 * Keep this in lockstep with supabase/migrations. These string-literal unions
 * mirror the Postgres enums one-to-one.
 */

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

export type PaymentProvider = 'mtn_momo' | 'orange_money';
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
  currency: string;
  customer_note: string | null;
  vendor_note: string | null;
  requested_at: string;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}
