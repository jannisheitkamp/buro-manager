import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';

export const useNotifications = () => {
  const { user } = useStore();

  useEffect(() => {
    if (!user) return;

    // Request permission on mount
    if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
      Notification.requestPermission();
    }

    const channel = supabase
      .channel('global_notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'callbacks' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
          const newItem = payload.new;
          
          // Check if relevant for me
          if (newItem.assigned_to === user.id || !newItem.assigned_to) {
             if (Notification.permission === 'granted') {
                 new Notification('Neuer Rückruf 📞', {
                     body: `${newItem.customer_name}: ${newItem.topic || 'Bitte zurückrufen'}`,
                     tag: 'callback-new', // Prevent spamming
                 });
             }
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'parcels' },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (payload: any) => {
             if (Notification.permission === 'granted') {
                 new Notification('Neues Paket 📦', {
                     body: `Für: ${payload.new.recipient_name || 'Unbekannt'}`,
                     tag: 'parcel-new',
                 });
             }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [user]);
};
