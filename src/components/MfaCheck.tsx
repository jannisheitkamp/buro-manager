import { useEffect, useState } from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';

export const MfaCheck = () => {
  const { user } = useStore();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [needsMfaSetup, setNeedsMfaSetup] = useState(false);

  useEffect(() => {
    const checkMfaStatus = async () => {
      if (!user) {
        setChecking(false);
        return;
      }

      // If already on setup page, don't redirect loop
      if (location.pathname === '/mfa-setup') {
          setChecking(false);
          return;
      }

      // Check enrolled factors
      const { data, error } = await supabase.auth.mfa.listFactors();
      
      if (error) {
          console.error('Error checking MFA:', error);
          setChecking(false);
          return;
      }

      const hasVerifiedFactor = data.all.some(f => f.status === 'verified');

      if (!hasVerifiedFactor) {
          setNeedsMfaSetup(true);
      }
      
      setChecking(false);
    };

    checkMfaStatus();
  }, [user, location.pathname]);

  if (checking) return null; // Loading spinner

  if (needsMfaSetup && location.pathname !== '/mfa-setup') {
    return <Navigate to="/mfa-setup" replace />;
  }

  return <Outlet />;
};
