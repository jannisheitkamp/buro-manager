import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { History, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Button, Card, CardHeader, EmptyState } from '@/components/ui';
import type { Profile } from '@/types';

type Entry = { id: number; created_at: string; actor: string | null; table_name: string; row_id: string | null; action: string; changes: Record<string, unknown> | null };

const TABLES: Record<string, string> = {
  absences: 'Abwesenheit',
  profiles: 'Profil',
  vacation_carryover: 'Urlaubsübertrag',
  production_lv_snapshots: 'Lebenswerte-Stand',
};
const ACTIONS: Record<string, string> = { insert: 'angelegt', update: 'geändert', delete: 'gelöscht' };
const FIELDS: Record<string, string> = {
  status: 'Status',
  type: 'Art',
  start_date: 'Von',
  end_date: 'Bis',
  used_days: 'Tage',
  deduct_vacation_days: 'Abzug',
  roles: 'Rollen',
  is_approved: 'Freigeschaltet',
  total_vacation_days: 'Jahresurlaub',
  full_name: 'Name',
  days: 'Tage',
  year: 'Jahr',
  month: 'Monat',
  ytd_lv: 'Lebenswerte',
};
const VALUES: Record<string, string> = {
  pending: 'offen',
  approved: 'genehmigt',
  rejected: 'abgelehnt',
  vacation: 'Urlaub',
  sick_leave: 'Krank',
  seminar: 'Seminar',
  school: 'Berufsschule',
  other: 'Sonstiges',
  true: 'ja',
  false: 'nein',
};

const show = (v: unknown) => {
  if (v === null || v === undefined) return '–';
  if (Array.isArray(v)) return v.join(', ');
  const s = String(v);
  return VALUES[s] ?? s;
};

/** Wer hat wann was geändert (Abwesenheiten, Rollen, Urlaub, Lebenswerte-Stand). Nur für Admins sichtbar. */
export const AuditLog = ({ users }: { users: Profile[] }) => {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const name = (id?: string | null) => (id ? users.find((u) => u.id === id)?.full_name || 'Unbekannt' : 'System');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(100);
    setEntries((data || []) as Entry[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const describe = (e: Entry) => {
    const c = e.changes || {};
    const target = e.table_name === 'profiles' ? e.row_id : (c.user_id as string | { neu?: string } | undefined);
    const targetId = typeof target === 'object' && target ? target.neu : target;
    const details = Object.entries(c)
      .filter(([k]) => k !== 'user_id')
      .map(([k, v]) => {
        const label = FIELDS[k] || k;
        if (e.action === 'update' && v && typeof v === 'object' && 'neu' in (v as object)) {
          const d = v as { alt: unknown; neu: unknown };
          return `${label}: ${show(d.alt)} → ${show(d.neu)}`;
        }
        return `${label}: ${show(v)}`;
      });
    return { who: name(targetId as string | undefined), details };
  };

  return (
    <Card>
      <CardHeader
        title="Änderungsprotokoll"
        icon={History}
        description="Die letzten 100 Änderungen an Abwesenheiten, Rollen, Urlaubskonten und Lebenswerte-Ständen."
        action={<Button size="sm" variant="ghost" icon={RefreshCw} loading={loading} onClick={load}>Aktualisieren</Button>}
      />
      {entries.length === 0 && !loading ? (
        <EmptyState icon={History} title="Noch keine Einträge" />
      ) : (
        <ul className="-mx-5 divide-y divide-gray-100 text-sm dark:divide-gray-700 sm:-mx-6">
          {entries.map((e) => {
            const d = describe(e);
            return (
              <li key={e.id} className="flex flex-col gap-0.5 px-5 py-2.5 sm:flex-row sm:items-baseline sm:gap-4 sm:px-6">
                <span className="tabular shrink-0 text-xs text-gray-400 sm:w-28">{format(new Date(e.created_at), 'dd.MM.yy HH:mm')}</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-gray-900 dark:text-white">{name(e.actor)}</span>
                  <span className="text-gray-500">
                    {' '}
                    · {TABLES[e.table_name] || e.table_name} von {d.who} {ACTIONS[e.action] || e.action}
                  </span>
                  {d.details.length > 0 && <span className="block truncate text-xs text-gray-500">{d.details.join(' · ')}</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
};
