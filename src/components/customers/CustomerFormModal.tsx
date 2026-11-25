import { useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { Button, Field, Segmented } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { HOUSING, MARITAL, OCCUPATIONS, PETS, VEHICLES } from '@/lib/gaps';
import type { Customer, InputChange } from './shared';

const EMPTY_FORM = {
  customer_type: 'person' as 'person' | 'company',
  last_name: '', first_name: '', birth_date: '', phone: '', email: '', address: '', household: '', notes: '',
  contact_person: '', industry: '', employees: '', occupation: '', marital_status: '', children: '', housing: '',
  vehicles: [] as string[], pets: [] as string[],
};
type FormState = typeof EMPTY_FORM;
type TextKey = Exclude<keyof FormState, 'customer_type' | 'vehicles' | 'pets'>;

const toForm = (c: Customer): FormState => {
  const str = (v: string | number | null | undefined) => (v == null ? '' : String(v));
  return {
    customer_type: c.customer_type || 'person',
    last_name: c.last_name,
    first_name: str(c.first_name),
    birth_date: str(c.birth_date),
    phone: str(c.phone),
    email: str(c.email),
    address: str(c.address),
    household: str(c.household),
    notes: str(c.notes),
    contact_person: str(c.contact_person),
    industry: str(c.industry),
    employees: str(c.employees),
    occupation: str(c.occupation),
    marital_status: str(c.marital_status),
    children: str(c.children),
    housing: str(c.housing),
    vehicles: c.vehicles || [],
    pets: c.pets || [],
  };
};

/** Kunde anlegen oder bearbeiten */
export function CustomerFormModal({
  editing,
  households,
  userId,
  onClose,
  onSaved,
}: {
  editing: Customer | 'new' | null;
  households: string[];
  userId: string | undefined;
  onClose: () => void;
  onSaved: (id: string | undefined) => void;
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) setForm(editing === 'new' ? EMPTY_FORM : toForm(editing));
  }, [editing]);

  const set = (k: TextKey) => (e: InputChange) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (k: 'vehicles' | 'pets', v: string) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || !form.last_name.trim()) return;
    setSaving(true);
    const t = (v: string) => v.trim() || null;
    const n = (v: string) => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v))) || 0);
    const company = form.customer_type === 'company';
    const payload = {
      customer_type: form.customer_type,
      last_name: form.last_name.trim(),
      first_name: company ? null : t(form.first_name),
      birth_date: company ? null : t(form.birth_date),
      phone: t(form.phone),
      email: t(form.email),
      address: t(form.address),
      household: company ? null : t(form.household),
      notes: t(form.notes),
      contact_person: company ? t(form.contact_person) : null,
      industry: company ? t(form.industry) : null,
      employees: company ? n(form.employees) : null,
      occupation: company ? null : t(form.occupation),
      marital_status: company ? null : t(form.marital_status),
      children: company ? null : n(form.children),
      housing: company ? null : t(form.housing),
      vehicles: company ? [] : form.vehicles,
      pets: company ? [] : form.pets,
    };
    const { data, error } =
      editing === 'new'
        ? await supabase.from('customers').insert({ ...payload, created_by: userId }).select('id').single()
        : await supabase.from('customers').update(payload).eq('id', editing.id).select('id').single();
    setSaving(false);
    if (error) return toast.error('Kunde konnte nicht gespeichert werden.');
    toast.success(editing === 'new' ? 'Kunde angelegt' : 'Gespeichert');
    onSaved(data?.id);
  };

  return (
    <Modal isOpen={!!editing} onClose={onClose} title={editing === 'new' ? 'Neuer Kunde' : 'Kunde bearbeiten'} size="lg">
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Segmented
              value={form.customer_type}
              onChange={(v) => setForm((f) => ({ ...f, customer_type: v as 'person' | 'company' }))}
              options={[
                { value: 'person', label: 'Privatkunde' },
                { value: 'company', label: 'Firma' },
              ]}
            />
          </div>
          {form.customer_type === 'company' ? (
            <>
              <Field label="Firmenname" htmlFor="cf-last" className="sm:col-span-2"><input id="cf-last" required value={form.last_name} onChange={set('last_name')} className="input" /></Field>
              <Field label="Ansprechpartner" htmlFor="cf-contact"><input id="cf-contact" value={form.contact_person} onChange={set('contact_person')} className="input" /></Field>
              <Field label="Branche" htmlFor="cf-industry"><input id="cf-industry" value={form.industry} onChange={set('industry')} className="input" placeholder="z. B. Handwerk, Gastronomie" /></Field>
              <Field label="Mitarbeiter" htmlFor="cf-emp" hint="Ab 1 Mitarbeiter: bAV und bKV als Lücke"><input id="cf-emp" type="number" min={0} value={form.employees} onChange={set('employees')} className="input tabular" /></Field>
              <Field label="Telefon" htmlFor="cf-phone"><input id="cf-phone" type="tel" value={form.phone} onChange={set('phone')} className="input" /></Field>
              <Field label="E-Mail" htmlFor="cf-mail"><input id="cf-mail" type="email" value={form.email} onChange={set('email')} className="input" /></Field>
            </>
          ) : (
            <>
              <Field label="Nachname" htmlFor="cf-last"><input id="cf-last" required value={form.last_name} onChange={set('last_name')} className="input" /></Field>
              <Field label="Vorname" htmlFor="cf-first"><input id="cf-first" value={form.first_name} onChange={set('first_name')} className="input" /></Field>
              <Field label="Geburtstag" htmlFor="cf-birth"><input id="cf-birth" type="date" value={form.birth_date} onChange={set('birth_date')} className="input" /></Field>
              <Field label="Telefon" htmlFor="cf-phone"><input id="cf-phone" type="tel" value={form.phone} onChange={set('phone')} className="input" /></Field>
              <Field label="E-Mail" htmlFor="cf-mail"><input id="cf-mail" type="email" value={form.email} onChange={set('email')} className="input" /></Field>
              <Field label="Haushalt" htmlFor="cf-house" hint="Gleicher Name verbindet Familienmitglieder, z. B. Familie Müller"><input id="cf-house" value={form.household} onChange={set('household')} className="input" list="cf-households" /></Field>
              <datalist id="cf-households">
                {households.map((h) => <option key={h} value={h} />)}
              </datalist>
              <fieldset className="space-y-3 rounded-xl border border-gray-200 p-4 dark:border-gray-700 sm:col-span-2">
                <legend className="px-1 text-sm font-semibold text-gray-700 dark:text-gray-200">Lebenslage <span className="font-normal text-gray-400">(für passende Lücken)</span></legend>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Beruf" htmlFor="cf-occ">
                    <select id="cf-occ" value={form.occupation} onChange={set('occupation')} className="input">
                      <option value="">unbekannt</option>
                      {OCCUPATIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Familienstand" htmlFor="cf-mar">
                    <select id="cf-mar" value={form.marital_status} onChange={set('marital_status')} className="input">
                      <option value="">unbekannt</option>
                      {MARITAL.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </Field>
                  <Field label="Kinder" htmlFor="cf-kids"><input id="cf-kids" type="number" min={0} value={form.children} onChange={set('children')} className="input tabular" /></Field>
                  <Field label="Wohnen" htmlFor="cf-housing">
                    <select id="cf-housing" value={form.housing} onChange={set('housing')} className="input">
                      <option value="">unbekannt</option>
                      {HOUSING.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </Field>
                </div>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-700 dark:text-gray-200">
                  {VEHICLES.map((v) => (
                    <label key={v.id} className="flex items-center gap-2"><input type="checkbox" checked={form.vehicles.includes(v.id)} onChange={() => toggle('vehicles', v.id)} className="rounded" /> {v.label}</label>
                  ))}
                  {PETS.map((v) => (
                    <label key={v.id} className="flex items-center gap-2"><input type="checkbox" checked={form.pets.includes(v.id)} onChange={() => toggle('pets', v.id)} className="rounded" /> {v.label}</label>
                  ))}
                </div>
              </fieldset>
            </>
          )}
          <Field label="Adresse" htmlFor="cf-addr" className="sm:col-span-2"><input id="cf-addr" value={form.address} onChange={set('address')} className="input" placeholder="Straße, PLZ Ort" /></Field>
          <Field label="Notizen" htmlFor="cf-notes" className="sm:col-span-2"><textarea id="cf-notes" rows={3} value={form.notes} onChange={set('notes')} className="input resize-none" /></Field>
        </div>
        {editing !== 'new' && editing && form.last_name.trim() !== editing.last_name && (
          <p className="text-xs text-gray-500">Der neue Name wird auch in allen Verträgen dieses Kunden übernommen.</p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button type="submit" loading={saving}>{editing === 'new' ? 'Anlegen' : 'Speichern'}</Button>
        </div>
      </form>
    </Modal>
  );
}
