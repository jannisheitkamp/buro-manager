// Gesprächshistorie der Kundenakte: Notizen und Rückrufe auf einer Zeitleiste
import { supabase } from '@/lib/supabase';

export type Note = { id: string; customer_id: string; created_by: string | null; body: string; created_at: string };
export type HistoryCallback = {
  id: string;
  topic: string | null;
  status: string;
  created_at: string;
  created_by: string | null;
  completed_at: string | null;
  completed_by: string | null;
};

export type HistoryItem =
  | { kind: 'note'; id: string; at: string; by: string | null; text: string }
  | { kind: 'callback'; id: string; at: string; by: string | null; text: string; done: boolean };

/** Neueste zuerst; ein erledigter Rückruf steht beim Erledigt-Datum */
export function mergeHistory(notes: Note[], callbacks: HistoryCallback[]): HistoryItem[] {
  const items: HistoryItem[] = [
    ...notes.map((n) => ({ kind: 'note' as const, id: n.id, at: n.created_at, by: n.created_by, text: n.body })),
    ...callbacks.map((c) => {
      const done = c.status === 'done';
      return {
        kind: 'callback' as const,
        id: c.id,
        at: (done && c.completed_at) || c.created_at,
        by: (done && c.completed_by) || c.created_by,
        text: c.topic || 'Rückruf',
        done,
      };
    }),
  ];
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

/** Notizen und Rückrufe eines Kunden laden. Fehlt die Notiztabelle noch, kommen nur die Rückrufe. */
export async function loadHistory(customerId: string) {
  const [n, c] = await Promise.all([
    supabase.from('customer_notes').select('id, customer_id, created_by, body, created_at').eq('customer_id', customerId).order('created_at', { ascending: false }),
    supabase.from('callbacks').select('id, topic, status, created_at, created_by, completed_at, completed_by').eq('customer_id', customerId),
  ]);
  return {
    notes: (n.data as Note[]) || [],
    callbacks: (c.data as HistoryCallback[]) || [],
    notesAvailable: !n.error,
  };
}
