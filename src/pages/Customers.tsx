import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { BellRing, Building2, Cake, ChevronDown, EyeOff, FileSpreadsheet, Phone, Plus, Search, SlidersHorizontal, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Button, EmptyState, PageHeader, PageLoading, Segmented } from '@/components/ui';
import { CountUp, HeroDivider, HeroPanel, HeroStat, StatusPill, Tag } from '@/components/ui/hero';
import { CATEGORY_COLORS } from '@/lib/chartTheme';
import { deadlineTopic, upcomingDeadlines, REMIND_DAYS, type Deadline } from '@/lib/followups';
import { productByName, useProducts } from '@/lib/products';
import { GapRulesEditor } from '@/components/GapRulesEditor';
import { customerGaps, type GapRule } from '@/lib/gaps';
import { CustomerFormModal } from '@/components/customers/CustomerFormModal';
import { ExistingContractModal } from '@/components/customers/ExistingContractModal';
import { CallbackModal } from '@/components/customers/CallbackModal';
import { MergeModal } from '@/components/customers/MergeModal';
import { CustomerDetail } from '@/components/customers/CustomerDetail';
import { GapOverview } from '@/components/customers/GapOverview';
import { CustomerImportModal } from '@/components/customers/CustomerImportModal';
import {
  BIRTHDAY_DAYS,
  entryName,
  eur0,
  fullName,
  hasLifestyle,
  nextBirthday,
  nf0,
  product,
  type Customer,
  type CustomerRow,
  type DeadlineEntry,
  type Entry,
  type Existing,
  type Followup,
  type OpenCallback,
} from '@/components/customers/shared';
import { cn } from '@/utils/cn';

export type { Customer } from '@/components/customers/shared';

export const Customers = () => {
  const { user, profile } = useStore();
  const isAdmin = profile?.roles?.includes('admin');
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [callbacks, setCallbacks] = useState<OpenCallback[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [teamScope, setScope] = useState<'mine' | 'team'>('mine');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [view, setView] = useState<'akte' | 'gaps'>('akte');
  // Fristenliste standardmäßig eingeklappt, Zustand merkt sich der Browser
  const [deadlinesOpen, setDeadlinesOpen] = useState(() => {
    try {
      return localStorage.getItem('customers.deadlinesOpen') === '1';
    } catch {
      return false;
    }
  });
  const toggleDeadlines = () =>
    setDeadlinesOpen((o) => {
      try {
        localStorage.setItem('customers.deadlinesOpen', o ? '0' : '1');
      } catch {
        /* ohne Speicher einfach nicht merken */
      }
      return !o;
    });
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | 'new' | null>(null);
  const [callbackFor, setCallbackFor] = useState<{ customers: Customer[]; topic: string } | null>(null);
  const [mergeFor, setMergeFor] = useState<Customer | null>(null);
  const [existing, setExisting] = useState<Existing[]>([]);
  const [existingFor, setExistingFor] = useState<{ customer: Customer; contract: Existing | null } | null>(null);
  const [rules, setRules] = useState<GapRule[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [people, setPeople] = useState<{ id: string; full_name: string; boss_id?: string | null; is_vocational_student?: boolean | null }[]>([]);
  const { products } = useProducts();

  const load = useCallback(async () => {
    const [{ data: c, error }, { data: e }, { data: cb }, { data: f }, { data: x }] = await Promise.all([
      supabase.from('customers').select('*').order('last_name'),
      supabase
        .from('production_entries')
        .select('id, user_id, managed_by, customer_id, status, category, sub_category, start_date, submission_date, customer_name, customer_firstname, policy_number, commission_amount, life_values, cancelled_at, cancel_reason')
        .order('submission_date', { ascending: false }),
      supabase.from('callbacks').select('id, customer_id, topic, priority, status, created_at').not('customer_id', 'is', null).neq('status', 'done'),
      supabase.from('contract_followups').select('entry_id, due_date, state'),
      supabase.from('customer_contracts').select('*').order('created_at'),
    ]);
    const [{ data: gr }, { data: pp }] = await Promise.all([
      supabase.from('gap_rules').select('*').order('sort'),
      supabase.from('profiles').select('id, full_name, boss_id, is_vocational_student'),
    ]);
    setRules((gr as GapRule[]) || []);
    setPeople((pp as typeof people) || []);
    setExisting((x as Existing[]) || []);
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
    if (isAdmin) setScope('team');
    setOpen(id);
    setSearchParams({}, { replace: true });
    setTimeout(() => document.getElementById(`customer-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }, [searchParams, loading, setSearchParams, isAdmin]);

  // Eigene Kunden: meine, als Azubi die des Chefs, als Chef die meiner Azubis (wie my_circle in der Datenbank)
  const names = useMemo(() => new Map(people.map((p) => [p.id, p.full_name])), [people]);
  const boss = profile?.is_vocational_student ? profile.boss_id || null : null;
  const circle = useMemo(
    () => new Set([user?.id, boss, ...people.filter((p) => p.is_vocational_student && p.boss_id === user?.id).map((p) => p.id)].filter((id): id is string => !!id)),
    [user?.id, boss, people],
  );
  const mineEntry = useCallback((e: Entry) => circle.has(e.user_id) || (!!e.managed_by && circle.has(e.managed_by)), [circle]);
  // Nur Admins sehen den ganzen Bestand
  const scope = isAdmin ? teamScope : 'mine';
  const scopedEntries = useMemo(() => (scope === 'mine' ? entries.filter(mineEntry) : entries), [entries, scope, mineEntry]);

  // Kunden mit ihren Verträgen und Lücken
  const rows = useMemo<CustomerRow[]>(() => {
    const byCustomer = new Map<string, Entry[]>();
    entries.forEach((e) => {
      if (!e.customer_id) return;
      if (!byCustomer.has(e.customer_id)) byCustomer.set(e.customer_id, []);
      byCustomer.get(e.customer_id)!.push(e);
    });
    const existingBy = new Map<string, Existing[]>();
    existing.forEach((x) => existingBy.set(x.customer_id, [...(existingBy.get(x.customer_id) || []), x]));
    const mineId = (id: string | null) => !!id && circle.has(id);
    return customers
      .map((c) => {
        const all = byCustomer.get(c.id) || [];
        const active = all.filter((e) => e.status !== 'cancelled');
        const prior = existingBy.get(c.id) || [];
        // Lücken nach Lebenslage: Gruppen, die ein aktiver Vertrag abdeckt
        // Betreuer: wer die meisten aktiven Verträge hält, sonst wer den Kunden angelegt hat
        const counts = new Map<string, number>();
        active.forEach((e) => {
          const who = e.managed_by || e.user_id;
          counts.set(who, (counts.get(who) || 0) + 1);
        });
        const owner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || c.created_by || prior[0]?.created_by || null;
        const covered = new Set([...active.map(product), ...prior.map((x) => x.sub_category)].map((n) => productByName(n)?.gap_group).filter((g): g is string => !!g));
        return {
          customer: c,
          name: fullName(c),
          entries: all,
          active,
          existing: prior,
          mine: all.some(mineEntry) || (all.length === 0 && (mineId(c.created_by) || prior.some((x) => mineId(x.created_by)))),
          owner,
          cancelled: all.length - active.length,
          gaps: active.length || prior.length || hasLifestyle(c) ? customerGaps(rules, c, covered) : [],
          lv: active.reduce((a, e) => a + Number(e.life_values || 0), 0),
          commission: active.reduce((a, e) => a + Number(e.commission_amount || 0), 0),
          birthday: c.birth_date ? nextBirthday(c.birth_date) : null,
          callbacks: callbacks.filter((cb) => cb.customer_id === c.id),
        };
      })
      .filter((r) => scope === 'team' || r.mine)
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
    // products: productByName liest den geladenen Katalog
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customers, entries, existing, callbacks, scope, mineEntry, circle, rules, products]);

  // Bestandsverträge der angezeigten Kunden bekommen ebenfalls Fristen
  const existingAsEntries = useMemo<DeadlineEntry[]>(
    () =>
      rows.flatMap((r) =>
        r.existing.map((x) => ({
          id: x.id,
          user_id: x.created_by,
          managed_by: null,
          customer_id: x.customer_id,
          status: 'policed' as const,
          category: x.category,
          sub_category: x.sub_category,
          start_date: x.start_date,
          end_date: x.end_date,
          main_due: x.main_due,
          submission_date: x.start_date || '',
          customer_name: r.customer.last_name,
          customer_firstname: r.customer.first_name,
          policy_number: x.policy_number,
          commission_amount: null,
          life_values: null,
          cancelled_at: null,
          cancel_reason: null,
          existing: x,
        })),
      ),
    [rows],
  );

  const handled = useMemo(() => new Set(followups.map((f) => `${f.entry_id}|${f.due_date}`)), [followups]);
  const deadlines = useMemo(
    () =>
      upcomingDeadlines<DeadlineEntry>([...scopedEntries, ...existingAsEntries]).filter((d) => {
        const x = d.entry.existing;
        if (x) return !(x.handled_until && x.handled_until >= format(d.deadline, 'yyyy-MM-dd'));
        return !handled.has(d.key);
      }),
    [scopedEntries, existingAsEntries, handled],
  );
  const due = deadlines.filter((d) => d.due);
  const kfzDue = deadlines.filter((d) => d.kind === 'kfz');
  const withGaps = rows.filter((r) => r.gaps.length > 0);
  const birthdays = rows.filter((r) => r.birthday && r.birthday.days <= BIRTHDAY_DAYS).sort((a, b) => a.birthday!.days - b.birthday!.days);

  const q = query.trim().toLowerCase();
  const visible = rows.filter((r) => {
    if (!q) return true;
    const c = r.customer;
    return (
      r.name.toLowerCase().includes(q) ||
      [c.phone, c.email, c.household, c.address, c.contact_person, c.industry].some((v) => v?.toLowerCase().includes(q)) ||
      [...r.entries, ...r.existing].some((e) => e.policy_number?.toLowerCase().includes(q)) ||
      r.existing.some((x) => x.insurer?.toLowerCase().includes(q))
    );
  });

  const householdOf = (c: Customer) =>
    c.household ? customers.filter((x) => x.id !== c.id && x.household?.trim().toLowerCase() === c.household!.trim().toLowerCase()) : [];

  /* ---------------- Aktionen ---------------- */

  /** Frist als erledigt merken: Produktion über contract_followups, Bestand direkt am Vertrag */
  const markHandled = (d: Deadline<DeadlineEntry>, state: 'callback' | 'dismissed', callbackId?: string) => {
    const due = format(d.deadline, 'yyyy-MM-dd');
    return d.entry.existing
      ? supabase.from('customer_contracts').update({ handled_until: due }).eq('id', d.entry.existing.id)
      : supabase.from('contract_followups').insert({ entry_id: d.entry.id, due_date: due, state, callback_id: callbackId });
  };

  const createDeadlineCallback = async (d: Deadline<DeadlineEntry>) => {
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
    if (!error) await markHandled(d, 'callback', cb?.id);
    setBusy(null);
    if (error) toast.error('Rückruf konnte nicht angelegt werden.');
    else {
      toast.success('Rückruf angelegt');
      load();
    }
  };

  const dismiss = async (d: Deadline<DeadlineEntry>) => {
    setBusy(d.key);
    const { error } = await markHandled(d, 'dismissed');
    setBusy(null);
    if (error) toast.error('Konnte nicht ausgeblendet werden.');
    else load();
  };

  /** Darf ich den Kunden bearbeiten? Gleiche Regel wie can_edit_customer in der Datenbank */
  const canEditCustomer = useCallback(
    (id: string) => {
      if (isAdmin) return true;
      const c = customers.find((x) => x.id === id);
      const mineId = (x: string | null | undefined) => !!x && circle.has(x);
      return !!c && (mineId(c.created_by) || entries.some((e) => e.customer_id === id && mineEntry(e)) || existing.some((x) => x.customer_id === id && mineId(x.created_by)));
    },
    [isAdmin, customers, entries, existing, circle, mineEntry],
  );

  const openCustomer = (id: string) => {
    setView('akte');
    setOpen(id);
    setTimeout(() => document.getElementById(`customer-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  if (loading) return <PageLoading label="Kunden werden geladen" />;

  const kfzDeadline = kfzDue[0]?.deadline;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kunden"
        description="Stammdaten, Verträge und Dokumente je Kunde, fehlende Absicherungen und anstehende Fristen."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <Segmented
                value={scope}
                onChange={(v) => setScope(v as 'mine' | 'team')}
                options={[
                  { value: 'mine', label: 'Meine' },
                  { value: 'team', label: 'Ganzes Team' },
                ]}
              />
            )}
            {isAdmin && <Button variant="secondary" icon={SlidersHorizontal} onClick={() => setRulesOpen(true)}>Lückenregeln</Button>}
            <Button variant="secondary" icon={FileSpreadsheet} onClick={() => setImportOpen(true)}>Import</Button>
            <Button icon={Plus} onClick={() => setEditing('new')}>Neuer Kunde</Button>
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
          <button type="button" onClick={() => setView('gaps')} className="text-left">
            <HeroStat label="Mit Lücken" value={withGaps.length} accent={withGaps.length > 0} hint="Liste öffnen" />
          </button>
          <HeroStat label="Fristen in 60 Tagen" value={deadlines.length} />
          <HeroStat label={`Geburtstage in ${BIRTHDAY_DAYS} Tagen`} value={birthdays.length} accent={birthdays.some((b) => b.birthday!.days === 0)} />
        </dl>
      </HeroPanel>

      <div className={cn('grid gap-6', birthdays.length > 0 && 'lg:grid-cols-[1fr_20rem]')}>
        {/* Fristen */}
        <section aria-labelledby="deadlines-title" className="card overflow-hidden">
          <div className={cn('flex items-center justify-between gap-3 px-5 py-4 sm:px-6', deadlinesOpen && 'border-b border-gray-100 dark:border-gray-700')}>
            <h2 id="deadlines-title" className="min-w-0 flex-1">
              <button type="button" onClick={toggleDeadlines} aria-expanded={deadlinesOpen} aria-controls="deadlines-list" className="flex w-full items-center gap-2 text-left font-display text-lg font-semibold text-gray-900 dark:text-white">
                <BellRing className="h-4 w-4 text-gray-400" /> Anstehende Fristen
                <span className="tabular rounded-full bg-gray-100 px-2 py-0.5 font-sans text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">{deadlines.length}</span>
                <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform', deadlinesOpen && 'rotate-180')} aria-hidden />
              </button>
            </h2>
            <Link to="/calls?tab=tasks" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">Rückrufe</Link>
          </div>
          {!deadlinesOpen ? null : deadlines.length === 0 ? (
            <p className="px-6 py-6 text-sm text-gray-500">In den nächsten 60 Tagen läuft keine Frist ab. KFZ-Verträge melden sich vor dem 30.11., andere Sachverträge 3 Monate vor ihrem Jahrestag.</p>
          ) : (
            <ul id="deadlines-list" className="divide-y divide-gray-100 dark:divide-gray-700/70">
              {deadlines.map((d) => (
                <li key={d.key} className="group relative flex flex-col gap-3 py-3.5 pl-6 pr-5 sm:flex-row sm:items-center sm:pr-6">
                  <span aria-hidden className="absolute inset-y-2.5 left-0 w-1 rounded-r" style={{ background: d.due ? '#F2A541' : '#9AA39C' }} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-semibold text-gray-900 dark:text-white">{entryName(d.entry)}</span>
                      <Tag color={CATEGORY_COLORS[d.entry.category] || '#9AA39C'}>{product(d.entry)}</Tag>
                      {d.entry.existing && <span className="text-2xs text-gray-500">Bestand{d.entry.existing.insurer ? `, ${d.entry.existing.insurer}` : ''}</span>}
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
                  <button type="button" onClick={() => openCustomer(r.customer.id)} className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left hover:bg-brand-50/40 dark:hover:bg-white/[0.03]">
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
          <div className="flex items-center gap-3">
            <h2 id="customers-title" className="sr-only">Kundenakte</h2>
            <Segmented
              value={view}
              onChange={(v) => setView(v as 'akte' | 'gaps')}
              options={[
                { value: 'akte', label: `Kundenakte · ${visible.length}` },
                { value: 'gaps', label: `Lücken · ${withGaps.length}` },
              ]}
            />
          </div>
          {view === 'akte' && (
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="search" placeholder="Name, Telefon, Schein-Nr." aria-label="Kunden durchsuchen" value={query} onChange={(e) => setQuery(e.target.value)} className="input pl-9" />
            </div>
          )}
        </div>

        {view === 'gaps' ? (
          <GapOverview rows={rows} people={people} onOpen={openCustomer} onCallbacks={(list, topic) => setCallbackFor({ customers: list, topic })} />
        ) : visible.length === 0 ? (
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
                        {c.customer_type === 'company' && <Building2 className="h-3.5 w-3.5 text-gray-400" aria-label="Firma" />}
                        {r.birthday && r.birthday.days <= BIRTHDAY_DAYS && <Cake className="h-3.5 w-3.5 text-amber-500" aria-label="Geburtstag bald" />}
                        {r.callbacks.length > 0 && <StatusPill tone="sky">{r.callbacks.length} Rückruf{r.callbacks.length > 1 ? 'e' : ''}</StatusPill>}
                        {r.cancelled > 0 && <span className="text-2xs text-gray-400">{r.cancelled} storniert</span>}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {r.active.map((e) => (
                          <Tag key={e.id} color={CATEGORY_COLORS[e.category] || '#9AA39C'}>{product(e)}</Tag>
                        ))}
                        {r.existing.map((x) => (
                          <Tag key={x.id} color={CATEGORY_COLORS[x.category] || '#9AA39C'} className="!bg-transparent ring-1 ring-inset ring-gray-300 dark:ring-gray-600">{x.sub_category}</Tag>
                        ))}
                        {r.entries.length === 0 && r.existing.length === 0 && <span className="text-xs text-gray-400">noch kein Vertrag</span>}
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
                    <CustomerDetail
                      row={r}
                      household={household}
                      canEdit={canEditCustomer(c.id)}
                      isAdmin={!!isAdmin}
                      names={names}
                      onOpen={openCustomer}
                      onEdit={setEditing}
                      onExisting={(customer, contract) => setExistingFor({ customer, contract })}
                      onCallback={(customer) => setCallbackFor({ customers: [customer], topic: '' })}
                      onMerge={setMergeFor}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <CustomerFormModal
        editing={editing}
        households={Array.from(new Set(customers.map((c) => c.household).filter((h): h is string => !!h)))}
        userId={user?.id}
        onClose={() => setEditing(null)}
        onSaved={(id) => {
          setEditing(null);
          if (id) setOpen(id);
          load();
        }}
      />
      <ExistingContractModal
        target={existingFor}
        insurers={Array.from(new Set(existing.map((x) => x.insurer).filter((i): i is string => !!i)))}
        userId={user?.id}
        onClose={() => setExistingFor(null)}
        onSaved={() => {
          setExistingFor(null);
          load();
        }}
      />
      <CallbackModal
        customers={callbackFor?.customers || null}
        defaultTopic={callbackFor?.topic}
        userId={user?.id}
        onClose={() => setCallbackFor(null)}
        onSaved={() => {
          setCallbackFor(null);
          load();
        }}
      />
      {isAdmin && <GapRulesEditor isOpen={rulesOpen} onClose={() => setRulesOpen(false)} rules={rules} onChanged={load} />}
      {isAdmin && (
        <MergeModal
          keep={mergeFor}
          customers={customers}
          entries={entries}
          onClose={() => setMergeFor(null)}
          onSaved={() => {
            setMergeFor(null);
            load();
          }}
        />
      )}
      <CustomerImportModal
        isOpen={importOpen}
        customers={customers}
        existing={existing}
        userId={user?.id}
        canEdit={canEditCustomer}
        onClose={() => setImportOpen(false)}
        onDone={load}
      />
    </div>
  );
};
