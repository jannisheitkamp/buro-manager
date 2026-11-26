import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Check, Copy, Link2, Mail, MessageCircle, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { diffUpdate, updateLink, updateMessage, type UpdateField, type UpdateRequest } from '@/lib/customerUpdate';
import { waNumber, type Customer } from './shared';

/** Daten-Update per Link: Link verschicken und eingereichte Änderungen prüfen */
export function CustomerUpdatePanel({ customer, canEdit, onApplied }: { customer: Customer; canEdit: boolean; onApplied: () => void }) {
  const { user, profile } = useStore();
  const [requests, setRequests] = useState<UpdateRequest[]>([]);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    const { data } = await supabase.from('customer_update_requests').select('id, customer_id, status, submitted_at, payload').eq('customer_id', customer.id).eq('status', 'submitted');
    setRequests((data as UpdateRequest[]) || []);
  }, [customer.id]);
  useEffect(() => {
    load();
  }, [load]);

  const req = requests[0];
  const changes = useMemo(() => diffUpdate(customer, req?.payload || null), [customer, req]);
  useEffect(() => setPicked(Object.fromEntries(changes.map((c) => [c.key, true]))), [changes]);

  const createLink = async () => {
    setBusy(true);
    const { data, error } = await supabase.rpc('create_customer_update_link', { p_customer: customer.id });
    setBusy(false);
    if (error || !data) return toast.error('Link konnte nicht erstellt werden.');
    setLink(updateLink(data as string));
  };

  const message = link ? updateMessage(customer.first_name, link, profile?.full_name) : '';
  const wa = waNumber(customer.phone);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      toast.success('Nachricht mit Link kopiert');
    } catch {
      toast.error('Kopieren hat nicht geklappt, bitte den Link markieren.');
    }
  };

  const finish = async (status: 'applied' | 'rejected') => {
    if (!req || !user) return;
    setBusy(true);
    if (status === 'applied') {
      const update = Object.fromEntries(changes.filter((c) => picked[c.key]).map((c) => [c.key as UpdateField, c.value]));
      if (Object.keys(update).length) {
        const { error } = await supabase.from('customers').update(update).eq('id', customer.id);
        if (error) {
          setBusy(false);
          return toast.error('Kundendaten konnten nicht gespeichert werden.');
        }
      }
      const lines = [...changes.filter((c) => picked[c.key]).map((c) => `${c.label}: ${c.next}`), req.payload?.message ? `Nachricht: ${req.payload.message}` : null].filter(Boolean);
      if (lines.length) await supabase.from('customer_notes').insert({ customer_id: customer.id, created_by: user.id, body: `Daten-Update vom Kunden übernommen\n${lines.join('\n')}` });
    }
    const { error } = await supabase.from('customer_update_requests').update({ status, handled_by: user.id, handled_at: new Date().toISOString() }).eq('id', req.id);
    setBusy(false);
    if (error) return toast.error('Konnte nicht abgeschlossen werden.');
    toast.success(status === 'applied' ? 'Übernommen' : 'Verworfen');
    load();
    onApplied();
  };

  if (!canEdit) return null;

  return (
    <div className="space-y-3">
      {req && (
        <section aria-label="Daten vom Kunden" className="rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-3 text-sm dark:border-violet-800 dark:bg-violet-900/20">
          <p className="text-xs font-semibold text-violet-800 dark:text-violet-200">
            Neue Daten vom Kunden{req.submitted_at ? ` · ${format(new Date(req.submitted_at), 'dd.MM.yyyy, HH:mm')}` : ''}
          </p>
          {changes.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {changes.map((c) => (
                <li key={c.key}>
                  <label className="flex items-start gap-2">
                    <input type="checkbox" checked={!!picked[c.key]} onChange={(e) => setPicked((p) => ({ ...p, [c.key]: e.target.checked }))} className="mt-1" />
                    <span>
                      <span className="font-medium text-gray-900 dark:text-white">{c.label}:</span>{' '}
                      {c.old && <span className="text-gray-500 line-through">{c.old}</span>} <span className="text-gray-900 dark:text-white">{c.next}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
          {req.payload?.message && <p className="mt-2 whitespace-pre-line text-gray-700 dark:text-gray-200"><span className="font-medium">Nachricht:</span> {req.payload.message}</p>}
          {changes.length === 0 && !req.payload?.message && <p className="mt-1 text-gray-600">Keine Abweichungen zu den gespeicherten Daten.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" icon={Check} loading={busy} onClick={() => finish('applied')}>{changes.some((c) => picked[c.key]) ? 'Auswahl übernehmen' : 'Erledigt'}</Button>
            <Button size="sm" variant="ghost" icon={X} loading={busy} onClick={() => finish('rejected')}>Verwerfen</Button>
          </div>
        </section>
      )}

      {link ? (
        <section aria-label="Update-Link" className="rounded-lg border border-gray-200 bg-white px-3 py-3 text-sm dark:border-gray-700 dark:bg-gray-800/40">
          <p className="text-xs font-semibold text-gray-500">Link für {customer.first_name || 'den Kunden'} (14 Tage gültig, einmal nutzbar)</p>
          <p className="mt-1 break-all font-mono text-xs text-gray-700 dark:text-gray-200">{link}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={Copy} onClick={copy}>Nachricht kopieren</Button>
            {wa && <a className="btn btn-secondary btn-sm" href={`https://wa.me/${wa}?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
            {customer.email && <a className="btn btn-secondary btn-sm" href={`mailto:${customer.email}?subject=${encodeURIComponent('Ihre Daten aktualisieren')}&body=${encodeURIComponent(message)}`}><Mail className="h-4 w-4" /> E-Mail</a>}
          </div>
        </section>
      ) : (
        <Button size="sm" variant="secondary" icon={Link2} loading={busy} onClick={createLink}>Update-Link senden</Button>
      )}
    </div>
  );
}
