import { motion } from 'motion/react';
import {
  Car,
  CalendarDays,
  FileText,
  Inbox,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Search,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, useView } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { EASE_SMOOTH_OUT } from '../../lib/motion';
import { HOME } from '../../lib/roles';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { ModeToggle } from '../ModeToggle';
import { Logo } from './Logo';

/**
 * The signed-in area for customers and providers, ported from NourishwithB's
 * client portal: a plain white header, a tab bar whose underline glides to
 * the chosen tab, and page content on a soft grey that fades up on arrival.
 */
type Tab = { href: string; label: string; icon: LucideIcon; match?: (p: string) => boolean };

const starts = (p: string, href: string) => p === href || p.startsWith(`${href}/`);

export function PortalShell({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const view = useView();
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const tabs: Tab[] =
    view === 'vendor'
      ? [
          { href: '/vendor', label: t('nav.dashboard'), icon: LayoutDashboard, match: (p) => p === '/vendor' },
          {
            href: '/vendor/bookings',
            label: t('nav.bookingRequests'),
            icon: Inbox,
            match: (p) => starts(p, '/vendor/bookings') || starts(p, '/bookings'),
          },
          { href: '/vendor/cars', label: t('nav.myCars'), icon: Car },
          { href: '/vendor/documents', label: t('nav.documents'), icon: FileText },
          { href: '/feedback', label: t('nav.feedback'), icon: Megaphone },
          { href: '/profile', label: t('common.profile'), icon: UserRound },
        ]
      : [
          { href: '/bookings', label: t('nav.myBookings'), icon: CalendarDays },
          { href: '/profile', label: t('common.profile'), icon: UserRound },
          { href: '/feedback', label: t('nav.feedback'), icon: Megaphone },
        ];

  const isActive = (tab: Tab) => (tab.match ? tab.match(pathname) : starts(pathname, tab.href));

  return (
    <div className="min-h-screen bg-slate-50 print:bg-surface">
      <header className="border-b border-slate-200 bg-surface print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            to={HOME[view]}
            className="inline-flex items-center rounded-sm text-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text focus-visible:ring-offset-2"
          >
            <Logo />
          </Link>
          <div className="flex items-center gap-1 sm:gap-3">
            <Link
              to="/search"
              className="hidden items-center gap-1.5 rounded-sm text-sm font-medium text-slate-600 transition-colors hover:text-brand-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text sm:inline-flex"
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              {view === 'vendor' ? t('nav.viewMarketplace') : t('nav.findCar')}
            </Link>
            <div className="hidden md:block">
              <LanguageSwitcher />
            </div>
            <ModeToggle />
            <button
              type="button"
              onClick={async () => {
                await signOut();
                navigate('/search');
              }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text"
            >
              <LogOut className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">{t('common.signOut')}</span>
            </button>
          </div>
        </div>
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <nav aria-label={t('nav.account')} className="karu-nav-strip -mb-px flex gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const active = isActive(tab);
              const Icon = tab.icon;
              return (
                <Link
                  key={tab.href}
                  to={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative inline-flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-3 text-sm font-semibold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text',
                    active ? 'text-slate-900' : 'text-slate-500 hover:border-slate-300 hover:text-slate-900',
                  )}
                >
                  <Icon className={cn('h-4 w-4', active && 'text-brand-text')} aria-hidden="true" />
                  {tab.label}
                  {/* One underline shared across tabs, so it glides to the new tab. */}
                  {active && (
                    <motion.span
                      layoutId="portal-tab-underline"
                      transition={{ duration: 0.25, ease: EASE_SMOOTH_OUT }}
                      className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-brand"
                      aria-hidden="true"
                    />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="route-reveal mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-10">
        {children}
      </main>
    </div>
  );
}
