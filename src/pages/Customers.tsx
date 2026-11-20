import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { BellRing, ChevronDown, EyeOff, Phone, Search, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Button, EmptyState, PageHeader, PageLoading, Segmented } from '@/components/ui';
import { CountUp, HeroDivider, HeroPanel, HeroStat, StatusPill, Tag } from '@/components/ui/hero';
import { CATEGORY_COLORS } from '@/lib/chartTheme';
import { deadlineTopic, upcomingDeadlines, REMIND_DAYS, type Deadline } from '@/lib/followups';
import { cn } from '@/utils/cn';

type Entry = {
  id: string;
  user_id: string;
  managed_by: string | null;
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

type Followup = { entry_id: string; due_date: string; state: 'callback' | 'dismissed' };

/** Was ein gut versorgter Privatkunde typischerweise hat */
const CORE_PRODUCTS = ['PHV', 'HR', 'Rechtsschutz', 'UNF', 'BU'];

const nf0 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const eur0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const customerKey = (e: Entry) => `${e.customer_name.trim().toLowerCase()}|${(e.customer_firstname || '').trim().toLowerCase()}`;
const customerName = (e: Entry) => `${e.customer_name}${e.customer_firstname ? `, ${e.customer_firstname}` : ''}`;
const product = (e: Entry) => e.sub_category || e.category;

export const Customers = () => {
  const { user } = useStore();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [followups, setFollowups] = useState<Followup[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<'mine' | 'team'>('mine');
  const [query, setQuery] = useState('');
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [{ data: e, error }, { data: f }] = await Promise.all([
      supabase
        .from('production_entries')
        .select('id, user_id, managed_by, status, category, sub_category, start_date, submission_date, customer_name, customer_firstname, policy_number, commission_amount, life_values, cancelled_at, cancel_reason')
        .order('submission_date', { ascending: false }),
      supabase.from('contract_followups').select('entry_id, due_date, state'),
    ]);
    if (error) toast.error('Kunden konnten nicht geladen werden.');
    setEntries((e as Entry[]) || []);
    setFollowups((f as Followup[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const scoped = useMemo(
    () => (scope === 'mine' ? entries.filter((e) => e.user_id === user?.id || e.managed_by === user?.id) : entries),
    [entries, scope, user?.id],
  );

  // Kunden mit ihren Verträgen und Lücken
  const customers = useMemo(() => {
    const map = new Map<string, { key: string; name: string; entries: Entry[] }>();
    scoped.forEach((e) => {
      const k = customerKey(e);
      if (!map.has(k)) map.set(k, { key: k, name: customerName(e), entries: [] });
      map.get(k)!.entries.push(e);
    });
    return [...map.values()]
      .map((c) => {
        const active = c.entries.filter((e) => e.status !== 'cancelled');
        const has = new Set(active.map(product));
        const gaps = active.length ? CORE_PRODUCTS.filter((p) => !has.has(p)) : [];
        return {
          ...c,
          active,
          cancelled: c.entries.length - active.length,
          gaps,
          lv: active.reduce((a, e) => a + Number(e.life_values || 0), 0),
          commission: active.reduce((a, e) => a + Number(e.commission_amount || 0), 0),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, [scoped]);

  const handled = useMemo(() => new Set(followups.map((f) => `${f.entry_id}|${f.due_date}`)), [followups]);
  const deadlines = useMemo(() => upcomingDeadlines(scoped).filter((d) => !handled.has(d.key)), [scoped, handled]);
  const due = deadlines.filter((d) => d.due);
  const kfzDue = deadlines.filter((d) => d.kind === 'kfz');
  const withGaps = customers.filter((c) => c.gaps.length > 0);

  const visible = customers.filter((c) => {
    if (onlyGaps && c.gaps.length === 0) return false;
    const q = query.trim().toLowerCase();
    return !q || c.name.toLowerCase().includes(q) || c.entries.some((e) => e.policy_number?.toLowerCase().includes(q));
  });

  const createCallback = async (d: Deadline<Entry>) => {
    if (!user) return;
    setBusy(d.key);
    const { data: cb, error } = await supabase
      .from('callbacks')
      .insert({
        customer_name: customerName(d.entry),
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

  if (loading) return <PageLoading label="Kunden werden geladen" />;

  const kfzDeadline = kfzDue[0]?.deadline;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kunden"
        description="Alle Verträge je Kunde, fehlende Absicherungen und anstehende Vertragsfristen."
        actions={
          <Segmented
            value={scope}
            onChange={(v) => setScope(v as 'mine' | 'team')}
            options={[
              { value: 'mine', label: 'Meine' },
              { value: 'team', label: 'Ganzes Team' },
            ]}
          />
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
        <dl className="grid grid-cols-3 gap-6 px-6 py-5 sm:px-8">
          <HeroStat label="Kunden" value={customers.length} />
          <HeroStat label="Mit Lücken" value={withGaps.length} accent={withGaps.length > 0} hint="fehlt PHV, HR, RS, UNF oder BU" />
          <HeroStat label="Fristen in 60 Tagen" value={deadlines.length} />
        </dl>
      </HeroPanel>

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
                    <span className="text-[15px] font-semibold text-gray-900 dark:text-white">{customerName(d.entry)}</span>
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
                  <Button size="sm" icon={Phone} loading={busy === d.key} onClick={() => createCallback(d)}>Rückruf anlegen</Button>
                  <button type="button" onClick={() => dismiss(d)} disabled={busy === d.key} className="btn-icon p-1.5" title="Ausblenden" aria-label="Frist ausblenden">
                    <EyeOff className="h-4 w-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

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
              <input type="search" placeholder="Name oder Schein-Nr." aria-label="Kunden durchsuchen" value={query} onChange={(e) => setQuery(e.target.value)} className="input pl-9" />
            </div>
          </div>
        </div>

        {visible.length === 0 ? (
          <EmptyState icon={Users} title={customers.length ? 'Kein Kunde in dieser Auswahl' : 'Noch keine Kunden'} description={customers.length ? 'Ändere Suche oder Filter.' : 'Kunden entstehen automatisch aus den Verträgen in der Produktion.'} />
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
            {visible.map((c) => {
              const isOpen = open === c.key;
              return (
                <li key={c.key}>
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : c.key)}
                    aria-expanded={isOpen}
                    className="flex w-full flex-col gap-2 px-4 py-3.5 text-left transition-colors hover:bg-brand-50/40 dark:hover:bg-white/[0.03] sm:flex-row sm:items-center sm:gap-4 sm:px-6"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-semibold text-gray-900 dark:text-white">{c.name}</span>
                        {c.cancelled > 0 && <span className="text-2xs text-gray-400">{c.cancelled} storniert</span>}
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {c.active.map((e) => (
                          <Tag key={e.id} color={CATEGORY_COLORS[e.category] || '#9AA39C'}>{product(e)}</Tag>
                        ))}
                        {c.gaps.length > 0 && (
                          <span className="inline-flex items-center rounded-md border border-dashed border-amber-400 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:border-amber-600 dark:text-amber-300">
                            fehlt: {c.gaps.join(', ')}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-5 text-right">
                      <span>
                        <span className="tabular block font-display text-base font-semibold text-gray-900 dark:text-white">{eur0.format(c.commission)}</span>
                        <span className="tabular block text-xs text-brand-700 dark:text-brand-300">{nf0.format(c.lv)} LW</span>
                      </span>
                      <ChevronDown className={cn('h-4 w-4 text-gray-400 transition-transform', isOpen && 'rotate-180')} />
                    </span>
                  </button>
                  {isOpen && (
                    <div className="animate-fade-in border-t border-gray-100 bg-gray-50/60 px-4 py-3 dark:border-gray-700 dark:bg-gray-900/30 sm:px-6">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-gray-500 [&>th]:pb-2 [&>th]:font-medium">
                            <th>Vertrag</th>
                            <th>Schein-Nr.</th>
                            <th>Beginn</th>
                            <th>Status</th>
                            <th className="text-right">Provision</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.entries.map((e) => (
                            <tr key={e.id} className={cn('[&>td]:py-1.5', e.status === 'cancelled' && 'opacity-60')}>
                              <td><Tag color={CATEGORY_COLORS[e.category] || '#9AA39C'}>{product(e)}</Tag></td>
                              <td className="font-mono text-xs text-gray-600 dark:text-gray-300">{e.policy_number || '–'}</td>
                              <td className="text-gray-600 dark:text-gray-300">{e.start_date ? format(new Date(`${e.start_date}T00:00:00`), 'dd.MM.yy') : '–'}</td>
                              <td>
                                <StatusPill tone={e.status === 'policed' ? 'emerald' : e.status === 'cancelled' ? 'red' : 'sky'}>
                                  {e.status === 'policed' ? 'Policiert' : e.status === 'cancelled' ? `Storniert${e.cancelled_at ? ` ${format(new Date(`${e.cancelled_at}T00:00:00`), 'dd.MM.yy')}` : ''}` : 'Eingereicht'}
                                </StatusPill>
                              </td>
                              <td className="tabular text-right font-medium text-gray-900 dark:text-white">{eur0.format(Number(e.commission_amount || 0))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};
