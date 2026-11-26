import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Clock, ShieldCheck } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { HOUSING, MARITAL, OCCUPATIONS } from '@/lib/gaps';

type Form = { status: 'loading' | 'open' | 'used' | 'expired' | 'invalid' | 'done'; first_name?: string | null; advisor?: string | null };
const EMPTY = { address: '', phone: '', email: '', marital_status: '', children: '', occupation: '', housing: '', message: '' };

/** Öffentliches Formular: Kunde trägt geänderte Daten ein. Zeigt keine gespeicherten Daten. */
export const CustomerUpdate = () => {
  const { token = '' } = useParams();
  const [form, setForm] = useState<Form>({ status: 'loading' });
  const [data, setData] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    supabase.rpc('get_customer_update_form', { p_token: token }).then(({ data: d, error: e }) => setForm(e || !d ? { status: 'invalid' } : (d as Form)));
  }, [token]);

  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setData((d) => ({ ...d, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { data: res, error: err } = await supabase.rpc('submit_customer_update', { p_token: token, p_data: data });
    setBusy(false);
    if (err) return setError('Das hat leider nicht geklappt. Bitte versuchen Sie es später noch einmal.');
    if (res === 'ok') return setForm((f) => ({ ...f, status: 'done' }));
    if (res === 'empty') return setError('Bitte tragen Sie mindestens eine Änderung ein.');
    setForm({ status: res === 'expired' ? 'expired' : res === 'used' ? 'used' : 'invalid' });
  };

  return (
    <div className="min-h-screen bg-gray-50 px-4 py-10 dark:bg-gray-950">
      <div className="mx-auto max-w-lg">
        <div className="mb-6 flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="h-8 w-8" />
          <span className="font-display text-lg font-semibold text-gray-900 dark:text-white">Daten aktualisieren</span>
        </div>

        {form.status === 'loading' && <p className="text-sm text-gray-500">Wird geladen …</p>}

        {(form.status === 'invalid' || form.status === 'used' || form.status === 'expired') && (
          <div className="card p-6 text-sm text-gray-700 dark:text-gray-200">
            <Clock className="mb-3 h-6 w-6 text-gray-400" />
            {form.status === 'expired' && 'Dieser Link ist abgelaufen. Bitte fragen Sie bei uns einen neuen Link an.'}
            {form.status === 'used' && 'Über diesen Link wurden bereits Daten geschickt. Vielen Dank! Für weitere Änderungen fragen Sie bitte einen neuen Link an.'}
            {form.status === 'invalid' && 'Dieser Link ist ungültig. Bitte prüfen Sie, ob er vollständig kopiert wurde.'}
          </div>
        )}

        {form.status === 'done' && (
          <div className="card p-6 text-sm text-gray-700 dark:text-gray-200">
            <CheckCircle2 className="mb-3 h-6 w-6 text-emerald-600" />
            Vielen Dank! Ihre Angaben sind bei uns angekommen. Wir prüfen sie und übernehmen sie in Ihre Unterlagen.
          </div>
        )}

        {form.status === 'open' && (
          <form onSubmit={submit} className="card space-y-4 p-6">
            <div>
              <p className="text-base font-semibold text-gray-900 dark:text-white">Hallo{form.first_name ? ` ${form.first_name}` : ''},</p>
              <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
                bitte tragen Sie nur ein, was sich geändert hat. Leere Felder bleiben, wie sie sind.{form.advisor ? ` Ihr Ansprechpartner: ${form.advisor}.` : ''}
              </p>
            </div>
            <Text id="address" label="Neue Adresse" placeholder="Straße Nr., PLZ Ort" value={data.address} onChange={set('address')} autoComplete="street-address" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Text id="phone" label="Neue Telefonnummer" type="tel" value={data.phone} onChange={set('phone')} autoComplete="tel" />
              <Text id="email" label="Neue E-Mail" type="email" value={data.email} onChange={set('email')} autoComplete="email" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select id="marital" label="Familienstand" options={MARITAL} value={data.marital_status} onChange={set('marital_status')} />
              <Text id="children" label="Anzahl Kinder" type="number" min={0} max={20} value={data.children} onChange={set('children')} />
              <Select id="occupation" label="Beruf" options={OCCUPATIONS} value={data.occupation} onChange={set('occupation')} />
              <Select id="housing" label="Wohnsituation" options={HOUSING} value={data.housing} onChange={set('housing')} />
            </div>
            <div>
              <label htmlFor="message" className="text-sm font-medium text-gray-800 dark:text-gray-100">Sonstiges</label>
              <textarea id="message" rows={3} maxLength={2000} value={data.message} onChange={set('message')} placeholder="z. B. neue Bankverbindung, Umzug zum …, Nachwuchs" className="input mt-1 w-full resize-y text-sm" />
            </div>
            {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
            <button type="submit" disabled={busy} className="btn btn-primary w-full justify-center">{busy ? 'Wird gesendet …' : 'Änderungen senden'}</button>
            <p className="flex items-start gap-1.5 text-xs text-gray-500"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Ihre Angaben gehen nur an Ihr Versicherungsbüro und werden dort geprüft. Der Link funktioniert einmal.</p>
          </form>
        )}
      </div>
    </div>
  );
};

const Text = ({ id, label, ...rest }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) => (
  <div>
    <label htmlFor={id} className="text-sm font-medium text-gray-800 dark:text-gray-100">{label}</label>
    <input id={id} type="text" maxLength={300} {...rest} className="input mt-1 w-full text-sm" />
  </div>
);

const Select = ({ id, label, options, ...rest }: { id: string; label: string; options: readonly { id: string; label: string }[] } & React.SelectHTMLAttributes<HTMLSelectElement>) => (
  <div>
    <label htmlFor={id} className="text-sm font-medium text-gray-800 dark:text-gray-100">{label}</label>
    <select id={id} {...rest} className="input mt-1 w-full text-sm">
      <option value="">unverändert</option>
      {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
    </select>
  </div>
);
