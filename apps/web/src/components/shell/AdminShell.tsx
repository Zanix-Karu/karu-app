import { useQuery } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  CalendarCheck,
  Car,
  ExternalLink,
  FileText,
  IdCard,
  LayoutDashboard,
  LogOut,
  Mail,
  Megaphone,
  Menu,
  MessagesSquare,
  Palette,
  ShieldCheck,
  Store,
  UserRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { EASE_SMOOTH_OUT } from '../../lib/motion';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { ModeToggle } from '../ModeToggle';
import { Logo } from './Logo';

/**
 * The admin console layout, ported from NourishwithB's AdminNav: a grouped
 * sidebar on desktop where each item says what it's for and the active one
 * sits on a brand tint that glides between items; a top bar with a menu on
 * phones. Counts come from the overview endpoint and pop in when they change.
 */
interface Counts {
  pendingVendors: number;
  pendingDocuments: number;
  pendingVerifications: number;
  requestedBookings: number;
  flaggedConversations: number;
}

type Item = {
  href: string;
  label: string;
  hint: string;
  icon: LucideIcon;
  count?: keyof Counts;
  exact?: boolean;
};

function useGroups(): { heading: string; items: Item[] }[] {
  const { t } = useTranslation();
  const item = (href: string, key: string, icon: LucideIcon, extra: Partial<Item> = {}): Item => ({
    href,
    label: t(`admin.nav.${key}.label`),
    hint: t(`admin.nav.${key}.hint`),
    icon,
    ...extra,
  });
  return [
    {
      heading: t('admin.nav.groups.today'),
      items: [
        item('/admin', 'overview', LayoutDashboard, { exact: true }),
        item('/admin/bookings', 'bookings', CalendarCheck, { count: 'requestedBookings' }),
        item('/admin/chats', 'chats', MessagesSquare, { count: 'flaggedConversations' }),
        item('/admin/feedback', 'feedback', Megaphone),
      ],
    },
    {
      heading: t('admin.nav.groups.marketplace'),
      items: [
        item('/admin/vendors', 'vendors', Store, { count: 'pendingVendors' }),
        item('/admin/documents', 'documents', FileText, { count: 'pendingDocuments' }),
        item('/admin/ids', 'ids', IdCard, { count: 'pendingVerifications' }),
        item('/admin/cars', 'cars', Car),
        item('/vendor', 'providerArea', ShieldCheck),
      ],
    },
    {
      heading: t('admin.nav.groups.setup'),
      items: [item('/admin/appearance', 'appearance', Palette), item('/admin/emails', 'emails', Mail)],
    },
  ];
}

function NavLinks({ counts }: { counts?: Counts }) {
  const { pathname } = useLocation();
  const groups = useGroups();
  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.heading}>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-widest text-slate-500">{group.heading}</p>
          <ul className="mt-2 space-y-0.5" role="list">
            {group.items.map(({ href, label, hint, icon: Icon, count, exact }) => {
              const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
              const n = count && counts ? counts[count] : 0;
              return (
                <li key={href}>
                  <Link
                    to={href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group relative isolate flex items-start gap-3 rounded-lg px-3 py-2 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text',
                      active ? '' : 'hover:bg-slate-100',
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="admin-nav-active"
                        transition={{ duration: 0.25, ease: EASE_SMOOTH_OUT }}
                        className="absolute inset-0 -z-10 rounded-lg bg-brand-tint"
                        aria-hidden="true"
                      />
                    )}
                    <Icon
                      className={cn('mt-0.5 h-4 w-4 shrink-0', active ? 'text-brand-text' : 'text-slate-400 group-hover:text-slate-600')}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-sm font-semibold', active ? 'text-slate-900' : 'text-slate-800')}>{label}</span>
                      <span className="block truncate text-xs text-slate-500">{hint}</span>
                    </span>
                    {n > 0 && (
                      <span
                        key={n}
                        className="badge-pop mt-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-[11px] font-bold leading-none text-on-brand"
                      >
                        {n}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function FooterLinks() {
  const { t } = useTranslation();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const row =
    'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text';
  return (
    <div className="space-y-0.5 border-t border-slate-200 pt-4">
      <Link to="/search" className={row}>
        <ExternalLink className="h-4 w-4 text-slate-400" aria-hidden="true" />
        {t('nav.viewMarketplace')}
      </Link>
      <Link to="/profile" className={row}>
        <UserRound className="h-4 w-4 text-slate-400" aria-hidden="true" />
        {t('common.profile')}
      </Link>
      <button
        type="button"
        className={row}
        onClick={async () => {
          await signOut();
          navigate('/search');
        }}
      >
        <LogOut className="h-4 w-4 text-slate-400" aria-hidden="true" />
        {t('common.signOut')}
      </button>
      <div className="flex items-center justify-between px-1 pt-2">
        <LanguageSwitcher />
        <ModeToggle />
      </div>
    </div>
  );
}

export function AdminShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const { data: counts } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => api<Counts>('/admin/overview'),
    staleTime: 60_000,
  });
  const total = counts
    ? counts.pendingVendors + counts.pendingDocuments + counts.pendingVerifications + counts.requestedBookings
    : 0;

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const logo = (
    <Link to="/admin" className="inline-flex items-center rounded-sm text-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text">
      <Logo />
    </Link>
  );

  return (
    <div className="min-h-screen bg-slate-50 lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-72 shrink-0 flex-col border-r border-slate-200 bg-surface lg:flex">
        <div className="flex shrink-0 items-center border-b border-slate-200 px-5 py-4">{logo}</div>
        <nav aria-label={t('nav.admin')} className="flex-1 overflow-y-auto px-3 py-5">
          <NavLinks counts={counts} />
        </nav>
        <div className="px-3 pb-3">
          <FooterLinks />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-surface lg:hidden">
        <div className="flex items-center justify-between px-4 py-3">
          {logo}
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="admin-mobile-menu"
            className="relative inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 px-4 text-sm font-semibold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text"
          >
            {open ? <X className="h-4 w-4" aria-hidden="true" /> : <Menu className="h-4 w-4" aria-hidden="true" />}
            {t('nav.menu')}
            {!open && total > 0 && (
              <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-[11px] font-bold leading-none text-on-brand">
                {total}
              </span>
            )}
          </button>
        </div>
        {open && (
          <nav id="admin-mobile-menu" aria-label={t('nav.admin')} className="max-h-[80vh] overflow-y-auto border-t border-slate-200 px-3 py-4">
            <NavLinks counts={counts} />
            <div className="mt-4">
              <FooterLinks />
            </div>
          </nav>
        )}
      </header>

      <main id="main" tabIndex={-1} className="min-w-0 flex-1">
        <div className="route-reveal mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10">{children}</div>
      </main>
    </div>
  );
}
