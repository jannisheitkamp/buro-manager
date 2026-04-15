import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { motion } from 'framer-motion';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, parseISO, startOfDay, addMonths, subMonths } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Download, Upload, Users } from 'lucide-react';
import { cn } from '@/utils/cn';
import { toast } from 'react-hot-toast';
import { getHolidays } from '@/utils/dateUtils';

type ReceptionPerson = 'Florent' | 'Lucas' | 'Jannis';

const STORAGE_BUCKET = 'documents';
const STORAGE_PATH = 'office/empfangsplan.pdf';

const PERSONS: ReceptionPerson[] = ['Florent', 'Lucas', 'Jannis'];
const DEFAULT_ROTATION_START = '2026-01-05'; // Montag
const DEFAULT_START_PERSON: ReceptionPerson = 'Florent';

const localStorageKey = (k: string) => `reception:${k}`;

export const Reception = () => {
    const { user } = useStore();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [rotationStart, setRotationStart] = useState<string>(() => localStorage.getItem(localStorageKey('start')) || DEFAULT_ROTATION_START);
    const [startPerson, setStartPerson] = useState<ReceptionPerson>(() => (localStorage.getItem(localStorageKey('person')) as ReceptionPerson) || DEFAULT_START_PERSON);
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        localStorage.setItem(localStorageKey('start'), rotationStart);
    }, [rotationStart]);

    useEffect(() => {
        localStorage.setItem(localStorageKey('person'), startPerson);
    }, [startPerson]);

    const holidays = useMemo(() => {
        const year = currentDate.getFullYear();
        const years = [year - 1, year, year + 1];
        return years.flatMap(y => getHolidays(y));
    }, [currentDate]);

    const isHoliday = (d: Date) => {
        return holidays.some(h => h.getFullYear() === d.getFullYear() && h.getMonth() === d.getMonth() && h.getDate() === d.getDate());
    };

    const isWeekend = (d: Date) => {
        const day = d.getDay();
        return day === 0 || day === 6;
    };

    const getAssignee = (day: Date): ReceptionPerson | null => {
        if (isWeekend(day) || isHoliday(day)) return null;

        const base = startOfWeek(parseISO(rotationStart), { weekStartsOn: 1 });
        const current = startOfWeek(day, { weekStartsOn: 1 });
        const diffWeeks = Math.floor((startOfDay(current).getTime() - startOfDay(base).getTime()) / (1000 * 60 * 60 * 24 * 7));

        const baseIdx = PERSONS.indexOf(startPerson);
        const idx = ((baseIdx + diffWeeks) % PERSONS.length + PERSONS.length) % PERSONS.length;
        return PERSONS[idx];
    };

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    const days = useMemo(() => {
        const out: Date[] = [];
        let d = gridStart;
        while (d <= gridEnd) {
            out.push(d);
            d = addDays(d, 1);
        }
        return out;
    }, [gridStart.getTime(), gridEnd.getTime()]);

    const openPdf = () => {
        const { data } = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(STORAGE_PATH);
        if (!data?.publicUrl) {
            toast.error('PDF konnte nicht geöffnet werden.');
            return;
        }
        window.open(data.publicUrl, '_blank');
    };

    const handleUpload = async (file: File) => {
        if (!user) return;
        setUploading(true);
        try {
            const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(STORAGE_PATH, file, { upsert: true });
            if (error) throw error;
            toast.success('Empfangsplan PDF hochgeladen.');
        } catch (e) {
            const msg = (e as Error)?.message || 'Unbekannter Fehler';
            toast.error(`Upload fehlgeschlagen: ${msg}`);
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-20">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
                            <Users className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        Empfangsplan
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2 ml-1">
                        Automatische Wochenrotation (Florent, Lucas, Jannis). Wochenenden &amp; Feiertage werden ignoriert.
                    </p>
                </motion.div>

                <div className="flex flex-col sm:flex-row gap-3">
                    <button
                        type="button"
                        onClick={openPdf}
                        className="bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 px-5 py-3 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-sm border border-gray-200 dark:border-gray-700"
                    >
                        <Download className="w-5 h-5" />
                        <span className="font-semibold">PDF öffnen</span>
                    </button>

                    <label className={cn(
                        "bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/30 cursor-pointer",
                        uploading ? "opacity-70 pointer-events-none" : ""
                    )}>
                        <Upload className="w-5 h-5" />
                        <span className="font-semibold">{uploading ? 'Lädt…' : 'PDF hochladen'}</span>
                        <input
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUpload(f);
                                e.currentTarget.value = '';
                            }}
                        />
                    </label>
                </div>
            </div>

            <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-gray-700/50 p-6 sm:p-8 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
                            title="Vorheriger Monat"
                        >
                            <ChevronLeft className="w-5 h-5" />
                        </button>
                        <div className="font-bold text-gray-900 dark:text-white text-lg">
                            {format(currentDate, 'MMMM yyyy', { locale: de })}
                        </div>
                        <button
                            type="button"
                            onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                            className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 transition-colors"
                            title="Nächster Monat"
                        >
                            <ChevronRight className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Rotation Start (Montag)</label>
                            <input
                                type="date"
                                value={rotationStart}
                                onChange={e => setRotationStart(e.target.value)}
                                className="w-full rounded-xl bg-gray-50 dark:bg-gray-900 border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-2.5 text-sm transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Start-Person</label>
                            <select
                                value={startPerson}
                                onChange={e => setStartPerson(e.target.value as ReceptionPerson)}
                                className="w-full rounded-xl bg-gray-50 dark:bg-gray-900 border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-2.5 text-sm transition-all"
                            >
                                {PERSONS.map(p => (
                                    <option key={p} value={p}>{p}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-7 gap-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                    {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(d => (
                        <div key={d} className="text-center py-2">{d}</div>
                    ))}
                </div>

                <div className="grid grid-cols-7 gap-2">
                    {days.map(day => {
                        const inMonth = isSameMonth(day, currentDate);
                        const today = isSameDay(day, new Date());
                        const closed = isWeekend(day) || isHoliday(day);
                        const assignee = getAssignee(day);

                        return (
                            <div
                                key={day.toISOString()}
                                className={cn(
                                    "rounded-2xl border p-3 min-h-[86px] transition-colors",
                                    inMonth ? "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700" : "bg-gray-50 dark:bg-gray-900/40 border-transparent opacity-60",
                                    today ? "ring-2 ring-indigo-500/50" : ""
                                )}
                            >
                                <div className="flex items-center justify-between">
                                    <div className={cn("text-xs font-bold", today ? "text-indigo-600 dark:text-indigo-400" : "text-gray-600 dark:text-gray-300")}>
                                        {format(day, 'd')}
                                    </div>
                                    {closed && (
                                        <div className="text-[10px] font-bold text-gray-400 dark:text-gray-500">
                                            {isHoliday(day) ? 'Feiertag' : 'WE'}
                                        </div>
                                    )}
                                </div>

                                <div className={cn(
                                    "mt-3 text-sm font-bold truncate",
                                    closed ? "text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-white"
                                )}>
                                    {closed ? 'Geschlossen' : assignee}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
