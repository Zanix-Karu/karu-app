import type { UserRole } from '@karu/shared';

/**
 * Who sees what. Karu presents four distinct views — guest, customer, vendor,
 * admin — and a role must never be shown another role's surface. This module
 * is the single source of truth for that; the nav, the route guards and the
 * per-screen affordances all read from here so they cannot drift apart.
 *
 * The API enforces the same rules independently (@Roles guards + ownership
 * checks). Nothing here is a security boundary — it decides what is *shown*,
 * never what is *permitted*.
 */

/** 'guest' is the un-signed-in view; the rest mirror profiles.role. */
export type View = 'guest' | UserRole;

export function viewOf(signedIn: boolean, role: UserRole | undefined): View {
  if (!signedIn) return 'guest';
  return role ?? 'customer';
}

/** Where each view goes when it lands on "/" or is bounced from a route. */
export const HOME: Record<View, string> = {
  guest: '/search',
  customer: '/search',
  vendor: '/vendor',
  admin: '/admin',
};

/**
 * Browsing the catalogue is readable by every view — a vendor needs to see
 * how their own listing looks to customers, and an admin needs it to check
 * the marketplace. Only *booking* is customer-only.
 */
export const CAN_BOOK: Record<View, boolean> = {
  guest: true, // prompted to sign in; the CTA is legitimate
  customer: true,
  vendor: false,
  // Superadmin: the ops team books on behalf of walk-in and phone customers,
  // so an admin can do anything a customer can.
  admin: true,
};

export interface NavItem {
  to: string;
  /** i18n key — resolved in the header so labels follow the active language. */
  label: string;
}

/** The nav for each view. A role only ever sees its own items. */
export const NAV: Record<View, NavItem[]> = {
  guest: [
    { to: '/search', label: 'nav.findCar' },
    { to: '/vendors', label: 'nav.providers' },
    { to: '/list-your-car', label: 'nav.listYourCar' },
  ],
  customer: [
    { to: '/search', label: 'nav.findCar' },
    { to: '/vendors', label: 'nav.providers' },
    { to: '/bookings', label: 'nav.myBookings' },
    { to: '/list-your-car', label: 'nav.listYourCar' },
  ],
  vendor: [
    { to: '/vendor', label: 'nav.dashboard' },
    { to: '/vendor/bookings', label: 'nav.bookingRequests' },
    { to: '/vendor/cars', label: 'nav.myCars' },
    { to: '/vendor/documents', label: 'nav.documents' },
    { to: '/search', label: 'nav.viewMarketplace' },
  ],
  // Superadmin sees its own console first, then every other surface.
  admin: [
    { to: '/admin', label: 'nav.operations' },
    { to: '/admin/bookings', label: 'nav.bookings' },
    { to: '/search', label: 'nav.findCar' },
    { to: '/bookings', label: 'nav.myBookings' },
    { to: '/vendor', label: 'nav.dashboard' },
  ],
};

/** Route prefixes each view may open. Anything else redirects to its HOME. */
const ALLOWED: Record<View, string[]> = {
  guest: ['/search', '/vendors', '/cars', '/auth', '/list-your-car'],
  customer: ['/search', '/vendors', '/cars', '/bookings', '/profile', '/auth', '/list-your-car'],
  vendor: ['/search', '/vendors', '/cars', '/vendor', '/profile', '/auth'],
  // An admin is a superadmin: every route any other view can reach.
  admin: ['/search', '/vendors', '/cars', '/admin', '/vendor', '/bookings', '/profile', '/auth', '/list-your-car'],
};

export function canOpen(view: View, path: string): boolean {
  return ALLOWED[view].some((p) => path === p || path.startsWith(p + '/'));
}
