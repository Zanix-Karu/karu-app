import { Suspense, lazy, useEffect, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { usePageMeta } from './lib/page-meta';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, RequireView, useAuth, useView } from './lib/auth';
import { HOME } from './lib/roles';
import { useTranslation } from 'react-i18next';
import { AssistantPanel } from './components/AssistantPanel';
import { CurrencyProvider } from './lib/currency';
import { SearchScreen } from './screens/SearchScreen';
import { CarDetailScreen } from './screens/CarDetailScreen';
import { VendorDirectoryScreen, VendorProfileScreen } from './screens/VendorDirectoryScreen';
import { ToastProvider } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SiteFooter, SiteHeader } from './components/shell/SiteHeader';
import { PortalShell } from './components/shell/PortalShell';
import { AdminShell } from './components/shell/AdminShell';
import { PreviewBar, useAppearance } from './components/ThemeStudio';
import { setAppearance } from './lib/theme';
import { CarFront, Search } from 'lucide-react';

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
  const { session, profile } = useAuth();
  const view = useView();
  // Wait for the role: right after sign-in the session exists but the profile
  // is still loading, and guessing "customer" sent providers to the search.
  if (session === undefined || (session && !profile)) return null;
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
      <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-tint">
        <CarFront aria-hidden="true" className="h-7 w-7 text-brand-text" />
      </span>
      <p className="headline-in font-display text-5xl font-bold tracking-tight text-slate-900">404</p>
      <h1 className="headline-in-2 mt-3 font-display text-2xl font-bold tracking-tight text-slate-900">{t('notFound.title')}</h1>
      <p className="mt-2 text-sm text-slate-600">
        {t('notFound.sub')}
      </p>
      <Link
        to="/search"
        className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-brand px-6 text-sm font-semibold text-on-brand shadow-sm transition-colors hover:bg-brand-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-text focus-visible:ring-offset-2"
      >
        <Search aria-hidden="true" className="h-4 w-4" />
        {t('nav.findCar')}
      </Link>
    </div>
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
    <div key={pathname}>
      {children}
    </div>
  );
}

/** Resets on navigation, so a crash on one screen doesn't follow you. */
function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}

/** Paths everyone sees in the public site layout, whoever they are. */
const PUBLIC = ['/search', '/vendors', '/cars', '/list-your-car', '/privacy', '/terms', '/auth'];
const isPublic = (p: string) => p === '/' || PUBLIC.some((x) => p === x || p.startsWith(`${x}/`));

/**
 * Three layouts, as in NourishwithB: the public site (header + footer), the
 * signed-in portal for customers and providers (header + tab bar), and the
 * admin console (sidebar). Unknown paths get the public layout.
 */
function Shell({ children }: { children: ReactNode }) {
  const view = useView();
  const { pathname } = useLocation();
  const known = /^\/(admin|vendor|bookings|profile|feedback)(\/|$)/.test(pathname);
  if (!isPublic(pathname) && known && view === 'admin') return <AdminShell>{children}</AdminShell>;
  if (!isPublic(pathname) && known && (view === 'vendor' || view === 'customer')) return <PortalShell>{children}</PortalShell>;
  return (
    <>
      <SiteHeader />
      <main id="main" tabIndex={-1} className="route-reveal mx-auto min-h-[60vh] max-w-6xl px-4 py-8 sm:px-6 lg:py-10">
        {children}
      </main>
      <SiteFooter />
    </>
  );
}

/** The admin's site-wide palettes. Applied from the device cache before the
 *  first paint (main.tsx), then refreshed from the API here. */
function AppearanceLoader() {
  const { data } = useAppearance();
  useEffect(() => {
    if (data) setAppearance(data);
  }, [data]);
  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <MotionConfig reducedMotion="user">
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
          <AppearanceLoader />
          <Shell>
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
          </Shell>
          <PreviewBar />
          {/* FEAT-2: rule-based help, on every page. */}
          <AssistantPanel />
        </BrowserRouter>
        </ToastProvider>
        </CurrencyProvider>
      </AuthProvider>
      </MotionConfig>
    </QueryClientProvider>
  );
}
