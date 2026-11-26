import { describe, expect, it } from 'vitest';
import { mergeHistory } from './history';

describe('mergeHistory', () => {
  const notes = [{ id: 'n1', customer_id: 'k', created_by: 'anna', body: 'Will Angebot für Hausrat', created_at: '2026-11-20T10:00:00Z' }];
  const callbacks = [
    { id: 'c1', topic: 'Kfz-Wechsel', status: 'done', created_at: '2026-11-01T09:00:00Z', created_by: 'anna', completed_at: '2026-11-24T15:00:00Z', completed_by: 'ben' },
    { id: 'c2', topic: null, status: 'open', created_at: '2026-11-10T08:00:00Z', created_by: 'anna', completed_at: null, completed_by: null },
  ];

  it('sortiert neueste zuerst, erledigte Rückrufe beim Erledigt-Datum', () => {
    expect(mergeHistory(notes, callbacks).map((i) => i.id)).toEqual(['c1', 'n1', 'c2']);
  });

  it('erledigt zählt für den, der erledigt hat; ohne Thema heißt es Rückruf', () => {
    const [done, , open] = mergeHistory(notes, callbacks);
    expect(done).toMatchObject({ kind: 'callback', by: 'ben', done: true });
    expect(open).toMatchObject({ text: 'Rückruf', by: 'anna', done: false });
  });
});
