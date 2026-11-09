import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { FullScreenLoader } from './FullScreenLoader';

// Nach 6 Stunden muss der 2FA-Code erneut eingegeben werden
const REVERIFY_AFTER_MS = 6 * 60 * 60 * 1000;

type MfaState = 'checking' | 'ok' | 'setup' | 'verify';

export const MfaCheck = () => {
  const userId = useStore((s) => s.user?.id);
  const [state, setState] = useState<MfaState>('checking');

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (cancelled) return;
      if (error) {
        console.error('2FA-Prüfung fehlgeschlagen:', error);
        setState('ok');
        return;
      }
      if (!data.all.some((f) => f.status === 'verified')) {
        setState('setup');
        return;
      }

      const { data: level } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (cancelled) return;
      let last = 0;
      try {
        last = Number(localStorage.getItem('last_mfa_check')) || 0;
      } catch {
        /* ignorieren */
      }
      const stale = Date.now() - last > REVERIFY_AFTER_MS;
      setState(level?.currentLevel === 'aal2' && !stale ? 'ok' : 'verify');
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (state === 'checking') return <FullScreenLoader />;
  if (state === 'setup') return <Navigate to="/mfa-setup" replace />;
  if (state === 'verify') return <Navigate to="/mfa-verify" replace />;
  return <Outlet />;
};
