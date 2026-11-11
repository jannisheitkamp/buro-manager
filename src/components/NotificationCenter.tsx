import { useCallback, useEffect, useRef, useState } from 'react';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { Bell, Package, Phone, PhoneMissed, BellRing, BellOff, CheckCheck, Smartphone } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { cn } from '@/utils/cn';
import { disablePush, enablePush, getPushState, type PushState } from '@/lib/push';
import type { LucideIcon } from 'lucide-react';

type Message = { id: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null };
type OpenItem = { id: string; title: string; subtitle?: string | null; date: string; link: string; icon: LucideIcon; tone: string };

const PushToggle = ({ state, onChange }: { state: PushState; onChange: (s: PushState) => void }) => {
  const userId = useStore((s) => s.user?.id);
  const [busy, setBusy] = useState(false);

  if (state === 'unsupported') return null;
  if (state === 'ios-needs-install')
    return (
      <p className="flex gap-2 p-2 text-xs text-gray-500">
        <Smartphone className="h-4 w-4 shrink-0" />
        Für Push aufs iPhone: In Safari „Teilen“ antippen, dann „Zum Home-Bildschirm“. Danach die App von dort öffnen.
      </p>
    );
  if (state === 'denied') return <p className="p-2 text-xs text-gray-500">Benachrichtigungen sind im Browser blockiert. Erlaube sie in den Einstellungen der Website.</p>;

  return (
    <button
      type="button"
      disabled={busy || !userId}
      onClick={async () => {
        if (!userId) return;
        setBusy(true);
        try {
          const next = state === 'on' ? await disablePush() : await enablePush(userId);
          onChange(next);
          if (next === 'on') toast.success('Push ist aktiv. Mitteilungen kommen jetzt auch bei geschlossener App.');
        } catch {
          toast.error('Push konnte nicht eingeschaltet werden.');
        } finally {
          setBusy(false);
        }
      }}
      className="btn-ghost w-full justify-start text-xs"
    >
      {state === 'on' ? <BellOff className="h-3.5 w-3.5" /> : <BellRing className="h-3.5 w-3.5" />}
      {state === 'on' ? 'Push auf diesem Gerät ausschalten' : 'Push auf diesem Gerät einschalten'}
    </button>
  );
};

export const NotificationCenter = () => {
  const userId = useStore((s) => s.user?.id);
  const isAdmin = useStore((s) => s.profile?.roles?.includes('admin'));
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Message[]>([]);
  const [openItems, setOpenItems] = useState<OpenItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushState, setPushState] = useState<PushState>('unsupported');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    getPushState().then(setPushState).catch(() => setPushState('unsupported'));
  }, []);

  const fetchAll = useCallback(async () => {
    if (!userId) return;
    const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    const [msgs, parcels, callbacks, missed] = await Promise.all([
      supabase.from('notifications').select('id, title, body, link, created_at, read_at').order('created_at', { ascending: false }).limit(30),
      supabase.from('parcels').select('id, carrier, location, created_at').eq('recipient_id', userId).eq('status', 'pending'),
      supabase.from('callbacks').select('id, customer_name, phone, topic, created_at').eq('assigned_to', userId).neq('status', 'done'),
      supabase.from('phone_calls').select('id, caller_number, notes, created_at, user_id').eq('status', 'missed').gte('created_at', since),
    ]);

    // Tabelle fehlt, solange das Update 2.1 nicht eingespielt ist
    setMessages(msgs.error ? [] : ((msgs.data as Message[]) || []));

    const items: OpenItem[] = [];
    parcels.data?.forEach((p) =>
      items.push({ id: `parcel-${p.id}`, title: 'Paket abholen', subtitle: [p.carrier, p.location].filter(Boolean).join(', ') || null, date: p.created_at, link: '/parcels', icon: Package, tone: 'bg-sky-50 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300' }),
    );
    callbacks.data?.forEach((c) =>
      items.push({ id: `cb-${c.id}`, title: `Rückruf: ${c.customer_name}`, subtitle: c.topic || c.phone, date: c.created_at, link: '/calls?tab=tasks', icon: Phone, tone: 'bg-brand-50 text-brand-700 dark:bg-brand-900/60 dark:text-brand-200' }),
    );
    missed.data
      ?.filter((c) => (c.user_id === userId || (!c.user_id && isAdmin)) && !c.notes?.includes('erledigt'))
      .forEach((c) =>
        items.push({ id: `call-${c.id}`, title: `Verpasst: ${c.caller_number}`, subtitle: c.notes?.replace('Anrufer: ', '') || null, date: c.created_at, link: '/calls?tab=live', icon: PhoneMissed, tone: 'bg-red-50 text-red-700 dark:bg-red-900/40 dark:text-red-300' }),
      );
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setOpenItems(items);
    setLoading(false);
  }, [userId, isAdmin]);

  useEffect(() => {
    if (!userId) return;
    fetchAll();
    const debounced = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(fetchAll, 400);
    };
    const channel = supabase.channel(`notification-center-${userId}`);
    ['notifications', 'parcels', 'callbacks', 'phone_calls'].forEach((table) =>
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, debounced),
    );
    channel.subscribe();
    return () => {
      clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [userId, fetchAll]);

  const unread = messages.filter((m) => !m.read_at).length;
  const badge = unread + openItems.length;

  // Zahl am App-Symbol (installierte App)
  useEffect(() => {
    const nav = navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    if (badge > 0) nav.setAppBadge?.(badge).catch(() => {});
    else nav.clearAppBadge?.().catch(() => {});
  }, [badge]);

  const markAllRead = async () => {
    const ids = messages.filter((m) => !m.read_at).map((m) => m.id);
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    setMessages((ms) => ms.map((m) => (m.read_at ? m : { ...m, read_at: now })));
    await supabase.from('notifications').update({ read_at: now }).in('id', ids);
  };

  const openMessage = async (m: Message, close: () => void) => {
    close();
    if (!m.read_at) {
      setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, read_at: new Date().toISOString() } : x)));
      supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', m.id).then(() => {});
    }
    if (m.link) navigate(m.link);
  };

  return (
    <Popover className="relative">
      {({ close }) => (
        <>
          <PopoverButton aria-label={badge > 0 ? `Benachrichtigungen, ${badge} offen` : 'Benachrichtigungen'} className="btn-icon relative data-[open]:bg-gray-100 data-[open]:text-gray-900 dark:data-[open]:bg-gray-700 dark:data-[open]:text-white">
            <Bell className="h-[18px] w-[18px]" />
            {badge > 0 && (
              <span className={cn('tabular absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold ring-2 ring-white dark:ring-gray-900', unread > 0 ? 'bg-red-500 text-white' : 'bg-amber-400 text-gray-950')}>
                {badge > 9 ? '9+' : badge}
              </span>
            )}
          </PopoverButton>

          <PopoverPanel anchor={{ to: 'bottom end', gap: 8 }} className="z-50 w-[min(24rem,calc(100vw-1.5rem))] animate-pop-in overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
            <div className="scrollbar-thin max-h-[70vh] overflow-y-auto">
              {/* Mitteilungen */}
              <div className="flex items-center justify-between px-4 pb-1 pt-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Mitteilungen</h3>
                {unread > 0 && (
                  <button type="button" onClick={markAllRead} className="flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
                    <CheckCheck className="h-3.5 w-3.5" /> Alle gelesen
                  </button>
                )}
              </div>
              <div className="p-1.5">
                {loading ? (
                  <p className="py-6 text-center text-xs text-gray-400">Wird geladen</p>
                ) : messages.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-gray-500">Keine Mitteilungen.</p>
                ) : (
                  messages.slice(0, 12).map((m) => (
                    <button key={m.id} type="button" onClick={() => openMessage(m, close)} className="flex w-full items-start gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', m.read_at ? 'bg-transparent' : 'bg-red-500')} aria-label={m.read_at ? undefined : 'ungelesen'} />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-sm', m.read_at ? 'text-gray-600 dark:text-gray-300' : 'font-medium text-gray-900 dark:text-white')}>{m.title}</span>
                        {m.body && <span className="block truncate text-xs text-gray-500">{m.body}</span>}
                        <span className="mt-0.5 block text-2xs text-gray-400">{formatDistanceToNow(new Date(m.created_at), { locale: de, addSuffix: true })}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>

              {/* Offene Aufgaben */}
              <div className="border-t border-gray-100 px-4 pb-1 pt-3 dark:border-gray-700">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Offen für dich</h3>
              </div>
              <div className="p-1.5">
                {!loading && openItems.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-gray-500">Keine offenen Rückrufe, Pakete oder Anrufe.</p>
                ) : (
                  openItems.map((item) => (
                    <button key={item.id} type="button" onClick={() => { close(); navigate(item.link); }} className="flex w-full items-start gap-3 rounded-lg p-2.5 text-left transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50">
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', item.tone)}>
                        <item.icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{item.title}</span>
                        {item.subtitle && <span className="block truncate text-xs text-gray-500 dark:text-gray-400">{item.subtitle}</span>}
                        <span className="mt-0.5 block text-2xs text-gray-400">{formatDistanceToNow(new Date(item.date), { locale: de, addSuffix: true })}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="border-t border-gray-100 p-1.5 dark:border-gray-700">
              <PushToggle state={pushState} onChange={setPushState} />
            </div>
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
};
