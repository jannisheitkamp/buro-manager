import { useEffect, useState } from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';

export const OnboardingCheck = () => {
  const { user } = useStore();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    const checkSettings = async () => {
      if (!user) {
        setChecking(false);
        return;
      }

      // Skip check if we are already on onboarding or profile page (to allow setup)
      if (location.pathname === '/onboarding' || location.pathname === '/profile') {
          setChecking(false);
          return;
      }

      const { count } = await supabase
        .from('user_commission_settings')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id);

      // If no settings found (count === 0), user needs onboarding
      if (count === 0) {
        setNeedsOnboarding(true);
      }
      setChecking(false);
    };

    checkSettings();
  }, [user, location.pathname]);

  if (checking) return null; // Or a loading spinner

  if (needsOnboarding && location.pathname !== '/onboarding') {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
};
