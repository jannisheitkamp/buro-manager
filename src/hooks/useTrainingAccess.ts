import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';

/** Sieht diese Person das Berichtsheft? Azubis, Admins und Chefs mit Azubis. */
export function useTrainingAccess() {
  const { user, profile } = useStore();
  const direct = !!profile?.is_vocational_student || !!profile?.roles?.includes('admin');
  const [isBoss, setIsBoss] = useState(false);
  useEffect(() => {
    if (direct || !user) return;
    supabase
      .from('profiles')
      .select('id')
      .eq('boss_id', user.id)
      .eq('is_vocational_student', true)
      .then(({ data }) => setIsBoss(!!data?.length));
  }, [direct, user]);
  return direct || isBoss;
}
