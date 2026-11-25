import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { GitMerge } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { Button, Field } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { day, fullName, type Customer, type Entry } from './shared';

/** Doppelten Kunden in einen anderen überführen (nur Admins) */
export function MergeModal({
  keep,
  customers,
  entries,
  onClose,
  onSaved,
}: {
  keep: Customer | null;
  customers: Customer[];
  entries: Entry[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [drop, setDrop] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => setDrop(''), [keep]);

  const candidates = keep
    ? customers
        .filter((c) => c.id !== keep.id)
        .sort((a, b) => {
          // ähnliche Nachnamen zuerst
          const s = (c: Customer) => (c.last_name.trim().toLowerCase().slice(0, 3) === keep.last_name.trim().toLowerCase().slice(0, 3) ? 0 : 1);
          return s(a) - s(b) || fullName(a).localeCompare(fullName(b), 'de');
        })
    : [];

  const merge = async () => {
    if (!keep || !drop) return;
    setBusy(true);
    const { error } = await supabase.rpc('merge_customers', { p_keep: keep.id, p_drop: drop });
    setBusy(false);
    if (error) return toast.error(error.message || 'Zusammenführen fehlgeschlagen.');
    toast.success('Kunden zusammengeführt');
    onSaved();
  };

  return (
    <Modal isOpen={!!keep} onClose={onClose} title="Kunden zusammenführen" description={keep ? `${fullName(keep)} bleibt bestehen.` : undefined}>
      <div className="space-y-4">
        <Field label="Doppelten Eintrag wählen" htmlFor="mg-drop" hint="Verträge, Rückrufe und fehlende Stammdaten wandern zu diesem Kunden, der doppelte Eintrag wird gelöscht.">
          <select id="mg-drop" value={drop} onChange={(e) => setDrop(e.target.value)} className="input">
            <option value="">Bitte wählen</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {fullName(c)}
                {c.birth_date ? ` (${format(day(c.birth_date), 'dd.MM.yyyy')})` : ''} · {entries.filter((e) => e.customer_id === c.id).length} Verträge
              </option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button icon={GitMerge} disabled={!drop} loading={busy} onClick={merge}>Zusammenführen</Button>
        </div>
      </div>
    </Modal>
  );
}
