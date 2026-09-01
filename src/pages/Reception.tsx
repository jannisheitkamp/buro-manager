import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { motion } from 'framer-motion';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, Download, Upload, Users, AlertTriangle } from 'lucide-react';
import { cn } from '@/utils/cn';
import { toast } from 'react-hot-toast';
import { getHolidays } from '@/utils/dateUtils';
import { extractPdfText } from '@/utils/extractPdfText';

type ReceptionPerson = 'Flori' | 'Lucas' | 'Jannis' | 'Marcio';

const STORAGE_BUCKET = 'documents';
const STORAGE_PATH = 'office/empfangsplan.pdf';

const PERSONS: ReceptionPerson[] = ['Flori', 'Lucas', 'Jannis', 'Marcio'];

const DEFAULT_WEEKDAY_MAP: Record<number, ReceptionPerson> = {
    1: 'Jannis',
    2: 'Lucas',
    3: 'Flori',
    4: 'Jannis',
    5: 'Lucas'
};

const localStorageKey = (k: string) => `reception:${k}`;

export const Reception = () => {
    const { user } = useStore();
    const [currentDate, setCurrentDate] = useState(new Date());
    const [weekdayMap, setWeekdayMap] = useState<Record<number, ReceptionPerson>>(() => {
        const raw = localStorage.getItem(localStorageKey('weekday_map'));
        // If there's saved map, check if it's the old default and replace it
        if (raw) {
             try {
                 const parsed = JSON.parse(raw);
                 if (parsed[1] === 'Lucas' && parsed[2] === 'Marcio') {
                     // Clear old map and return new default
                     localStorage.removeItem(localStorageKey('weekday_map'));
                     return DEFAULT_WEEKDAY_MAP;
                 }
             } catch (e) {}
        }
        
        if (!raw) return DEFAULT_WEEKDAY_MAP;
        try {
            const parsed = JSON.parse(raw) as Record<string, ReceptionPerson>;
            const out: Record<number, ReceptionPerson> = { ...DEFAULT_WEEKDAY_MAP };
            Object.keys(parsed || {}).forEach(k => {
                const n = Number(k);
                const v = parsed[k];
                if (Number.isFinite(n) && n >= 1 && n <= 5 && PERSONS.includes(v)) {
                    out[n] = v;
                }
            });
            return out;
        } catch {
            return DEFAULT_WEEKDAY_MAP;
        }
    });
    const [uploading, setUploading] = useState(false);

    useEffect(() => {
        localStorage.setItem(localStorageKey('weekday_map'), JSON.stringify(weekdayMap));
    }, [weekdayMap]);

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
        const dow = day.getDay();
        
        // Special logic for Mondays (alternating between Jannis and Flori)
        // Reference date: 2026-08-31 is Jannis
        if (dow === 1) {
            // Calculate weeks since the reference date
            const refDate = new Date('2026-08-31T00:00:00Z'); // Start date with Jannis
            const currentMonday = startOfWeek(day, { weekStartsOn: 1 });
            const diffTime = currentMonday.getTime() - refDate.getTime();
            const diffWeeks = Math.round(diffTime / (1000 * 60 * 60 * 24 * 7));
            
            // diffWeeks = 0 -> Jannis, 1 -> Flori, 2 -> Jannis, etc.
            return diffWeeks % 2 === 0 ? 'Jannis' : 'Flori';
        }
        
        return weekdayMap[dow] || null;
    };

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [absences, setAbsences] = useState<any[]>([]);

    useEffect(() => {
        const fetchAbsences = async () => {
            const startStr = format(gridStart, 'yyyy-MM-dd');
            const endStr = format(gridEnd, 'yyyy-MM-dd');

            const { data, error } = await supabase
                .from('absences')
                .select('start_date, end_date, status, profiles(full_name)')
                .in('status', ['pending', 'approved'])
                .gte('end_date', startStr)
                .lte('start_date', endStr);

            if (!error && data) {
                setAbsences(data);
            }
        };
        fetchAbsences();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gridStart.getTime(), gridEnd.getTime()]);

    const isAbsent = (d: Date, personName: string) => {
        const dStr = format(d, 'yyyy-MM-dd');
        return absences.some(a => {
            const matchName = a.profiles?.full_name?.toLowerCase().includes(personName.toLowerCase());
            if (!matchName) return false;
            return dStr >= a.start_date && dStr <= a.end_date;
        });
    };

    const days = useMemo(() => {
        const out: Date[] = [];
        let d = gridStart;
        while (d <= gridEnd) {
            out.push(d);
            d = addDays(d, 1);
        }
        return out;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gridStart.getTime(), gridEnd.getTime()]);

    return (
        <div className="max-w-7xl mx-auto space-y-8 pb-20">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
                            <Users className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        Empfang & Laufkundschaft
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-2 ml-1">
                        Fester Wochenplan (Mo–Fr). Die eingeteilte Person übernimmt auch die Laufkundschaft.
                    </p>
                </motion.div>
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

                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                        {[
                            { key: 1, label: 'Mo (Start 31.08)' },
                            { key: 2, label: 'Di' },
                            { key: 3, label: 'Mi' },
                            { key: 4, label: 'Do' },
                            { key: 5, label: 'Fr' }
                        ].map(wd => (
                            <div key={wd.key}>
                                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{wd.label}</label>
                                <select
                                    value={wd.key === 1 ? 'Jannis / Flori' : weekdayMap[wd.key]}
                                    disabled={wd.key === 1}
                                    onChange={e => setWeekdayMap(prev => ({ ...prev, [wd.key]: e.target.value as ReceptionPerson }))}
                                    className="w-full rounded-xl bg-gray-50 dark:bg-gray-900 border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500/20 px-4 py-2.5 text-sm transition-all disabled:opacity-50"
                                >
                                    {wd.key === 1 ? (
                                        <option value="Jannis / Flori">Wechselnd</option>
                                    ) : PERSONS.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                            </div>
                        ))}
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
                        const absent = assignee && !closed ? isAbsent(day, assignee) : false;

                        return (
                            <div
                                key={day.toISOString()}
                                className={cn(
                                    "rounded-2xl border p-3 min-h-[86px] transition-colors relative overflow-hidden",
                                    inMonth ? "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700" : "bg-gray-50 dark:bg-gray-900/40 border-transparent opacity-60",
                                    today ? "ring-2 ring-indigo-500/50" : "",
                                    absent ? "bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30" : ""
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

                                <div className="mt-3 space-y-1">
                                    <div className={cn(
                                        "text-[11px] font-bold truncate flex items-center gap-1.5",
                                        closed ? "text-gray-400 dark:text-gray-500" : (absent ? "text-red-600 dark:text-red-400" : "text-gray-900 dark:text-white")
                                    )}>
                                        {closed ? 'Geschlossen' : `Empfang: ${assignee || '-'}`}
                                        {absent && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                                    </div>

                                    {!closed && (
                                        <div className={cn(
                                            "text-[11px] font-bold truncate flex items-center gap-1.5",
                                            absent ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"
                                        )}>
                                            {`Laufkundschaft: ${assignee || '-'}`}
                                            {absent && <AlertTriangle className="w-3.5 h-3.5 text-red-500" />}
                                        </div>
                                    )}

                                    {absent && !closed && (
                                        <div className="text-[10px] font-semibold text-red-500 mt-1 truncate">
                                            Vertretung nötig!
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
