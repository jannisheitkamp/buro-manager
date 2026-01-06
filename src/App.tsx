import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Layout } from '@/components/Layout';
import { Login } from '@/pages/Login';
import { ProtectedRoute } from '@/components/ProtectedRoute';

import { Dashboard } from '@/pages/Dashboard';
import { Calendar } from '@/pages/Calendar';
import { Bookings } from '@/pages/Bookings';
import { Board } from '@/pages/Board';
import { Polls } from '@/pages/Polls';
import { Parcels } from '@/pages/Parcels';
import { Callbacks } from '@/pages/Callbacks';
import { Directory } from '@/pages/Directory';
import { ProfilePage } from '@/pages/ProfilePage';
import { Toaster } from 'react-hot-toast';

import { PageTransition } from '@/components/PageTransition';

import { GeneralCalendar } from '@/pages/GeneralCalendar';

import { Production } from '@/pages/Production';
import { Onboarding } from '@/pages/Onboarding';
import { OnboardingCheck } from '@/components/OnboardingCheck';
import { MfaSetup } from '@/pages/MfaSetup';
import { MfaCheck } from '@/components/MfaCheck';

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
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route element={<ProtectedRoute />}>
          <Route path="/mfa-setup" element={<MfaSetup />} />
          
          <Route element={<MfaCheck />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route element={<OnboardingCheck />}>
              <Route path="/" element={<Layout><PageTransition><Dashboard /></PageTransition></Layout>} />
              <Route path="/general-calendar" element={<Layout><PageTransition><GeneralCalendar /></PageTransition></Layout>} />
              <Route path="/calendar" element={<Layout><PageTransition><Calendar /></PageTransition></Layout>} />
              <Route path="/bookings" element={<Layout><PageTransition><Bookings /></PageTransition></Layout>} />
              <Route path="/production" element={<Layout><PageTransition><Production /></PageTransition></Layout>} />
              <Route path="/board" element={<Layout><PageTransition><Board /></PageTransition></Layout>} />
              <Route path="/polls" element={<Layout><PageTransition><Polls /></PageTransition></Layout>} />
              <Route path="/callbacks" element={<Layout><PageTransition><Callbacks /></PageTransition></Layout>} />
              <Route path="/parcels" element={<Layout><PageTransition><Parcels /></PageTransition></Layout>} />
              <Route path="/directory" element={<Layout><PageTransition><Directory /></PageTransition></Layout>} />
              <Route path="/profile" element={<Layout><PageTransition><ProfilePage /></PageTransition></Layout>} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
