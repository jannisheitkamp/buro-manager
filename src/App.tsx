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
import { ChatBot } from '@/components/ChatBot';

import { PageTransition } from '@/components/PageTransition';

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
          <Route path="/" element={<><Layout><PageTransition><Dashboard /></PageTransition></Layout><ChatBot /></>} />
          <Route path="/calendar" element={<><Layout><PageTransition><Calendar /></PageTransition></Layout><ChatBot /></>} />
          <Route path="/bookings" element={<><Layout><PageTransition><Bookings /></PageTransition></Layout><ChatBot /></>} />
          <Route path="/board" element={<><Layout><PageTransition><Board /></PageTransition></Layout><ChatBot /></>} />
          <Route path="/polls" element={<><Layout><PageTransition><Polls /></PageTransition></Layout><ChatBot /></>} />
          <Route path="/callbacks" element={<><Layout><PageTransition><Callbacks /></PageTransition></Layout><ChatBot /></>} />
          <Route path="/parcels" element={<><Layout><PageTransition><Parcels /></PageTransition></Layout><ChatBot /></>} />
          <Route path="/directory" element={<><Layout><PageTransition><Directory /></PageTransition></Layout><ChatBot /></>} />
          <Route path="/profile" element={<><Layout><PageTransition><ProfilePage /></PageTransition></Layout><ChatBot /></>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
