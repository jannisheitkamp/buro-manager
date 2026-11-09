import { useEffect, useMemo, useState } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { de } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getHolidayName } from '@/utils/dateUtils';
import { RECEPTION_WEEKDAYS, getReceptionAssignee, isOfficeClosed, matchesPerson } from '@/lib/reception';
import { Card, IconButton, PageHeader } from '@/components/ui';
import { cn } from '@/utils/cn';

type AbsenceRow = { start_date: string; end_date: string; type: string; profiles: { full_name: string | null } | null };

const WEEKDAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const PERSON_TONE: Record<string, string> = {
  Jannis: 'bg-brand-600',
  Flori: 'bg-amber-400',
  Lucas: 'bg-sky-500',
  Marcio: 'bg-rose-400',
};

export const Reception = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [absences, setAbsences] = useState<AbsenceRow[]>([]);

  const gridStart = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });

  useEffect(() => {
    let cancelled = false;
    supabase
      .from('absences')
      .select('start_date, end_date, type, profiles(full_name)')
      .in('status', ['pending', 'approved'])
      .gte('end_date', format(gridStart, 'yyyy-MM-dd'))
      .lte('start_date', format(gridEnd, 'yyyy-MM-dd'))
      .then(({ data, error }) => {
        if (!cancelled && !error) setAbsences((data as unknown as AbsenceRow[]) || []);
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

  const isAbsent = (d: Date, person: string) => {
    const key = format(d, 'yyyy-MM-dd');
    return absences.some((a) => matchesPerson(a.profiles?.full_name, person) && key >= a.start_date && key <= a.end_date);
  };

  const gaps = days.filter((d) => isSameMonth(d, currentDate) && !isOfficeClosed(d)).filter((d) => {
    const p = getReceptionAssignee(d);
    return p && isAbsent(d, p);
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Empfang" description="Wer sitzt wann am Empfang und übernimmt die Laufkundschaft. Fehlt jemand, ist der Tag markiert." />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <Card padded={false} className="overflow-hidden xl:col-span-3">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-gray-700 sm:px-6">
            <h2 className="text-base font-semibold capitalize text-gray-900 dark:text-white">{format(currentDate, 'MMMM yyyy', { locale: de })}</h2>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setCurrentDate(new Date())} className="btn-ghost btn-sm">
                Heute
              </button>
              <IconButton icon={ChevronLeft} label="Vorheriger Monat" onClick={() => setCurrentDate(subMonths(currentDate, 1))} />
              <IconButton icon={ChevronRight} label="Nächster Monat" onClick={() => setCurrentDate(addMonths(currentDate, 1))} />
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-gray-100 text-center text-xs font-medium text-gray-500 dark:border-gray-700">
            {WEEKDAY_LABELS.map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 [&>*:nth-child(7n)]:border-r-0">
            {days.map((day) => {
              const inMonth = isSameMonth(day, currentDate);
              const today = isSameDay(day, new Date());
              const closed = isOfficeClosed(day);
              const holiday = getHolidayName(day);
              const person = getReceptionAssignee(day);
              const absent = !!person && isAbsent(day, person);
              return (
                <div
                  key={day.toISOString()}
                  className={cn(
                    'min-h-[5.5rem] border-b border-r border-gray-100 p-2 dark:border-gray-700/70 sm:p-2.5',
                    !inMonth && 'bg-gray-50/70 text-gray-400 dark:bg-gray-900/30',
                    closed && inMonth && 'bg-gray-50/70 dark:bg-gray-900/30',
                    absent && inMonth && 'bg-red-50/70 dark:bg-red-950/30',
                  )}
                >
                  <span
                    className={cn(
                      'tabular inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs',
                      today ? 'bg-brand-600 font-semibold text-white' : 'text-gray-500 dark:text-gray-400',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {inMonth && (
                    <div className="mt-1.5">
                      {holiday ? (
                        <p className="truncate text-2xs text-gray-400">{holiday}</p>
                      ) : person ? (
                        <p className={cn('flex items-center gap-1.5 text-xs font-medium sm:text-sm', absent ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-white')}>
                          <span className={cn('hidden h-2 w-2 shrink-0 rounded-full sm:inline-block', PERSON_TONE[person])} />
                          <span className="truncate">{person}</span>
                          {absent && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-label="abwesend" />}
                        </p>
                      ) : null}
                      {absent && <p className="mt-0.5 hidden text-2xs text-red-600 dark:text-red-400 sm:block">Vertretung nötig</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-4 text-base font-semibold text-gray-900 dark:text-white">Wochenplan</h2>
            <dl className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-gray-500">Montag</dt>
                <dd className="text-right font-medium text-gray-900 dark:text-white">Jannis und Flori im Wechsel</dd>
              </div>
              {[2, 3, 4, 5].map((dow) => (
                <div key={dow} className="flex items-center justify-between gap-3">
                  <dt className="text-gray-500">{['', '', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'][dow]}</dt>
                  <dd className="flex items-center gap-2 font-medium text-gray-900 dark:text-white">
                    <span className={cn('h-2 w-2 rounded-full', PERSON_TONE[RECEPTION_WEEKDAYS[dow]])} />
                    {RECEPTION_WEEKDAYS[dow]}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500 dark:border-gray-700">
              Die eingeteilte Person übernimmt auch die Laufkundschaft. Änderungen am Plan bitte an die Büroleitung.
            </p>
          </Card>

          <Card>
            <h2 className="mb-1 text-base font-semibold text-gray-900 dark:text-white">Vertretung nötig</h2>
            <p className="mb-3 text-xs text-gray-500">Tage im {format(currentDate, 'MMMM', { locale: de })}, an denen die eingeteilte Person abwesend ist.</p>
            {gaps.length === 0 ? (
              <p className="text-sm text-gray-500">Keine Lücken in diesem Monat.</p>
            ) : (
              <ul className="space-y-2">
                {gaps.map((d) => (
                  <li key={d.toISOString()} className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm dark:bg-red-950/30">
                    <span className="text-red-800 dark:text-red-200">{format(d, 'EEE, d. MMM', { locale: de })}</span>
                    <span className="font-medium text-red-800 dark:text-red-200">{getReceptionAssignee(d)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};
