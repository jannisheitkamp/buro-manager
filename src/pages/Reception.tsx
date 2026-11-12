import { useEffect, useMemo, useState } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths, isBefore, startOfDay } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, AlertTriangle, ArrowLeftRight, Check, X, Pencil, UserCheck, Undo2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { PROFILE_COLUMNS } from '@/lib/profiles';
import { getHolidayName } from '@/utils/dateUtils';
import { DEFAULT_RULES, WEEKDAY_NAMES, dayKey, isOfficeClosed, matchesPerson, useReceptionPlan, type PlanProfile, type ReceptionRule } from '@/lib/reception';
import { Avatar, Badge, Button, Card, Field, IconButton, PageHeader } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { cn } from '@/utils/cn';

type AbsenceRow = { start_date: string; end_date: string; user_id: string };

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const TONES = ['bg-brand-600', 'bg-amber-400', 'bg-sky-500', 'bg-rose-400', 'bg-emerald-500', 'bg-violet-400'];

export const Reception = () => {
  const user = useStore((s) => s.user);
  const isAdmin = useStore((s) => !!s.profile?.roles?.includes('admin'));
  const plan = useReceptionPlan();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selected, setSelected] = useState<Date>(startOfDay(new Date()));
  const [absences, setAbsences] = useState<AbsenceRow[]>([]);
  const [people, setPeople] = useState<PlanProfile[]>([]);

  // Tausch
  const [swapTo, setSwapTo] = useState('');
  const [swapNote, setSwapNote] = useState('');
  const [busy, setBusy] = useState(false);

  // Wochenplan bearbeiten
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState<ReceptionRule[]>(DEFAULT_RULES);

  const gridStart = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });

  useEffect(() => {
    supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .order('full_name')
      .then(({ data }) => setPeople(((data || []) as unknown as (PlanProfile & { is_approved?: boolean })[]).filter((p) => p.is_approved !== false)));
  }, []);

  useEffect(() => {
    let cancelled = false;
    supabase
      .rpc('team_absences')
      .select('start_date, end_date, user_id')
      .in('status', ['pending', 'approved'])
      .gte('end_date', format(gridStart, 'yyyy-MM-dd'))
      .lte('start_date', format(gridEnd, 'yyyy-MM-dd'))
      .then(({ data, error }) => {
        if (!cancelled && !error) setAbsences((data as AbsenceRow[]) || []);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridStart.getTime(), gridEnd.getTime()]);

  const days = useMemo(() => {
    const out: Date[] = [];
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) out.push(d);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridStart.getTime(), gridEnd.getTime()]);

  /* ---------------- Hilfen ---------------- */

  const profileFor = (person: string, userId?: string | null) =>
    (userId && people.find((p) => p.id === userId)) || people.find((p) => matchesPerson(p, person));

  const isAbsentUser = (d: Date, userId?: string) => {
    if (!userId) return false;
    const k = dayKey(d);
    return absences.some((a) => a.user_id === userId && k >= a.start_date && k <= a.end_date);
  };

  const dayInfo = (d: Date) => {
    const a = plan.assigneeFor(d);
    if (!a) return null;
    const profile = profileFor(a.person, a.userId);
    return { ...a, profile, absent: isAbsentUser(d, profile?.id) };
  };

  const allPersons = useMemo(() => Array.from(new Set(plan.rules.flatMap((r) => r.persons))), [plan.rules]);
  const toneFor = (person: string) => TONES[Math.max(0, allPersons.indexOf(person)) % TONES.length];

  const selectedInfo = dayInfo(selected);
  const selectedIsMine = !!selectedInfo && (selectedInfo.userId === user?.id || selectedInfo.profile?.id === user?.id);
  const selectedPast = isBefore(selected, startOfDay(new Date()));

  // Vertretungsvorschläge: wer an dem Tag nicht abwesend ist, Empfangs-Team zuerst
  const suggestions = useMemo(() => {
    if (!selectedInfo) return [];
    return people
      .filter((p) => p.id !== selectedInfo.profile?.id && !isAbsentUser(selected, p.id))
      .sort((a, b) => Number(allPersons.some((n) => matchesPerson(b, n))) - Number(allPersons.some((n) => matchesPerson(a, n))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, selectedInfo?.profile?.id, selected, absences, allPersons]);

  const myPending = plan.swaps.filter((s) => s.status === 'pending' && s.to_user === user?.id);
  const myOutgoing = plan.swaps.filter((s) => s.status === 'pending' && s.from_user === user?.id);
  const pendingForSelected = plan.swaps.find((s) => s.status === 'pending' && s.day === dayKey(selected));
  const nameOf = (id: string) => people.find((p) => p.id === id)?.full_name?.split(' ')[0] || 'Jemand';

  const gaps = days.filter((d) => isSameMonth(d, currentDate) && !isBefore(d, startOfDay(new Date()))).filter((d) => dayInfo(d)?.absent);

  /* ---------------- Aktionen ---------------- */

  const requestSwap = async () => {
    if (!user || !swapTo) return;
    setBusy(true);
    const { error } = await supabase.from('reception_swaps').insert({ day: dayKey(selected), from_user: user.id, to_user: swapTo, note: swapNote.trim() || null });
    setBusy(false);
    // Die Datenbank prüft Zuständigkeit und Datum und liefert eine verständliche Begründung
    if (error) toast.error(error.message || 'Anfrage konnte nicht gesendet werden.');
    else {
      toast.success(`Anfrage an ${nameOf(swapTo)} gesendet`);
      setSwapTo('');
      setSwapNote('');
      plan.reload();
    }
  };

  const answerSwap = async (id: string, accept: boolean) => {
    const { error } = await supabase.rpc('respond_reception_swap', { p_swap_id: id, p_accept: accept });
    if (error) toast.error(error.message);
    else {
      toast.success(accept ? 'Tausch angenommen' : 'Anfrage abgelehnt');
      plan.reload();
    }
  };

  const cancelSwap = async (id: string) => {
    const { error } = await supabase.from('reception_swaps').update({ status: 'cancelled' }).eq('id', id);
    if (error) toast.error('Anfrage konnte nicht zurückgezogen werden.');
    else plan.reload();
  };

  const setSubstitute = async (p: PlanProfile) => {
    const { error } = await supabase.from('reception_overrides').upsert({
      day: dayKey(selected),
      person: p.full_name?.split(' ')[0] || 'Vertretung',
      user_id: p.id,
      note: selectedInfo?.absent ? `Vertretung für ${selectedInfo.person}` : 'Geändert',
      created_by: user?.id,
    });
    if (error) toast.error('Vertretung konnte nicht gespeichert werden.');
    else {
      toast.success(`${p.full_name?.split(' ')[0]} übernimmt den ${format(selected, 'd. MMMM', { locale: de })}`);
      plan.reload();
    }
  };

  const removeOverride = async () => {
    const { error } = await supabase.from('reception_overrides').delete().eq('day', dayKey(selected));
    if (error) toast.error('Abweichung konnte nicht entfernt werden.');
    else plan.reload();
  };

  const saveRules = async () => {
    const cleaned = draft.map((r) => ({ ...r, persons: r.persons.map((p) => p.trim()).filter(Boolean) }));
    if (cleaned.some((r) => r.persons.length === 0)) {
      toast.error('Jeder Wochentag braucht mindestens eine Person.');
      return;
    }
    const { error } = await supabase.from('reception_rules').upsert(cleaned.map((r) => ({ ...r, updated_at: new Date().toISOString(), updated_by: user?.id })));
    if (error) toast.error('Plan konnte nicht gespeichert werden.');
    else {
      toast.success('Wochenplan gespeichert');
      setEditOpen(false);
      plan.reload();
    }
  };

  /* ---------------- Ansicht ---------------- */

  return (
    <div className="space-y-6">
      <PageHeader
        title="Empfang"
        description="Wer sitzt wann am Empfang und übernimmt die Laufkundschaft. Klick auf einen Tag für Tausch und Vertretung."
        actions={
          isAdmin && plan.available ? (
            <Button
              variant="secondary"
              icon={Pencil}
              onClick={() => {
                setDraft(plan.rules.map((r) => ({ ...r, persons: [...r.persons] })));
                setEditOpen(true);
              }}
            >
              Wochenplan bearbeiten
            </Button>
          ) : undefined
        }
      />

      {/* Offene Anfragen an mich */}
      {myPending.length > 0 && (
        <Card className="border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/30">
          <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-white">
            <ArrowLeftRight className="h-4 w-4 text-amber-600" /> Tauschanfragen an dich
          </h2>
          <ul className="space-y-2">
            {myPending.map((s) => (
              <li key={s.id} className="flex flex-col gap-2 rounded-lg bg-white p-3 dark:bg-gray-800 sm:flex-row sm:items-center">
                <p className="flex-1 text-sm text-gray-700 dark:text-gray-200">
                  <strong>{nameOf(s.from_user)}</strong> fragt, ob du am <strong>{format(new Date(`${s.day}T00:00:00`), 'EEEE, d. MMMM', { locale: de })}</strong> den Empfang übernimmst.
                  {s.note && <span className="block text-xs text-gray-500">„{s.note}“</span>}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" icon={Check} onClick={() => answerSwap(s.id, true)}>Übernehmen</Button>
                  <Button size="sm" variant="secondary" icon={X} onClick={() => answerSwap(s.id, false)}>Ablehnen</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <Card padded={false} className="overflow-hidden xl:col-span-3">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700 sm:px-6">
            <h2 className="text-base font-semibold capitalize text-gray-900 dark:text-white">{format(currentDate, 'MMMM yyyy', { locale: de })}</h2>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => { setCurrentDate(new Date()); setSelected(startOfDay(new Date())); }} className="btn-ghost btn-sm">Heute</button>
              <IconButton icon={ChevronLeft} label="Vorheriger Monat" onClick={() => setCurrentDate(subMonths(currentDate, 1))} />
              <IconButton icon={ChevronRight} label="Nächster Monat" onClick={() => setCurrentDate(addMonths(currentDate, 1))} />
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-gray-100 text-center text-xs font-medium text-gray-500 dark:border-gray-700">
            {WEEKDAY_LABELS.map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>

          <div className="grid grid-cols-7 [&>*:nth-child(7n)]:border-r-0">
            {days.map((day) => {
              const inMonth = isSameMonth(day, currentDate);
              const today = isSameDay(day, new Date());
              const closed = isOfficeClosed(day);
              const holiday = getHolidayName(day);
              const info = dayInfo(day);
              const isSel = isSameDay(day, selected);
              const pending = plan.swaps.some((s) => s.status === 'pending' && s.day === dayKey(day));
              return (
                <button
                  type="button"
                  key={day.toISOString()}
                  onClick={() => setSelected(startOfDay(day))}
                  disabled={closed}
                  className={cn(
                    'min-h-[5.5rem] border-b border-r border-gray-100 p-2 text-left transition-colors dark:border-gray-700/70 sm:p-2.5',
                    !inMonth && 'bg-gray-50/70 text-gray-400 dark:bg-gray-900/30',
                    closed ? 'cursor-default bg-gray-50/70 dark:bg-gray-900/30' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30',
                    info?.absent && inMonth && 'bg-red-50/70 dark:bg-red-950/30',
                    isSel && !closed && 'ring-2 ring-inset ring-brand-500',
                  )}
                >
                  <span className={cn('tabular inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs', today ? 'bg-brand-600 font-semibold text-white' : 'text-gray-500 dark:text-gray-400')}>
                    {format(day, 'd')}
                  </span>
                  {inMonth && (
                    <span className="mt-1.5 block">
                      {holiday ? (
                        <span className="block truncate text-2xs text-gray-400">{holiday}</span>
                      ) : info ? (
                        <span className={cn('flex items-center gap-1.5 text-xs font-medium sm:text-sm', info.absent ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-white')}>
                          <span className={cn('hidden h-2 w-2 shrink-0 rounded-full sm:inline-block', toneFor(info.person))} />
                          <span className="truncate">{info.person}</span>
                          {info.absent && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-label="abwesend" />}
                        </span>
                      ) : null}
                      {info?.override && <span className="mt-0.5 hidden truncate text-2xs text-brand-700 dark:text-brand-300 sm:block">{info.override.note || 'Geändert'}</span>}
                      {pending && <span className="mt-0.5 hidden text-2xs text-amber-700 dark:text-amber-300 sm:block">Tausch angefragt</span>}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Tagesdetails */}
        <div className="space-y-6">
          <Card>
            <p className="text-xs text-gray-500">{format(selected, 'EEEE, d. MMMM', { locale: de })}</p>
            {!selectedInfo ? (
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Büro geschlossen.</p>
            ) : (
              <>
                <div className="mt-3 flex items-center gap-3">
                  <Avatar name={selectedInfo.profile?.full_name || selectedInfo.person} src={selectedInfo.profile?.avatar_url} size="md" />
                  <div className="min-w-0">
                    <p className="font-display text-lg font-semibold text-gray-900 dark:text-white">{selectedInfo.person}</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedInfo.absent && <Badge tone="danger">Abwesend</Badge>}
                      {selectedInfo.override && <Badge tone="brand">{selectedInfo.override.note || 'Abweichend vom Plan'}</Badge>}
                      {selectedIsMine && <Badge tone="warning">Du</Badge>}
                    </div>
                  </div>
                </div>

                {!plan.available && (
                  <p className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-500 dark:bg-gray-900/40">
                    Tausch und Vertretung sind verfügbar, sobald das Datenbank-Update für Version 2.1 eingespielt ist.
                  </p>
                )}

                {plan.available && !selectedPast && (
                  <div className="mt-5 space-y-5 border-t border-gray-100 pt-4 dark:border-gray-700">
                    {pendingForSelected && (
                      <div className="flex items-center justify-between gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                        <span>
                          Tausch bei {nameOf(pendingForSelected.to_user)} angefragt
                        </span>
                        {pendingForSelected.from_user === user?.id && (
                          <button type="button" onClick={() => cancelSwap(pendingForSelected.id)} className="btn-ghost btn-sm">
                            Zurückziehen
                          </button>
                        )}
                      </div>
                    )}

                    {selectedIsMine && !pendingForSelected && (
                      <div className="space-y-3">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">Tag tauschen</p>
                        <Field label="Wen fragen?" htmlFor="swap-to">
                          <select id="swap-to" value={swapTo} onChange={(e) => setSwapTo(e.target.value)} className="input">
                            <option value="">Person auswählen</option>
                            {suggestions.map((p) => (
                              <option key={p.id} value={p.id}>{p.full_name}</option>
                            ))}
                          </select>
                        </Field>
                        <input type="text" value={swapNote} onChange={(e) => setSwapNote(e.target.value)} placeholder="Nachricht (optional)" aria-label="Nachricht" className="input" />
                        <Button className="w-full" icon={ArrowLeftRight} disabled={!swapTo} loading={busy} onClick={requestSwap}>
                          Anfrage senden
                        </Button>
                      </div>
                    )}

                    {(isAdmin || selectedInfo.absent) && (
                      <div>
                        <p className="mb-2 text-sm font-medium text-gray-900 dark:text-white">{selectedInfo.absent ? 'Vertretung' : 'Jemand anderes einteilen'}</p>
                        <p className="mb-2 text-xs text-gray-500">An diesem Tag nicht abwesend:</p>
                        <ul className="space-y-1">
                          {suggestions.slice(0, 6).map((p) => (
                            <li key={p.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/40">
                              <Avatar name={p.full_name} src={p.avatar_url} size="xs" />
                              <span className="flex-1 truncate text-sm text-gray-700 dark:text-gray-200">{p.full_name}</span>
                              {isAdmin && (
                                <button type="button" onClick={() => setSubstitute(p)} className="btn-secondary btn-sm">
                                  <UserCheck className="h-3.5 w-3.5" /> Einteilen
                                </button>
                              )}
                            </li>
                          ))}
                        </ul>
                        {!isAdmin && <p className="mt-2 text-xs text-gray-500">Eintragen kann die Büroleitung. Alternativ fragt die eingeteilte Person direkt per Tausch.</p>}
                        {isAdmin && selectedInfo.override && (
                          <button type="button" onClick={removeOverride} className="btn-ghost btn-sm mt-2">
                            <Undo2 className="h-3.5 w-3.5" /> Zurück zum Wochenplan
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </Card>

          <Card>
            <h2 className="mb-1 text-base font-semibold text-gray-900 dark:text-white">Vertretung nötig</h2>
            <p className="mb-3 text-xs text-gray-500">Kommende Tage im {format(currentDate, 'MMMM', { locale: de })}, an denen die eingeteilte Person abwesend ist.</p>
            {gaps.length === 0 ? (
              <p className="text-sm text-gray-500">Keine Lücken.</p>
            ) : (
              <ul className="space-y-2">
                {gaps.map((d) => (
                  <li key={d.toISOString()}>
                    <button type="button" onClick={() => setSelected(startOfDay(d))} className="flex w-full items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-left text-sm hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50">
                      <span className="text-red-800 dark:text-red-200">{format(d, 'EEE, d. MMM', { locale: de })}</span>
                      <span className="font-medium text-red-800 dark:text-red-200">{dayInfo(d)?.person}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">Wochenplan</h2>
            <dl className="space-y-2.5 text-sm">
              {plan.rules.map((r) => (
                <div key={r.weekday} className="flex items-start justify-between gap-3">
                  <dt className="text-gray-500">{WEEKDAY_NAMES[r.weekday]}</dt>
                  <dd className="text-right font-medium text-gray-900 dark:text-white">
                    {r.persons.length > 1 ? `${r.persons.join(' / ')} im Wechsel` : r.persons[0]}
                  </dd>
                </div>
              ))}
            </dl>
            {myOutgoing.length > 0 && (
              <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-700">
                Du hast {myOutgoing.length} offene Tauschanfrage{myOutgoing.length > 1 ? 'n' : ''}.
              </p>
            )}
          </Card>
        </div>
      </div>

      <Modal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title="Wochenplan bearbeiten"
        description="Mehrere Namen an einem Tag wechseln sich wöchentlich ab. Einzelne Tage änderst du direkt im Kalender."
        footer={
          <>
            <button type="button" onClick={() => setEditOpen(false)} className="btn-secondary">Abbrechen</button>
            <Button onClick={saveRules}>Plan speichern</Button>
          </>
        }
      >
        <div className="space-y-4">
          {draft.map((r, i) => (
            <div key={r.weekday} className="grid grid-cols-[6rem_1fr] items-start gap-3">
              <label htmlFor={`rule-${r.weekday}`} className="pt-2 text-sm font-medium text-gray-700 dark:text-gray-200">{WEEKDAY_NAMES[r.weekday]}</label>
              <div className="space-y-2">
                <input
                  id={`rule-${r.weekday}`}
                  type="text"
                  value={r.persons.join(', ')}
                  onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, persons: e.target.value.split(',') } : x)))}
                  placeholder="Vorname, z. B. Lucas"
                  className="input"
                />
                {r.persons.filter((p) => p.trim()).length > 1 && (
                  <Field label="Wechsel beginnt in der Woche vom" htmlFor={`rot-${r.weekday}`}>
                    <input
                      id={`rot-${r.weekday}`}
                      type="date"
                      value={r.rotation_start}
                      onChange={(e) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, rotation_start: e.target.value } : x)))}
                      className="input"
                    />
                  </Field>
                )}
              </div>
            </div>
          ))}
          <p className="text-xs text-gray-500">Namen wie im Rollen-Kürzel oder Vornamen, z. B. „Flori“. So findet die App das passende Konto für Abwesenheiten und Benachrichtigungen.</p>
        </div>
      </Modal>
    </div>
  );
};
