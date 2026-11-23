import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { addYears, differenceInCalendarDays, differenceInYears, format, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { BellRing, Cake, ChevronDown, EyeOff, FileText, GitMerge, Mail, MapPin, Pencil, Phone, Plus, Search, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Button, EmptyState, Field, PageHeader, PageLoading, Segmented } from '@/components/ui';
import { CountUp, HeroDivider, HeroPanel, HeroStat, StatusPill, Tag } from '@/components/ui/hero';
import { Modal } from '@/components/Modal';
import { ContractDocuments } from '@/components/ContractDocuments';
import { CATEGORY_COLORS } from '@/lib/chartTheme';
import { deadlineTopic, upcomingDeadlines, REMIND_DAYS, type Deadline } from '@/lib/followups';
import { cn } from '@/utils/cn';

type Entry = {
  id: string;
  user_id: string;
  managed_by: string | null;
  customer_id: string | null;
  status: 'submitted' | 'policed' | 'cancelled';
  category: string;
  sub_category: string | null;
  start_date: string | null;
  submission_date: string;
  customer_name: string;
  customer_firstname: string | null;
  policy_number: string | null;
  commission_amount: number | null;
  life_values: number | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
};

export type Customer = {
  id: string;
  created_at: string;
  created_by: string | null;
  last_name: string;
  first_name: string | null;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  household: string | null;
  notes: string | null;
};

type OpenCallback = { id: string; customer_id: string; topic: string | null; priority: string; status: string; created_at: string };
type Followup = { entry_id: string; due_date: string; state: 'callback' | 'dismissed' };

/** Was ein gut versorgter Privatkunde typischerweise hat */
const CORE_PRODUCTS = ['PHV', 'HR', 'Rechtsschutz', 'UNF', 'BU'];
/** So viele Tage im Voraus werden Geburtstage angezeigt */
const BIRTHDAY_DAYS = 14;

const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const eur0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const fullName = (c: Pick<Customer, 'last_name' | 'first_name'>) => `${c.last_name}${c.first_name ? `, ${c.first_name}` : ''}`;
const entryName = (e: Entry) => `${e.customer_name}${e.customer_firstname ? `, ${e.customer_firstname}` : ''}`;
const product = (e: Entry) => e.sub_category || e.category;
const day = (d: string) => new Date(`${d}T00:00:00`);

/** Tage bis zum nächsten Geburtstag (0 = heute) */
function nextBirthday(birth: string, today = new Date()) {
  const b = day(birth);
  const t = startOfDay(today);
  let next = new Date(t.getFullYear(), b.getMonth(), b.getDate());
  if (next < t) next = addYears(next, 1);
  return { date: next, days: differenceInCalendarDays(next, t), age: differenceInYears(next, b) };
}

const EMPTY_FORM = { last_name: '', first_name: '', birth_date: '', phone: '', email: '', address: '', household: '', notes: '' };
type FormState = typeof EMPTY_FORM;

export const Customers = () => {
  const { user, profile } = useStore();
  const isAdmin = profile?.roles?.includes('admin');
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [callbacks, setCallbacks] = useState<OpenCallback[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<'mine' | 'team'>('mine');
  const [query, setQuery] = useState('');
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [openDocs, setOpenDocs] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [callbackFor, setCallbackFor] = useState<Customer | null>(null);
  const [callbackTopic, setCallbackTopic] = useState('');
  const [mergeFor, setMergeFor] = useState<Customer | null>(null);
  const [mergeDrop, setMergeDrop] = useState('');

  const load = useCallback(async () => {
    const [{ data: c, error }, { data: e }, { data: cb }, { data: f }] = await Promise.all([
      supabase.from('customers').select('*').order('last_name'),
      supabase
        .from('production_entries')
        .select('id, user_id, managed_by, customer_id, status, category, sub_category, start_date, submission_date, customer_name, customer_firstname, policy_number, commission_amount, life_values, cancelled_at, cancel_reason')
        .order('submission_date', { ascending: false }),
      supabase.from('callbacks').select('id, customer_id, topic, priority, status, created_at').not('customer_id', 'is', null).neq('status', 'done'),
      supabase.from('contract_followups').select('entry_id, due_date, state'),
    ]);
    if (error) toast.error('Kunden konnten nicht geladen werden.');
    setCustomers((c as Customer[]) || []);
    setEntries((e as Entry[]) || []);
    setCallbacks((cb as OpenCallback[]) || []);
    setFollowups((f as Followup[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Aus der Suche (?c=<id>) direkt den Kunden öffnen
  useEffect(() => {
    const id = searchParams.get('c');
    if (!id || loading) return;
    setScope('team');
    setOpen(id);
    setSearchParams({}, { replace: true });
    setTimeout(() => document.getElementById(`customer-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [searchParams, loading, setSearchParams]);

  const mineEntry = useCallback((e: Entry) => e.user_id === user?.id || e.managed_by === user?.id, [user?.id]);
  const scopedEntries = useMemo(() => (scope === 'mine' ? entries.filter(mineEntry) : entries), [entries, scope, mineEntry]);

  // Kunden mit ihren Verträgen und Lücken
  const rows = useMemo(() => {
    const byCustomer = new Map<string, Entry[]>();
    entries.forEach((e) => {
      if (!e.customer_id) return;
      if (!byCustomer.has(e.customer_id)) byCustomer.set(e.customer_id, []);
      byCustomer.get(e.customer_id)!.push(e);
    });
    return customers
      .map((c) => {
        const all = byCustomer.get(c.id) || [];
        const active = all.filter((e) => e.status !== 'cancelled');
        const has = new Set(active.map(product));
        return {
          customer: c,
          name: fullName(c),
          entries: all,
          active,
          mine: all.some(mineEntry) || (all.length === 0 && c.created_by === user?.id),
          cancelled: all.length - active.length,
          gaps: active.length ? CORE_PRODUCTS.filter((p) => !has.has(p)) : [],
          lv: active.reduce((a, e) => a + Number(e.life_values || 0), 0),
          commission: active.reduce((a, e) => a + Number(e.commission_amount || 0), 0),
          birthday: c.birth_date ? nextBirthday(c.birth_date) : null,
          callbacks: callbacks.filter((cb) => cb.customer_id === c.id),
        };
      })
      .filter((r) => scope === 'team' || r.mine)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [customers, entries, callbacks, scope, mineEntry, user?.id]);

  const handled = useMemo(() => new Set(followups.map((f) => `${f.entry_id}|${f.due_date}`)), [followups]);
  const deadlines = useMemo(() => upcomingDeadlines(scopedEntries).filter((d) => !handled.has(d.key)), [scopedEntries, handled]);
  const due = deadlines.filter((d) => d.due);
  const kfzDue = deadlines.filter((d) => d.kind === 'kfz');
  const withGaps = rows.filter((r) => r.gaps.length > 0);
  const birthdays = rows.filter((r) => r.birthday && r.birthday.days <= BIRTHDAY_DAYS).sort((a, b) => a.birthday!.days - b.birthday!.days);

  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (onlyGaps && r.gaps.length === 0) return false;
    if (!q) return true;
    const c = r.customer;
    return (
      r.name.toLowerCase().includes(q) ||
      [c.phone, c.email, c.household, c.address].some((v) => v?.toLowerCase().includes(q)) ||
      r.entries.some((e) => e.policy_number?.toLowerCase().includes(q))
    );
  });

  const householdOf = (c: Customer) =>
    c.household ? customers.filter((x) => x.id !== c.id && x.household?.trim().toLowerCase() === c.household!.trim().toLowerCase()) : [];

  /* ---------------- Aktionen ---------------- */

  const createDeadlineCallback = async (d: Deadline<Entry>) => {
    if (!user) return;
    setBusy(d.key);
    const c = customers.find((x) => x.id === d.entry.customer_id);
    const { data: cb, error } = await supabase
      .from('callbacks')
      .insert({
        customer_name: c ? fullName(c) : entryName(d.entry),
        customer_id: d.entry.customer_id,
        phone: c?.phone || null,
        topic: deadlineTopic(d),
        priority: d.daysLeft <= 7 ? 'high' : 'normal',
        status: 'open',
        created_by: user.id,
        assigned_to: user.id,
      })
      .select('id')
      .single();
    if (!error) {
      await supabase.from('contract_followups').insert({ entry_id: d.entry.id, due_date: format(d.deadline, 'yyyy-MM-dd'), state: 'callback', callback_id: cb?.id });
    }
    setBusy(null);
    if (error) toast.error('Rückruf konnte nicht angelegt werden.');
    else {
      toast.success('Rückruf angelegt');
      load();
    }
  };

  const dismiss = async (d: Deadline<Entry>) => {
    setBusy(d.key);
    const { error } = await supabase.from('contract_followups').insert({ entry_id: d.entry.id, due_date: format(d.deadline, 'yyyy-MM-dd'), state: 'dismissed' });
    setBusy(null);
    if (error) toast.error('Konnte nicht ausgeblendet werden.');
    else load();
  };

  const openForm = (c: Customer | 'new') => {
    setEditing(c);
    setForm(
      c === 'new'
        ? EMPTY_FORM
        : {
            last_name: c.last_name,
            first_name: c.first_name || '',
            birth_date: c.birth_date || '',
            phone: c.phone || '',
            email: c.email || '',
            address: c.address || '',
            household: c.household || '',
            notes: c.notes || '',
          },
    );
  };

  const saveForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !form.last_name.trim()) return;
    setSaving(true);
    const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null])) as Record<keyof FormState, string | null>;
    const { data, error } =
      editing === 'new'
        ? await supabase.from('customers').insert({ ...payload, created_by: user?.id }).select('id').single()
        : await supabase.from('customers').update(payload).eq('id', editing.id).select('id').single();
    setSaving(false);
    if (error) return toast.error('Kunde konnte nicht gespeichert werden.');
    toast.success(editing === 'new' ? 'Kunde angelegt' : 'Gespeichert');
    setEditing(null);
    if (data?.id) setOpen(data.id);
    load();
  };

  const createCallback = async () => {
    if (!user || !callbackFor) return;
    setBusy(callbackFor.id);
    const { error } = await supabase.from('callbacks').insert({
      customer_name: fullName(callbackFor),
      customer_id: callbackFor.id,
      phone: callbackFor.phone,
      topic: callbackTopic.trim() || null,
      priority: 'normal',
      status: 'open',
      created_by: user.id,
      assigned_to: user.id,
    });
    setBusy(null);
    if (error) return toast.error('Rückruf konnte nicht angelegt werden.');
    toast.success('Rückruf angelegt');
    setCallbackFor(null);
    setCallbackTopic('');
    load();
  };

  const merge = async () => {
    if (!mergeFor || !mergeDrop) return;
    setBusy('merge');
    const { error } = await supabase.rpc('merge_customers', { p_keep: mergeFor.id, p_drop: mergeDrop });
    setBusy(null);
    if (error) return toast.error(error.message || 'Zusammenführen fehlgeschlagen.');
    toast.success('Kunden zusammengeführt');
    setMergeFor(null);
    setMergeDrop('');
    load();
  };

  if (loading) return <PageLoading label="Kunden werden geladen" />;

  const kfzDeadline = kfzDue[0]?.deadline;
  const mergeCandidates = mergeFor
    ? customers
        .filter((c) => c.id !== mergeFor.id)
        .sort((a, b) => {
          // ähnliche Nachnamen zuerst
          const s = (c: Customer) => (c.last_name.trim().toLowerCase().slice(0, 3) === mergeFor.last_name.trim().toLowerCase().slice(0, 3) ? 0 : 1);
          return s(a) - s(b) || fullName(a).localeCompare(fullName(b), 'de');
        })
    : [];
  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kunden"
        description="Stammdaten, Verträge und Dokumente je Kunde, fehlende Absicherungen und anstehende Fristen."
        actions={
          <div className="flex items-center gap-2">
            <Segmented
              value={scope}
              onChange={(v) => setScope(v as 'mine' | 'team')}
              options={[
                { value: 'mine', label: 'Meine' },
                { value: 'team', label: 'Ganzes Team' },
              ]}
            />
            <Button icon={Plus} onClick={() => openForm('new')}>Neuer Kunde</Button>
          </div>
        }
      />

      <HeroPanel aria-label="Kunden im Überblick">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="text-sm text-brand-200">Fristen in den nächsten {REMIND_DAYS / 7} Wochen</p>
            <p className="mt-1.5 font-display font-semibold leading-[0.9] tracking-tight">
              <CountUp value={due.length} className={cn('text-7xl sm:text-8xl', due.length > 0 && 'text-amber-300')} />
              <span className="ml-2 text-3xl text-brand-200 sm:text-4xl">{due.length === 1 ? 'Kunde anrufen' : 'Kunden anrufen'}</span>
            </p>
            <p className="mt-4 text-sm text-brand-100">
              {due.length === 0 ? 'Gerade steht keine Frist an.' : 'Leg einen Rückruf an, dann landet er unter Anrufe.'}
            </p>
          </div>
          {kfzDeadline && (
            <div className="rounded-2xl bg-amber-300 px-5 py-4 text-brand-950 shadow-[0_0_40px_rgba(242,165,65,0.45)]">
              <p className="text-xs font-semibold">KFZ-Wechselstichtag {format(kfzDeadline, 'd. MMMM', { locale: de })}</p>
              <p className="mt-1 font-display text-3xl font-semibold leading-none">in {kfzDue[0].daysLeft} {kfzDue[0].daysLeft === 1 ? 'Tag' : 'Tagen'}</p>
              <p className="mt-1 text-xs">{kfzDue.length} {kfzDue.length === 1 ? 'KFZ-Vertrag' : 'KFZ-Verträge'} prüfen</p>
            </div>
          )}
        </div>
        <HeroDivider />
        <dl className="grid grid-cols-2 gap-6 px-6 py-5 sm:grid-cols-4 sm:px-8">
          <HeroStat label="Kunden" value={rows.length} />
          <HeroStat label="Mit Lücken" value={withGaps.length} accent={withGaps.length > 0} hint="fehlt PHV, HR, RS, UNF oder BU" />
          <HeroStat label="Fristen in 60 Tagen" value={deadlines.length} />
          <HeroStat label={`Geburtstage in ${BIRTHDAY_DAYS} Tagen`} value={birthdays.length} accent={birthdays.some((b) => b.birthday!.days === 0)} />
        </dl>
      </HeroPanel>

      <div className={cn('grid gap-6', birthdays.length > 0 && 'lg:grid-cols-[1fr_20rem]')}>
        {/* Fristen */}
        <section aria-labelledby="deadlines-title" className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-gray-700 sm:px-6">
            <h2 id="deadlines-title" className="flex items-center gap-2 font-display text-lg font-semibold text-gray-900 dark:text-white">
              <BellRing className="h-4 w-4 text-gray-400" /> Anstehende Fristen
              <span className="tabular rounded-full bg-gray-100 px-2 py-0.5 font-sans text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">{deadlines.length}</span>
            </h2>
            <Link to="/calls?tab=tasks" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">Rückrufe</Link>
          </div>
          {deadlines.length === 0 ? (
            <p className="px-6 py-6 text-sm text-gray-500">In den nächsten 60 Tagen läuft keine Frist ab. KFZ-Verträge melden sich vor dem 30.11., andere Sachverträge 3 Monate vor ihrem Jahrestag.</p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
              {deadlines.map((d) => (
                <li key={d.key} className="group relative flex flex-col gap-3 py-3.5 pl-6 pr-5 sm:flex-row sm:items-center sm:pr-6">
                  <span aria-hidden className="absolute inset-y-2.5 left-0 w-1 rounded-r" style={{ background: d.due ? '#F2A541' : '#9AA39C' }} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold text-gray-900 dark:text-white">{entryName(d.entry)}</span>
                      <Tag color={CATEGORY_COLORS[d.entry.category] || '#9AA39C'}>{product(d.entry)}</Tag>
                      {d.due && <StatusPill tone={d.daysLeft <= 7 ? 'red' : 'amber'} pulse={d.daysLeft <= 7}>{d.daysLeft === 0 ? 'heute' : `noch ${d.daysLeft} ${d.daysLeft === 1 ? 'Tag' : 'Tage'}`}</StatusPill>}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">
                      {d.kind === 'kfz'
                        ? `Wechselstichtag ${format(d.deadline, 'dd.MM.yyyy')}, Hauptfälligkeit ${format(d.renewal, 'dd.MM.yyyy')}`
                        : `Kündigungsfrist ${format(d.deadline, 'dd.MM.yyyy')}, Ablauf ${format(d.renewal, 'dd.MM.yyyy')}`}
                      {d.entry.policy_number && <span className="ml-2 font-mono">{d.entry.policy_number}</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 self-end sm:self-auto">
                    <Button size="sm" icon={Phone} loading={busy === d.key} onClick={() => createDeadlineCallback(d)}>Rückruf anlegen</Button>
                    <button type="button" onClick={() => dismiss(d)} disabled={busy === d.key} className="btn-icon p-1.5" title="Ausblenden" aria-label="Frist ausblenden">
                      <EyeOff className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Geburtstage */}
        {birthdays.length > 0 && (
          <section aria-labelledby="birthdays-title" className="card self-start overflow-hidden">
            <h2 id="birthdays-title" className="flex items-center gap-2 border-b border-gray-100 px-5 py-4 font-display text-lg font-semibold text-gray-900 dark:border-gray-700 dark:text-white">
              <Cake className="h-4 w-4 text-amber-500" /> Geburtstage
            </h2>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
              {birthdays.map((r) => (
                <li key={r.customer.id}>
                  <button type="button" onClick={() => setOpen(r.customer.id)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-brand-50/40 dark:hover:bg-white/[0.03]">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">{r.name}</span>
                      <span className="block text-xs text-gray-500">wird {r.birthday!.age}, {format(r.birthday!.date, 'EEEE, d. MMM', { locale: de })}</span>
                    </span>
                    {r.birthday!.days === 0 ? <StatusPill tone="amber" pulse>heute</StatusPill> : <span className="tabular shrink-0 text-xs font-medium text-gray-500">in {r.birthday!.days} {r.birthday!.days === 1 ? 'Tag' : 'Tagen'}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {/* Kunden */}
      <section aria-labelledby="customers-title" className="card overflow-clip">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 dark:border-gray-700 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <h2 id="customers-title" className="font-display text-lg font-semibold text-gray-900 dark:text-white">
            Kundenakte <span className="tabular ml-1 font-sans text-sm font-normal text-gray-400">{visible.length}</span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-pressed={onlyGaps}
              onClick={() => setOnlyGaps((v) => !v)}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors',
                onlyGaps ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200' : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700/50',
              )}
            >
              Nur mit Lücken
            </button>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="search" placeholder="Name, Telefon, Schein-Nr." aria-label="Kunden durchsuchen" value={query} onChange={(e) => setQuery(e.target.value)} className="input pl-9" />
            </div>
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            icon={Users}
            title={rows.length ? 'Kein Kunde in dieser Auswahl' : 'Noch keine Kunden'}
            description={rows.length ? 'Ändere Suche oder Filter.' : 'Kunden entstehen automatisch aus den Verträgen in der Produktion, oder du legst sie hier an.'}
          />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
            {visible.map((r) => {
              const c = r.customer;
              const isOpen = open === c.id;
              const household = isOpen ? householdOf(c) : [];
              return (
                <li key={c.id} id={`customer-${c.id}`} className="scroll-mt-20">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : c.id)}
                    aria-expanded={isOpen}
                    className="flex w-full flex-col gap-2 px-4 py-3.5 text-left transition-colors hover:bg-brand-50/40 dark:hover:bg-white/[0.03] sm:flex-row sm:items-center sm:gap-4 sm:px-6"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-[15px] font-semibold text-gray-900 dark:text-white">{r.name}</span>
                        {r.birthday && r.birthday.days <= BIRTHDAY_DAYS && <Cake className="h-3.5 w-3.5 text-amber-500" aria-label="Geburtstag bald" />}
                        {r.callbacks.length > 0 && <StatusPill tone="sky">{r.callbacks.length} Rückruf{r.callbacks.length > 1 ? 'e' : ''}</StatusPill>}
                        {r.cancelled > 0 && <span className="text-2xs text-gray-400">{r.cancelled} storniert</span>}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.active.map((e) => (
                          <Tag key={e.id} color={CATEGORY_COLORS[e.category] || '#9AA39C'}>{product(e)}</Tag>
                        ))}
                        {r.entries.length === 0 && <span className="text-xs text-gray-400">noch kein Vertrag</span>}
                        {r.gaps.length > 0 && (
                          <span className="inline-flex items-center rounded-md border border-dashed border-amber-400 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-600 dark:text-amber-300">
                            fehlt: {r.gaps.join(', ')}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-5 text-right">
                      <span>
                        <span className="tabular block font-display text-base font-semibold text-gray-900 dark:text-white">{eur0.format(r.commission)}</span>
                        <span className="tabular block text-xs text-brand-700 dark:text-brand-300">{nf0.format(r.lv)} LW</span>
                      </span>
                      <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform', isOpen && 'rotate-180')} />
                    </span>
                  </button>

                  {isOpen && (
                    <div className="animate-fade-in space-y-4 border-t border-gray-100 bg-gray-50/60 px-4 py-4 dark:border-gray-700 dark:bg-gray-900/30 sm:px-6">
                      {/* Stammdaten */}
                      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                          <div className="flex items-center gap-2">
                            <Cake className="h-4 w-4 shrink-0 text-gray-400" />
                            <dt className="sr-only">Geburtstag</dt>
                            <dd className="text-gray-700 dark:text-gray-200">{c.birth_date ? `${format(day(c.birth_date), 'dd.MM.yyyy')} (${differenceInYears(new Date(), day(c.birth_date))} Jahre)` : <span className="text-gray-400">kein Geburtstag</span>}</dd>
                          </div>
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 shrink-0 text-gray-400" />
                            <dt className="sr-only">Telefon</dt>
                            <dd>{c.phone ? <a href={`tel:${c.phone.replace(/\s/g, '')}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{c.phone}</a> : <span className="text-gray-400">keine Nummer</span>}</dd>
                          </div>
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 shrink-0 text-gray-400" />
                            <dt className="sr-only">E-Mail</dt>
                            <dd className="min-w-0 truncate">{c.email ? <a href={`mailto:${c.email}`} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{c.email}</a> : <span className="text-gray-400">keine E-Mail</span>}</dd>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 shrink-0 text-gray-400" />
                            <dt className="sr-only">Adresse</dt>
                            <dd className="text-gray-700 dark:text-gray-200">{c.address || <span className="text-gray-400">keine Adresse</span>}</dd>
                          </div>
                          {c.household && (
                            <div className="flex items-start gap-2 sm:col-span-2">
                              <Users className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                              <dt className="sr-only">Haushalt</dt>
                              <dd className="text-gray-700 dark:text-gray-200">
                                Haushalt {c.household}
                                {household.length > 0 && (
                                  <span className="text-gray-500">
                                    {' · '}
                                    {household.map((h, i) => (
                                      <span key={h.id}>
                                        {i > 0 && ', '}
                                        <button type="button" onClick={() => setOpen(h.id)} className="font-medium text-brand-700 hover:underline dark:text-brand-300">{fullName(h)}</button>
                                      </span>
                                    ))}
                                  </span>
                                )}
                              </dd>
                            </div>
                          )}
                          {c.notes && <p className="whitespace-pre-line text-gray-600 dark:text-gray-300 sm:col-span-2">{c.notes}</p>}
                        </dl>
                        <div className="flex flex-wrap gap-1.5">
                          {(isAdmin || c.created_by === user?.id || r.entries.some(mineEntry)) && (
                            <Button size="sm" variant="secondary" icon={Pencil} onClick={() => openForm(c)}>Bearbeiten</Button>
                          )}
                          <Button size="sm" variant="secondary" icon={Phone} onClick={() => { setCallbackFor(c); setCallbackTopic(''); }}>Rückruf</Button>
                          {isAdmin && <Button size="sm" variant="ghost" icon={GitMerge} onClick={() => { setMergeFor(c); setMergeDrop(''); }}>Zusammenführen</Button>}
                        </div>
                      </div>

                      {/* Offene Rückrufe */}
                      {r.callbacks.length > 0 && (
                        <div className="rounded-lg border border-sky-200 bg-sky-50/60 px-3 py-2 text-sm dark:border-sky-800 dark:bg-sky-900/20">
                          <p className="text-xs font-semibold text-sky-800 dark:text-sky-200">Offene Rückrufe</p>
                          <ul className="mt-1 space-y-0.5">
                            {r.callbacks.map((cb) => (
                              <li key={cb.id} className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
                                {cb.priority === 'high' && <StatusPill tone="red">dringend</StatusPill>}
                                {cb.topic || 'Rückruf'}
                                <span className="text-xs text-gray-500">seit {format(new Date(cb.created_at), 'dd.MM.')}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Verträge */}
                      {r.entries.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-gray-500 [&>th]:pb-2 [&>th]:font-medium">
                                <th>Vertrag</th>
                                <th>Schein-Nr.</th>
                                <th>Beginn</th>
                                <th>Status</th>
                                <th className="text-right">Provision</th>
                                <th className="w-10"><span className="sr-only">Dokumente</span></th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.entries.map((e) => (
                                <Fragment key={e.id}>
                                  <tr className={cn('[&>td]:py-1.5', e.status === 'cancelled' && 'opacity-60')}>
                                    <td><Tag color={CATEGORY_COLORS[e.category] || '#9AA39C'}>{product(e)}</Tag></td>
                                    <td className="font-mono text-xs text-gray-600 dark:text-gray-300">{e.policy_number || '–'}</td>
                                    <td className="text-gray-600 dark:text-gray-300">{e.start_date ? format(day(e.start_date), 'dd.MM.yy') : '–'}</td>
                                    <td>
                                      <StatusPill tone={e.status === 'policed' ? 'emerald' : e.status === 'cancelled' ? 'red' : 'sky'}>
                                        {e.status === 'policed' ? 'Policiert' : e.status === 'cancelled' ? `Storniert${e.cancelled_at ? ` ${format(day(e.cancelled_at), 'dd.MM.yy')}` : ''}` : 'Eingereicht'}
                                      </StatusPill>
                                    </td>
                                    <td className="tabular text-right font-medium text-gray-900 dark:text-white">{eur0.format(Number(e.commission_amount || 0))}</td>
                                    <td className="text-right">
                                      <button
                                        type="button"
                                        onClick={() => setOpenDocs(openDocs === e.id ? null : e.id)}
                                        aria-expanded={openDocs === e.id}
                                        className={cn('btn-icon p-1.5', openDocs === e.id && 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300')}
                                        title="Dokumente"
                                        aria-label="Dokumente"
                                      >
                                        <FileText className="h-4 w-4" />
                                      </button>
                                    </td>
                                  </tr>
                                  {openDocs === e.id && (
                                    <tr>
                                      <td colSpan={6} className="pb-3 pt-1">
                                        <ContractDocuments entryId={e.id} />
                                      </td>
                                    </tr>
                                  )}
                                </Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Kunde anlegen / bearbeiten */}
      <Modal isOpen={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Neuer Kunde' : 'Kunde bearbeiten'} size="lg">
        <form onSubmit={saveForm} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nachname" htmlFor="cf-last"><input id="cf-last" required value={form.last_name} onChange={set('last_name')} className="input" /></Field>
            <Field label="Vorname" htmlFor="cf-first"><input id="cf-first" value={form.first_name} onChange={set('first_name')} className="input" /></Field>
            <Field label="Geburtstag" htmlFor="cf-birth"><input id="cf-birth" type="date" value={form.birth_date} onChange={set('birth_date')} className="input" /></Field>
            <Field label="Telefon" htmlFor="cf-phone"><input id="cf-phone" type="tel" value={form.phone} onChange={set('phone')} className="input" /></Field>
            <Field label="E-Mail" htmlFor="cf-mail"><input id="cf-mail" type="email" value={form.email} onChange={set('email')} className="input" /></Field>
            <Field label="Haushalt" htmlFor="cf-house" hint="Gleicher Name verbindet Familienmitglieder, z. B. Familie Müller"><input id="cf-house" value={form.household} onChange={set('household')} className="input" list="cf-households" /></Field>
            <datalist id="cf-households">
              {Array.from(new Set(customers.map((c) => c.household).filter(Boolean))).map((h) => <option key={h!} value={h!} />)}
            </datalist>
            <Field label="Adresse" htmlFor="cf-addr" className="sm:col-span-2"><input id="cf-addr" value={form.address} onChange={set('address')} className="input" placeholder="Straße, PLZ Ort" /></Field>
            <Field label="Notizen" htmlFor="cf-notes" className="sm:col-span-2"><textarea id="cf-notes" rows={3} value={form.notes} onChange={set('notes')} className="input resize-none" /></Field>
          </div>
          {editing !== 'new' && editing && form.last_name.trim() !== editing.last_name && (
            <p className="text-xs text-gray-500">Der neue Name wird auch in allen Verträgen dieses Kunden übernommen.</p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Abbrechen</Button>
            <Button type="submit" loading={saving}>{editing === 'new' ? 'Anlegen' : 'Speichern'}</Button>
          </div>
        </form>
      </Modal>

      {/* Rückruf */}
      <Modal isOpen={!!callbackFor} onClose={() => setCallbackFor(null)} title="Rückruf anlegen" description={callbackFor ? fullName(callbackFor) : undefined} size="sm">
        <div className="space-y-4">
          <Field label="Worum geht es?" htmlFor="cb-topic">
            <input id="cb-topic" autoFocus value={callbackTopic} onChange={(e) => setCallbackTopic(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && createCallback()} className="input" placeholder="z. B. Angebot BU besprechen" />
          </Field>
          {!callbackFor?.phone && <p className="text-xs text-amber-700 dark:text-amber-300">Für diesen Kunden ist keine Telefonnummer hinterlegt.</p>}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCallbackFor(null)}>Abbrechen</Button>
            <Button icon={Phone} loading={busy === callbackFor?.id} onClick={createCallback}>Anlegen</Button>
          </div>
        </div>
      </Modal>

      {/* Zusammenführen */}
      <Modal isOpen={!!mergeFor} onClose={() => setMergeFor(null)} title="Kunden zusammenführen" description={mergeFor ? `${fullName(mergeFor)} bleibt bestehen.` : undefined}>
        <div className="space-y-4">
          <Field label="Doppelten Eintrag wählen" htmlFor="mg-drop" hint="Verträge, Rückrufe und fehlende Stammdaten wandern zu diesem Kunden, der doppelte Eintrag wird gelöscht.">
            <select id="mg-drop" value={mergeDrop} onChange={(e) => setMergeDrop(e.target.value)} className="input">
              <option value="">Bitte wählen</option>
              {mergeCandidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {fullName(c)}
                  {c.birth_date ? ` (${format(day(c.birth_date), 'dd.MM.yyyy')})` : ''} · {entries.filter((e) => e.customer_id === c.id).length} Verträge
                </option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMergeFor(null)}>Abbrechen</Button>
            <Button icon={GitMerge} disabled={!mergeDrop} loading={busy === 'merge'} onClick={merge}>Zusammenführen</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
