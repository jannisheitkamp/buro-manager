// Tests für Geld- und Fristenlogik: Provision, Courtage, Storno, Kündigungsfristen und Lücken
import { describe, expect, it } from 'vitest';
import { calcCommission, maxYearsFor } from './products';
import { courtageForYear, courtageMonthsInYear, courtagePerRate, courtageRateMonths, type CourtageEntry } from './courtage';
import { stornoStats } from './storno';
import { nextDeadline, upcomingDeadlines } from './followups';
import { customerGaps, GAP_RULE_SEED, ruleApplies, type GapRule } from './gaps';

const base = { rate: 0, net: 0, gross: 0, factor: 12, duration: 0, installments: 12, contractSum: 0, lvFactor: 0 };

describe('calcCommission', () => {
  it('Promille der Beitragssumme, Laufzeit höchstens 35 Jahre', () => {
    const r = calcCommission('promille_sum', { ...base, rate: 8, gross: 100, duration: 40, lvFactor: 1.142 });
    // 100 € × 12 × 35 = 42.000 €, davon 8 ‰
    expect(r.valuation).toBe(42000);
    expect(r.commission).toBeCloseTo(336);
    expect(r.lifeValues).toBeCloseTo(42000 * 1.142);
  });

  it('BU: Laufzeit höchstens 45 Jahre, Fondsrente bleibt bei 35', () => {
    expect(maxYearsFor('BU')).toBe(45);
    expect(maxYearsFor('Fondsrente')).toBe(35);
    const r = calcCommission('promille_sum', { ...base, rate: 8, gross: 100, duration: 49, lvFactor: 1.142, maxYears: maxYearsFor('BU') });
    expect(r.valuation).toBe(54000);
    expect(r.commission).toBeCloseTo(432);
  });

  it('Monatsbeiträge', () => {
    const r = calcCommission('monthly_multiple', { ...base, rate: 3, gross: 250 });
    expect(r.commission).toBe(750);
  });

  it('Prozent vom Jahresbeitrag', () => {
    expect(calcCommission('percent_yearly', { ...base, rate: 10, gross: 20 }).commission).toBe(24);
  });

  it('Laufende Courtage je Rate', () => {
    const r = calcCommission('courtage_rate', { ...base, rate: 7.5, net: 10, installments: 6, lvFactor: 20 });
    expect(r.commission).toBeCloseTo(4.5);
    expect(r.lifeValues).toBe(120 * 20);
  });

  it('Prozent der Vertragssumme und fester Betrag', () => {
    expect(calcCommission('percent_sum', { ...base, rate: 1, contractSum: 50000 }).commission).toBe(500);
    expect(calcCommission('fixed', { ...base, rate: 50 }).commission).toBe(50);
  });
});

describe('Courtage', () => {
  const phv = (o: Partial<CourtageEntry> = {}): CourtageEntry => ({
    id: '1', status: 'policed', sub_category: 'PHV', start_date: '2026-04-01', payment_method: 'quarterly', net_premium: 30, commission_rate: 10, commission_amount: null, ...o,
  });

  it('Raten ab Beginn bis Dezember', () => {
    expect(courtageRateMonths('2026-04-01', 'quarterly')).toEqual([3, 6, 9]);
    expect(courtageRateMonths('2026-11-15', 'monthly')).toEqual([10, 11]);
    expect(courtageRateMonths(null, 'yearly')).toEqual([0]);
    expect(courtageRateMonths('2026-06-01', 'one_time')).toEqual([5]);
  });

  it('erstes Jahr ab Beginn, Folgejahr im Rhythmus der Zahlweise', () => {
    expect(courtageMonthsInYear(phv(), 2026)).toEqual([3, 6, 9]);
    expect(courtageMonthsInYear(phv(), 2027)).toEqual([0, 3, 6, 9]);
    expect(courtageMonthsInYear(phv(), 2025)).toEqual([]);
  });

  it('nach Storno keine Raten mehr', () => {
    expect(courtageMonthsInYear(phv({ status: 'cancelled', cancelled_at: '2027-05-10' }), 2027)).toEqual([0, 3]);
    expect(courtageMonthsInYear(phv({ status: 'cancelled', cancelled_at: '2027-05-10' }), 2028)).toEqual([]);
    expect(courtageMonthsInYear(phv({ status: 'cancelled', cancelled_at: null }), 2026)).toEqual([]);
  });

  it('Betrag je Rate und Jahr', () => {
    expect(courtagePerRate(phv())).toBe(3);
    expect(courtageForYear(phv(), 2027)).toBe(12);
    // ohne Beitrag: gespeicherter Betrag geteilt durch Raten im ersten Jahr
    expect(courtagePerRate(phv({ net_premium: null, commission_amount: 9 }))).toBe(3);
  });

  it('Leben-Produkte haben keine laufende Courtage', () => {
    expect(courtageMonthsInYear(phv({ sub_category: 'BU' }), 2026)).toEqual([]);
  });
});

describe('stornoStats', () => {
  it('Quote gesamt, je Sparte und nach Grund', () => {
    const s = stornoStats(
      [
        { category: 'life', status: 'policed' },
        { category: 'life', status: 'cancelled', cancel_reason: 'Widerruf' },
        { category: 'car', status: 'cancelled' },
        { category: 'car', status: 'submitted' },
      ],
      ['life', 'car', 'health'],
    );
    expect(s.rate).toBe(50);
    expect(s.byCategory.map((c) => c.id)).toEqual(['life', 'car']);
    expect(s.byReason).toEqual([
      { reason: 'Widerruf', count: 1 },
      { reason: 'Ohne Angabe', count: 1 },
    ]);
  });
});

describe('Kündigungsfristen', () => {
  const entry = (o: Partial<Parameters<typeof nextDeadline>[0]> = {}) => ({
    id: 'e1', status: 'policed', category: 'property', sub_category: 'PHV', start_date: '2024-03-01', customer_name: 'Müller', customer_firstname: null, policy_number: null, ...o,
  });

  it('Sachvertrag: Frist 3 Monate vor dem Jahrestag', () => {
    const d = nextDeadline(entry(), new Date(2026, 10, 1))!;
    expect(d.kind).toBe('renewal');
    expect(d.renewal).toEqual(new Date(2027, 2, 1));
    expect(d.deadline).toEqual(new Date(2026, 11, 1));
    expect(d.daysLeft).toBe(30);
  });

  it('KFZ: Wechselstichtag 30.11.', () => {
    const d = nextDeadline(entry({ category: 'car', sub_category: 'KFZ' }), new Date(2026, 10, 25))!;
    expect(d.kind).toBe('kfz');
    expect(d.deadline).toEqual(new Date(2026, 10, 30));
    expect(d.due).toBe(true);
    // nach dem Stichtag: nächstes Jahr
    expect(nextDeadline(entry({ category: 'car', sub_category: 'KFZ' }), new Date(2026, 11, 2))!.deadline).toEqual(new Date(2027, 10, 30));
  });

  it('keine Frist für Storno, Leben oder ohne Beginn', () => {
    expect(nextDeadline(entry({ status: 'cancelled' }))).toBeNull();
    expect(nextDeadline(entry({ sub_category: 'BU', category: 'life' }))).toBeNull();
    expect(nextDeadline(entry({ start_date: null }))).toBeNull();
  });

  it('Ablauf in der Zukunft: erste Frist 3 Monate vor Ablauf', () => {
    const d = nextDeadline(entry({ start_date: '2024-03-01', end_date: '2029-03-01' }), new Date(2026, 10, 1))!;
    expect(d.renewal).toEqual(new Date(2029, 2, 1));
    expect(d.deadline).toEqual(new Date(2028, 11, 1));
  });

  it('Hauptfälligkeit statt Beginn, auch ohne Beginn', () => {
    const d = nextDeadline(entry({ start_date: '2024-03-15', main_due: '2000-01-01' }), new Date(2026, 8, 1))!;
    expect(d.renewal).toEqual(new Date(2027, 0, 1));
    expect(d.deadline).toEqual(new Date(2026, 9, 1));
    expect(nextDeadline(entry({ start_date: null, main_due: '2000-07-01' }), new Date(2026, 0, 10))!.renewal).toEqual(new Date(2026, 6, 1));
  });

  it('Ablauf vorbei: weiter jährlich ab Hauptfälligkeit', () => {
    const d = nextDeadline(entry({ start_date: '2020-05-01', end_date: '2021-05-01', main_due: '2000-05-01' }), new Date(2026, 10, 1))!;
    expect(d.renewal).toEqual(new Date(2027, 4, 1));
  });

  it('KFZ mit abweichender Hauptfälligkeit: ein Monat Frist', () => {
    const d = nextDeadline(entry({ category: 'car', sub_category: 'KFZ', main_due: '2000-04-01' }), new Date(2026, 10, 1))!;
    expect(d.kind).toBe('renewal');
    expect(d.renewal).toEqual(new Date(2027, 3, 1));
    expect(d.deadline).toEqual(new Date(2027, 1, 28));
  });

  it('upcomingDeadlines zeigt nur die nächsten 60 Tage, sortiert', () => {
    const today = new Date(2026, 10, 1);
    const list = upcomingDeadlines([entry({ id: 'a', start_date: '2020-06-01' }), entry({ id: 'b' }), entry({ id: 'c', category: 'car', sub_category: 'KFZ' })], today);
    expect(list.map((d) => d.entry.id)).toEqual(['c', 'b']);
  });
});

describe('Lücken', () => {
  const rules: GapRule[] = GAP_RULE_SEED.map((r, i) => ({ ...r, id: String(i), active: true }));
  const today = new Date(2026, 10, 25);

  it('Familie mit Kindern und Haus bekommt passende Lücken', () => {
    const gaps = customerGaps(rules, { birth_date: '1985-01-01', occupation: 'employee', marital_status: 'married', children: 2, housing: 'own_house', vehicles: ['car'] }, new Set(['phv']));
    expect(gaps).toEqual(expect.arrayContaining(['HR', 'BU', 'Wohngebäude', 'Risiko-LV', 'Kinderinvalidität', 'KFZ']));
    expect(gaps).not.toContain('PHV');
    // Risiko-LV nur einmal, obwohl zwei Regeln passen
    expect(gaps.filter((g) => g === 'Risiko-LV')).toHaveLength(1);
  });

  it('Altersgrenzen und Berufe', () => {
    const bu = rules.find((r) => r.label === 'BU')!;
    expect(ruleApplies(bu, { birth_date: '1960-01-01', occupation: 'employee' }, today)).toBe(false);
    expect(ruleApplies(bu, { birth_date: '1990-01-01', occupation: 'retired' }, today)).toBe(false);
    expect(ruleApplies(bu, { birth_date: '1990-01-01' }, today)).toBe(true);
    const pflege = rules.find((r) => r.label === 'Pflege')!;
    // unbekanntes Alter: Regel mit Mindestalter greift nicht
    expect(ruleApplies(pflege, {}, today)).toBe(false);
  });

  it('Firmen bekommen nur Firmenregeln', () => {
    const gaps = customerGaps(rules, { customer_type: 'company', employees: 5 }, new Set());
    expect(gaps).toEqual(expect.arrayContaining(['Betriebshaftpflicht', 'bAV', 'bKV']));
    expect(gaps).not.toContain('PHV');
  });
});
