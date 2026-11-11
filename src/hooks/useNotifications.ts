import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { getPushState } from '@/lib/push';

const canNotify = () => typeof window !== 'undefined' && 'Notification' in window;

/** Fragt einmalig nach der Erlaubnis für Systembenachrichtigungen (muss aus einem Klick kommen). */
export const requestNotificationPermission = async () => {
  if (!canNotify() || Notification.permission !== 'default') return;
  try {
    await Notification.requestPermission();
  } catch {
    /* ältere Browser */
  }
};

const notifyLocal = (title: string, body: string, tag: string) => {
  if (!canNotify() || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag, icon: '/icon.png' });
  } catch {
    /* z. B. Android Chrome ohne Service Worker */
  }
};

export const useNotifications = () => {
  const userId = useStore((s) => s.user?.id);

  useEffect(() => {
    if (!userId) return;
    // Ist Push aktiv, kommen Mitteilungen über den Service Worker. Sonst doppelt.
    let pushOn = false;
    getPushState().then((st) => (pushOn = st === 'on')).catch(() => {});
    const notify = (title: string, body: string, tag: string) => {
      if (!pushOn) notifyLocal(title, body, tag);
    };

    const channel = supabase
      .channel(`system-notifications-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'callbacks' }, (payload) => {
        const item = payload.new as { assigned_to?: string | null; customer_name?: string; topic?: string | null };
        if (item.assigned_to === userId || !item.assigned_to) {
          notify('Neuer Rückruf', `${item.customer_name}: ${item.topic || 'Bitte zurückrufen'}`, 'callback-new');
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'parcels' }, (payload) => {
        const item = payload.new as { recipient_id?: string; carrier?: string | null };
        if (item.recipient_id === userId) {
          notify('Paket für dich', item.carrier ? `Zugestellt von ${item.carrier}` : 'Liegt im Büro bereit', 'parcel-new');
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);
};
