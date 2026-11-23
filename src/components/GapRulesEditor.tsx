import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { CONDITIONS, GAP_GROUP_LABELS, OCCUPATIONS, type ConditionId, type CustomerType, type GapRule } from '@/lib/gaps';
import { Modal } from '@/components/Modal';
import { Button } from '@/components/ui';
import { cn } from '@/utils/cn';

type Props = { isOpen: boolean; onClose: () => void; rules: GapRule[]; onChanged: () => void };

const numOrNull = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v))));

/** Admins legen fest, welche Absicherung zu welcher Lebenslage gehört */
export const GapRulesEditor = ({ isOpen, onClose, rules, onChanged }: Props) => {
  const [rows, setRows] = useState<GapRule[]>(rules);
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<CustomerType>('person');

  useEffect(() => {
    if (isOpen) {
      setRows(rules);
      setDirty(new Set());
    }
  }, [isOpen, rules]);

  const change = (id: string, patch: Partial<GapRule>) => {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setDirty((d) => new Set(d).add(id));
  };

  const add = async () => {
    const sort = Math.max(0, ...rows.map((r) => r.sort)) + 10;
    const { error } = await supabase.from('gap_rules').insert({ gap_group: 'phv', label: 'Neue Regel', customer_type: tab, condition: 'always', sort });
    if (error) return toast.error('Regel konnte nicht angelegt werden.');
    onChanged();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('gap_rules').delete().eq('id', id);
    if (error) return toast.error('Regel konnte nicht gelöscht werden.');
    onChanged();
  };

  const save = async () => {
    setSaving(true);
    for (const id of dirty) {
      const r = rows.find((x) => x.id === id);
      if (!r) continue;
      const { error } = await supabase
        .from('gap_rules')
        .update({ label: r.label.trim() || GAP_GROUP_LABELS[r.gap_group] || r.gap_group, gap_group: r.gap_group, condition: r.condition, min_age: r.min_age, max_age: r.max_age, occupations: r.occupations?.length ? r.occupations : null, active: r.active })
        .eq('id', id);
      if (error) {
        setSaving(false);
        return toast.error('Speichern fehlgeschlagen.');
      }
    }
    setSaving(false);
    toast.success('Lückenregeln gespeichert');
    onChanged();
    onClose();
  };

  const shown = rows.filter((r) => r.customer_type === tab).sort((a, b) => a.sort - b.sort);
  const conditions = CONDITIONS.filter((c) => (tab === 'company' ? ['always', 'employees'].includes(c.id) : c.id !== 'employees'));

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Lückenregeln"
      description="Wann fehlt einem Kunden eine Absicherung? Eine Lücke gilt als geschlossen, sobald ein Vertrag mit derselben Lückengruppe besteht."
      size="full"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button loading={saving} disabled={dirty.size === 0} onClick={save}>Speichern</Button>
        </>
      }
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-gray-700">
          {(['person', 'company'] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} className={cn('rounded-md px-3 py-1.5 text-sm font-medium', tab === t ? 'bg-brand-600 text-white' : 'text-gray-600 dark:text-gray-300')}>
              {t === 'person' ? 'Privatkunden' : 'Firmen'}
            </button>
          ))}
        </div>
        <Button size="sm" variant="secondary" icon={Plus} onClick={add}>Regel</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 [&>th]:pb-2 [&>th]:pr-2 [&>th]:font-medium">
              <th className="w-10">Aktiv</th>
              <th>Anzeige</th>
              <th>Lückengruppe</th>
              <th>Wenn</th>
              {tab === 'person' && <th className="w-36">Alter</th>}
              {tab === 'person' && <th>Nur bei Beruf</th>}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
            {shown.map((r) => (
              <tr key={r.id} className={cn('align-top [&>td]:py-2 [&>td]:pr-2', !r.active && 'opacity-50')}>
                <td><input type="checkbox" checked={r.active} onChange={(e) => change(r.id, { active: e.target.checked })} aria-label="Regel aktiv" className="mt-2 rounded" /></td>
                <td><input value={r.label} onChange={(e) => change(r.id, { label: e.target.value })} className="input h-9 py-0" aria-label="Anzeige" /></td>
                <td>
                  <select value={r.gap_group} onChange={(e) => change(r.id, { gap_group: e.target.value })} className="input h-9 py-0" aria-label="Lückengruppe">
                    {Object.entries(GAP_GROUP_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </td>
                <td>
                  <select value={r.condition} onChange={(e) => change(r.id, { condition: e.target.value as ConditionId })} className="input h-9 py-0" aria-label="Bedingung">
                    {conditions.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </td>
                {tab === 'person' && (
                  <td>
                    <div className="flex items-center gap-1">
                      <input inputMode="numeric" placeholder="ab" value={r.min_age ?? ''} onChange={(e) => change(r.id, { min_age: numOrNull(e.target.value) })} className="input h-9 w-14 px-2 py-0 text-center" aria-label="Mindestalter" />
                      <span className="text-gray-400">–</span>
                      <input inputMode="numeric" placeholder="bis" value={r.max_age ?? ''} onChange={(e) => change(r.id, { max_age: numOrNull(e.target.value) })} className="input h-9 w-14 px-2 py-0 text-center" aria-label="Höchstalter" />
                    </div>
                  </td>
                )}
                {tab === 'person' && (
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {OCCUPATIONS.map((o) => {
                        const on = !!r.occupations?.includes(o.id);
                        return (
                          <button
                            key={o.id}
                            type="button"
                            aria-pressed={on}
                            onClick={() => change(r.id, { occupations: on ? (r.occupations || []).filter((x) => x !== o.id) : [...(r.occupations || []), o.id] })}
                            className={cn('rounded-md border px-1.5 py-0.5 text-2xs', on ? 'border-brand-500 bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100' : 'border-gray-200 text-gray-500 dark:border-gray-700')}
                          >
                            {o.label}
                          </button>
                        );
                      })}
                    </div>
                    {!r.occupations?.length && <p className="mt-0.5 text-2xs text-gray-400">alle Berufe</p>}
                  </td>
                )}
                <td>
                  <button type="button" onClick={() => remove(r.id)} className="btn-icon mt-1 p-1.5 hover:text-red-600" aria-label={`Regel ${r.label} löschen`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-gray-500">Ohne Geburtstag zählen nur Regeln ohne Mindestalter. Ohne Beruf wird „Angestellt“ angenommen.</p>
    </Modal>
  );
};
