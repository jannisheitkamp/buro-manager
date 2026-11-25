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
  { id: 'phone', label: 'Telefon', group: 'customer', synonyms: ['telefon', 'tel', 'telefonnummer', 'phone', 'rufnummer', 'festnetz'] },
  { id: 'mobile', label: 'Mobil (wenn Telefon leer)', group: 'customer', synonyms: ['mobil', 'handy', 'mobilnummer', 'mobiltelefon'] },
  { id: 'email', label: 'E-Mail', group: 'customer', synonyms: ['e mail', 'email', 'mail', 'e mail adresse'] },
  { id: 'street', label: 'Straße', group: 'customer', synonyms: ['strasse', 'str', 'anschrift', 'adresse', 'strasse hausnummer', 'street'] },
  { id: 'zip', label: 'PLZ', group: 'customer', synonyms: ['plz', 'postleitzahl', 'zip'] },
  { id: 'city', label: 'Ort', group: 'customer', synonyms: ['ort', 'stadt', 'wohnort', 'city'] },
  { id: 'household', label: 'Haushalt', group: 'customer', synonyms: ['haushalt', 'familie'] },
  { id: 'customer_type', label: 'Privat / Gewerbe', group: 'customer', synonyms: ['privat gewerbe', 'kundenart', 'kundentyp', 'privat firma'] },
  { id: 'salutation', label: 'Anrede („Firma“ = Firmenkunde)', group: 'customer', synonyms: ['anrede'] },
  { id: 'notes', label: 'Notizen', group: 'customer', synonyms: ['notiz', 'notizen', 'bemerkung', 'bemerkungen', 'kommentar'] },
  { id: 'product', label: 'Versicherung / Sparte', group: 'contract', synonyms: ['sparte', 'produkt', 'versicherungsart', 'vertragsart', 'versicherung', 'tarif'] },
  { id: 'insurer', label: 'Gesellschaft', group: 'contract', synonyms: ['gesellschaft', 'versicherer', 'versicherungsunternehmen', 'versicherungsgesellschaft', 'anbieter', 'vu'] },
  { id: 'policy_number', label: 'Schein-Nr.', group: 'contract', synonyms: ['schein nr', 'scheinnummer', 'vertragsnummer', 'vertrags nr', 'policennummer', 'police', 'vsnr', 'vertrag nr', 'versicherungsnummer'] },
  { id: 'start_date', label: 'Vertragsbeginn', group: 'contract', synonyms: ['beginn', 'vertragsbeginn', 'versicherungsbeginn', 'beginn vertrag'] },
  { id: 'end_date', label: 'Ablauf', group: 'contract', synonyms: ['ablauf vertrag', 'ablauf', 'vertragsablauf', 'ablaufdatum', 'vertragsende'] },
  { id: 'main_due', label: 'Hauptfälligkeit', group: 'contract', synonyms: ['hauptfaelligkeit', 'faelligkeit'] },
  // brutto zuerst: das zahlt der Kunde
  { id: 'premium', label: 'Beitrag (€)', group: 'contract', synonyms: ['beitrag brutto eur', 'beitrag brutto', 'bruttobeitrag', 'zahlbeitrag', 'beitrag', 'praemie', 'monatsbeitrag', 'jahresbeitrag', 'betrag'] },
  { id: 'payment', label: 'Zahlweise', group: 'contract', synonyms: ['zahlweise', 'zahlungsweise'] },
  { id: 'contract_status', label: 'Vertragsstatus', group: 'contract', synonyms: ['vertragsstatus', 'status'] },
  { id: 'cancel_date', label: 'Stornodatum', group: 'contract', synonyms: ['stornodatum', 'storno datum', 'kuendigungsdatum', 'storniert am'] },
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
      const hit = (s: string) => nh.findIndex((h, i) => !used.has(i) && (exact ? h === s : h.split(' ').includes(s) || h.startsWith(s)));
      // Synonyme in ihrer Reihenfolge prüfen: das erste (beste) gewinnt, z. B. „beitrag brutto“ vor „beitrag“
      const idx = f.synonyms.map(hit).find((i) => i >= 0) ?? -1;
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

/** Datum aus „31.12.1980“, „1980-12-31“, „2026.03.26“, „31/12/80“, Excel-Seriennummer oder Date → yyyy-MM-dd */
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
  m = s.match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (m) return iso(Number(m[1]), Number(m[2]), Number(m[3]));
  if (/^\d{5}$/.test(s)) return parseDate(Number(s));
  return null;
}

/** Hauptfälligkeit: volles Datum oder nur „01.01.“ / „1.4“ (Jahr egal, gespeichert als 2000) */
export function parseDueDate(v: Cell): string | null {
  const full = parseDate(v);
  if (full) return full;
  const m = typeof v === 'string' ? v.trim().match(/^(\d{1,2})\.(\d{1,2})\.?$/) : null;
  return m ? iso(2000, Number(m[2]), Number(m[1])) : null;
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

/**
 * Sparten, wie Maklerprogramme und Gesellschaften sie exportieren → Produkt im Katalog.
 * Gewerbliche Verträge bekommen die Gewerbe-Variante, wenn es eine gibt.
 */
const SPARTE_HINTS: { re: RegExp; privat: string; gewerbe?: string }[] = [
  { re: /^(privat ?)?haftpflicht$|^phv$/, privat: 'PHV', gewerbe: 'Betriebshaftpflicht' },
  { re: /^hausrat/, privat: 'HR' },
  { re: /^unfall/, privat: 'UNF' },
  { re: /^(kraftfahrt|kfz|kraftfahrzeug|auto)/, privat: 'KFZ' },
  { re: /^(wohn)?gebaeude/, privat: 'Wohngebäudeversicherung' },
  { re: /^rechtsschutz/, privat: 'Rechtsschutz', gewerbe: 'Firmenrechtsschutz' },
  { re: /^(leben|lebensversicherung)$/, privat: 'Leben' },
  { re: /^(kranken|krankenversicherung)$/, privat: 'KV Zusatz' },
  { re: /^berufsunfaehig/, privat: 'BU' },
];

/** Produkt im Katalog finden: bekannte Sparten, exakter Name, Alias, dann Wortsuche */
export function matchProduct(value: string, products: Product[]): Product | null {
  // Gewerbliche Verträge kommen aus readRows als „Haftpflicht (Gewerbe)“
  const business = /\(gewerbe\)\s*$/i.test(value);
  const q = norm(value.replace(/\(gewerbe\)\s*$/i, ''));
  if (!q) return null;
  const active = products.filter((p) => p.active);
  const hint = SPARTE_HINTS.find((h) => h.re.test(q));
  const hinted = hint && active.find((p) => p.name === ((business && hint.gewerbe) || hint.privat));
  return (
    hinted ||
    active.find((p) => norm(p.name) === q) ||
    active.find((p) => (p.aliases || '').split(/[,;]| {2,}/).some((a) => norm(a) === q)) ||
    active.find((p) => norm(`${p.name} ${p.aliases || ''}`).split(' ').includes(q)) ||
    active.find((p) => q.split(' ').every((w) => norm(`${p.name} ${p.aliases || ''}`).includes(w))) ||
    null
  );
}

/* ---------------------------------------------------------------- Zeilen */

export type CustomerFields = {
  customer_type: 'person' | 'company';
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
  end_date: string | null;
  main_due: string | null;
  premium: number | null;
  notes: string | null;
};
export type ImportRow = {
  line: number;
  key: string;
  customer: CustomerFields;
  contract: ContractFields | null;
  /** Vertrag in der Datei, aber storniert oder beendet: wird nicht übernommen */
  inactiveContract: string | null;
  problems: string[];
};

/** Platzhalter für „leer“ in Exporten */
const EMPTY = new Set(['-', '–', '—', 'n/a', 'k.a.', 'unbekannt']);
const INACTIVE = /storn|gekuendigt|kuendigung|beendet|abgelaufen|aufgehoben|erloschen|inaktiv|ruhend|annulliert|ausgelaufen/;

/** Schlüssel neuer Kunden: Name plus Geburtsdatum (passt zu name_key|birth_date aus der Datenbank) */
export const importKey = (key: string, birth: string | null | undefined) => `${key}|${birth || ''}`;

export const nameKey = (last: string, first: string | null | undefined) => `${last.trim().toLowerCase()}|${(first || '').trim().toLowerCase()}`;

/** Tabellenzeilen mit Zuordnung in Kunden- und Vertragsdaten übersetzen */
export function readRows(table: Table, mapping: Mapping): ImportRow[] {
  const get = (r: Cell[], f: FieldId) => {
    const v = mapping[f] >= 0 ? r[mapping[f]] : null;
    return typeof v === 'string' && EMPTY.has(v.trim().toLowerCase()) ? null : v;
  };
  const today = new Date().toISOString().slice(0, 10);
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

    const business = /gewerb|firma|betrieb|geschaeft/.test(norm(text(get(r, 'customer_type')))) || /^firma/i.test(text(get(r, 'salutation')));
    const product = text(get(r, 'product'));
    // Stornierte oder beendete Verträge nicht als Bestand übernehmen, sonst gilt die Lücke als geschlossen
    const status = norm(text(get(r, 'contract_status')));
    const cancelDate = parseDate(get(r, 'cancel_date'));
    const inactive = !!product && (INACTIVE.test(status) || (!!cancelDate && cancelDate <= today));
    const payment = text(get(r, 'payment'));
    const rawStart = get(r, 'start_date');
    const start = parseDate(rawStart);
    if (product && rawStart != null && rawStart !== '' && !start) problems.push(`Beginn „${text(rawStart)}“ nicht erkannt`);
    const end = parseDate(get(r, 'end_date'));
    const due = parseDueDate(get(r, 'main_due'));
    const rawPremium = get(r, 'premium');
    const premium = parseAmount(rawPremium);
    if (product && rawPremium != null && rawPremium !== '' && premium == null) problems.push(`Beitrag „${text(rawPremium)}“ ist keine Zahl`);

    return {
      line: i + 2,
      key: nameKey(last, first),
      customer: {
        customer_type: business ? 'company' : 'person',
        last_name: last,
        first_name: first,
        birth_date: birth,
        phone: text(get(r, 'phone')) || text(get(r, 'mobile')) || null,
        email: email && !problems.some((p) => p.startsWith('E-Mail')) ? email : null,
        address,
        household: text(get(r, 'household')) || null,
        notes: text(get(r, 'notes')) || null,
      },
      contract:
        product && !inactive
          ? {
              // gleiche Sparte privat und gewerblich getrennt zuordnen lassen
              product: business ? `${product} (Gewerbe)` : product,
              insurer: text(get(r, 'insurer')) || null,
              policy_number: text(get(r, 'policy_number')) || null,
              start_date: start,
              end_date: end,
              main_due: due,
              premium,
              notes: payment ? `Zahlweise: ${payment}` : null,
            }
          : null,
      inactiveContract: inactive ? `${product}${cancelDate ? `, storniert ${cancelDate.split('-').reverse().join('.')}` : `, ${text(get(r, 'contract_status'))}`}` : null,
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

const FILLABLE = ['birth_date', 'phone', 'email', 'address', 'household', 'notes'] as const;

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
  // Gleicher Name reicht nicht immer: Vater und Sohn heißen oft gleich. Das Geburtsdatum trennt sie,
  // wenn es auf beiden Seiten bekannt ist; fehlt es auf einer Seite, zählt nur der Name.
  const byKey = new Map<string, KnownCustomer[]>();
  known.forEach((c) => {
    const k = nameKey(c.last_name, c.first_name);
    byKey.set(k, [...(byKey.get(k) || []), c]);
  });
  const fits = (a: string | null | undefined, b: string | null | undefined) => !a || !b || a === b;
  const create = new Map<string, ImportPlan['create'][number][]>();
  const update = new Map<string, ImportPlan['update'][number]>();
  const skipped: ImportPlan['skipped'] = [];
  const warnings: ImportPlan['warnings'] = [];
  const unknown = new Set<string>();
  // Doppelte Verträge erkennen: gleicher Kunde + Produkt + Schein-Nr.
  const seen = new Set(knownContracts.map((x) => `${x.customer_id}|${x.sub_category}|${(x.policy_number || '').toLowerCase()}`));
  // Geburtsdatum eines vorhandenen Kunden, auch wenn es erst durch diesen Import ergänzt wird
  const birthOf = (c: KnownCustomer) => update.get(c.id)?.patch.birth_date || c.birth_date || null;

  for (const r of rows) {
    if (!r.customer.last_name) {
      skipped.push({ line: r.line, reason: 'kein Name' });
      continue;
    }
    r.problems.forEach((p) => warnings.push({ line: r.line, text: p }));
    if (r.inactiveContract) warnings.push({ line: r.line, text: `Vertrag ${r.inactiveContract}: nicht übernommen` });

    let contract: ContractFields | null = null;
    if (r.contract) {
      const name = productFor(r.contract.product);
      if (name) contract = { ...r.contract, product: name };
      else {
        unknown.add(r.contract.product);
        warnings.push({ line: r.line, text: `Vertrag „${r.contract.product}“ ausgelassen` });
      }
    }

    const birth = r.customer.birth_date;
    const sameName = byKey.get(r.key) || [];
    let existing: KnownCustomer | undefined;
    if (birth) {
      // erst gleiches Geburtsdatum, sonst ein Kunde ohne Geburtsdatum
      existing = sameName.find((c) => birthOf(c) === birth) || sameName.find((c) => !birthOf(c));
      if (!existing && sameName.length) warnings.push({ line: r.line, text: `${r.customer.last_name}${r.customer.first_name ? `, ${r.customer.first_name}` : ''}: gleicher Name, anderes Geburtsdatum, wird neu angelegt` });
    } else if (sameName.length + (create.get(r.key)?.length || 0) > 1) {
      // mehrdeutig: mehrere gleichnamige Kunden in Datenbank oder Datei
      skipped.push({ line: r.line, reason: `mehrere Kunden heißen ${r.customer.last_name}${r.customer.first_name ? `, ${r.customer.first_name}` : ''}, Geburtsdatum fehlt` });
      continue;
    } else existing = sameName[0];

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
      // neue Kunden aus der Datei: gleiche Regel untereinander
      const list = create.get(r.key) || [];
      let c = list.find((x) => x.customer.birth_date === birth && !!birth) || list.find((x) => fits(x.customer.birth_date, birth));
      if (!c) {
        c = { key: r.key, customer: { ...r.customer }, contracts: [] };
        list.push(c);
        create.set(r.key, list);
      }
      // weitere Zeilen desselben Kunden ergänzen leere Felder
      for (const f of FILLABLE) if (!c.customer[f] && r.customer[f]) c.customer[f] = r.customer[f];
      if (contract) {
        const k = `${r.key}|${c.customer.birth_date || list.indexOf(c)}|${contract.product}|${(contract.policy_number || '').toLowerCase()}`;
        if (!seen.has(k)) {
          seen.add(k);
          c.contracts.push(contract);
        }
      }
    }
  }

  // Kunden ohne Änderung und ohne neue Verträge nicht anfassen
  const changed = [...update.values()].filter((u) => Object.keys(u.patch).length > 0 || u.contracts.length > 0);
  return {
    // Schlüssel mit Geburtsdatum, damit gleichnamige neue Kunden nach dem Speichern auseinanderzuhalten sind
    create: [...create.values()].flat().map((c) => ({ ...c, key: importKey(c.key, c.customer.birth_date) })),
    update: changed,
    unchanged: update.size - changed.length,
    skipped,
    warnings,
    unknownProducts: [...unknown],
  };
}
