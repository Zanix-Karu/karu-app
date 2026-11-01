import { ArrowRight, CarFront, LayoutDashboard, LogIn, Menu, Search, Store, UserRound, X, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth, useView } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { HOME } from '../../lib/roles';
import { CurrencySwitcher } from '../CurrencySwitcher';
import { LanguageSwitcher } from '../LanguageSwitcher';
import { ModeToggle } from '../ModeToggle';
import { Logo } from './Logo';

/**
 * The public site header, ported from NourishwithB's marketing navbar:
 * white, sticky, a short row of links with a brand pill for the main action,
 * and on phones a menu that slides open while its icon turns into a cross.
 */
const RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text focus-visible:ring-offset-2 focus-visible:ring-offset-surface';

export function SiteHeader() {
  const { t } = useTranslation();
  const { session, profile } = useAuth();
  const view = useView();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Close on navigation and on Escape (focus goes back to the toggle).
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const links: { to: string; label: string; icon: LucideIcon }[] = [
    { to: '/search', label: t('nav.findCar'), icon: Search },
    { to: '/vendors', label: t('nav.providers'), icon: Store },
    ...(view === 'guest' ? [{ to: '/list-your-car', label: t('nav.listYourCar'), icon: CarFront }] : []),
  ];

  // The one brand pill: what this visitor most likely came to do.
  const cta =
    view === 'guest'
      ? { to: '/search', label: t('nav.findCar') }
      : view === 'customer'
        ? { to: '/bookings', label: t('nav.myBookings') }
        : { to: HOME[view], label: view === 'admin' ? t('nav.adminConsole') : t('nav.dashboard') };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    cn(
      'relative inline-flex items-center gap-1.5 rounded-sm text-sm font-medium transition-colors',
      RING,
      isActive ? 'text-slate-900' : 'text-slate-600 hover:text-brand-text',
    );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-surface">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link to={HOME[view]} className={cn('rounded-sm text-2xl', RING)}>
          <Logo />
        </Link>

        {/* Desktop nav */}
        <nav aria-label={t('nav.main')} className="hidden items-center gap-7 md:flex">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} className={linkClass}>
              {l.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-1 sm:gap-2">
          <div className="hidden items-center gap-1 lg:flex">
            <LanguageSwitcher />
            <CurrencySwitcher />
          </div>
          <ModeToggle />
          {session ? (
            <NavLink
              to="/profile"
              className={cn(
                'hidden min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-slate-600 transition-colors hover:text-brand-text sm:inline-flex',
                RING,
              )}
            >
              <UserRound className="h-4 w-4" aria-hidden="true" />
              {profile?.full_name?.split(' ')[0] ?? t('common.profile')}
            </NavLink>
          ) : (
            <Link
              to="/auth"
              className={cn(
                'hidden min-h-11 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-slate-600 transition-colors hover:text-brand-text sm:inline-flex',
                RING,
              )}
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              {t('common.signIn')}
            </Link>
          )}
          <Link
            to={cta.to}
            className={cn(
              'hidden min-h-11 items-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-on-brand shadow-sm transition-colors hover:bg-brand-dark sm:inline-flex',
              RING,
            )}
          >
            {view === 'vendor' || view === 'admin' ? <LayoutDashboard className="h-4 w-4" aria-hidden="true" /> : null}
            {cta.label}
          </Link>
          <button
            ref={toggleRef}
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? t('nav.closeMenu') : t('nav.openMenu')}
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text md:hidden"
          >
            {/* Both icons stay mounted so the lines rotate away as the cross rotates in. */}
            <Menu
              className={`absolute h-5 w-5 transition-[opacity,rotate,scale,filter] duration-250 ease-[var(--ease-smooth-out)] motion-reduce:transition-none ${open ? 'rotate-90 scale-50 opacity-0 blur-[2px]' : ''}`}
              aria-hidden="true"
            />
            <X
              className={`absolute h-5 w-5 transition-[opacity,rotate,scale,filter] duration-250 ease-[var(--ease-smooth-out)] motion-reduce:transition-none ${open ? '' : '-rotate-90 scale-50 opacity-0 blur-[2px]'}`}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>

      {/* Mobile menu: always rendered so it can slide open and closed. */}
      <div
        id="mobile-menu"
        inert={!open}
        className={`grid bg-surface transition-[grid-template-rows,opacity] duration-250 ease-[var(--ease-smooth-out)] motion-reduce:transition-none md:hidden ${
          open ? 'grid-rows-[1fr] border-t border-slate-200 opacity-100' : 'grid-rows-[0fr] opacity-0'
        }`}
      >
        <div className="overflow-hidden">
          <nav aria-label={t('nav.mobile')} className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
            <ul className="flex flex-col">
              {links.map(({ to, label, icon: Icon }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    className={({ isActive }) =>
                      cn(
                        'flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors hover:bg-slate-50',
                        isActive ? 'bg-slate-50 text-slate-900' : 'text-slate-700',
                      )
                    }
                  >
                    <Icon className="h-4 w-4 text-slate-500" aria-hidden="true" />
                    {label}
                  </NavLink>
                </li>
              ))}
              <li>
                <Link
                  to={session ? '/profile' : '/auth'}
                  className="flex min-h-11 items-center gap-2 rounded-md px-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  {session ? <UserRound className="h-4 w-4 text-slate-500" aria-hidden="true" /> : <LogIn className="h-4 w-4 text-slate-500" aria-hidden="true" />}
                  {session ? (profile?.full_name ?? t('common.profile')) : t('common.signIn')}
                </Link>
              </li>
              <li className="mt-2 flex items-center justify-between gap-2 rounded-md bg-slate-50 px-3 py-1">
                <LanguageSwitcher />
                <CurrencySwitcher />
              </li>
              <li className="mt-2">
                <Link
                  to={cta.to}
                  className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand px-4 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-dark"
                >
                  {cta.label}
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const { t } = useTranslation();
  const view = useView();
  const RINGLINK = cn('inline-flex min-h-11 items-center rounded-sm transition-colors hover:text-brand-text', RING);
  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50 text-slate-600">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        {view === 'guest' && (
          <div className="mb-12 flex flex-col gap-4 rounded-2xl bg-surface p-6 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-display text-lg font-bold text-slate-900">{t('footer.ctaTitle')}</p>
              <p className="mt-1 text-sm text-slate-600">{t('footer.ctaSub')}</p>
            </div>
            <Link
              to="/list-your-car"
              className={cn(
                'inline-flex min-h-11 shrink-0 items-center gap-2 self-start rounded-full bg-brand px-6 text-sm font-semibold text-on-brand transition-colors hover:bg-brand-dark sm:self-auto',
                RING,
              )}
            >
              {t('nav.listYourCar')}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        )}
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Link to="/" className={cn('inline-block rounded-sm text-2xl', RING)}>
              <Logo />
            </Link>
            <p className="mt-4 max-w-[300px] text-sm leading-relaxed text-slate-600">{t('common.tagline')}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{t('footer.marketplace')}</p>
            <ul className="mt-2 text-sm" role="list">
              <li><Link to="/search" className={RINGLINK}>{t('nav.findCar')}</Link></li>
              <li><Link to="/vendors" className={RINGLINK}>{t('nav.providers')}</Link></li>
              <li><Link to="/list-your-car" className={RINGLINK}>{t('nav.listYourCar')}</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">{t('footer.legal')}</p>
            <ul className="mt-2 text-sm" role="list">
              <li><Link to="/terms" className={RINGLINK}>{t('footer.terms')}</Link></li>
              <li><Link to="/privacy" className={RINGLINK}>{t('footer.privacy')}</Link></li>
            </ul>
          </div>
        </div>
        <div className="mt-12 flex flex-col gap-2 border-t border-slate-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">© {new Date().getFullYear()} Karu</p>
          <p className="text-xs text-slate-500" title={t('common.buildVersion')}>
            v{__APP_VERSION__}
          </p>
        </div>
      </div>
    </footer>
  );
}
