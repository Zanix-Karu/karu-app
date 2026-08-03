import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import { AuthScreen } from './screens/AuthScreen';
import { SearchScreen } from './screens/SearchScreen';
import { CarDetailScreen } from './screens/CarDetailScreen';
import { ConfirmationScreen } from './screens/ConfirmationScreen';
import { BookingsScreen } from './screens/BookingsScreen';
import { BookingDetailScreen } from './screens/BookingDetailScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { AdminScreen } from './screens/AdminScreen';
import { VendorAreaScreen } from './screens/VendorAreaScreen';
import { VendorDirectoryScreen, VendorProfileScreen } from './screens/VendorDirectoryScreen';
import { Button } from './ui';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

/** "/" sends each view to its own home. */
function HomeRedirect() {
  const view = useView();
  return <Navigate to={HOME[view]} replace />;
}

function NotFoundScreen() {
  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="font-display text-5xl font-bold text-karu-brown">404</p>
      <h1 className="mt-3 font-display text-2xl font-bold">We can&rsquo;t find that page</h1>
      <p className="mt-2 text-sm text-karu-mute">
        The link may be out of date, or the page may have moved.
      </p>
      <Link
        to="/search"
        className="mt-6 inline-block rounded-full bg-karu-yellow px-5 py-2.5 text-sm font-semibold text-karu-ink"
      >
        Find a car
      </Link>
    </div>
  );
}

function Header() {
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
          className="shrink-0"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: 26,
            letterSpacing: '0.3em',
            color: 'var(--gold-400)',
          }}
        >
          KARU
        </Link>
        {/* Each view sees only its own items — see lib/roles.ts */}
        <nav className="flex flex-wrap items-center justify-center gap-1">
          {NAV[view].map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/vendor' || item.to === '/admin'} className={nav}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {session ? (
            <>
              <NavLink to="/profile" className={nav}>
                {profile?.full_name?.split(' ')[0] ?? 'Profile'}
              </NavLink>
              <Button
                variant="ghost"
                className="whitespace-nowrap px-3 text-karu-cream/70 hover:bg-white/10 sm:px-5"
                onClick={async () => {
                  await signOut();
                  navigate('/search');
                }}
              >
                Sign out
              </Button>
            </>
          ) : (
            <Button onClick={() => navigate('/auth')}>Sign in</Button>
          )}
        </div>
      </div>
    </header>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Header />
          <main className="mx-auto max-w-6xl px-4 py-8">
            <Routes>
              <Route path="/" element={<HomeRedirect />} />
              <Route path="/auth" element={<AuthScreen />} />

              {/* Public marketplace — readable by every view. Only *booking*
                  is customer-only, enforced inside CarDetailScreen. */}
              <Route path="/search" element={<SearchScreen />} />
              <Route path="/vendors" element={<VendorDirectoryScreen />} />
              <Route path="/vendors/:id" element={<VendorProfileScreen />} />
              <Route path="/cars/:id" element={<CarDetailScreen />} />

              {/* Customer view */}
              <Route
                path="/bookings"
                element={
                  <RequireView views={['customer']}>
                    <BookingsScreen />
                  </RequireView>
                }
              />
              <Route
                path="/bookings/:id/confirmed"
                element={
                  <RequireView views={['customer']}>
                    <ConfirmationScreen />
                  </RequireView>
                }
              />

              {/* Vendor view */}
              <Route
                path="/vendor/*"
                element={
                  <RequireView views={['vendor']}>
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
          </main>
          <footer className="mx-auto max-w-6xl px-4 pb-8 text-center text-xs text-karu-mute">
            Karu — verified car rental for Cameroon · Douala & Yaoundé
          </footer>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
