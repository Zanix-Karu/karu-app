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
  admin: false,
};

export interface NavItem {
  to: string;
  label: string;
}

/** The nav for each view. A role only ever sees its own items. */
export const NAV: Record<View, NavItem[]> = {
  guest: [
    { to: '/search', label: 'Find a car' },
    { to: '/vendors', label: 'Providers' },
    { to: '/list-your-car', label: 'List your car' },
  ],
  customer: [
    { to: '/search', label: 'Find a car' },
    { to: '/vendors', label: 'Providers' },
    { to: '/bookings', label: 'My bookings' },
    { to: '/list-your-car', label: 'List your car' },
  ],
  vendor: [
    { to: '/vendor', label: 'Dashboard' },
    { to: '/vendor/bookings', label: 'Booking requests' },
    { to: '/vendor/cars', label: 'My cars' },
    { to: '/vendor/documents', label: 'Documents' },
    { to: '/search', label: 'View marketplace' },
  ],
  admin: [
    { to: '/admin', label: 'Operations' },
    { to: '/admin/bookings', label: 'Bookings' },
    { to: '/search', label: 'View marketplace' },
  ],
};

/** Route prefixes each view may open. Anything else redirects to its HOME. */
const ALLOWED: Record<View, string[]> = {
  guest: ['/search', '/vendors', '/cars', '/auth', '/list-your-car'],
  customer: ['/search', '/vendors', '/cars', '/bookings', '/profile', '/auth', '/list-your-car'],
  vendor: ['/search', '/vendors', '/cars', '/vendor', '/profile', '/auth'],
  admin: ['/search', '/vendors', '/cars', '/admin', '/profile', '/auth'],
};

export function canOpen(view: View, path: string): boolean {
  return ALLOWED[view].some((p) => path === p || path.startsWith(p + '/'));
}
