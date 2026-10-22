import { Suspense, lazy, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePageMeta } from './lib/page-meta';
import { BrowserRouter, Link, NavLink, Navigate, Route, Routes, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, RequireView, useAuth, useView } from './lib/auth';
import { HOME, NAV } from './lib/roles';
import { useTranslation } from 'react-i18next';
import { ThemePicker } from './components/ThemePicker';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { CurrencySwitcher } from './components/CurrencySwitcher';
import { AssistantPanel } from './components/AssistantPanel';
import { CurrencyProvider } from './lib/currency';
import { SearchScreen } from './screens/SearchScreen';
import { CarDetailScreen } from './screens/CarDetailScreen';
import { VendorDirectoryScreen, VendorProfileScreen } from './screens/VendorDirectoryScreen';
import { Button } from './ui';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  CalendarCheck,
  CalendarDays,
  Car,
  CarFront,
  Inbox,
  LayoutDashboard,
  LogIn,
  LogOut,
  MessageSquareText,
  MessagesSquare,
  Search,
  ShieldCheck,
  Store,
  FileText,
  Megaphone,
  UserRound,
  type LucideIcon,
} from 'lucide-react';

/** Nav icons, keyed by route. Kept here so lib/roles.ts stays React-free. */
const NAV_ICONS: Record<string, LucideIcon> = {
  '/search': Search,
  '/vendors': Store,
  '/list-your-car': CarFront,
  '/bookings': CalendarDays,
  '/feedback': Megaphone,
  '/vendor': LayoutDashboard,
  '/vendor/bookings': Inbox,
  '/vendor/cars': Car,
  '/vendor/documents': FileText,
  '/admin': ShieldCheck,
  '/admin/bookings': CalendarCheck,
  '/admin/chats': MessagesSquare,
};


/*
 * Route-level code splitting (PERF-1). The app shipped as one ~719KB chunk
 * (~200KB gzipped) with no splitting, which is a slow first screen on the
 * patchy connections much of this market uses.
 *
 * Search and the car page stay eager on purpose: they are the marketplace
 * entry points, and putting a spinner in front of them would trade a slow
 * first paint for a slower one. Everything below is behind a click or a
 * sign-in, so a suspense boundary there costs nothing anyone notices.
 */
const AuthScreen = lazy(() => import('./screens/AuthScreen').then((m) => ({ default: m.AuthScreen })));
const ResetPasswordScreen = lazy(() => import('./screens/ResetPasswordScreen').then((m) => ({ default: m.ResetPasswordScreen })));
const ListYourCarScreen = lazy(() => import('./screens/ListYourCarScreen').then((m) => ({ default: m.ListYourCarScreen })));
const ConfirmationScreen = lazy(() => import('./screens/ConfirmationScreen').then((m) => ({ default: m.ConfirmationScreen })));
const BookingsScreen = lazy(() => import('./screens/BookingsScreen').then((m) => ({ default: m.BookingsScreen })));
const BookingDetailScreen = lazy(() => import('./screens/BookingDetailScreen').then((m) => ({ default: m.BookingDetailScreen })));
const ProfileScreen = lazy(() => import('./screens/ProfileScreen').then((m) => ({ default: m.ProfileScreen })));
const AdminScreen = lazy(() => import('./screens/AdminScreen').then((m) => ({ default: m.AdminScreen })));
const LegalScreen = lazy(() => import('./screens/LegalScreen').then((m) => ({ default: m.LegalScreen })));
const FeedbackScreen = lazy(() => import('./screens/FeedbackScreen').then((m) => ({ default: m.FeedbackScreen })));
const VendorAreaScreen = lazy(() => import('./screens/VendorAreaScreen').then((m) => ({ default: m.VendorAreaScreen })));

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/** "/" sends each view to its own home. */
function HomeRedirect() {
  const view = useView();
  return <Navigate to={HOME[view]} replace />;
}

/** Deliberately blank: a lazy chunk on a warm connection resolves faster than
 *  a spinner takes to register, and a flash of one reads as jank. */
function RouteFallback() {
  return <div style={{ minHeight: '50vh' }} />;
}

function NotFoundScreen() {
  const { t } = useTranslation();
  // The SPA rewrite answers every unknown path with 200 and this body, so a
  // crawler has no status code to go on — the robots tag is the only signal
  // that stops soft-404s being indexed (SEO-1).
  usePageMeta({ title: t('seo.notFound.title'), noindex: true });
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-karu-yellow/20">
        <CarFront aria-hidden="true" className="h-7 w-7 text-karu-brown" />
      </span>
      <p className="font-display text-5xl font-bold text-karu-brown">404</p>
      <h1 className="mt-3 font-display text-2xl font-bold">{t('notFound.title')}</h1>
      <p className="mt-2 text-sm text-karu-mute">
        {t('notFound.sub')}
      </p>
      <Link
        to="/search"
        className="karu-btn mt-6 inline-flex items-center gap-2 rounded-full bg-karu-yellow px-5 py-2.5 text-sm font-semibold text-karu-on-brand"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
        {t('nav.findCar')}
      </Link>
    </div>
  );
}

function Header() {
  const { t } = useTranslation();
  const { session, profile, signOut } = useAuth();
  const view = useView();
  const navigate = useNavigate();
  // No logo asset exists yet (Feature 3 prep) — the image is tried first and
  // falls back to the text wordmark on 404 rather than showing a broken icon.
  const [logoFailed, setLogoFailed] = useState(false);

  // px-3 on mobile so the row fits a 375px viewport without overflowing.
  const nav = ({ isActive }: { isActive: boolean }) =>
    `inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition sm:px-4 ${
      isActive ? 'bg-karu-yellow text-karu-on-brand' : 'text-karu-on-chrome/80 hover:text-karu-yellow'
    }`;

  return (
    <header className="sticky top-0 z-20 bg-karu-chrome">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-3 sm:justify-between sm:gap-4">
        <Link to={HOME[view]} className="shrink-0">
          {logoFailed ? (
            <span
              className="text-[20px] sm:text-[26px]"
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                letterSpacing: '0.3em',
                color: 'var(--gold-400)',
              }}
            >
              KARU
            </span>
          ) : (
            <img
              src="/logo/logo-wordmark.svg"
              alt="Karu"
              className="h-6 sm:h-8"
              onError={() => setLogoFailed(true)}
            />
          )}
        </Link>
        {/* Each view sees only its own items — see lib/roles.ts */}
        <nav className="karu-nav-strip flex flex-nowrap items-center justify-center gap-1 overflow-x-auto">
          {NAV[view].map((item) => {
            const Icon = NAV_ICONS[item.to] ?? MessageSquareText;
            return (
              <NavLink key={item.to} to={item.to} end={item.to === '/vendor' || item.to === '/admin'} className={nav}>
                <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
                {t(item.label)}
              </NavLink>
            );
          })}
        </nav>
        <div className="flex flex-nowrap items-center justify-center gap-2">
          <LanguageSwitcher />
          <CurrencySwitcher />
          <ThemePicker compact />
          {session ? (
            <>
              <NavLink to="/profile" className={nav}>
                <UserRound aria-hidden="true" className="h-4 w-4 shrink-0" />
                {profile?.full_name?.split(' ')[0] ?? t('common.profile')}
              </NavLink>
              <Button
                variant="ghost"
                className="whitespace-nowrap px-3 text-karu-on-chrome/70 hover:bg-white/10 sm:px-5"
                onClick={async () => {
                  await signOut();
                  navigate('/search');
                }}
              >
                <LogOut aria-hidden="true" className="h-4 w-4" />
                {t('common.signOut')}
              </Button>
            </>
          ) : (
            <Button onClick={() => navigate('/auth')}>
              <LogIn aria-hidden="true" className="h-4 w-4" />
              {t('common.signIn')}
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  const { t } = useTranslation();
  return (
    <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-karu-mute">
      <p>{t('common.tagline')}</p>
      <p className="mt-1 text-[11px] text-karu-mute/70" title={t('common.buildVersion')}>
        v{__APP_VERSION__}
      </p>
    </footer>
  );
}

/** Localising this needs the i18n context that only exists below; the two
 *  supported languages both read fine here and it is never seen unless
 *  focused. */
const SKIP_TO_CONTENT = 'Skip to content / Aller au contenu';

/**
 * IDEAS #6: every screen arrives the same way, a short rise-in keyed on the
 * path. Query-string changes (filters, sort) don't count as a new page, so
 * search results update in place instead of the whole screen jumping.
 * Reduced-motion users get the content without the movement (ds/motion.css).
 */
function PageTransition({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className="karu-page">
      {children}
    </div>
  );
}

/** Resets on navigation, so a crash on one screen doesn't follow you. */
function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CurrencyProvider>
        <ToastProvider>
        <BrowserRouter>
          {/*
            Skip link: first thing in the tab order, visually hidden until it
            takes focus. Without it a keyboard or screen-reader user walks the
            whole header on every navigation before reaching the page.
          */}
          <a href="#main" className="karu-skip-link">
            {SKIP_TO_CONTENT}
          </a>
          <Header />
          <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8">
            <RouteErrorBoundary>
            <Suspense fallback={<RouteFallback />}>
            <PageTransition>
            <Routes>
              <Route path="/" element={<HomeRedirect />} />
              <Route path="/auth" element={<AuthScreen />} />
              <Route path="/auth/reset" element={<ResetPasswordScreen />} />

              {/* Public marketplace — readable by every view. Only *booking*
                  is customer-only, enforced inside CarDetailScreen. */}
              <Route path="/search" element={<SearchScreen />} />
              <Route path="/vendors" element={<VendorDirectoryScreen />} />
              <Route path="/vendors/:id" element={<VendorProfileScreen />} />
              <Route path="/cars/:id" element={<CarDetailScreen />} />
              <Route path="/list-your-car" element={<ListYourCarScreen />} />
              {/* FEAT-4: the signup consent checkbox asked people to agree to
                  documents that did not exist and linked nowhere. */}
              <Route path="/privacy" element={<LegalScreen doc="privacy" />} />
              <Route path="/terms" element={<LegalScreen doc="terms" />} />

              {/* Customer view */}
              <Route
                path="/bookings"
                element={
                  <RequireView views={['customer', 'admin']}>
                    <BookingsScreen />
                  </RequireView>
                }
              />
              <Route
                path="/bookings/:id/confirmed"
                element={
                  <RequireView views={['customer', 'admin']}>
                    <ConfirmationScreen />
                  </RequireView>
                }
              />

              {/* Vendor view */}
              <Route
                path="/vendor/*"
                element={
                  <RequireView views={['vendor', 'admin']}>
                    <VendorAreaScreen />
                  </RequireView>
                }
              />

              {/* Admin view */}
              <Route
                path="/admin/*"
                element={
                  <RequireView views={['admin']}>
                    <AdminScreen />
                  </RequireView>
                }
              />

              {/* Booking detail — one screen, shaped per role by the API. */}
              <Route
                path="/bookings/:id"
                element={
                  <RequireView views={['customer', 'vendor', 'admin']}>
                    <BookingDetailScreen />
                  </RequireView>
                }
              />

              {/* Shared by every signed-in view */}
              <Route
                path="/profile"
                element={
                  <RequireView views={['customer', 'vendor', 'admin']}>
                    <ProfileScreen />
                  </RequireView>
                }
              />
              {/* FEAT-3: customers and vendors report issues; admins triage. */}
              <Route
                path="/feedback"
                element={
                  <RequireView views={['customer', 'vendor', 'admin']}>
                    <FeedbackScreen />
                  </RequireView>
                }
              />

              {/* An unknown URL should say so rather than silently redirect. */}
              <Route path="*" element={<NotFoundScreen />} />
            </Routes>
            </PageTransition>
            </Suspense>
            </RouteErrorBoundary>
          </main>
          <Footer />
          {/* FEAT-2: rule-based help, on every page. */}
          <AssistantPanel />
        </BrowserRouter>
        </ToastProvider>
        </CurrencyProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
