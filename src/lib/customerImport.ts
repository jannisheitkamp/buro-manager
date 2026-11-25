// Kunden und Bestandsverträge aus CSV/Excel einlesen.
// Reine Logik ohne Datenbank, damit sie sich testen lässt; die Oberfläche liegt in CustomerImportModal.

import { norm, type Product } from './products';

export type Cell = string | number | boolean | Date | null | undefined;
export type Table = { headers: string[]; rows: Cell[][] };

/** Felder, die eine Spalte füllen kann */
export const IMPORT_FIELDS = [
  { id: 'last_name', label: 'Nachname / Firma', group: 'customer', required: true, synonyms: ['nachname', 'name', 'familienname', 'kunde', 'firma', 'firmenname', 'last name', 'surname'] },
  { id: 'first_name', label: 'Vorname', group: 'customer', synonyms: ['vorname', 'first name', 'rufname'] },
  { id: 'full_name', label: 'Name komplett („Müller, Anna“)', group: 'customer', synonyms: ['kundenname', 'name komplett', 'vollstaendiger name', 'name vorname'] },
  { id: 'birth_date', label: 'Geburtsdatum', group: 'customer', synonyms: ['geburtsdatum', 'geboren', 'geb datum', 'geburtstag', 'birth', 'geb'] },
  { id: 'phone', label: 'Telefon', group: 'customer', synonyms: ['telefon', 'tel', 'mobil', 'handy', 'telefonnummer', 'phone', 'rufnummer'] },
  { id: 'email', label: 'E-Mail', group: 'customer', synonyms: ['e mail', 'email', 'mail', 'e mail adresse'] },
  { id: 'street', label: 'Straße', group: 'customer', synonyms: ['strasse', 'str', 'anschrift', 'adresse', 'strasse hausnummer', 'street'] },
  { id: 'zip', label: 'PLZ', group: 'customer', synonyms: ['plz', 'postleitzahl', 'zip'] },
  { id: 'city', label: 'Ort', group: 'customer', synonyms: ['ort', 'stadt', 'wohnort', 'city'] },
  { id: 'household', label: 'Haushalt', group: 'customer', synonyms: ['haushalt', 'familie'] },
  { id: 'notes', label: 'Notizen', group: 'customer', synonyms: ['notiz', 'notizen', 'bemerkung', 'bemerkungen', 'kommentar'] },
  { id: 'product', label: 'Versicherung / Sparte', group: 'contract', synonyms: ['sparte', 'produkt', 'versicherung', 'tarif', 'vertragsart', 'art', 'versicherungsart'] },
  { id: 'insurer', label: 'Gesellschaft', group: 'contract', synonyms: ['gesellschaft', 'versicherer', 'anbieter', 'vu', 'versicherungsgesellschaft'] },
  { id: 'policy_number', label: 'Schein-Nr.', group: 'contract', synonyms: ['schein nr', 'scheinnummer', 'vertragsnummer', 'vertrags nr', 'policennummer', 'police', 'vsnr', 'vertrag nr', 'versicherungsnummer'] },
  { id: 'start_date', label: 'Vertragsbeginn', group: 'contract', synonyms: ['beginn', 'vertragsbeginn', 'versicherungsbeginn', 'start', 'ab'] },
  { id: 'premium', label: 'Beitrag (€)', group: 'contract', synonyms: ['beitrag', 'praemie', 'monatsbeitrag', 'jahresbeitrag', 'zahlbeitrag', 'betrag'] },
] as const;
export type FieldId = (typeof IMPORT_FIELDS)[number]['id'];
/** Feld → Spaltenindex (oder -1 für „nicht importieren“) */
export type Mapping = Record<FieldId, number>;

/* ---------------------------------------------------------------- Datei lesen */

/** CSV mit Anführungszeichen; Trennzeichen (; , Tab) wird aus der ersten Zeile erkannt */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] || '';
  const delim = [';', '\t', ','].map((d) => [d, firstLine.split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0];
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

/** Erste nicht leere Zeile als Überschrift, Rest als Daten */
export function toTable(raw: Cell[][]): Table {
  const rows = raw.filter((r) => r.some((c) => c != null && String(c).trim() !== ''));
  const [head = [], ...data] = rows;
  const width = Math.max(head.length, ...data.map((r) => r.length));
  const headers = Array.from({ length: width }, (_, i) => String(head[i] ?? '').trim() || `Spalte ${i + 1}`);
  return { headers, rows: data };
}

/* ---------------------------------------------------------------- Zuordnung */

/** Spalten anhand der Überschriften erraten; jede Spalte höchstens einmal */
export function guessMapping(headers: string[]): Mapping {
  const used = new Set<number>();
  const m = {} as Mapping;
  const nh = headers.map((h) => norm(h));
  // erst exakte Treffer, dann Teiltreffer
  for (const exact of [true, false]) {
    for (const f of IMPORT_FIELDS) {
      if (m[f.id] !== undefined && m[f.id] >= 0) continue;
      const idx = nh.findIndex((h, i) => !used.has(i) && f.synonyms.some((s) => (exact ? h === s : h.split(' ').includes(s) || h.startsWith(s))));
      if (idx >= 0) {
        m[f.id] = idx;
        used.add(idx);
      } else m[f.id] = -1;
    }
  }
  // „Name“ allein mit Komma-Werten ist eher der volle Name; das klärt die Vorschau
  return m;
}

/* ---------------------------------------------------------------- Werte */

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, mo: number, d: number) => {
  if (y < 100) y += y > 30 ? 1900 : 2000;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || y < 1900 || y > 2100) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
};

/** Datum aus „31.12.1980“, „1980-12-31“, „31/12/80“, Excel-Seriennummer oder Date → yyyy-MM-dd */
export function parseDate(v: Cell): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : iso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === 'number') {
    // Excel zählt Tage ab 30.12.1899
    if (v < 1 || v > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
    return iso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) return iso(Number(m[3]), Number(m[2]), Number(m[1]));
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  if (/^\d{5}$/.test(s)) return parseDate(Number(s));
  return null;
}

/** Betrag aus „1.234,50 €“, „12,5“, „12.50“ oder Zahl */
export function parseAmount(v: Cell): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  let s = String(v).replace(/[€\s]|EUR/gi, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const text = (v: Cell) => {
  if (v == null) return '';
  if (v instanceof Date) return parseDate(v) || '';
  return String(v).trim();
};

/** Produkt im Katalog finden: exakter Name, Alias, dann Wortsuche */
export function matchProduct(value: string, products: Product[]): Product | null {
  const q = norm(value);
  if (!q) return null;
  const active = products.filter((p) => p.active);
  return (
    active.find((p) => norm(p.name) === q) ||
    active.find((p) => (p.aliases || '').split(/[,;]| {2,}/).some((a) => norm(a) === q)) ||
    active.find((p) => norm(`${p.name} ${p.aliases || ''}`).split(' ').includes(q)) ||
    active.find((p) => q.split(' ').every((w) => norm(`${p.name} ${p.aliases || ''}`).includes(w))) ||
    null
  );
}

/* ---------------------------------------------------------------- Zeilen */

export type CustomerFields = {
  last_name: string;
  first_name: string | null;
  birth_date: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  household: string | null;
  notes: string | null;
};
export type ContractFields = {
  product: string;
  insurer: string | null;
  policy_number: string | null;
  start_date: string | null;
  premium: number | null;
};
export type ImportRow = { line: number; key: string; customer: CustomerFields; contract: ContractFields | null; problems: string[] };

export const nameKey = (last: string, first: string | null | undefined) => `${last.trim().toLowerCase()}|${(first || '').trim().toLowerCase()}`;

/** Tabellenzeilen mit Zuordnung in Kunden- und Vertragsdaten übersetzen */
export function readRows(table: Table, mapping: Mapping): ImportRow[] {
  const get = (r: Cell[], f: FieldId) => (mapping[f] >= 0 ? r[mapping[f]] : null);
  return table.rows.map((r, i) => {
    const problems: string[] = [];
    let last = text(get(r, 'last_name'));
    let first = text(get(r, 'first_name')) || null;
    const full = text(get(r, 'full_name'));
    if (full && !last) {
      // „Müller, Anna“ oder „Anna Müller“
      if (full.includes(',')) [last, first] = full.split(',').map((s) => s.trim()) as [string, string];
      else {
        const parts = full.split(/\s+/);
        last = parts.pop() || '';
        first = parts.join(' ') || null;
      }
    }
    const rawBirth = get(r, 'birth_date');
    const birth = parseDate(rawBirth);
    if (rawBirth != null && rawBirth !== '' && !birth) problems.push(`Geburtsdatum „${text(rawBirth)}“ nicht erkannt`);
    const street = text(get(r, 'street'));
    const place = [text(get(r, 'zip')), text(get(r, 'city'))].filter(Boolean).join(' ');
    const address = [street, place].filter(Boolean).join(', ') || null;
    const email = text(get(r, 'email')) || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problems.push(`E-Mail „${email}“ sieht falsch aus`);

    const product = text(get(r, 'product'));
    const rawStart = get(r, 'start_date');
    const start = parseDate(rawStart);
    if (product && rawStart != null && rawStart !== '' && !start) problems.push(`Beginn „${text(rawStart)}“ nicht erkannt`);
    const rawPremium = get(r, 'premium');
    const premium = parseAmount(rawPremium);
    if (product && rawPremium != null && rawPremium !== '' && premium == null) problems.push(`Beitrag „${text(rawPremium)}“ ist keine Zahl`);

    return {
      line: i + 2,
      key: nameKey(last, first),
      customer: {
        last_name: last,
        first_name: first,
        birth_date: birth,
        phone: text(get(r, 'phone')) || null,
        email: email && !problems.some((p) => p.startsWith('E-Mail')) ? email : null,
        address,
        household: text(get(r, 'household')) || null,
        notes: text(get(r, 'notes')) || null,
      },
      contract: product
        ? { product, insurer: text(get(r, 'insurer')) || null, policy_number: text(get(r, 'policy_number')) || null, start_date: start, premium }
        : null,
      problems,
    };
  });
}

/* ---------------------------------------------------------------- Plan */

export type KnownCustomer = { id: string; last_name: string; first_name: string | null } & Partial<Record<keyof CustomerFields, string | null>>;
export type KnownContract = { customer_id: string; sub_category: string; policy_number: string | null };

export type ImportPlan = {
  /** neue Kunden je Namensschlüssel, mit ihren Verträgen */
  create: { key: string; customer: CustomerFields; contracts: ContractFields[] }[];
  /** vorhandene Kunden: nur leere Felder füllen, Verträge anhängen */
  update: { id: string; name: string; patch: Partial<CustomerFields>; contracts: ContractFields[] }[];
  skipped: { line: number; reason: string }[];
  /** vorhandene Kunden, bei denen nichts zu ergänzen war */
  unchanged: number;
  warnings: { line: number; text: string }[];
  /** Produktnamen aus der Datei, die im Katalog fehlen */
  unknownProducts: string[];
};

const FILLABLE: (keyof CustomerFields)[] = ['birth_date', 'phone', 'email', 'address', 'household', 'notes'];

/**
 * Was beim Import passieren würde. Dubletten (gleicher Nach- und Vorname) werden ergänzt, nicht überschrieben.
 * productFor: Dateiwert → Katalogname oder null (Vertrag weglassen).
 */
export function planImport(
  rows: ImportRow[],
  known: KnownCustomer[],
  knownContracts: KnownContract[],
  productFor: (value: string) => string | null,
  canEdit: (customerId: string) => boolean,
): ImportPlan {
  const byKey = new Map(known.map((c) => [nameKey(c.last_name, c.first_name), c]));
  const create = new Map<string, ImportPlan['create'][number]>();
  const update = new Map<string, ImportPlan['update'][number]>();
  const skipped: ImportPlan['skipped'] = [];
  const warnings: ImportPlan['warnings'] = [];
  const unknown = new Set<string>();
  // Doppelte Verträge erkennen: gleicher Kunde + Produkt + Schein-Nr.
  const seen = new Set(knownContracts.map((x) => `${x.customer_id}|${x.sub_category}|${(x.policy_number || '').toLowerCase()}`));

  for (const r of rows) {
    if (!r.customer.last_name) {
      skipped.push({ line: r.line, reason: 'kein Name' });
      continue;
    }
    r.problems.forEach((p) => warnings.push({ line: r.line, text: p }));

    let contract: ContractFields | null = null;
    if (r.contract) {
      const name = productFor(r.contract.product);
      if (name) contract = { ...r.contract, product: name };
      else {
        unknown.add(r.contract.product);
        warnings.push({ line: r.line, text: `Vertrag „${r.contract.product}“ ausgelassen` });
      }
    }

    const existing = byKey.get(r.key);
    if (existing) {
      if (!canEdit(existing.id)) {
        skipped.push({ line: r.line, reason: `${r.customer.last_name} gibt es schon, betreut von jemand anderem` });
        continue;
      }
      const u = update.get(existing.id) || { id: existing.id, name: existing.first_name ? `${existing.last_name}, ${existing.first_name}` : existing.last_name, patch: {}, contracts: [] };
      for (const f of FILLABLE) {
        if (r.customer[f] && !existing[f] && !u.patch[f]) u.patch[f] = r.customer[f]!;
      }
      if (contract) {
        const k = `${existing.id}|${contract.product}|${(contract.policy_number || '').toLowerCase()}`;
        if (seen.has(k)) warnings.push({ line: r.line, text: `${contract.product} ist schon eingetragen` });
        else {
          seen.add(k);
          u.contracts.push(contract);
        }
      }
      update.set(existing.id, u);
    } else {
      const c = create.get(r.key) || { key: r.key, customer: { ...r.customer }, contracts: [] };
      // weitere Zeilen desselben Kunden ergänzen leere Felder
      for (const f of FILLABLE) if (!c.customer[f] && r.customer[f]) c.customer[f] = r.customer[f];
      if (contract) {
        const k = `${r.key}|${contract.product}|${(contract.policy_number || '').toLowerCase()}`;
        if (!seen.has(k)) {
          seen.add(k);
          c.contracts.push(contract);
        }
      }
      create.set(r.key, c);
    }
  }

  // Kunden ohne Änderung und ohne neue Verträge nicht anfassen
  const changed = [...update.values()].filter((u) => Object.keys(u.patch).length > 0 || u.contracts.length > 0);
  return {
    create: [...create.values()],
    update: changed,
    unchanged: update.size - changed.length,
    skipped,
    warnings,
    unknownProducts: [...unknown],
  };
}
