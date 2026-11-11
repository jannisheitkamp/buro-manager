import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, startOfWeek } from 'date-fns';
import { isHoliday } from '@/utils/dateUtils';
import { supabase } from '@/lib/supabase';

/* ------------------------------------------------------------------ */
/* Typen                                                               */
/* ------------------------------------------------------------------ */

export type ReceptionRule = { weekday: number; persons: string[]; rotation_start: string };
export type ReceptionOverride = { day: string; person: string; user_id: string | null; note: string | null };
export type ReceptionSwap = {
  id: string;
  day: string;
  from_user: string;
  to_user: string;
  note: string | null;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
};

export type PlanProfile = { id: string; full_name: string | null; avatar_url?: string | null; roles?: string[] | null };

/* ------------------------------------------------------------------ */
/* Fallback: bisheriger fester Plan (falls die Tabellen noch fehlen)   */
/* ------------------------------------------------------------------ */

export const DEFAULT_RULES: ReceptionRule[] = [
  { weekday: 1, persons: ['Jannis', 'Flori'], rotation_start: '2026-08-31' },
  { weekday: 2, persons: ['Lucas'], rotation_start: '2026-08-31' },
  { weekday: 3, persons: ['Flori'], rotation_start: '2026-08-31' },
  { weekday: 4, persons: ['Jannis'], rotation_start: '2026-08-31' },
  { weekday: 5, persons: ['Lucas'], rotation_start: '2026-08-31' },
];

export const WEEKDAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
export const isOfficeClosed = (d: Date) => isWeekend(d) || isHoliday(d);
export const dayKey = (d: Date) => format(d, 'yyyy-MM-dd');

/** Wer laut Wochenplan (ohne Abweichungen) an diesem Tag dran ist */
export const planAssignee = (day: Date, rules: ReceptionRule[] = DEFAULT_RULES): string | null => {
  if (isOfficeClosed(day)) return null;
  const rule = rules.find((r) => r.weekday === day.getDay());
  if (!rule || rule.persons.length === 0) return null;
  if (rule.persons.length === 1) return rule.persons[0];
  const [y, m, d] = rule.rotation_start.split('-').map(Number);
  const ref = startOfWeek(new Date(y, m - 1, d), { weekStartsOn: 1 });
  const weeks = Math.round((startOfWeek(day, { weekStartsOn: 1 }).getTime() - ref.getTime()) / WEEK_MS);
  const n = rule.persons.length;
  return rule.persons[((weeks % n) + n) % n];
};

/**
 * Gehört ein Profil zu einem Namen aus dem Plan?
 * Zuerst über das Rollen-Kürzel (z. B. "flori" bei Florent), sonst über den Vornamen.
 */
export const matchesPerson = (profile: { full_name?: string | null; roles?: string[] | null } | null | undefined, person: string) => {
  if (!profile) return false;
  const p = person.toLowerCase();
  if (profile.roles?.some((r) => r.toLowerCase() === p)) return true;
  return !!profile.full_name && profile.full_name.toLowerCase().split(/[\s.]+/).includes(p);
};

/** Abwärtskompatibel für einfache Aufrufer ohne geladene Daten */
export const getReceptionAssignee = (day: Date) => planAssignee(day);

/* ------------------------------------------------------------------ */
/* Hook: Plan, Abweichungen und Tauschanfragen aus der Datenbank       */
/* ------------------------------------------------------------------ */

export const useReceptionPlan = () => {
  const [rules, setRules] = useState<ReceptionRule[]>(DEFAULT_RULES);
  const [overrides, setOverrides] = useState<ReceptionOverride[]>([]);
  const [swaps, setSwaps] = useState<ReceptionSwap[]>([]);
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const since = format(new Date(Date.now() - 62 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
    const [r, o, s] = await Promise.all([
      supabase.from('reception_rules').select('weekday, persons, rotation_start').order('weekday'),
      supabase.from('reception_overrides').select('day, person, user_id, note').gte('day', since),
      supabase.from('reception_swaps').select('*').gte('day', since).order('created_at', { ascending: false }),
    ]);
    // Tabellen fehlen noch (Migration nicht eingespielt): fester Plan bleibt
    if (r.error) {
      setAvailable(false);
      setLoading(false);
      return;
    }
    setAvailable(true);
    if (r.data && r.data.length > 0) setRules(r.data as ReceptionRule[]);
    setOverrides((o.data as ReceptionOverride[]) || []);
    setSwaps((s.data as ReceptionSwap[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    reload();
    const channel = supabase
      .channel(`reception-plan-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reception_rules' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reception_overrides' }, reload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reception_swaps' }, reload)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [reload]);

  const overrideMap = useMemo(() => new Map(overrides.map((o) => [o.day, o])), [overrides]);

  /** Tatsächlich eingeteilte Person (Abweichung vor Wochenplan) */
  const assigneeFor = useCallback(
    (day: Date): { person: string; userId: string | null; override?: ReceptionOverride } | null => {
      if (isOfficeClosed(day)) return null;
      const o = overrideMap.get(dayKey(day));
      if (o) return { person: o.person, userId: o.user_id, override: o };
      const person = planAssignee(day, rules);
      return person ? { person, userId: null } : null;
    },
    [overrideMap, rules],
  );

  return { rules, overrides, swaps, available, loading, reload, assigneeFor };
};
