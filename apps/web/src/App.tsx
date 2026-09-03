import { Suspense, lazy } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePageMeta } from './lib/page-meta';
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom';
import { AuthProvider, RequireView, useAuth, useView } from './lib/auth';
import { HOME, NAV } from './lib/roles';
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from './components/LanguageSwitcher';
import { CurrencySwitcher } from './components/CurrencySwitcher';
import { CurrencyProvider } from './lib/currency';
import { SearchScreen } from './screens/SearchScreen';
import { CarDetailScreen } from './screens/CarDetailScreen';
import { VendorDirectoryScreen, VendorProfileScreen } from './screens/VendorDirectoryScreen';
import { Button } from './ui';


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
      <p className="font-display text-5xl font-bold text-karu-brown">404</p>
      <h1 className="mt-3 font-display text-2xl font-bold">{t('notFound.title')}</h1>
      <p className="mt-2 text-sm text-karu-mute">
        {t('notFound.sub')}
      </p>
      <Link
        to="/search"
        className="mt-6 inline-block rounded-full bg-karu-yellow px-5 py-2.5 text-sm font-semibold text-karu-ink"
      >
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

  // px-3 on mobile so the row fits a 375px viewport without overflowing.
  const nav = ({ isActive }: { isActive: boolean }) =>
    `whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition sm:px-4 ${
      isActive ? 'bg-karu-yellow text-karu-ink' : 'text-karu-cream/80 hover:text-karu-yellow'
    }`;

  return (
    <header className="sticky top-0 z-20 bg-karu-ink">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-3 gap-y-2 px-4 py-3 sm:justify-between sm:gap-4">
        <Link
          to={HOME[view]}
          className="shrink-0 text-[20px] sm:text-[26px]"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            letterSpacing: '0.3em',
            color: 'var(--gold-400)',
          }}
        >
          KARU
        </Link>
        {/* Each view sees only its own items — see lib/roles.ts */}
        <nav className="karu-nav-strip flex flex-nowrap items-center justify-center gap-1 overflow-x-auto">
          {NAV[view].map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/vendor' || item.to === '/admin'} className={nav}>
              {t(item.label)}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-nowrap items-center justify-center gap-2">
          <LanguageSwitcher />
          <CurrencySwitcher />
          {session ? (
            <>
              <NavLink to="/profile" className={nav}>
                {profile?.full_name?.split(' ')[0] ?? t('common.profile')}
              </NavLink>
              <Button
                variant="ghost"
                className="whitespace-nowrap px-3 text-karu-cream/70 hover:bg-white/10 sm:px-5"
                onClick={async () => {
                  await signOut();
                  navigate('/search');
                }}
              >
                {t('common.signOut')}
              </Button>
            </>
          ) : (
            <Button onClick={() => navigate('/auth')}>{t('common.signIn')}</Button>
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
      {t('common.tagline')}
    </footer>
  );
}

/** Localising this needs the i18n context that only exists below; the two
 *  supported languages both read fine here and it is never seen unless
 *  focused. */
const SKIP_TO_CONTENT = 'Skip to content / Aller au contenu';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <CurrencyProvider>
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
            <Suspense fallback={<RouteFallback />}>
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

              {/* An unknown URL should say so rather than silently redirect. */}
              <Route path="*" element={<NotFoundScreen />} />
            </Routes>
            </Suspense>
          </main>
          <Footer />
        </BrowserRouter>
        </CurrencyProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
