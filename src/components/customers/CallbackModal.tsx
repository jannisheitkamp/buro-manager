import { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '@/lib/supabase';
import { Button, Field } from '@/components/ui';
import { Modal } from '@/components/Modal';
import { fullName, type Customer } from './shared';

/** Rückruf für einen oder mehrere Kunden anlegen */
export function CallbackModal({
  customers,
  defaultTopic = '',
  userId,
  onClose,
  onSaved,
}: {
  customers: Customer[] | null;
  defaultTopic?: string;
  userId: string | undefined;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const list = customers || [];
  const single = list.length === 1 ? list[0] : null;
  const withoutPhone = list.filter((c) => !c.phone).length;

  useEffect(() => {
    if (customers) setTopic(defaultTopic);
  }, [customers, defaultTopic]);

  const create = async () => {
    if (!userId || list.length === 0) return;
    setBusy(true);
    const { error } = await supabase.from('callbacks').insert(
      list.map((c) => ({
        customer_name: fullName(c),
        customer_id: c.id,
        phone: c.phone,
        topic: topic.trim() || null,
        priority: 'normal',
        status: 'open',
        created_by: userId,
        assigned_to: userId,
      })),
    );
    setBusy(false);
    if (error) return toast.error('Rückruf konnte nicht angelegt werden.');
    toast.success(list.length === 1 ? 'Rückruf angelegt' : `${list.length} Rückrufe angelegt`);
    onSaved();
  };

  return (
    <Modal
      isOpen={list.length > 0}
      onClose={onClose}
      title={list.length > 1 ? `${list.length} Rückrufe anlegen` : 'Rückruf anlegen'}
      description={single ? fullName(single) : list.length > 1 ? list.slice(0, 4).map(fullName).join(' · ') + (list.length > 4 ? ` und ${list.length - 4} weitere` : '') : undefined}
      size="sm"
    >
      <div className="space-y-4">
        <Field label="Worum geht es?" htmlFor="cb-topic">
          <input id="cb-topic" autoFocus value={topic} onChange={(e) => setTopic(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && create()} className="input" placeholder="z. B. Angebot BU besprechen" />
        </Field>
        {withoutPhone > 0 && (
          <p className="text-xs text-amber-700 dark:text-amber-300">
            {single ? 'Für diesen Kunden ist keine Telefonnummer hinterlegt.' : `${withoutPhone} ${withoutPhone === 1 ? 'Kunde hat' : 'Kunden haben'} keine Telefonnummer.`}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button icon={Phone} loading={busy} onClick={create}>Anlegen</Button>
        </div>
      </div>
    </Modal>
  );
}
