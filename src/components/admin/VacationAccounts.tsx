import { useCallback, useEffect, useState } from 'react';
import { Palmtree, ArrowRightLeft } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { vacationDaysUsedInYear } from '@/lib/vacation';
import { Avatar, Button, Card, CardHeader } from '@/components/ui';
import { ConfirmModal } from '@/components/ConfirmModal';
import type { Absence, Profile } from '@/types';

type Row = Pick<Absence, 'user_id' | 'type' | 'status' | 'start_date' | 'end_date' | 'deduct_vacation_days' | 'used_days'>;

const fmt = (n: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(n);

/** Urlaubskonten aller Personen: Anspruch, Übertrag, genommen, beantragt, Rest. Nur für Admins. */
export const VacationAccounts = ({ users, onChanged }: { users: Profile[]; onChanged?: () => void }) => {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [absences, setAbsences] = useState<Row[]>([]);
  const [carry, setCarry] = useState<Record<string, number>>({});
  const [prevCarry, setPrevCarry] = useState<Record<string, number>>({});
  const [confirmCarry, setConfirmCarry] = useState(false);
  const [busy, setBusy] = useState(false);

  const people = users.filter((u) => u.is_approved !== false);

  const load = useCallback(async () => {
    const [abs, c, pc] = await Promise.all([
      supabase
        .from('absences')
        .select('user_id, type, status, start_date, end_date, deduct_vacation_days, used_days')
        .eq('type', 'vacation')
        .gte('end_date', `${year - 1}-01-01`)
        .lte('start_date', `${year}-12-31`),
      supabase.from('vacation_carryover').select('user_id, days').eq('year', year),
      supabase.from('vacation_carryover').select('user_id, days').eq('year', year - 1),
    ]);
    setAbsences((abs.data || []) as Row[]);
    setCarry(Object.fromEntries((c.data || []).map((r) => [r.user_id, Number(r.days)])));
    setPrevCarry(Object.fromEntries((pc.data || []).map((r) => [r.user_id, Number(r.days)])));
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const account = (u: Profile, y: number, carryover: number) => {
    const own = absences.filter((a) => a.user_id === u.id);
    const taken = vacationDaysUsedInYear(own.filter((a) => a.status === 'approved'), y, u);
    const requested = vacationDaysUsedInYear(own.filter((a) => a.status === 'pending'), y, u);
    const total = (u.total_vacation_days ?? 30) + carryover;
    return { total, taken, requested, rest: total - taken - requested };
  };

  const saveEntitlement = async (u: Profile, value: string) => {
    const days = Number(value);
    if (!Number.isFinite(days) || days < 0 || days > 60 || days === (u.total_vacation_days ?? 30)) return;
    const { error } = await supabase.from('profiles').update({ total_vacation_days: days }).eq('id', u.id);
    if (error) toast.error('Anspruch konnte nicht gespeichert werden.');
    else {
      toast.success(`Jahresurlaub für ${u.full_name}: ${days} Tage`);
      onChanged?.();
    }
  };

  const saveCarry = async (userId: string, value: string) => {
    const days = Number(value.replace(',', '.'));
    if (!Number.isFinite(days) || days < 0 || days > 100 || days === (carry[userId] || 0)) return;
    const { error } = await supabase.from('vacation_carryover').upsert({ user_id: userId, year, days, updated_at: new Date().toISOString() });
    if (error) toast.error('Übertrag konnte nicht gespeichert werden.');
    else {
      setCarry((c) => ({ ...c, [userId]: days }));
      toast.success('Übertrag gespeichert');
    }
  };

  // Rest aus dem Vorjahr (genehmigt und beantragt abgezogen) als Übertrag ins gewählte Jahr
  const carryAll = async () => {
    setBusy(true);
    const rows = people.map((u) => ({
      user_id: u.id,
      year,
      days: Math.max(0, account(u, year - 1, prevCarry[u.id] || 0).rest),
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('vacation_carryover').upsert(rows);
    setBusy(false);
    if (error) toast.error('Übertrag fehlgeschlagen.');
    else {
      toast.success(`Resturlaub aus ${year - 1} übertragen`);
      load();
    }
  };

  return (
    <Card>
      <CardHeader
        title="Urlaubskonten"
        icon={Palmtree}
        description="Anspruch und Übertrag hier ändern. Genommen = genehmigt, beantragt = noch offen."
        action={
          <div className="flex items-center gap-2">
            <select aria-label="Jahr" value={year} onChange={(e) => setYear(Number(e.target.value))} className="input w-auto py-1.5 text-sm">
              {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
            <Button size="sm" variant="secondary" icon={ArrowRightLeft} loading={busy} onClick={() => setConfirmCarry(true)}>
              Rest aus {year - 1} übertragen
            </Button>
          </div>
        }
      />
      <div className="-mx-5 overflow-x-auto sm:-mx-6">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="text-xs text-gray-500">
            <tr className="border-b border-gray-100 dark:border-gray-700">
              <th className="px-5 py-2 font-medium sm:px-6">Person</th>
              <th className="px-2 py-2 text-right font-medium">Anspruch</th>
              <th className="px-2 py-2 text-right font-medium">Übertrag</th>
              <th className="px-2 py-2 text-right font-medium">Genommen</th>
              <th className="px-2 py-2 text-right font-medium">Beantragt</th>
              <th className="px-5 py-2 text-right font-medium sm:px-6">Rest</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {people.map((u) => {
              const a = account(u, year, carry[u.id] || 0);
              return (
                <tr key={`${u.id}-${year}`}>
                  <td className="px-5 py-2 sm:px-6">
                    <span className="flex items-center gap-2">
                      <Avatar name={u.full_name} src={u.avatar_url} size="sm" />
                      <span className="font-medium text-gray-900 dark:text-white">{u.full_name}</span>
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      max={60}
                      aria-label={`Jahresurlaub ${u.full_name}`}
                      defaultValue={u.total_vacation_days ?? 30}
                      onBlur={(e) => saveEntitlement(u, e.target.value)}
                      className="input tabular w-16 py-1 text-right"
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      aria-label={`Übertrag ${u.full_name}`}
                      defaultValue={carry[u.id] || 0}
                      key={`c-${u.id}-${year}-${carry[u.id] || 0}`}
                      onBlur={(e) => saveCarry(u.id, e.target.value)}
                      className="input tabular w-16 py-1 text-right"
                    />
                  </td>
                  <td className="tabular px-2 py-2 text-right">{fmt(a.taken)}</td>
                  <td className="tabular px-2 py-2 text-right text-gray-500">{a.requested ? fmt(a.requested) : '–'}</td>
                  <td className={`tabular px-5 py-2 text-right font-semibold sm:px-6 ${a.rest < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                    {fmt(a.rest)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <ConfirmModal
        isOpen={confirmCarry}
        onClose={() => setConfirmCarry(false)}
        onConfirm={carryAll}
        title={`Resturlaub aus ${year - 1} übertragen?`}
        message={`Für alle Personen wird der Rest aus ${year - 1} (Anspruch + Übertrag − genehmigt − beantragt) als Übertrag für ${year} eingetragen. Vorhandene Überträge für ${year} werden überschrieben.`}
        confirmText="Übertragen"
      />
    </Card>
  );
};
