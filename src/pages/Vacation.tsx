import { useEffect, useMemo, useState } from 'react';
import { PageHeader, Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Absence } from '@/types';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { Check, X, RefreshCw } from 'lucide-react';
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

    const statusBadge = (status: Absence['status']) => {
        if (status === 'approved') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
        if (status === 'pending') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Urlaubskonto"
                description="Deine Urlaubstage im Jahr und welche Abwesenheiten davon abgezogen werden."
                actions={<Button variant="secondary" icon={RefreshCw} loading={loading} onClick={fetchVacations}>Aktualisieren</Button>}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Jahresurlaub {currentYear}</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalVacationDays + carryover} Tage</p>
                    {carryover > 0 && <p className="text-xs text-gray-400">davon {carryover} aus {currentYear - 1}</p>}
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Genutzt / Geplant</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{usedDays} Tage</p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Verbleibend</p>
                    <p className={cn('text-2xl font-bold', remainingDays > 0 ? 'text-gray-900 dark:text-white' : 'text-red-600 dark:text-red-400')}>
                        {remainingDays} Tage
                    </p>
                </div>
            </div>

            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
                <h2 className="text-xl font-bold mb-6 text-gray-900 dark:text-white">Urlaubszeiträume</h2>

                {loading ? (
                    <div className="flex items-center justify-center py-10">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                    </div>
                ) : absences.length === 0 ? (
                    <div className="text-center py-10 text-gray-500 dark:text-gray-400">
                        Keine Urlaube gefunden.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {absences.map(a => {
                            const calculatedDays = getVacationDaysToDeduct(parseISO(a.start_date), parseISO(a.end_date), profile ?? undefined);
                            const displayDays = a.used_days ?? calculatedDays;
                            const deduct = a.deduct_vacation_days ?? true;
                            const busy = savingId === a.id;
                            const isEditing = editingDaysId === a.id;
                            
                            return (
                                <div
                                    key={a.id}
                                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-gray-900 dark:text-white">
                                                {format(parseISO(a.start_date), 'dd.MM.yyyy', { locale: de })} – {format(parseISO(a.end_date), 'dd.MM.yyyy', { locale: de })}
                                            </span>
                                            <span className={cn('px-2.5 py-1 rounded-full text-xs font-bold', statusBadge(a.status))}>
                                                {a.status === 'approved' ? 'Genehmigt' : a.status === 'pending' ? 'Offen' : 'Abgelehnt'}
                                            </span>
                                            
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

