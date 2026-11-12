import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Popover, PopoverButton, PopoverPanel } from '@headlessui/react';
import { format, formatDistanceToNowStrict, isSameDay, addDays, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Headset,
  MessageSquare,
  Package,
  Phone,
  PhoneMissed,
  PhoneOutgoing,
  Plus,
  RefreshCw,
  TrendingUp,
  Users,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { correctedMonthlyLv, fetchLvSnapshots, sumUntil } from '@/lib/lifeValues';
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, GoalRuler, PageLoading } from '@/components/ui';
import { STATUS_CONFIG, getStatusConfig, isStatusFresh, type StatusType } from '@/lib/status';
import { isOfficeClosed, matchesPerson, useReceptionPlan } from '@/lib/reception';
import { cn } from '@/utils/cn';

/* ------------------------------------------------------------------ */
/* Typen                                                               */
/* ------------------------------------------------------------------ */

type Colleague = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  roles?: string[] | null;
  status?: { status: StatusType; message: string | null; updated_at: string };
  absentToday?: string;
};

type AgendaItem = {
  id: string;
  kind: 'event' | 'callback' | 'followup' | 'missed';
  title: string;
  meta?: string | null;
  phone?: string | null;
  time: Date;
  urgent: boolean;
  topic?: string | null;
};

type Post = { id: string; title: string; content: string; created_at: string; profiles?: { full_name: string | null } | null };

type Stats = {
  monthLv: number;
  monthCommission: number;
  yearLv: number;
  yearCommission: number;
  monthlyGoal: number;
  yearlyGoal: number;
};

/* ------------------------------------------------------------------ */
/* Hilfen                                                              */
/* ------------------------------------------------------------------ */

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });

const greeting = (d: Date) => (d.getHours() < 11 ? 'Guten Morgen' : d.getHours() < 17 ? 'Guten Tag' : 'Guten Abend');

/** Anteil der Arbeitstage des Monats, die bis einschließlich heute vergangen sind */
const workdayProgress = (today: Date) => {
  const days = eachDayOfInterval({ start: startOfMonth(today), end: endOfMonth(today) }).filter((d) => !isOfficeClosed(d));
  const passed = days.filter((d) => d <= today).length;
  return { passed, total: days.length, ratio: days.length ? passed / days.length : 0 };
};

const ABSENCE_LABEL: Record<string, string> = {
  vacation: 'Urlaub',
  sick_leave: 'Krank',
  seminar: 'Seminar',
  school: 'Berufsschule',
  other: 'Abwesend',
};

/* ------------------------------------------------------------------ */
/* Status-Auswahl                                                      */
/* ------------------------------------------------------------------ */

const StatusPicker = ({ current, onChange }: { current?: Colleague['status']; onChange: (s: StatusType, msg: string) => Promise<void> }) => {
  const [message, setMessage] = useState('');
  const fresh = current && isStatusFresh(current.updated_at);
  const cfg = fresh ? getStatusConfig(current?.status) : undefined;

  return (
    <Popover className="relative">
      {({ close }) => (
        <>
          <PopoverButton className="btn-secondary h-10 gap-2.5 pl-3 pr-2.5">
            <span className={cn('h-2.5 w-2.5 rounded-full', cfg?.dot || 'bg-gray-300 dark:bg-gray-600')} />
            <span className="text-left">
              <span className="block text-sm font-medium leading-tight">{cfg?.label || 'Status setzen'}</span>
              {fresh && current?.message && <span className="block max-w-[11rem] truncate text-2xs text-gray-500">{current.message}</span>}
            </span>
            <ChevronDown className="h-4 w-4 text-gray-400" />
          </PopoverButton>
          <PopoverPanel
            anchor={{ to: 'bottom end', gap: 8 }}
            className="z-50 w-[min(20rem,calc(100vw-2rem))] animate-pop-in rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-700 dark:bg-gray-800"
          >
            <p className="mb-2 text-xs font-medium text-gray-500">Wo bist du gerade?</p>
            <div className="grid grid-cols-2 gap-1.5">
              {STATUS_CONFIG.map((s) => {
                const active = cfg?.value === s.value;
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={async () => {
                      await onChange(s.value, message);
                      setMessage('');
                      close();
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition-colors',
                      active ? cn('ring-1', s.tone) : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/60',
                    )}
                  >
                    <s.icon className="h-4 w-4 shrink-0 opacity-70" />
                    {s.label}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Notiz, z. B. „zurück um 14 Uhr“"
              aria-label="Notiz zum Status"
              className="input mt-3"
              onKeyDown={async (e) => {
                if (e.key === 'Enter') {
                  await onChange(cfg?.value || 'office', message);
                  setMessage('');
                  close();
                }
              }}
            />
          </PopoverPanel>
        </>
      )}
    </Popover>
  );
};

/* ------------------------------------------------------------------ */
/* Seite                                                               */
/* ------------------------------------------------------------------ */

export const Dashboard = () => {
  const user = useStore((s) => s.user);
  const profile = useStore((s) => s.profile);
  const isAdmin = !!profile?.roles?.includes('admin');
  const navigate = useNavigate();
  const reception = useReceptionPlan();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [colleagues, setColleagues] = useState<Colleague[]>([]);
  const [agenda, setAgenda] = useState<AgendaItem[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [parcelCount, setParcelCount] = useState({ mine: 0, all: 0 });
  const [stats, setStats] = useState<Stats>({ monthLv: 0, monthCommission: 0, yearLv: 0, yearCommission: 0, monthlyGoal: 10000, yearlyGoal: 120000 });
  const [openScript, setOpenScript] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const today = useMemo(() => new Date(), []);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setError(null);

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date();
    dayEnd.setHours(23, 59, 59, 999);
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const yearStart = `${new Date().getFullYear()}-01-01`;
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

    try {
      const [profilesRes, statusRes, absencesRes, callbacksRes, parcelsRes, eventsRes, postsRes, callsRes, prodRes, followRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, avatar_url, roles, is_approved, monthly_goal, yearly_goal').order('full_name'),
        supabase.from('user_status').select('user_id, status, message, updated_at').gte('updated_at', dayStart.toISOString()).order('updated_at', { ascending: false }),
        supabase.rpc('team_absences').select('user_id, type, status').lte('start_date', todayStr).gte('end_date', todayStr).neq('status', 'rejected'),
        supabase
          .from('callbacks')
          .select('id, customer_name, phone, topic, priority, created_at, assigned_to')
          .neq('status', 'done')
          .or(`assigned_to.eq.${user.id},assigned_to.is.null`),
        supabase.from('parcels').select('id, recipient_id').eq('status', 'pending'),
        supabase.from('calendar_events').select('id, title, location, start_time').gte('start_time', dayStart.toISOString()).lte('start_time', dayEnd.toISOString()).order('start_time'),
        supabase.from('posts').select('id, title, content, created_at, profiles(full_name)').order('created_at', { ascending: false }).limit(2),
        supabase.from('phone_calls').select('id, caller_number, notes, created_at, user_id').eq('status', 'missed').gte('created_at', twoDaysAgo),
        supabase.from('production_entries').select('commission_amount, life_values, submission_date, status').eq('user_id', user.id).gte('submission_date', yearStart),
        supabase
          .from('call_logs')
          .select('id, customer_name, phone_number, follow_up_date, follow_up_time, notes')
          .eq('user_id', user.id)
          .eq('status', 'wiedervorlage')
          .lte('follow_up_date', todayStr),
      ]);

      if (profilesRes.error) throw profilesRes.error;

      // Team
      const latest = new Map<string, Colleague['status']>();
      (statusRes.data || []).forEach((s) => {
        if (!latest.has(s.user_id)) latest.set(s.user_id, s as Colleague['status']);
      });
      const absent = new Map<string, string>();
      ((absencesRes.data || []) as { user_id: string; type: string }[]).forEach((a) => absent.set(a.user_id, ABSENCE_LABEL[a.type] || 'Abwesend'));

      const team: Colleague[] = (profilesRes.data || [])
        .filter((p) => p.is_approved !== false)
        .map((p) => ({ id: p.id, full_name: p.full_name, avatar_url: p.avatar_url, roles: p.roles, status: latest.get(p.id), absentToday: absent.get(p.id) }))
        .sort((a, b) => {
          const rank = (c: Colleague) => (c.status && getStatusConfig(c.status.status)?.available ? 0 : c.absentToday ? 2 : c.status ? 1 : 1.5);
          return rank(a) - rank(b) || (a.full_name || '').localeCompare(b.full_name || '');
        });
      setColleagues(team);

      // Aufgaben und Termine
      const items: AgendaItem[] = [];
      (callsRes.data || [])
        .filter((c) => !c.notes?.includes('erledigt') && (c.user_id === user.id || (!c.user_id && isAdmin)))
        .forEach((c) =>
          items.push({
            id: c.id,
            kind: 'missed',
            title: c.caller_number,
            meta: c.notes?.replace('Anrufer: ', '').replace(/Raw Params:.*/, '') || null,
            phone: c.caller_number,
            time: new Date(c.created_at),
            urgent: true,
          }),
        );
      (followRes.data || []).forEach((f) => {
        const t = new Date(`${f.follow_up_date}T${f.follow_up_time || '09:00'}`);
        items.push({ id: f.id, kind: 'followup', title: f.customer_name, meta: f.notes, phone: f.phone_number, time: t, urgent: t < new Date() });
      });
      (callbacksRes.data || []).forEach((c) =>
        items.push({
          id: c.id,
          kind: 'callback',
          title: c.customer_name,
          meta: c.topic,
          topic: c.topic,
          phone: c.phone,
          time: new Date(c.created_at),
          urgent: c.priority === 'high',
        }),
      );
      (eventsRes.data || []).forEach((e) =>
        items.push({ id: e.id, kind: 'event', title: e.title, meta: e.location, time: new Date(e.start_time), urgent: false }),
      );
      setAgenda(items);

      // Pakete
      const parcels = parcelsRes.data || [];
      setParcelCount({ mine: parcels.filter((p) => p.recipient_id === user.id).length, all: parcels.length });

      setPosts((postsRes.data as unknown as Post[]) || []);

      // Produktion (stornierte Verträge zählen nicht)
      const monthKey = format(new Date(), 'yyyy-MM');
      const prod = (prodRes.data || []).filter((e) => e.status !== 'cancelled');
      const sum = (rows: typeof prod, key: 'commission_amount' | 'life_values') => rows.reduce((acc, r) => acc + Number(r[key] || 0), 0);
      const monthRows = prod.filter((e) => String(e.submission_date).startsWith(monthKey));
      const me = profilesRes.data?.find((p) => p.id === user.id);
      const monthlyGoal = Number(me?.monthly_goal) || 10000;
      // Lebenswerte mit Korrektur aus den Monatslisten (falls eingetragen)
      const snaps = await fetchLvSnapshots(new Date().getFullYear(), user.id);
      const lvByMonth = correctedMonthlyLv(
        prod.map((e) => ({ ...e, user_id: user.id })),
        snaps,
        user.id,
        new Date().getFullYear(),
      );
      setStats({
        monthLv: lvByMonth[new Date().getMonth()],
        monthCommission: sum(monthRows, 'commission_amount'),
        yearLv: sumUntil(lvByMonth),
        yearCommission: sum(prod, 'commission_amount'),
        monthlyGoal,
        yearlyGoal: Number(me?.yearly_goal) || monthlyGoal * 12,
      });
    } catch (e) {
      console.error('Übersicht konnte nicht geladen werden:', e);
      setError('Die Übersicht konnte nicht geladen werden. Prüfe deine Verbindung und versuche es erneut.');
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin]);

  useEffect(() => {
    fetchData();
    const debounced = () => {
      clearTimeout(timer.current);
      timer.current = setTimeout(fetchData, 600);
    };
    const channel = supabase.channel('dashboard-live');
    ['user_status', 'callbacks', 'parcels', 'production_entries', 'calendar_events', 'posts', 'phone_calls', 'call_logs', 'absences'].forEach((table) =>
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, debounced),
    );
    channel.subscribe();
    return () => {
      clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [fetchData]);

  const setStatus = async (status: StatusType, message: string) => {
    if (!user) return;
    const { error } = await supabase.from('user_status').insert({ user_id: user.id, status, message: message.trim() || null, updated_at: new Date().toISOString() });
    if (error) toast.error('Status konnte nicht gespeichert werden.');
    else {
      toast.success(`Status: ${getStatusConfig(status)?.label}`);
      fetchData();
    }
  };

  if (loading) return <PageLoading label="Übersicht wird geladen" />;

  if (error)
    return (
      <Card className="mx-auto mt-10 max-w-md text-center">
        <p className="text-sm text-gray-700 dark:text-gray-300">{error}</p>
        <Button className="mt-4" icon={RefreshCw} onClick={() => fetchData()}>
          Erneut laden
        </Button>
      </Card>
    );

  const firstName = profile?.full_name?.split(' ')[0];
  const me = colleagues.find((c) => c.id === user?.id);
  const progress = workdayProgress(today);
  const projectedLv = progress.passed > 0 ? Math.round((stats.monthLv / progress.passed) * progress.total) : 0;
  const monthPct = stats.monthlyGoal ? Math.round((stats.monthLv / stats.monthlyGoal) * 100) : 0;
  const yearPct = stats.yearlyGoal ? Math.round((stats.yearLv / stats.yearlyGoal) * 100) : 0;
  const onTrack = stats.monthLv >= stats.monthlyGoal * progress.ratio;
  // Was pro verbleibendem Arbeitstag (inkl. heute) noch fürs Monatsziel fehlt
  const workdaysLeft = progress.total - progress.passed + (isOfficeClosed(today) ? 0 : 1);
  const missingLv = Math.max(0, stats.monthlyGoal - stats.monthLv);
  const perDayLv = workdaysLeft > 0 ? Math.ceil(missingLv / workdaysLeft) : 0;

  const todayAssignment = reception.assigneeFor(today);
  const receptionToday = todayAssignment?.person;
  const nextWorkday = [1, 2, 3, 4, 5, 6, 7].map((n) => addDays(today, n)).find((d) => !isOfficeClosed(d))!;
  const receptionNext = reception.assigneeFor(nextWorkday)?.person;
  const receptionPersonToday = todayAssignment
    ? colleagues.find((c) => c.id === todayAssignment.userId) || colleagues.find((c) => matchesPerson(c, todayAssignment.person))
    : undefined;

  const urgent = agenda.filter((a) => a.kind !== 'event').sort((a, b) => Number(b.urgent) - Number(a.urgent) || a.time.getTime() - b.time.getTime());
  const events = agenda.filter((a) => a.kind === 'event').sort((a, b) => a.time.getTime() - b.time.getTime());
  const availableCount = colleagues.filter((c) => c.status && isStatusFresh(c.status.updated_at) && getStatusConfig(c.status.status)?.available).length;
  const absentCount = colleagues.filter((c) => c.absentToday).length;

  return (
    <div className="space-y-6">
      {/* Kopf */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{format(today, 'EEEE, d. MMMM yyyy', { locale: de })}</p>
          <h1 className="mt-1 text-[1.75rem] font-semibold leading-9 text-gray-900 dark:text-white sm:text-[2rem]">
            {greeting(new Date())}
            {firstName ? `, ${firstName}` : ''}
          </h1>
        </div>
        <StatusPicker current={me?.status} onChange={setStatus} />
      </header>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Linke Spalte */}
        <div className="space-y-6 lg:col-span-8">
          {/* Ziel */}
          <Card padded={false} className="overflow-hidden">
            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Lebenswerte im {format(today, 'MMMM', { locale: de })}</p>
                  <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                    <span className="tabular font-display text-4xl font-semibold tracking-tight text-gray-900 dark:text-white sm:text-5xl">{num.format(stats.monthLv)}</span>
                    <span className="tabular text-sm text-gray-500">von {num.format(stats.monthlyGoal)}</span>
                  </p>
                </div>
                <Link to="/production" className="btn-ghost btn-sm -mr-2 shrink-0">
                  Produktion <ChevronRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              <GoalRuler value={stats.monthLv} goal={stats.monthlyGoal} expected={progress.ratio} className="mt-6" />
              <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                <span className="tabular">
                  {monthPct} % erreicht
                  {missingLv > 0 && workdaysLeft > 0 && ` · noch ${num.format(missingLv)}, also ${num.format(perDayLv)} pro Arbeitstag`}
                  {missingLv === 0 && ' · Ziel geschafft 🎉'}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-0.5 rounded bg-amber-400" />
                  Soll heute: Tag {progress.passed} von {progress.total}
                </span>
              </div>
            </div>

            <dl className="grid grid-cols-2 border-t border-gray-100 dark:border-gray-700 sm:grid-cols-4 [&>div]:border-gray-100 dark:[&>div]:border-gray-700">
              <div className="border-b border-r p-4 sm:border-b-0 sm:px-6">
                <dt className="text-xs text-gray-500">Prognose Monat</dt>
                <dd className={cn('tabular mt-1 text-lg font-semibold', onTrack ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-900 dark:text-white')}>
                  {num.format(projectedLv)}
                </dd>
              </div>
              <div className="border-b p-4 sm:border-b-0 sm:border-r sm:px-6">
                <dt className="text-xs text-gray-500">Provision Monat</dt>
                <dd className="tabular mt-1 text-lg font-semibold text-gray-900 dark:text-white">{eur.format(stats.monthCommission)}</dd>
              </div>
              <div className="border-r p-4 sm:px-6">
                <dt className="text-xs text-gray-500">Lebenswerte {today.getFullYear()}</dt>
                <dd className="tabular mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {num.format(stats.yearLv)} <span className="text-xs font-normal text-gray-500">{yearPct} %</span>
                </dd>
              </div>
              <div className="p-4 sm:px-6">
                <dt className="text-xs text-gray-500">Provision {today.getFullYear()}</dt>
                <dd className="tabular mt-1 text-lg font-semibold text-gray-900 dark:text-white">{eur.format(stats.yearCommission)}</dd>
              </div>
            </dl>
          </Card>

          {/* Aufgaben */}
          <Card padded={false}>
            <div className="flex items-center justify-between px-5 pb-3 pt-5 sm:px-6">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Zu erledigen</h2>
              <Link to="/calls?tab=tasks" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
                Alle Anrufe
              </Link>
            </div>
            {urgent.length === 0 ? (
              <EmptyState icon={Phone} title="Keine offenen Rückrufe" description="Verpasste Anrufe, Rückrufe und fällige Wiedervorlagen erscheinen hier." className="py-10" />
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
                {urgent.map((item) => {
                  const Icon = item.kind === 'missed' ? PhoneMissed : item.kind === 'followup' ? PhoneOutgoing : Phone;
                  const label = item.kind === 'missed' ? 'Verpasst' : item.kind === 'followup' ? 'Wiedervorlage' : 'Rückruf';
                  const target = item.kind === 'missed' ? '/calls?tab=live' : item.kind === 'followup' ? '/calls?tab=history' : '/calls?tab=tasks';
                  return (
                    <li key={`${item.kind}-${item.id}`} className="px-5 py-3 sm:px-6">
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                            item.urgent ? 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300',
                          )}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <button
                          type="button"
                          className="min-w-0 flex-1 text-left"
                          onClick={() => (item.kind === 'callback' ? setOpenScript(openScript === item.id ? null : item.id) : navigate(target))}
                        >
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-medium text-gray-900 dark:text-white">{item.title}</span>
                            {item.urgent && <Badge tone="danger">{item.kind === 'callback' ? 'Dringend' : label}</Badge>}
                          </span>
                          <span className="block truncate text-xs text-gray-500">
                            {!item.urgent && `${label} · `}
                            {item.meta || 'Ohne Notiz'} · {formatDistanceToNowStrict(item.time, { locale: de, addSuffix: true })}
                          </span>
                        </button>
                        {item.phone && (
                          <a href={`tel:${item.phone.replace(/\s/g, '')}`} className="btn-secondary btn-sm shrink-0" aria-label={`${item.title} anrufen`}>
                            <Phone className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">Anrufen</span>
                          </a>
                        )}
                      </div>
                      {item.kind === 'callback' && openScript === item.id && (
                        <div className="ml-12 mt-3 animate-fade-in rounded-lg border border-brand-100 bg-brand-50/60 p-3 text-sm text-gray-700 dark:border-brand-900 dark:bg-brand-950/40 dark:text-gray-300">
                          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-brand-700 dark:text-brand-300">
                            <MessageSquare className="h-3.5 w-3.5" /> Gesprächseinstieg
                          </p>
                          <p>
                            „Guten Tag, hier ist {firstName} vom Agenturverbund. Sie hatten um Rückruf gebeten
                            {item.topic ? <> wegen <strong>{item.topic}</strong></> : ''}.“
                          </p>
                          <Link to="/calls?tab=tasks" className="mt-2 inline-block text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
                            Rückruf öffnen
                          </Link>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* Termine heute */}
          <Card>
            <CardHeader
              title="Termine heute"
              icon={CalendarDays}
              action={
                <Link to="/general-calendar" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
                  Kalender
                </Link>
              }
            />
            {events.length === 0 ? (
              <p className="text-sm text-gray-500">Heute stehen keine Termine im Kalender.</p>
            ) : (
              <ol className="space-y-1">
                {events.map((e) => {
                  const past = e.time < new Date();
                  return (
                    <li key={e.id} className={cn('flex items-baseline gap-4 rounded-lg px-2 py-1.5', past && 'opacity-50')}>
                      <span className="tabular w-12 shrink-0 font-mono text-sm text-gray-500">{format(e.time, 'HH:mm')}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-gray-900 dark:text-white">{e.title}</span>
                        {e.meta && <span className="block truncate text-xs text-gray-500">{e.meta}</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>

        {/* Rechte Spalte */}
        <div className="space-y-6 lg:col-span-4">
          {/* Empfang */}
          <Card className="bg-brand-900 text-white dark:bg-brand-950" padded={false}>
            <div className="flex items-center gap-4 p-5">
              {receptionPersonToday ? (
                <Avatar name={receptionPersonToday.full_name} src={receptionPersonToday.avatar_url} size="lg" className="ring-2 ring-white/20" />
              ) : (
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10">
                  <Headset className="h-6 w-6 text-brand-100" />
                </span>
              )}
              <div className="min-w-0">
                <p className="text-xs text-brand-200">Empfang heute</p>
                <p className="font-display text-xl font-semibold">{receptionToday || 'Büro geschlossen'}</p>
                {receptionPersonToday?.absentToday && <p className="text-xs font-medium text-amber-300">{receptionPersonToday.absentToday}, Vertretung nötig</p>}
              </div>
            </div>
            <Link to="/reception" className="flex items-center justify-between border-t border-white/10 px-5 py-3 text-sm text-brand-100 hover:bg-white/5">
              <span>
                {format(nextWorkday, 'EEEE', { locale: de })}: <strong className="font-medium text-white">{receptionNext}</strong>
              </span>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Card>

          {/* Team */}
          <Card padded={false}>
            <div className="px-5 pb-2 pt-5">
              <CardHeader
                className="mb-1"
                title="Team"
                icon={Users}
                action={
                  <Link to="/directory" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
                    Verzeichnis
                  </Link>
                }
              />
              <p className="text-xs text-gray-500">
                {availableCount} erreichbar{absentCount > 0 && ` · ${absentCount} abwesend`}
              </p>
            </div>
            <ul className="scrollbar-thin max-h-[26rem] overflow-y-auto px-2 pb-3">
              {colleagues.map((c) => {
                const fresh = c.status && isStatusFresh(c.status.updated_at);
                const cfg = fresh ? getStatusConfig(c.status!.status) : undefined;
                const label = c.absentToday || cfg?.label || 'Noch kein Status';
                const dim = !cfg?.available;
                return (
                  <li key={c.id} className="flex items-center gap-3 rounded-lg px-3 py-2">
                    <span className="relative">
                      <Avatar name={c.full_name} src={c.avatar_url} size="sm" className={cn(dim && 'opacity-60 grayscale')} />
                      <span
                        className={cn(
                          'absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white dark:ring-gray-800',
                          c.absentToday ? 'bg-gray-400' : cfg?.dot || 'bg-gray-200 dark:bg-gray-600',
                        )}
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate text-sm font-medium', dim ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white')}>
                        {c.full_name || 'Ohne Namen'}
                        {c.id === user?.id && <span className="font-normal text-gray-400"> (du)</span>}
                      </span>
                      <span className="block truncate text-xs text-gray-500">
                        {label}
                        {fresh && !c.absentToday && c.status?.message ? ` · ${c.status.message}` : ''}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Schnellzugriff */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Vertrag', icon: TrendingUp, onClick: () => navigate('/production', { state: { prefill: {} } }) },
              { label: 'Rückruf', icon: Phone, onClick: () => navigate('/calls?tab=tasks&new=1') },
              { label: 'Paket', icon: Package, onClick: () => navigate('/parcels?new=1'), count: parcelCount.mine },
            ].map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={a.onClick}
                className="card relative flex flex-col items-center gap-1.5 px-2 py-3.5 text-xs font-medium text-gray-700 transition-colors hover:border-brand-300 hover:text-brand-800 dark:text-gray-200 dark:hover:border-brand-700"
              >
                <span className="flex items-center gap-1">
                  <Plus className="h-3 w-3 text-gray-400" />
                  <a.icon className="h-4 w-4" />
                </span>
                {a.label}
                {!!a.count && (
                  <span className="tabular absolute right-2 top-2 rounded bg-amber-400 px-1 text-2xs font-semibold text-gray-950" title="Pakete für dich">
                    {a.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Schwarzes Brett */}
          <Card>
            <CardHeader
              title="Schwarzes Brett"
              icon={ClipboardList}
              action={
                <Link to="/board" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
                  Alle
                </Link>
              }
            />
            {posts.length === 0 ? (
              <p className="text-sm text-gray-500">Noch keine Beiträge.</p>
            ) : (
              <ul className="space-y-4">
                {posts.map((p) => (
                  <li key={p.id}>
                    <Link to="/board" className="group block">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-brand-700 dark:text-white dark:group-hover:text-brand-300">{p.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-sm text-gray-500">{p.content.replace(/<[^>]+>/g, ' ')}</p>
                      <p className="mt-1 text-2xs text-gray-400">
                        {p.profiles?.full_name} · {isSameDay(new Date(p.created_at), today) ? 'heute' : format(new Date(p.created_at), 'd. MMM', { locale: de })}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
