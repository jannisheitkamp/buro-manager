import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Layout } from '@/components/Layout';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PageTransition } from '@/components/PageTransition';
import { OnboardingCheck } from '@/components/OnboardingCheck';
import { MfaCheck } from '@/components/MfaCheck';
import { Toaster } from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

// Lazy load pages
const Login = lazy(() => import('@/pages/Login').then(module => ({ default: module.Login })));
const Dashboard = lazy(() => import('@/pages/Dashboard').then(module => ({ default: module.Dashboard })));
const Leads = lazy(() => import('@/pages/Leads').then(module => ({ default: module.Leads })));
const Calendar = lazy(() => import('@/pages/Calendar').then(module => ({ default: module.Calendar })));
const Bookings = lazy(() => import('@/pages/Bookings').then(module => ({ default: module.Bookings })));
const Board = lazy(() => import('@/pages/Board').then(module => ({ default: module.Board })));
const Polls = lazy(() => import('@/pages/Polls').then(module => ({ default: module.Polls })));
const Parcels = lazy(() => import('@/pages/Parcels').then(module => ({ default: module.Parcels })));
const Directory = lazy(() => import('@/pages/Directory').then(module => ({ default: module.Directory })));
const Documents = lazy(() => import('@/pages/Documents').then(module => ({ default: module.Documents })));
const ProfilePage = lazy(() => import('@/pages/Profile').then(module => ({ default: module.ProfilePage })));
const GeneralCalendar = lazy(() => import('@/pages/GeneralCalendar').then(module => ({ default: module.GeneralCalendar })));
const Production = lazy(() => import('@/pages/Production').then(module => ({ default: module.Production })));
const Admin = lazy(() => import('@/pages/Admin').then(module => ({ default: module.Admin })));
const Onboarding = lazy(() => import('@/pages/Onboarding').then(module => ({ default: module.Onboarding })));
const MfaSetup = lazy(() => import('@/pages/MfaSetup').then(module => ({ default: module.MfaSetup })));
const MfaVerify = lazy(() => import('@/pages/MfaVerify').then(module => ({ default: module.MfaVerify })));
const PhoneCalls = lazy(() => import('@/pages/PhoneCalls').then(module => ({ default: module.PhoneCalls })));
const IncomingCallHandler = lazy(() => import('@/pages/IncomingCallHandler').then(module => ({ default: module.IncomingCallHandler })));
const Todoist = lazy(() => import('@/pages/Todoist').then(module => ({ default: module.Todoist })));

function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-10 h-10 animate-spin text-indigo-600" />
        <p className="text-sm text-gray-500 font-medium">Laden...</p>
      </div>
    </div>
  );
}

function App() {
  const setUser = useStore((state) => state.setUser);
  const setLoading = useStore((state) => state.setLoading);
  const fetchProfile = useStore((state) => state.fetchProfile);

  useEffect(() => {
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile().finally(() => {
          setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile();
      }
    });

    return () => subscription.unsubscribe();
  }, [setUser, fetchProfile]);

  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/incoming-call" element={<IncomingCallHandler />} />
          
          <Route element={<ProtectedRoute />}>
            <Route path="/mfa-setup" element={<MfaSetup />} />
            <Route path="/mfa-verify" element={<MfaVerify />} />
            
            <Route element={<MfaCheck />}>
              <Route path="/onboarding" element={<Onboarding />} />
              <Route element={<OnboardingCheck />}>
                <Route path="/" element={<Layout><PageTransition><Dashboard /></PageTransition></Layout>} />
                <Route path="/leads" element={<Layout><PageTransition><Leads /></PageTransition></Layout>} />
                <Route path="/general-calendar" element={<Layout><PageTransition><GeneralCalendar /></PageTransition></Layout>} />
                <Route path="/calendar" element={<Layout><PageTransition><Calendar /></PageTransition></Layout>} />
                <Route path="/bookings" element={<Layout><PageTransition><Bookings /></PageTransition></Layout>} />
                <Route path="/production" element={<Layout><PageTransition><Production /></PageTransition></Layout>} />
                <Route path="/board" element={<Layout><PageTransition><Board /></PageTransition></Layout>} />
                <Route path="/polls" element={<Layout><PageTransition><Polls /></PageTransition></Layout>} />
                <Route path="/parcels" element={<Layout><PageTransition><Parcels /></PageTransition></Layout>} />
                <Route path="/directory" element={<Layout><PageTransition><Directory /></PageTransition></Layout>} />
                <Route path="/admin" element={<Layout><PageTransition><Admin /></PageTransition></Layout>} />
                <Route path="/documents" element={<Layout><PageTransition><Documents /></PageTransition></Layout>} />
                <Route path="/todoist" element={<Layout><PageTransition><Todoist /></PageTransition></Layout>} />
                <Route path="/calls" element={<Layout><PageTransition><PhoneCalls /></PageTransition></Layout>} />
                <Route path="/profile" element={<Layout><PageTransition><ProfilePage /></PageTransition></Layout>} />
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
