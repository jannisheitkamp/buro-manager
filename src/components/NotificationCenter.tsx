import { useCallback, useEffect, useRef, useState } from 'react';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { Bell, Package, Phone, ClipboardList, PhoneMissed, BellRing } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { cn } from '@/utils/cn';
import { requestNotificationPermission } from '@/hooks/useNotifications';
import type { LucideIcon } from 'lucide-react';

type NotificationItem = {
  id: string;
  title: string;
  subtitle?: string | null;
  date: string;
  link: string;
  icon: LucideIcon;
  tone: string;
};

const SEEN_KEY = 'notifications_seen_at';

export const NotificationCenter = () => {
  const userId = useStore((s) => s.user?.id);
  const isAdmin = useStore((s) => s.profile?.roles?.includes('admin'));
  const navigate = useNavigate();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [seenAt, setSeenAt] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(SEEN_KEY)) || 0;
    } catch {
      return 0;
    }
  });
  const [canAskPermission, setCanAskPermission] = useState(
    () => typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default',
  );
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const [parcels, callbacks, posts, missed] = await Promise.all([
      supabase.from('parcels').select('id, carrier, location, created_at').eq('recipient_id', userId).eq('status', 'pending'),
      supabase
        .from('callbacks')
        .select('id, customer_name, phone, topic, created_at')
        .eq('assigned_to', userId)
        .neq('status', 'done'),
      supabase
        .from('posts')
        .select('id, title, user_id, created_at, profiles(full_name)')
        .gte('created_at', since)
        .neq('user_id', userId),
      supabase
        .from('phone_calls')
        .select('id, caller_number, notes, created_at, user_id')
        .eq('status', 'missed')
        .gte('created_at', since),
    ]);

    const next: NotificationItem[] = [];

    parcels.data?.forEach((p) =>
      next.push({
        id: `parcel-${p.id}`,
        title: 'Paket für dich',
        subtitle: [p.carrier, p.location].filter(Boolean).join(', ') || null,
        date: p.created_at,
        link: '/parcels',
        icon: Package,
        tone: 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
      }),
    );

    callbacks.data?.forEach((c) =>
      next.push({
        id: `cb-${c.id}`,
        title: `Rückruf: ${c.customer_name}`,
        subtitle: c.topic || c.phone,
        date: c.created_at,
        link: '/calls?tab=tasks',
        icon: Phone,
        tone: 'bg-brand-50 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200',
      }),
    );

    missed.data
      ?.filter((c) => c.user_id === userId || (!c.user_id && isAdmin))
      .filter((c) => !c.notes?.includes('erledigt'))
      .forEach((c) =>
        next.push({
          id: `call-${c.id}`,
          title: `Verpasst: ${c.caller_number}`,
          subtitle: c.notes?.replace('Anrufer: ', '') || null,
          date: c.created_at,
          link: '/calls?tab=live',
          icon: PhoneMissed,
          tone: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300',
        }),
      );

    posts.data?.forEach((m) => {
      const author = (m.profiles as unknown as { full_name?: string } | null)?.full_name;
      next.push({
        id: `post-${m.id}`,
        title: m.title,
        subtitle: author ? `von ${author}` : null,
        date: m.created_at,
        link: '/board',
        icon: ClipboardList,
        tone: 'bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
      });
    });

    next.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setItems(next);
    setLoading(false);
  }, [userId, isAdmin]);

  useEffect(() => {
    if (!userId) return;
    fetchNotifications();
    const debounced = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(fetchNotifications, 500);
    };
    const channel = supabase
      .channel(`notification-center-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'parcels' }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'callbacks' }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'posts' }, debounced)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'phone_calls' }, debounced)
      .subscribe();
    return () => {
      clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [userId, fetchNotifications]);

  const unread = items.filter((i) => new Date(i.date).getTime() > seenAt).length;

  const markSeen = () => {
    const now = Date.now();
    setSeenAt(now);
    try {
      localStorage.setItem(SEEN_KEY, String(now));
    } catch {
      /* ignorieren */
    }
  };

  return (
    <Popover className="relative">
      {({ open, close }) => (
        <>
          <PopoverButton
            aria-label={unread > 0 ? `Benachrichtigungen, ${unread} neu` : 'Benachrichtigungen'}
            onClick={() => !open && setTimeout(markSeen, 1500)}
            className={cn('btn-icon relative', open && 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white')}
          >
            <Bell className="h-[18px] w-[18px]" />
            {unread > 0 && (
              <span className="tabular absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-semibold text-gray-950 ring-2 ring-white dark:ring-gray-900">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </PopoverButton>

          <PopoverPanel
            anchor={{ to: 'bottom end', gap: 8 }}
            className="z-50 w-[min(24rem,calc(100vw-1.5rem))] animate-pop-in overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Für dich</h3>
              <span className="text-xs text-gray-500">{items.length === 0 ? 'Nichts offen' : `${items.length} offen`}</span>
            </div>

            <div className="scrollbar-thin max-h-[60vh] overflow-y-auto p-1.5">
              {loading ? (
                <p className="py-8 text-center text-xs text-gray-400">Wird geladen</p>
              ) : items.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">Alles erledigt</p>
                  <p className="mt-1 text-xs text-gray-500">Keine offenen Rückrufe, Pakete oder Anrufe.</p>
                </div>
              ) : (
                items.map((item) => {
                  const isNew = new Date(item.date).getTime() > seenAt;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        close();
                        navigate(item.link);
                      }}
                      className="flex w-full items-start gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', item.tone)}>
                        <item.icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-gray-900 dark:text-white">{item.title}</span>
                          {isNew && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" aria-label="neu" />}
                        </span>
                        {item.subtitle && <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{item.subtitle}</span>}
                        <span className="mt-0.5 block text-2xs text-gray-400">
                          {formatDistanceToNow(new Date(item.date), { locale: de, addSuffix: true })}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            {canAskPermission && (
              <div className="border-t border-gray-100 p-2 dark:border-gray-700">
                <button
                  type="button"
                  onClick={async () => {
                    await requestNotificationPermission();
                    setCanAskPermission(false);
                  }}
                  className="btn-ghost w-full justify-start text-xs"
                >
                  <BellRing className="h-3.5 w-3.5" />
                  Desktop-Benachrichtigungen einschalten
                </button>
              </div>
            )}
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
};
