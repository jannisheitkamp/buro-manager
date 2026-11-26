import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { BookOpen, Check, ChevronLeft, ChevronRight, FileDown, Send, Undo2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button, EmptyState, PageHeader, Segmented } from '@/components/ui';
import { StatusPill } from '@/components/ui/hero';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { cn } from '@/utils/cn';
import {
  exportTrainingPdf,
  schoolDaysText,
  SECTIONS,
  shiftWeek,
  STATUS_LABEL,
  STATUS_TONE,
  weekKey,
  weekLabel,
  weeksSince,
  type SectionKey,
  type TrainingReport,
} from '@/lib/training';

type Person = { id: string; full_name: string; boss_id: string | null; is_vocational_student: boolean | null; vocational_school_days?: { dayOfWeek: number; type: 'full' | 'half' }[] | null };
const EMPTY: Record<SectionKey, string> = { company: '', training: '', school: '' };

/** Berichtsheft: Azubis schreiben Wochenberichte, Chef oder Admin zeichnet ab */
export const Training = () => {
  const { user, profile } = useStore();
  const isAdmin = !!profile?.roles?.includes('admin');
  const isTrainee = !!profile?.is_vocational_student;
  const [people, setPeople] = useState<Person[]>([]);
  const [reports, setReports] = useState<TrainingReport[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [p, r] = await Promise.all([
      supabase.from('profiles').select('id, full_name, boss_id, is_vocational_student, vocational_school_days'),
      supabase.from('training_reports').select('*').order('week_start', { ascending: false }),
    ]);
    if (r.error) toast.error('Berichte konnten nicht geladen werden.');
    setPeople((p.data as Person[]) || []);
    setReports((r.data as TrainingReport[]) || []);
    setLoading(false);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const names = useMemo(() => new Map(people.map((p) => [p.id, p.full_name])), [people]);
  // Azubis, deren Berichte ich abzeichnen darf
  const trainees = useMemo(() => people.filter((p) => p.is_vocational_student && p.id !== user?.id && (isAdmin || p.boss_id === user?.id)), [people, user?.id, isAdmin]);
  const isReviewer = trainees.length > 0;
  const [tab, setTab] = useState<'mine' | 'review'>(isTrainee ? 'mine' : 'review');
  useEffect(() => setTab(isTrainee ? 'mine' : 'review'), [isTrainee]);

  if (loading) return <p className="text-sm text-gray-500">Wird geladen …</p>;

  return (
    <div>
      <PageHeader
        title="Berichtsheft"
        description="Ausbildungsnachweise pro Woche. Azubis schreiben und reichen ein, der Chef zeichnet ab. Als PDF fertig für die IHK."
        actions={
          isTrainee && isReviewer ? (
            <Segmented value={tab} onChange={setTab} options={[{ value: 'mine', label: 'Mein Berichtsheft' }, { value: 'review', label: 'Abzeichnen', count: reports.filter((r) => r.status === 'submitted' && r.user_id !== user?.id).length }]} />
          ) : undefined
        }
      />
      {!isTrainee && !isReviewer ? (
        <EmptyState icon={BookOpen} title="Kein Berichtsheft" description="Das Berichtsheft gibt es für Azubis und ihre Chefs. Ob jemand Azubi ist, stellt ein Admin im Verzeichnis ein." />
      ) : tab === 'mine' && isTrainee ? (
        <MyReports reports={reports.filter((r) => r.user_id === user?.id)} names={names} reload={load} />
      ) : (
        <Review reports={reports.filter((r) => r.user_id !== user?.id)} trainees={trainees} names={names} reload={load} />
      )}
    </div>
  );
};

/* ---------------------------------------------------------------- Azubi */

function MyReports({ reports, names, reload }: { reports: TrainingReport[]; names: Map<string, string>; reload: () => void }) {
  const { user, profile } = useStore();
  const [week, setWeek] = useState(() => weekKey(new Date()));
  const current = reports.find((r) => r.week_start === week);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(current ? { company: current.company, training: current.training, school: current.school } : EMPTY), [current, week]);

  const locked = current?.status === 'approved' || current?.status === 'submitted';
  const weeks = useMemo(() => weeksSince(reports), [reports]);
  const firstWeek = weeks[weeks.length - 1] || week;
  const missing = weeks.filter((w) => w !== weekKey(new Date()) && !reports.some((r) => r.week_start === w)).length;
  const school = schoolDaysText(profile?.vocational_school_days as never);

  const save = async (submit: boolean) => {
    if (!user) return;
    if (submit && !form.company.trim()) return toast.error('Bitte zuerst die betrieblichen Tätigkeiten eintragen.');
    setBusy(true);
    const status = submit ? 'submitted' : 'draft';
    const fields = { ...form, status };
    const { error } = current
      ? await supabase.from('training_reports').update(fields).eq('id', current.id)
      : await supabase.from('training_reports').insert({ ...fields, user_id: user.id, week_start: week });
    setBusy(false);
    if (error) return toast.error('Bericht konnte nicht gespeichert werden.');
    toast.success(submit ? 'Zur Abzeichnung eingereicht' : 'Gespeichert');
    reload();
  };

  const pull = async () => {
    if (!current) return;
    const { error } = await supabase.rpc('withdraw_training_report', { p_id: current.id });
    if (error) return toast.error('Konnte nicht zurückgeholt werden.');
    reload();
  };

  const approved = reports.filter((r) => r.status === 'approved');
  const pdfOpts = { name: profile?.full_name || 'Azubi', firstWeek, names };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <section className="card p-5 sm:p-6" aria-label="Wochenbericht">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button type="button" className="btn-icon p-1.5" onClick={() => setWeek(shiftWeek(week, -1))} aria-label="Vorige Woche"><ChevronLeft className="h-4 w-4" /></button>
            <h2 className="font-display text-lg font-semibold text-gray-900 dark:text-white">{weekLabel(week)}</h2>
            <button type="button" className="btn-icon p-1.5 disabled:opacity-30" onClick={() => setWeek(shiftWeek(week, 1))} disabled={week >= weekKey(new Date())} aria-label="Nächste Woche"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <StatusPill tone={current ? STATUS_TONE[current.status] : 'gray'}>{current ? STATUS_LABEL[current.status] : 'Noch nicht geschrieben'}</StatusPill>
        </div>

        {current?.status === 'returned' && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-100">
            Zurückgegeben{current.reviewed_by && names.get(current.reviewed_by) ? ` von ${names.get(current.reviewed_by)}` : ''}{current.review_note ? `: ${current.review_note}` : '. Bitte überarbeiten und neu einreichen.'}
          </div>
        )}
        {current?.status === 'approved' && current.reviewed_at && (
          <p className="mt-4 text-sm text-emerald-700 dark:text-emerald-300">
            Abgezeichnet{current.reviewed_by && names.get(current.reviewed_by) ? ` von ${names.get(current.reviewed_by)}` : ''} am {format(new Date(current.reviewed_at), 'dd.MM.yyyy')}{current.review_note ? ` · ${current.review_note}` : ''}
          </p>
        )}

        <div className="mt-5 space-y-4">
          {SECTIONS.map((s) => (
            <div key={s.key}>
              <label htmlFor={`tr-${s.key}`} className="text-sm font-semibold text-gray-900 dark:text-white">{s.label}</label>
              {s.key === 'school' && school && <span className="ml-2 text-xs text-gray-500">Berufsschultage: {school}</span>}
              <textarea
                id={`tr-${s.key}`}
                rows={s.key === 'company' ? 6 : 3}
                value={form[s.key]}
                onChange={(e) => setForm((f) => ({ ...f, [s.key]: e.target.value }))}
                readOnly={locked}
                placeholder={s.hint}
                className={cn('input mt-1.5 w-full resize-y text-sm', locked && 'bg-gray-50 dark:bg-gray-900/40')}
              />
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {current && <Button variant="ghost" icon={FileDown} onClick={() => exportTrainingPdf([current], pdfOpts)}>PDF</Button>}
          {current?.status === 'submitted' && <Button variant="secondary" icon={Undo2} onClick={pull}>Zurückholen</Button>}
          {!locked && (
            <>
              <Button variant="secondary" loading={busy} onClick={() => save(false)}>Speichern</Button>
              <Button icon={Send} loading={busy} onClick={() => save(true)}>Zum Abzeichnen einreichen</Button>
            </>
          )}
        </div>
      </section>

      <aside className="card self-start overflow-hidden" aria-label="Alle Wochen">
        <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-700">
          <p className="font-display font-semibold text-gray-900 dark:text-white">Alle Wochen</p>
          <p className="text-xs text-gray-500">
            {approved.length} abgezeichnet{missing > 0 && <span className="text-amber-600"> · {missing} fehlen</span>}
          </p>
        </div>
        <ul className="max-h-[28rem] divide-y divide-gray-100 overflow-y-auto dark:divide-gray-700/70">
          {weeks.map((w) => {
            const r = reports.find((x) => x.week_start === w);
            return (
              <li key={w}>
                <button type="button" onClick={() => setWeek(w)} className={cn('flex w-full items-center justify-between gap-2 px-4 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-800/60', w === week && 'bg-brand-50 dark:bg-brand-900/30')}>
                  <span className="text-gray-700 dark:text-gray-200">{weekLabel(w).split(' · ')[0]} <span className="text-xs text-gray-400">{weekLabel(w).split(' · ')[1]}</span></span>
                  {r ? <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill> : w === weekKey(new Date()) ? <span className="text-xs text-gray-400">offen</span> : <span className="text-xs text-amber-600">fehlt</span>}
                </button>
              </li>
            );
          })}
        </ul>
        {reports.length > 0 && (
          <div className="space-y-2 border-t border-gray-100 p-3 dark:border-gray-700">
            <Button size="sm" variant="secondary" icon={FileDown} className="w-full" disabled={!approved.length} onClick={() => exportTrainingPdf(approved, pdfOpts)}>Abgezeichnete als PDF</Button>
            <Button size="sm" variant="ghost" icon={FileDown} className="w-full" onClick={() => exportTrainingPdf(reports, pdfOpts)}>Alle Wochen als PDF</Button>
          </div>
        )}
      </aside>
    </div>
  );
}

/* ---------------------------------------------------------------- Chef / Admin */

function Review({ reports, trainees, names, reload }: { reports: TrainingReport[]; trainees: Person[]; names: Map<string, string>; reload: () => void }) {
  const open = reports.filter((r) => r.status === 'submitted').sort((a, b) => a.week_start.localeCompare(b.week_start));
  const [who, setWho] = useState(trainees[0]?.id || '');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const review = async (r: TrainingReport, approve: boolean) => {
    if (!approve && !notes[r.id]?.trim()) return toast.error('Schreib kurz dazu, was noch fehlt.');
    setBusy(r.id);
    // p_seen: abgezeichnet wird nur der Stand, der hier angezeigt wird
    const { error } = await supabase.rpc('review_training_report', { p_id: r.id, p_approve: approve, p_seen: r.updated_at, p_note: notes[r.id] || null });
    setBusy(null);
    if (error) {
      toast.error(error.message || 'Hat nicht geklappt.');
      return reload();
    }
    toast.success(approve ? 'Abgezeichnet' : 'Zurückgegeben');
    reload();
  };

  const theirs = reports.filter((r) => r.user_id === who);
  const approved = theirs.filter((r) => r.status === 'approved');
  const firstWeek = theirs.map((r) => r.week_start).sort()[0];
  const missing = theirs.length ? weeksSince(theirs).filter((w) => w !== weekKey(new Date()) && !theirs.some((r) => r.week_start === w)).length : 0;

  return (
    <div className="space-y-6">
      <section className="card overflow-hidden" aria-labelledby="review-title">
        <h2 id="review-title" className="border-b border-gray-100 px-5 py-4 font-display text-lg font-semibold text-gray-900 dark:border-gray-700 dark:text-white">
          Zum Abzeichnen <span className="tabular ml-1 rounded-full bg-gray-100 px-2 py-0.5 font-sans text-xs font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">{open.length}</span>
        </h2>
        {open.length === 0 ? (
          <p className="px-5 py-6 text-sm text-gray-500">Gerade wartet kein Bericht auf dich.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
            {open.map((r) => (
              <li key={r.id} className="space-y-3 px-5 py-4">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-gray-900 dark:text-white">{names.get(r.user_id) || 'Azubi'}</span>
                  <span className="text-sm text-gray-500">{weekLabel(r.week_start)}</span>
                </p>
                <dl className="grid gap-3 text-sm sm:grid-cols-3">
                  {SECTIONS.map((s) => (
                    <div key={s.key}>
                      <dt className="text-xs font-semibold text-gray-500">{s.label}</dt>
                      <dd className="mt-0.5 whitespace-pre-line text-gray-800 dark:text-gray-100">{r[s.key].trim() || '–'}</dd>
                    </div>
                  ))}
                </dl>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label htmlFor={`rv-${r.id}`} className="sr-only">Hinweis</label>
                  <input id={`rv-${r.id}`} value={notes[r.id] || ''} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} placeholder="Hinweis (nötig beim Zurückgeben)" className="input flex-1 text-sm" />
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" icon={Undo2} loading={busy === r.id} onClick={() => review(r, false)}>Zurückgeben</Button>
                    <Button size="sm" icon={Check} loading={busy === r.id} onClick={() => review(r, true)}>Abzeichnen</Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card overflow-hidden" aria-labelledby="trainee-title">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-700">
          <h2 id="trainee-title" className="font-display text-lg font-semibold text-gray-900 dark:text-white">Berichte je Azubi</h2>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="rv-who" className="sr-only">Azubi</label>
            <select id="rv-who" value={who} onChange={(e) => setWho(e.target.value)} className="input text-sm">
              {trainees.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
            </select>
            <Button size="sm" variant="secondary" icon={FileDown} disabled={!approved.length} onClick={() => exportTrainingPdf(approved, { name: names.get(who) || 'Azubi', firstWeek, names })}>Abgezeichnete als PDF</Button>
            <Button size="sm" variant="ghost" icon={FileDown} disabled={!theirs.length} onClick={() => exportTrainingPdf(theirs, { name: names.get(who) || 'Azubi', firstWeek, names })}>Alle als PDF</Button>
          </div>
        </div>
        <p className="px-5 pt-3 text-xs text-gray-500">
          {theirs.length} {theirs.length === 1 ? 'Bericht' : 'Berichte'} · {approved.length} abgezeichnet{missing > 0 && <span className="text-amber-600"> · {missing} {missing === 1 ? 'Woche fehlt' : 'Wochen fehlen'}</span>}
        </p>
        {theirs.length === 0 ? (
          <p className="px-5 pb-6 pt-2 text-sm text-gray-500">Noch keine Berichte.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
            {theirs.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="text-gray-700 dark:text-gray-200">{weekLabel(r.week_start)}</span>
                <span className="flex items-center gap-2">
                  <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill>
                  <button type="button" className="btn-icon p-1.5" title="PDF" aria-label={`PDF ${weekLabel(r.week_start)}`} onClick={() => exportTrainingPdf([r], { name: names.get(who) || 'Azubi', firstWeek, names })}>
                    <FileDown className="h-4 w-4" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
