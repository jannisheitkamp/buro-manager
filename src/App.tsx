import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { OnboardingCheck } from '@/components/OnboardingCheck';
import { MfaCheck } from '@/components/MfaCheck';
import { FullScreenLoader } from '@/components/FullScreenLoader';

const page = <T extends string>(loader: () => Promise<Record<T, React.ComponentType>>, name: T) =>
  lazy(() => loader().then((m) => ({ default: m[name] })));

const Login = page(() => import('@/pages/Login'), 'Login');
const Dashboard = page(() => import('@/pages/Dashboard'), 'Dashboard');
const Leads = page(() => import('@/pages/Leads'), 'Leads');
const Calendar = page(() => import('@/pages/Calendar'), 'Calendar');
const Bookings = page(() => import('@/pages/Bookings'), 'Bookings');
const Board = page(() => import('@/pages/Board'), 'Board');
const Polls = page(() => import('@/pages/Polls'), 'Polls');
const Parcels = page(() => import('@/pages/Parcels'), 'Parcels');
const Directory = page(() => import('@/pages/Directory'), 'Directory');
const Documents = page(() => import('@/pages/Documents'), 'Documents');
const ProfilePage = page(() => import('@/pages/Profile'), 'ProfilePage');
const GeneralCalendar = page(() => import('@/pages/GeneralCalendar'), 'GeneralCalendar');
const Production = page(() => import('@/pages/Production'), 'Production');
const Vacation = page(() => import('@/pages/Vacation'), 'Vacation');
const Reception = page(() => import('@/pages/Reception'), 'Reception');
const Admin = page(() => import('@/pages/Admin'), 'Admin');
const Onboarding = page(() => import('@/pages/Onboarding'), 'Onboarding');
const MfaSetup = page(() => import('@/pages/MfaSetup'), 'MfaSetup');
const MfaVerify = page(() => import('@/pages/MfaVerify'), 'MfaVerify');
const PhoneCalls = page(() => import('@/pages/PhoneCalls'), 'PhoneCalls');
const IncomingCallHandler = page(() => import('@/pages/IncomingCallHandler'), 'IncomingCallHandler');

const PendingApproval = () => {
  const signOut = useStore((s) => s.signOut);
  return (
    <div className="flex min-h-dvh items-center justify-center bg-gray-50 px-4 dark:bg-gray-900">
      <div className="card card-pad w-full max-w-md text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-900/30 dark:text-amber-300">
          <Lock className="h-6 w-6" />
        </div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Konto wartet auf Freischaltung</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Dein Konto ist angelegt. Sobald die Büroleitung es freischaltet, kannst du dich anmelden.
        </p>
        <button type="button" onClick={() => signOut()} className="btn-secondary mt-6">
          Zurück zur Anmeldung
        </button>
      </div>
    </div>
  );
};

function App() {
  const setUser = useStore((s) => s.setUser);
  const setLoading = useStore((s) => s.setLoading);
  const fetchProfile = useStore((s) => s.fetchProfile);
  const fetchSchoolHolidays = useStore((s) => s.fetchSchoolHolidays);

  useEffect(() => {
    let lastUserId: string | undefined;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;
      setUser(user);

      // Supabase-Aufrufe nicht direkt im Callback ausführen (kann sonst hängen)
      setTimeout(() => {
        if (!user) {
          lastUserId = undefined;
          setLoading(false);
          return;
        }
        // Profil nur bei neuem Nutzer oder echten Änderungen neu laden, nicht bei jedem Token-Refresh
        if (user.id !== lastUserId || event === 'USER_UPDATED') {
          lastUserId = user.id;
          fetchProfile().finally(() => setLoading(false));
          fetchSchoolHolidays();
        } else {
          setLoading(false);
        }
      }, 0);
    });

    return () => subscription.unsubscribe();
  }, [setUser, fetchProfile, fetchSchoolHolidays, setLoading]);

  return (
    <BrowserRouter>
      <Toaster
        position="top-center"
        toastOptions={{
          duration: 3500,
          className: '!rounded-lg !border !border-gray-200 !bg-white !text-sm !text-gray-900 !shadow-lg dark:!border-gray-700 dark:!bg-gray-800 dark:!text-gray-100',
          success: { iconTheme: { primary: '#146A68', secondary: '#fff' } },
        }}
      />
      <Suspense fallback={<FullScreenLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/incoming-call" element={<IncomingCallHandler />} />
          <Route path="/pending-approval" element={<PendingApproval />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/mfa-setup" element={<MfaSetup />} />
            <Route path="/mfa-verify" element={<MfaVerify />} />

            <Route element={<MfaCheck />}>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route element={<OnboardingCheck />}>
                <Route element={<Layout />}>
                  <Route index element={<Dashboard />} />
                  <Route path="/leads" element={<Leads />} />
                  <Route path="/general-calendar" element={<GeneralCalendar />} />
                  <Route path="/calendar" element={<Calendar />} />
                  <Route path="/vacation" element={<Vacation />} />
                  <Route path="/reception" element={<Reception />} />
                  <Route path="/bookings" element={<Bookings />} />
                  <Route path="/production" element={<Production />} />
                  <Route path="/board" element={<Board />} />
                  <Route path="/polls" element={<Polls />} />
                  <Route path="/parcels" element={<Parcels />} />
                  <Route path="/directory" element={<Directory />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="/documents" element={<Documents />} />
                  <Route path="/calls" element={<PhoneCalls />} />
                  <Route path="/profile" element={<ProfilePage />} />
                  {/* Alte Links weiterleiten */}
                  <Route path="/callbacks" element={<Navigate to="/calls?tab=tasks" replace />} />
                  <Route path="/dashboard" element={<Navigate to="/" replace />} />
                </Route>
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

export default App;
