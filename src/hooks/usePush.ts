import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { useStore } from '@/store/useStore';
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/push';

/** Push-Status dieses Geräts und Ein-/Ausschalten. Gemeinsam für Glocke und Profil. */
export const usePush = () => {
  const userId = useStore((s) => s.user?.id);
  const [state, setState] = useState<PushState>('unsupported');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getPushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  const toggle = async () => {
    if (!userId || busy) return;
    setBusy(true);
    try {
      const next = state === 'on' ? await disablePush() : await enablePush(userId);
      setState(next);
      if (next === 'on') toast.success('Push ist aktiv. Mitteilungen kommen jetzt auch bei geschlossener App.');
    } catch {
      toast.error('Push konnte nicht eingeschaltet werden.');
    } finally {
      setBusy(false);
    }
  };

  return { state, busy, toggle, ready: !!userId };
};
