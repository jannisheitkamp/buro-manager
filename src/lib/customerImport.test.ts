import { describe, expect, it } from 'vitest';
import { guessMapping, matchProduct, parseAmount, parseCsv, parseDate, planImport, readRows, toTable, type Mapping } from './customerImport';
import { SEED_PRODUCTS, type Product } from './products';

const products: Product[] = SEED_PRODUCTS.map((p, i) => ({ ...p, id: `p${i}`, active: true, created_by: null }));

describe('parseCsv', () => {
  it('erkennt Semikolon, Anführungszeichen und Zeilenumbrüche im Feld', () => {
    const rows = parseCsv('﻿Name;Notiz\r\n"Müller";"sagt ""hallo""\nund tschüss"\r\nSchmidt;\r\n');
    expect(rows).toEqual([
      ['Name', 'Notiz'],
      ['Müller', 'sagt "hallo"\nund tschüss'],
      ['Schmidt', ''],
    ]);
  });

  it('erkennt Komma als Trennzeichen und überspringt leere Zeilen', () => {
    expect(parseCsv('a,b\n\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('parseDate', () => {
  it.each([
    ['31.12.1980', '1980-12-31'],
    ['1.2.85', '1985-02-01'],
    ['05/03/2001', '2001-03-05'],
    ['1990-07-15', '1990-07-15'],
    [29221, '1980-01-01'],
    [new Date(1975, 4, 9), '1975-05-09'],
  ])('%s → %s', (input, out) => expect(parseDate(input)).toBe(out));

  it.each(['31.02.1980', 'morgen', '', null])('ungültig: %s', (input) => expect(parseDate(input)).toBeNull());
});

describe('parseAmount', () => {
  it.each([
    ['1.234,50 €', 1234.5],
    ['12,5', 12.5],
    ['12.50', 12.5],
    ['1.200', 1200],
    [99.999, 100],
    ['EUR 7', 7],
  ])('%s → %s', (input, out) => expect(parseAmount(input)).toBe(out));

  it('keine Zahl → null', () => expect(parseAmount('abc')).toBeNull());
});

describe('guessMapping', () => {
  it('ordnet typische Überschriften aus Maklerprogrammen zu', () => {
    const m = guessMapping(['Nachname', 'Vorname', 'Geb.-Datum', 'Telefon', 'E-Mail', 'Straße', 'PLZ', 'Ort', 'Sparte', 'Gesellschaft', 'Vertragsnummer', 'Beginn', 'Beitrag']);
    expect(m).toMatchObject({ last_name: 0, first_name: 1, birth_date: 2, phone: 3, email: 4, street: 5, zip: 6, city: 7, product: 8, insurer: 9, policy_number: 10, start_date: 11, premium: 12 });
  });

  it('nutzt jede Spalte nur einmal', () => {
    const m = guessMapping(['Name', 'Name']);
    expect(m.last_name).toBe(0);
    expect(Object.values(m).filter((v) => v === 0)).toHaveLength(1);
  });
});

describe('matchProduct', () => {
  it('findet Produkte über Namen und Aliase', () => {
    expect(matchProduct('Risikolebensversicherung', products)?.name).toBe('Risikolebensversicherung');
    expect(matchProduct('berufsunfähigkeitsversicherung', products)?.name).toBe('BU');
    expect(matchProduct('Quatschversicherung XY', products)).toBeNull();
  });
});

const mapping = (m: Partial<Mapping>) => ({ ...guessMapping([]), ...m }) as Mapping;

describe('readRows', () => {
  it('trennt „Name komplett“ und setzt die Adresse zusammen', () => {
    const t = toTable([
      ['Kunde', 'Straße', 'PLZ', 'Ort'],
      ['Müller, Anna', 'Hauptstr. 1', '12345', 'Berlin'],
      ['Peter Schmidt', '', '', 'Köln'],
    ]);
    const rows = readRows(t, mapping({ full_name: 0, street: 1, zip: 2, city: 3 }));
    expect(rows[0].customer).toMatchObject({ last_name: 'Müller', first_name: 'Anna', address: 'Hauptstr. 1, 12345 Berlin' });
    expect(rows[1].customer).toMatchObject({ last_name: 'Schmidt', first_name: 'Peter', address: 'Köln' });
    expect(rows[0].line).toBe(2);
  });

  it('meldet unlesbare Werte als Hinweis', () => {
    const t = toTable([
      ['Nachname', 'Geburtsdatum', 'Mail'],
      ['Meier', '32.13.1990', 'kaputt'],
    ]);
    const [r] = readRows(t, mapping({ last_name: 0, birth_date: 1, email: 2 }));
    expect(r.customer.birth_date).toBeNull();
    expect(r.customer.email).toBeNull();
    expect(r.problems).toHaveLength(2);
  });
});

describe('planImport', () => {
  const table = toTable([
    ['Nachname', 'Vorname', 'Telefon', 'Sparte', 'Schein'],
    ['Müller', 'Anna', '0151 1', 'PHV', 'A1'],
    ['Müller', 'Anna', '', 'Hausrat', 'A2'],
    ['Schmidt', 'Peter', '0170 2', 'PHV', 'S1'],
    ['Schmidt', 'Peter', '', 'PHV', 'S1'],
    ['Fremd', 'Kunde', '0', 'PHV', 'F1'],
    ['', '', '', 'PHV', ''],
    ['Neu', '', '', 'Unbekanntes Ding', ''],
  ]);
  const rows = readRows(table, mapping({ last_name: 0, first_name: 1, phone: 2, product: 3, policy_number: 4 }));
  const known = [
    { id: 'c-schmidt', last_name: 'Schmidt', first_name: 'Peter', phone: null, email: 'p@x.de' },
    { id: 'c-fremd', last_name: 'Fremd', first_name: 'Kunde', phone: null },
  ];
  const plan = planImport(
    rows,
    known,
    [{ customer_id: 'c-schmidt', sub_category: 'PHV', policy_number: 's1' }],
    (v) => matchProduct(v, products)?.name || null,
    (id) => id !== 'c-fremd',
  );

  it('fasst Zeilen desselben neuen Kunden zusammen', () => {
    const anna = plan.create.find((c) => c.customer.last_name === 'Müller')!;
    expect(anna.contracts.map((c) => c.product)).toEqual(['PHV', 'HR']);
    expect(anna.customer.phone).toBe('0151 1');
  });

  it('ergänzt vorhandene Kunden nur in leeren Feldern und erkennt doppelte Verträge', () => {
    const schmidt = plan.update.find((u) => u.id === 'c-schmidt')!;
    expect(schmidt.patch).toEqual({ phone: '0170 2' });
    expect(schmidt.contracts).toHaveLength(0);
    expect(plan.warnings.some((w) => w.text.includes('schon eingetragen'))).toBe(true);
  });

  it('überspringt fremde Kunden und Zeilen ohne Namen', () => {
    expect(plan.update.find((u) => u.id === 'c-fremd')).toBeUndefined();
    expect(plan.skipped.map((s) => s.line).sort()).toEqual([6, 7]);
  });

  it('legt Kunden mit unbekannter Sparte ohne Vertrag an', () => {
    const neu = plan.create.find((c) => c.customer.last_name === 'Neu')!;
    expect(neu.contracts).toHaveLength(0);
    expect(plan.unknownProducts).toEqual(['Unbekanntes Ding']);
  });
});
