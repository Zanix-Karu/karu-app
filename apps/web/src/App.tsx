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
import { AuthProvider, RequireAdmin, RequireAuth, RequireVendor, useAuth } from './lib/auth';
import { AuthScreen } from './screens/AuthScreen';
import { SearchScreen } from './screens/SearchScreen';
import { CarDetailScreen } from './screens/CarDetailScreen';
import { ConfirmationScreen } from './screens/ConfirmationScreen';
import { BookingsScreen } from './screens/BookingsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { AdminScreen } from './screens/AdminScreen';
import { VendorAreaScreen } from './screens/VendorAreaScreen';
import { VendorDirectoryScreen, VendorProfileScreen } from './screens/VendorDirectoryScreen';
import { Button } from './ui';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function Header() {
  const { session, profile, signOut } = useAuth();
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
          to="/search"
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
        <nav className="flex flex-wrap items-center justify-center gap-1">
          <NavLink to="/search" className={nav}>
            Find a car
          </NavLink>
          <NavLink to="/vendors" className={nav}>
            Providers
          </NavLink>
          {session && (
            <NavLink to="/bookings" className={nav}>
              My bookings
            </NavLink>
          )}
          {profile?.role === 'vendor' && (
            <NavLink to="/vendor" className={nav}>
              Vendor area
            </NavLink>
          )}
          {profile?.role === 'admin' && (
            <NavLink to="/admin" className={nav}>
              Admin
            </NavLink>
          )}
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
              <Route path="/" element={<Navigate to="/search" replace />} />
              <Route path="/auth" element={<AuthScreen />} />
              <Route path="/search" element={<SearchScreen />} />
              <Route path="/vendors" element={<VendorDirectoryScreen />} />
              <Route path="/vendors/:id" element={<VendorProfileScreen />} />
              <Route path="/cars/:id" element={<CarDetailScreen />} />
              <Route
                path="/vendor"
                element={
                  <RequireVendor>
                    <VendorAreaScreen />
                  </RequireVendor>
                }
              />
              <Route
                path="/bookings/:id/confirmed"
                element={
                  <RequireAuth>
                    <ConfirmationScreen />
                  </RequireAuth>
                }
              />
              <Route
                path="/bookings"
                element={
                  <RequireAuth>
                    <BookingsScreen />
                  </RequireAuth>
                }
              />
              <Route
                path="/profile"
                element={
                  <RequireAuth>
                    <ProfileScreen />
                  </RequireAuth>
                }
              />
              <Route
                path="/admin"
                element={
                  <RequireAdmin>
                    <AdminScreen />
                  </RequireAdmin>
                }
              />
              <Route path="*" element={<Navigate to="/search" replace />} />
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
