import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { Absence } from '@/types';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { Palmtree, Check, X, RefreshCw } from 'lucide-react';
import { cn } from '@/utils/cn';
import { toast } from 'react-hot-toast';
import { getWorkingDays } from '@/utils/dateUtils';

export const Vacation = () => {
    const { user, profile } = useStore();
    const [absences, setAbsences] = useState<Absence[]>([]);
    const [loading, setLoading] = useState(true);
    const [savingId, setSavingId] = useState<string | null>(null);

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
        fetchVacations();
        const subscription = supabase
            .channel('vacation_absences')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'absences' }, () => {
                fetchVacations();
            })
            .subscribe();

        return () => {
            subscription.unsubscribe();
        };
    }, [user?.id]);

    const currentYear = new Date().getFullYear();
    const totalVacationDays = profile?.total_vacation_days ?? 30;

    const { usedDays, remainingDays } = useMemo(() => {
        const used = absences
            .filter(a => a.status !== 'rejected')
            .filter(a => a.deduct_vacation_days ?? true)
            .reduce((sum, a) => {
                let start = parseISO(a.start_date);
                let end = parseISO(a.end_date);
                if (start.getFullYear() < currentYear) start = new Date(currentYear, 0, 1);
                if (end.getFullYear() > currentYear) end = new Date(currentYear, 11, 31);
                if (start.getFullYear() !== currentYear && end.getFullYear() !== currentYear) return sum;
                return sum + getWorkingDays(start, end);
            }, 0);
        return { usedDays: used, remainingDays: Math.max(0, totalVacationDays - used) };
    }, [absences, currentYear, totalVacationDays]);

    const toggleDeduct = async (absence: Absence) => {
        if (!user) return;
        const next = !(absence.deduct_vacation_days ?? true);
        setSavingId(absence.id);
        try {
            const { error } = await supabase
                .from('absences')
                .update({ deduct_vacation_days: next })
                .eq('id', absence.id);

            if (error) throw error;

            setAbsences(prev => prev.map(a => (a.id === absence.id ? { ...a, deduct_vacation_days: next } : a)));
            toast.success(next ? 'Urlaubstage werden abgezogen.' : 'Urlaubstage werden nicht abgezogen.');
        } catch (e) {
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

    const statusBadge = (status: Absence['status']) => {
        if (status === 'approved') return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
        if (status === 'pending') return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
        return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-20">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
                            <Palmtree className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        Urlaubskonto
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2 ml-1">
                        Übersicht deiner Urlaubszeiträume und ob sie vom Urlaubskonto abgezogen werden.
                    </p>
                </motion.div>

                <motion.button
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    onClick={fetchVacations}
                    className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 px-5 py-3 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-sm border border-gray-200 dark:border-gray-700"
                >
                    <RefreshCw className={cn('w-5 h-5', loading ? 'animate-spin' : '')} />
                    <span className="font-semibold">Aktualisieren</span>
                </motion.button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">Jahresurlaub {currentYear}</p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalVacationDays} Tage</p>
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

            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6 sm:p-8">
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
                            const days = getWorkingDays(a.start_date, a.end_date);
                            const deduct = a.deduct_vacation_days ?? true;
                            const busy = savingId === a.id;
                            return (
                                <div
                                    key={a.id}
                                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800"
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-gray-900 dark:text-white">
                                                {format(parseISO(a.start_date), 'dd.MM.yyyy', { locale: de })} – {format(parseISO(a.end_date), 'dd.MM.yyyy', { locale: de })}
                                            </span>
                                            <span className={cn('px-2.5 py-1 rounded-full text-xs font-bold', statusBadge(a.status))}>
                                                {a.status === 'approved' ? 'Genehmigt' : a.status === 'pending' ? 'Offen' : 'Abgelehnt'}
                                            </span>
                                            <span className="text-xs font-bold text-gray-500 dark:text-gray-400">
                                                {days} Arbeitstage
                                            </span>
                                        </div>
                                        {a.note && (
                                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                                                {a.note}
                                            </div>
                                        )}
                                    </div>

                                    <button
                                        type="button"
                                        disabled={busy}
                                        onClick={() => toggleDeduct(a)}
                                        className={cn(
                                            'shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold border transition-colors',
                                            deduct
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-900/30'
                                                : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100 dark:bg-gray-700/40 dark:text-gray-200 dark:border-gray-700',
                                            busy ? 'opacity-70 cursor-not-allowed' : ''
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

