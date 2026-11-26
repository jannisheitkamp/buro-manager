import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { toast } from 'react-hot-toast';
import { Modal } from '@/components/Modal';
import { Button, Field } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { nextDeadline } from '@/lib/followups';
import { exportCancellationPdf, REASONS, type ReasonId } from '@/lib/cancellation';
import { fullName, type Customer, type Existing } from './shared';

/** Ort aus einer Adresse wie „Lindenweg 56, 44135 Dortmund“ */
const placeOf = (address: string | null) => address?.match(/\d{5}\s+([^,\n]+)/)?.[1]?.trim() || '';

/** Kündigungsschreiben für einen Bestandsvertrag erstellen */
export function CancellationModal({ target, onClose, onDone }: { target: { customer: Customer; contract: Existing } | null; onClose: () => void; onDone: () => void }) {
  const c = target?.customer;
  const x = target?.contract;
  return (
    <Modal isOpen={!!target} onClose={onClose} title="Kündigung erstellen" description={c && x ? `${fullName(c)} · ${x.sub_category}${x.policy_number ? ` · ${x.policy_number}` : ''}` : undefined}>
      {/* key: frisches Formular je Vertrag, sofort mit den richtigen Werten */}
      {c && x && <CancellationForm key={x.id} c={c} x={x} onClose={onClose} onDone={onDone} />}
    </Modal>
  );
}

function CancellationForm({ c, x, onClose, onDone }: { c: Customer; x: Existing; onClose: () => void; onDone: () => void }) {
  const { user } = useStore();
  const kfz = x.sub_category === 'KFZ' || x.category === 'car';

  // Vorschlag: nächster Ablauf laut Fristberechnung
  const suggestion = useMemo(() => nextDeadline({ ...x, status: 'policed', customer_name: c.last_name, customer_firstname: c.first_name }), [c, x]);

  const [form, setForm] = useState(() => ({
    customerAddress: c.address || '',
    insurer: x.insurer || '',
    insurerAddress: '',
    plate: '',
    date: suggestion ? format(suggestion.renewal, 'yyyy-MM-dd') : '',
    extraordinary: false,
    reason: 'premium' as ReasonId,
    reasonText: '',
    revokeSepa: true,
    place: placeOf(c.address),
  }));
  const [saving, setSaving] = useState(false);

  // Gemerkte Anschrift der Gesellschaft laden
  useEffect(() => {
    const name = form.insurer.trim();
    if (!name) return;
    const t = setTimeout(async () => {
      const { data } = await supabase.from('insurer_addresses').select('address').eq('name', name).maybeSingle();
      if (data?.address) setForm((f) => (f.insurerAddress ? f : { ...f, insurerAddress: data.address }));
    }, 300);
    return () => clearTimeout(t);
  }, [form.insurer]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? (e.target as HTMLInputElement).checked : e.target.value }));

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.insurer.trim() || !form.insurerAddress.trim()) return toast.error('Bitte Gesellschaft und ihre Anschrift eintragen.');
    if (!form.customerAddress.trim()) return toast.error('Bitte die Adresse des Kunden eintragen.');
    setSaving(true);
    try {
      await exportCancellationPdf({
        customerName: [c.first_name, c.last_name].filter(Boolean).join(' '),
        customerAddress: form.customerAddress.trim(),
        insurer: form.insurer.trim(),
        insurerAddress: form.insurerAddress.trim(),
        product: x.sub_category,
        policyNumber: x.policy_number || '',
        plate: kfz ? form.plate.trim() : '',
        date: form.date,
        extraordinary: form.extraordinary,
        reason: form.reason,
        reasonText: form.reasonText,
        revokeSepa: form.revokeSepa,
        place: form.place.trim(),
      });
      // Anschrift merken und in der Historie vermerken
      await supabase.from('insurer_addresses').upsert({ name: form.insurer.trim(), address: form.insurerAddress.trim(), updated_by: user.id, updated_at: new Date().toISOString() });
      await supabase.from('customer_notes').insert({
        customer_id: c.id,
        created_by: user.id,
        body: `Kündigung erstellt: ${x.sub_category} bei ${form.insurer.trim()}${x.policy_number ? ` (Schein ${x.policy_number})` : ''}, ${form.extraordinary ? 'außerordentlich ' : ''}${form.date ? `zum ${format(new Date(`${form.date}T00:00:00`), 'dd.MM.yyyy')}` : 'zum nächstmöglichen Zeitpunkt'}`,
      });
      toast.success('Kündigung erstellt. Vom Kunden unterschreiben lassen und an die Gesellschaft schicken.');
      onDone();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
      <form onSubmit={create} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Gesellschaft" htmlFor="kd-ins"><input id="kd-ins" type="text" value={form.insurer} onChange={set('insurer')} className="input" placeholder="z. B. HUK-Coburg" /></Field>
          <Field label="Kündigen zum" htmlFor="kd-date" hint={suggestion ? `Kündigungsfrist bis ${format(suggestion.deadline, 'dd.MM.yyyy')}` : 'Leer lassen = nächstmöglicher Zeitpunkt'}>
            <input id="kd-date" type="date" value={form.date} onChange={set('date')} className="input" />
          </Field>
          <Field label="Anschrift der Gesellschaft" htmlFor="kd-insaddr" className="sm:col-span-2" hint="Wird für den nächsten Brief gemerkt">
            <textarea id="kd-insaddr" rows={3} value={form.insurerAddress} onChange={set('insurerAddress')} className="input resize-none" placeholder={'Straße Nr.\nPLZ Ort'} />
          </Field>
          <Field label="Adresse des Kunden" htmlFor="kd-addr" className="sm:col-span-2"><input id="kd-addr" type="text" value={form.customerAddress} onChange={set('customerAddress')} className="input" /></Field>
          <Field label="Ort für das Datum" htmlFor="kd-place"><input id="kd-place" type="text" value={form.place} onChange={set('place')} className="input" /></Field>
          {kfz && <Field label="Kennzeichen" htmlFor="kd-plate"><input id="kd-plate" type="text" value={form.plate} onChange={set('plate')} className="input" placeholder="z. B. DO-AB 123" /></Field>}
        </div>

        <fieldset className="space-y-2">
          <legend className="sr-only">Art der Kündigung</legend>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="kd-kind" checked={!form.extraordinary} onChange={() => setForm((f) => ({ ...f, extraordinary: false }))} /> Ordentlich (fristgerecht zum Ablauf)</label>
          <label className="flex items-center gap-2 text-sm"><input type="radio" name="kd-kind" checked={form.extraordinary} onChange={() => setForm((f) => ({ ...f, extraordinary: true }))} /> Außerordentlich (Sonderkündigung)</label>
          {form.extraordinary && (
            <div className="grid gap-3 pl-6 sm:grid-cols-2">
              <select aria-label="Grund" value={form.reason} onChange={set('reason')} className="input text-sm">
                {REASONS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
              {form.reason === 'other' && <input aria-label="Grund in eigenen Worten" type="text" value={form.reasonText} onChange={set('reasonText')} className="input text-sm" placeholder="z. B. wegen Umzugs ins Ausland" />}
            </div>
          )}
        </fieldset>

        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.revokeSepa} onChange={set('revokeSepa')} /> SEPA-Lastschriftmandat zum Vertragsende widerrufen</label>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" loading={saving}>PDF erstellen</Button>
        </div>
      </form>
  );
}
