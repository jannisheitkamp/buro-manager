import { useEffect, useMemo, useState } from 'react';
import { PageHeader, Button, EmptyState } from '@/components/ui';
import { CountUp, GoalGauge, HeroDivider, HeroPanel, HeroStat, StatusPill } from '@/components/ui/hero';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Absence } from '@/types';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Check, X, RefreshCw, Palmtree } from 'lucide-react';
import { cn } from '@/utils/cn';
import { toast } from 'react-hot-toast';
import { getVacationDaysToDeduct } from '@/utils/dateUtils';
import { fetchCarryover, vacationDaysUsedInYear } from '@/lib/vacation';

export const Vacation = () => {
    const { user, profile } = useStore();
    const [absences, setAbsences] = useState<Absence[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [editingDaysId, setEditingDaysId] = useState<string | null>(null);
    const [editingDaysValue, setEditingDaysValue] = useState<string>('');
    const [carryover, setCarryover] = useState(0);
    // Abzug und Tage legt die genehmigende Person fest, hier ändern das nur Admins
    const isAdmin = !!profile?.roles?.includes('admin');

    const fetchVacations = async () => {
        if (!user) return;
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('absences')
                .select('*')
                .eq('user_id', user.id)
                .eq('type', 'vacation')
                .order('start_date', { ascending: false });

            if (error) throw error;
            setAbsences((data || []) as Absence[]);
        } catch (e) {
            const msg = (e as Error)?.message || 'Unbekannter Fehler';
            toast.error(`Fehler beim Laden: ${msg}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let timeoutId: NodeJS.Timeout;
        const debouncedFetch = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                fetchVacations();
            }, 500);
        };

        fetchVacations();
        if (user) fetchCarryover(user.id, new Date().getFullYear()).then(setCarryover);

        const subscription = supabase
            .channel('vacation_absences')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'absences' }, debouncedFetch)
            .subscribe();

        return () => {
            clearTimeout(timeoutId);
            supabase.removeChannel(subscription);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const currentYear = new Date().getFullYear();
    const totalVacationDays = profile?.total_vacation_days ?? 30;

    const { usedDays, remainingDays } = useMemo(() => {
        const used = vacationDaysUsedInYear(absences, currentYear, profile);
        return { usedDays: used, remainingDays: Math.max(0, totalVacationDays + carryover - used) };
    }, [absences, currentYear, totalVacationDays, carryover, profile]);

    const toggleDeduct = async (absence: Absence) => {
        if (!user) return;
        const next = !(absence.deduct_vacation_days ?? true);
        setSavingId(absence.id);
        try {
            const { data, error } = await supabase
                .from('absences')
                .update({ deduct_vacation_days: next })
                .eq('id', absence.id)
                .select('id');

            if (error) throw error;
            if (!data?.length) throw new Error('Keine Berechtigung');

            setAbsences(prev => prev.map(a => (a.id === absence.id ? { ...a, deduct_vacation_days: next } : a)));
            toast.success(next ? 'Urlaubstage werden abgezogen.' : 'Urlaubstage werden nicht abgezogen.');
        } catch (e) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const err: any = e;
            const msg = err?.message || 'Unbekannter Fehler';
            if (msg.toLowerCase().includes('deduct_vacation_days') && msg.toLowerCase().includes('column')) {
                toast.error('Datenbank-Spalte für Abzug fehlt. Bitte SQL Migration ausführen.');
            } else {
                toast.error(`Konnte nicht speichern: ${msg}`);
            }
        } finally {
            setSavingId(null);
        }
    };

    const updateUsedDays = async (absence: Absence) => {
        if (!user) return;
        const val = editingDaysValue.trim() === '' ? null : Number(editingDaysValue);
        if (val !== null && (isNaN(val) || val < 0)) {
            toast.error('Bitte eine gültige Zahl eingeben.');
            return;
        }

        setSavingId(absence.id);
        try {
            const { data, error } = await supabase
                .from('absences')
                .update({ used_days: val })
                .eq('id', absence.id)
                .select('id');

            if (error) throw error;
            if (!data?.length) throw new Error('Keine Berechtigung');

            setAbsences(prev => prev.map(a => (a.id === absence.id ? { ...a, used_days: val } : a)));
            toast.success('Urlaubstage erfolgreich aktualisiert.');
        } catch (e) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const err: any = e;
            const msg = err?.message || 'Unbekannter Fehler';
            toast.error(`Konnte nicht speichern: ${msg}`);
        } finally {
            setSavingId(null);
            setEditingDaysId(null);
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Urlaubskonto"
                description="Deine Urlaubstage im Jahr und welche Abwesenheiten davon abgezogen werden."
                actions={<Button variant="secondary" icon={RefreshCw} loading={loading} onClick={fetchVacations}>Aktualisieren</Button>}
            />

            {(() => {
                const total = totalVacationDays + carryover;
                const usedPct = total ? Math.round((usedDays / total) * 100) : 0;
                const yearPassed = (Date.now() - new Date(currentYear, 0, 1).getTime()) / (new Date(currentYear + 1, 0, 1).getTime() - new Date(currentYear, 0, 1).getTime());
                const nextTrip = absences
                    .filter(a => a.status !== 'rejected' && parseISO(a.end_date) >= new Date())
                    .sort((x, y) => x.start_date.localeCompare(y.start_date))[0];
                return (
                    <HeroPanel aria-label={`Urlaub ${currentYear}`}>
                        <div className="grid items-center gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_18rem]">
                            <div>
                                <p className="text-sm text-brand-200">Noch frei in {currentYear}</p>
                                <p className={cn('mt-1.5 font-display font-semibold leading-[0.9] tracking-tight', remainingDays > 0 ? 'text-white' : 'text-red-300')}>
                                    <CountUp value={remainingDays} format={Number.isInteger(remainingDays) ? 'int' : 'dec'} className="text-7xl sm:text-8xl" />
                                    <span className="ml-2 text-3xl text-brand-200 sm:text-4xl">{remainingDays === 1 ? 'Tag' : 'Tage'}</span>
                                </p>
                                <p className="mt-4 text-sm text-brand-100">
                                    {nextTrip
                                        ? <>Nächster Urlaub: <strong className="font-semibold text-amber-300">{format(parseISO(nextTrip.start_date), 'd. MMMM', { locale: de })}</strong>{nextTrip.status === 'pending' && ' (noch offen)'}</>
                                        : remainingDays > 0 ? 'Noch nichts geplant. Zeit für eine Pause?' : 'Alles verplant.'}
                                </p>
                            </div>
                            <div className="text-center">
                                <GoalGauge pct={usedPct} expected={yearPassed} caption="genutzt oder geplant" />
                            </div>
                        </div>
                        <HeroDivider />
                        <dl className="grid grid-cols-3 gap-6 px-6 py-5 sm:px-8">
                            <HeroStat label={`Jahresurlaub ${currentYear}`} value={`${total} Tage`} hint={carryover > 0 ? `davon ${carryover} aus ${currentYear - 1}` : undefined} />
                            <HeroStat label="Genutzt oder geplant" value={`${usedDays} Tage`} />
                            <HeroStat label="Verbleibend" value={`${remainingDays} Tage`} accent={remainingDays > 0} />
                        </dl>
                    </HeroPanel>
                );
            })()}

            <div className="card overflow-hidden">
                <h2 className="border-b border-gray-100 px-5 py-4 font-display text-lg font-semibold text-gray-900 dark:border-gray-700 dark:text-white sm:px-6">Urlaubszeiträume</h2>

                {loading ? (
                    <div className="flex items-center justify-center py-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    </div>
                ) : absences.length === 0 ? (
                    <EmptyState icon={Palmtree} title="Noch kein Urlaub eingetragen" description="Beantrage Urlaub unter Abwesenheiten, dann erscheint er hier." />
                ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-700/70">
                        {absences.map(a => {
                            const calculatedDays = getVacationDaysToDeduct(parseISO(a.start_date), parseISO(a.end_date), profile ?? undefined, a.half_day);
                            const displayDays = a.used_days ?? calculatedDays;
                            const deduct = a.deduct_vacation_days ?? true;
                            const busy = savingId === a.id;
                            const isEditing = editingDaysId === a.id;
                            
                            return (
                                <div
                                    key={a.id}
                                    className={cn('group relative flex flex-col justify-between gap-4 py-4 pl-6 pr-5 transition-colors hover:bg-brand-50/40 dark:hover:bg-white/[0.03] sm:flex-row sm:items-center sm:pr-6', a.status === 'rejected' && 'opacity-60')}
                                >
                                    <span aria-hidden className="absolute inset-y-3 left-0 w-1 rounded-r" style={{ background: a.status === 'approved' ? '#10B981' : a.status === 'pending' ? '#F2A541' : '#EF4444' }} />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[15px] font-semibold text-gray-900 dark:text-white">
                                                {format(parseISO(a.start_date), 'dd.MM.yyyy', { locale: de })} – {format(parseISO(a.end_date), 'dd.MM.yyyy', { locale: de })}
                                            </span>
                                            <StatusPill tone={a.status === 'approved' ? 'emerald' : a.status === 'pending' ? 'amber' : 'red'} pulse={a.status === 'pending'}>
                                                {a.status === 'approved' ? 'Genehmigt' : a.status === 'pending' ? 'Offen' : 'Abgelehnt'}
                                            </StatusPill>
                                            
                                            {isEditing ? (
                                                <div className="flex items-center gap-1 ml-2">
                                                    <input
                                                        type="number"
                                                        step="0.5"
                                                        value={editingDaysValue}
                                                        onChange={(e) => setEditingDaysValue(e.target.value)}
                                                        className="w-16 px-2 py-1 text-xs rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                        placeholder={String(calculatedDays)}
                                                        autoFocus
                                                    />
                                                    <button
                                                        onClick={() => updateUsedDays(a)}
                                                        disabled={busy}
                                                        className="p-1 bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 rounded-md hover:bg-indigo-200 dark:hover:bg-indigo-800/50"
                                                    >
                                                        <Check className="w-3.5 h-3.5" />
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingDaysId(null)}
                                                        disabled={busy}
                                                        className="p-1 bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
                                                    >
                                                        <X className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <span 
                                                    className={cn("text-xs font-bold text-gray-500 dark:text-gray-400 ml-2", isAdmin && "cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 border-b border-dashed border-gray-300 dark:border-gray-600")}
                                                    onClick={() => {
                                                        if (!isAdmin) return;
                                                        setEditingDaysId(a.id);
                                                        setEditingDaysValue(a.used_days !== null && a.used_days !== undefined ? String(a.used_days) : String(calculatedDays));
                                                    }}
                                                    title={isAdmin ? "Klicken zum Ändern (z.B. wegen Feiertagen)" : undefined}
                                                >
                                                    {displayDays} {displayDays === 1 ? 'Arbeitstag' : 'Arbeitstage'}
                                                    {a.used_days !== null && a.used_days !== undefined && ' (Manuell)'}
                                                </span>
                                            )}
                                        </div>
                                        {a.note && (
                                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                                                {a.note}
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        disabled={busy || !isAdmin}
                                        title={isAdmin ? undefined : 'Legt die genehmigende Person fest'}
                                        onClick={() => toggleDeduct(a)}
                                        className={cn(
                                            'shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-colors',
                                            deduct
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-900/30'
                                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 dark:bg-gray-700/40 dark:text-gray-200 dark:border-gray-700',
                                            busy ? 'opacity-70 cursor-not-allowed' : '',
                                            !isAdmin && 'cursor-default'
                                        )}
                                    >
                                        {deduct ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                        {deduct ? 'Zieht ab' : 'Zieht nicht ab'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

