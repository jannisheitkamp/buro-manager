import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { CheckCircle2, MessageSquare, Phone, Trash2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useStore } from '@/store/useStore';
import { cn } from '@/utils/cn';
import { loadHistory, mergeHistory, type HistoryCallback, type Note } from './history';

const SHOWN = 5;

/** Gesprächshistorie: wer hat wann was mit dem Kunden besprochen, plus Rückrufe */
export function CustomerHistory({ customerId, names, isAdmin }: { customerId: string; names: Map<string, string>; isAdmin: boolean }) {
  const { user } = useStore();
  const [notes, setNotes] = useState<Note[]>([]);
  const [callbacks, setCallbacks] = useState<HistoryCallback[]>([]);
  const [available, setAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [all, setAll] = useState(false);

  const load = useCallback(async () => {
    const h = await loadHistory(customerId);
    setNotes(h.notes);
    setCallbacks(h.callbacks);
    setAvailable(h.notesAvailable);
    setLoading(false);
  }, [customerId]);

  useEffect(() => {
    load();
  }, [load]);

  const items = useMemo(() => mergeHistory(notes, callbacks), [notes, callbacks]);
  const shown = all ? items : items.slice(0, SHOWN);

  const add = async () => {
    const body = text.trim();
    if (!body || !user) return;
    setSaving(true);
    const { error } = await supabase.from('customer_notes').insert({ customer_id: customerId, created_by: user.id, body });
    setSaving(false);
    if (error) return toast.error('Notiz konnte nicht gespeichert werden.');
    setText('');
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from('customer_notes').delete().eq('id', id);
    if (error) return toast.error('Notiz konnte nicht gelöscht werden.');
    setNotes((n) => n.filter((x) => x.id !== id));
  };

  return (
    <section aria-label="Gesprächshistorie" className="rounded-lg border border-gray-200 bg-white px-3 py-3 dark:border-gray-700 dark:bg-gray-800/40">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-500">
        <MessageSquare className="h-3.5 w-3.5" /> Gesprächshistorie
      </p>

      {available && (
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end">
          <label htmlFor={`note-${customerId}`} className="sr-only">Neue Notiz</label>
          <textarea
            id={`note-${customerId}`}
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && add()}
            placeholder="Was wurde besprochen?"
            className="input flex-1 resize-none text-sm"
          />
          <Button size="sm" onClick={add} loading={saving} disabled={!text.trim()}>Notiz speichern</Button>
        </div>
      )}

      {loading ? (
        <p className="mt-3 text-sm text-gray-400">Wird geladen …</p>
      ) : items.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">Noch keine Gespräche festgehalten.</p>
      ) : (
        <ol className="mt-3 space-y-2.5">
          {shown.map((it) => (
            <li key={`${it.kind}-${it.id}`} className="group flex gap-2.5 text-sm">
              <span className={cn('mt-0.5 shrink-0', it.kind === 'note' ? 'text-brand-600 dark:text-brand-300' : it.done ? 'text-emerald-600' : 'text-sky-600')} aria-hidden>
                {it.kind === 'note' ? <MessageSquare className="h-4 w-4" /> : it.done ? <CheckCircle2 className="h-4 w-4" /> : <Phone className="h-4 w-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-500">
                  {format(new Date(it.at), 'dd.MM.yyyy, HH:mm')}
                  {it.by && names.get(it.by) ? ` · ${names.get(it.by)}` : ''}
                  {it.kind === 'callback' && ` · Rückruf ${it.done ? 'erledigt' : 'offen'}`}
                </p>
                <p className="whitespace-pre-line text-gray-800 dark:text-gray-100">{it.text}</p>
              </div>
              {it.kind === 'note' && (it.by === user?.id || isAdmin) && (
                <button type="button" onClick={() => remove(it.id)} className="btn-icon self-start p-1 opacity-0 focus:opacity-100 group-hover:opacity-100" title="Notiz löschen" aria-label="Notiz löschen">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {items.length > SHOWN && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-2 text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
          {all ? 'Weniger anzeigen' : `Alle ${items.length} anzeigen`}
        </button>
      )}
    </section>
  );
}
