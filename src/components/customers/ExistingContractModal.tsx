import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { Button, Field } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { ProductPicker } from '@/components/ProductPicker';
import { productByName } from '@/lib/products';
import { fullName, parseEuro, type Customer, type Existing, type InputChange } from './shared';

const EMPTY_EXISTING = { sub_category: 'PHV', insurer: '', policy_number: '', start_date: '', premium: '', notes: '' };
type ExistingForm = typeof EMPTY_EXISTING;

/** Bestandsvertrag hinzufügen oder bearbeiten */
export function ExistingContractModal({
  target,
  insurers,
  userId,
  onClose,
  onSaved,
}: {
  target: { customer: Customer; contract: Existing | null } | null;
  insurers: string[];
  userId: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<ExistingForm>(EMPTY_EXISTING);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const x = target?.contract;
    setForm(
      x
        ? {
            sub_category: x.sub_category,
            insurer: x.insurer || '',
            policy_number: x.policy_number || '',
            start_date: x.start_date || '',
            premium: x.premium != null ? String(x.premium).replace('.', ',') : '',
            notes: x.notes || '',
          }
        : EMPTY_EXISTING,
    );
  }, [target]);

  const setX = (k: keyof ExistingForm) => (e: InputChange) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!target || !userId) return;
    const premium = parseEuro(form.premium);
    if (premium != null && Number.isNaN(premium)) return toast.error('Beitrag bitte als Zahl eingeben.');
    const payload = {
      sub_category: form.sub_category,
      category: productByName(form.sub_category)?.area || 'other',
      insurer: form.insurer.trim() || null,
      policy_number: form.policy_number.trim() || null,
      start_date: form.start_date || null,
      premium,
      notes: form.notes.trim() || null,
    };
    setSaving(true);
    const { error } = target.contract
      ? await supabase.from('customer_contracts').update(payload).eq('id', target.contract.id)
      : await supabase.from('customer_contracts').insert({ ...payload, customer_id: target.customer.id, created_by: userId });
    setSaving(false);
    if (error) return toast.error('Vertrag konnte nicht gespeichert werden.');
    toast.success(target.contract ? 'Gespeichert' : 'Bestandsvertrag hinzugefügt');
    onSaved();
  };

  const remove = async () => {
    const x = target?.contract;
    if (!x) return;
    setSaving(true);
    const { error } = await supabase.from('customer_contracts').delete().eq('id', x.id);
    setSaving(false);
    if (error) return toast.error('Vertrag konnte nicht gelöscht werden.');
    toast.success('Bestandsvertrag entfernt');
    onSaved();
  };

  return (
    <Modal
      isOpen={!!target}
      onClose={onClose}
      title={target?.contract ? 'Bestandsvertrag bearbeiten' : 'Bestandsvertrag hinzufügen'}
      description={target ? `${fullName(target.customer)} · zählt für Lücken und Fristen, nicht für Produktion und Provision` : undefined}
    >
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Versicherung / Produkt" htmlFor="ex-sub" className="sm:col-span-2">
            <ProductPicker id="ex-sub" value={form.sub_category} onChange={(p) => setForm((f) => ({ ...f, sub_category: p.name }))} />
          </Field>
          <Field label="Gesellschaft" htmlFor="ex-ins"><input id="ex-ins" value={form.insurer} onChange={setX('insurer')} className="input" placeholder="z. B. Allianz" list="ex-insurers" /></Field>
          <datalist id="ex-insurers">
            {insurers.map((i) => <option key={i} value={i} />)}
          </datalist>
          <Field label="Schein-Nr." htmlFor="ex-pol"><input id="ex-pol" value={form.policy_number} onChange={setX('policy_number')} className="input" /></Field>
          <Field label="Beginn" htmlFor="ex-start" hint="Für die Kündigungsfrist"><input id="ex-start" type="date" value={form.start_date} onChange={setX('start_date')} className="input" /></Field>
          <Field label="Beitrag (€)" htmlFor="ex-prem"><input id="ex-prem" inputMode="decimal" value={form.premium} onChange={setX('premium')} className="input" placeholder="z. B. 12,50" /></Field>
          <Field label="Notizen" htmlFor="ex-notes" className="sm:col-span-2"><textarea id="ex-notes" rows={2} value={form.notes} onChange={setX('notes')} className="input resize-none" /></Field>
        </div>
        <div className="flex items-center justify-between gap-2">
          {target?.contract ? <Button type="button" variant="ghost" onClick={remove} disabled={saving} className="text-red-600">Entfernen</Button> : <span />}
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
            <Button type="submit" loading={saving}>{target?.contract ? 'Speichern' : 'Hinzufügen'}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
