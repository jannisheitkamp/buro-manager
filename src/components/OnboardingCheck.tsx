import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { FullScreenLoader } from './FullScreenLoader';

// Wer noch keine Provisionssätze hinterlegt hat, wird einmalig durchs Onboarding geführt
export const OnboardingCheck = () => {
  const userId = useStore((s) => s.user?.id);
  const location = useLocation();
  const [needsOnboarding, setNeedsOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from('user_commission_settings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .then(({ count, error }) => {
        if (cancelled) return;
        // Bei Fehlern nicht blockieren
        setNeedsOnboarding(!error && count === 0);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (needsOnboarding === null) return <FullScreenLoader />;
  if (needsOnboarding && location.pathname !== '/profile') return <Navigate to="/onboarding" replace />;
  return <Outlet />;
};
