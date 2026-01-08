import { useEffect, useState } from 'react';
import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';

export const MfaCheck = () => {
  const { user } = useStore();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [needsMfaSetup, setNeedsMfaSetup] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);

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
          setChecking(false);
          return;
      }

      // 2FA Re-Verification Logic
      // Check if user has authenticated with MFA recently
      const { data: levelData, error: levelError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      
      if (!levelError && levelData) {
         if (levelData.currentLevel === 'aal2') {
             // Already fully authenticated with MFA
             // Check if session is too old (optional, usually handled by token expiry, but we can enforce re-check)
             // For now, if AAL2 is active, we are good.
             // But user wants re-check every 6 hours.
             // Supabase session usually lasts longer.
             // We can check `last_sign_in_at` or store a local timestamp?
             
             // Simpler approach: Supabase MFA sessions are valid as long as the token is.
             // To enforce "every 6 hours", we need to check the session `aal` timestamp or similar.
             // Actually, Supabase doesn't expose "when was MFA done" easily in client session object.
             
             // Workaround: We store a timestamp in localStorage when MFA is passed.
             const lastMfaTime = localStorage.getItem('last_mfa_check');
             const SIX_HOURS = 6 * 60 * 60 * 1000;
             
             if (!lastMfaTime || (Date.now() - parseInt(lastMfaTime) > SIX_HOURS)) {
                 // Force re-verification
                 setNeedsVerification(true);
             }

         } else {
             // User has MFA enabled (aal2 possible) but is currently only on aal1 (password only)
             setNeedsVerification(true);
         }
      }
      
      setChecking(false);
    };

    checkMfaStatus();
  }, [user, location.pathname]);

  if (checking) return null; // Loading spinner

  if (needsMfaSetup && location.pathname !== '/mfa-setup') {
    return <Navigate to="/mfa-setup" replace />;
  }

  if (needsVerification && location.pathname !== '/mfa-verify') {
      return <Navigate to="/mfa-verify" replace />;
  }

  return <Outlet />;
};
