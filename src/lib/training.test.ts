import { describe, expect, it } from 'vitest';
import { reportNumber, schoolDaysText, shiftWeek, weekKey, weekLabel, weeksSince } from './training';

describe('Berichtsheft-Wochen', () => {
  it('weekKey liefert den Montag', () => {
    expect(weekKey(new Date(2026, 10, 26))).toBe('2026-11-23'); // Donnerstag
    expect(weekKey(new Date(2026, 10, 29))).toBe('2026-11-23'); // Sonntag
  });
  it('weekLabel zeigt KW und Mo–Fr', () => expect(weekLabel('2026-11-23')).toBe('KW 48 · 23.11. – 27.11.2026'));
  it('shiftWeek über den Jahreswechsel', () => expect(shiftWeek('2026-12-28', 1)).toBe('2027-01-04'));
  it('weeksSince füllt Lücken auf, neueste zuerst', () => {
    expect(weeksSince([{ week_start: '2026-11-09' }], new Date(2026, 10, 26))).toEqual(['2026-11-23', '2026-11-16', '2026-11-09']);
  });
  it('reportNumber zählt ab 1', () => expect(reportNumber('2026-11-23', '2026-11-09')).toBe(3));
  it('schoolDaysText sortiert nach Wochentag', () =>
    expect(schoolDaysText([{ dayOfWeek: 4, type: 'half' }, { dayOfWeek: 2, type: 'full' }])).toBe('Di (ganztags), Do (halbtags)'));
});
