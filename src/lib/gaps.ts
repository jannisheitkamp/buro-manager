// Lücken nach Lebenslage: welche Absicherung zu welchem Kunden passt.
// Regeln liegen in gap_rules (Admins pflegen sie), GAP_RULE_SEED ist der Startbestand.

import { differenceInYears } from 'date-fns';

export type CustomerType = 'person' | 'company';

export const OCCUPATIONS = [
  { id: 'employee', label: 'Angestellt' },
  { id: 'self_employed', label: 'Selbstständig' },
  { id: 'civil_servant', label: 'Beamt(in)' },
  { id: 'trainee', label: 'Azubi / Student(in)' },
  { id: 'retired', label: 'Rente / Pension' },
  { id: 'not_working', label: 'Nicht berufstätig' },
] as const;

export const MARITAL = [
  { id: 'single', label: 'Ledig' },
  { id: 'married', label: 'Verheiratet' },
  { id: 'partnership', label: 'Lebensgemeinschaft' },
  { id: 'divorced', label: 'Geschieden' },
  { id: 'widowed', label: 'Verwitwet' },
] as const;

export const HOUSING = [
  { id: 'rent', label: 'Miete' },
  { id: 'own_flat', label: 'Eigentumswohnung' },
  { id: 'own_house', label: 'Eigenes Haus' },
  { id: 'with_parents', label: 'Bei den Eltern' },
] as const;

export const VEHICLES = [
  { id: 'car', label: 'Auto' },
  { id: 'motorcycle', label: 'Motorrad' },
] as const;

export const PETS = [
  { id: 'dog', label: 'Hund' },
  { id: 'cat', label: 'Katze' },
  { id: 'horse', label: 'Pferd' },
] as const;

/** Bedingungen, auf die eine Regel prüfen kann */
export const CONDITIONS = [
  { id: 'always', label: 'Immer' },
  { id: 'own_home', label: 'Wohneigentum' },
  { id: 'rent', label: 'Wohnt zur Miete' },
  { id: 'own_household', label: 'Eigener Haushalt' },
  { id: 'car', label: 'Hat Auto' },
  { id: 'motorcycle', label: 'Hat Motorrad' },
  { id: 'dog', label: 'Hat Hund' },
  { id: 'cat', label: 'Hat Katze' },
  { id: 'horse', label: 'Hat Pferd' },
  { id: 'any_pet', label: 'Hat Tier' },
  { id: 'children', label: 'Hat Kinder' },
  { id: 'partner', label: 'Verheiratet / Partner' },
  { id: 'employees', label: 'Firma mit Mitarbeitern' },
] as const;
export type ConditionId = (typeof CONDITIONS)[number]['id'];

export type GapRule = {
  id: string;
  gap_group: string;
  label: string;
  customer_type: CustomerType;
  condition: ConditionId;
  min_age: number | null;
  max_age: number | null;
  occupations: string[] | null;
  active: boolean;
  sort: number;
};

export type Lifestyle = {
  customer_type?: CustomerType | null;
  birth_date?: string | null;
  occupation?: string | null;
  marital_status?: string | null;
  children?: number | null;
  housing?: string | null;
  vehicles?: string[] | null;
  pets?: string[] | null;
  employees?: number | null;
};

const WORKING = ['employee', 'self_employed', 'civil_servant', 'trainee'];

/** Startregeln; Admins können sie in der Kundenakte unter „Lückenregeln“ anpassen */
export const GAP_RULE_SEED: Omit<GapRule, 'id' | 'active'>[] = [
  { gap_group: 'phv', label: 'PHV', customer_type: 'person', condition: 'always', min_age: null, max_age: null, occupations: null, sort: 10 },
  { gap_group: 'hr', label: 'HR', customer_type: 'person', condition: 'own_household', min_age: null, max_age: null, occupations: null, sort: 20 },
  { gap_group: 'rs', label: 'Rechtsschutz', customer_type: 'person', condition: 'always', min_age: null, max_age: null, occupations: null, sort: 30 },
  { gap_group: 'unf', label: 'UNF', customer_type: 'person', condition: 'always', min_age: null, max_age: null, occupations: null, sort: 40 },
  { gap_group: 'akv', label: 'BU', customer_type: 'person', condition: 'always', min_age: null, max_age: 55, occupations: WORKING, sort: 50 },
  { gap_group: 'av', label: 'Altersvorsorge', customer_type: 'person', condition: 'always', min_age: null, max_age: 60, occupations: WORKING, sort: 60 },
  { gap_group: 'kv', label: 'Krankenvoll', customer_type: 'person', condition: 'always', min_age: null, max_age: null, occupations: ['self_employed', 'civil_servant'], sort: 70 },
  { gap_group: 'pflege', label: 'Pflege', customer_type: 'person', condition: 'always', min_age: 40, max_age: null, occupations: null, sort: 80 },
  { gap_group: 'wg', label: 'Wohngebäude', customer_type: 'person', condition: 'own_home', min_age: null, max_age: null, occupations: null, sort: 90 },
  { gap_group: 'rlv', label: 'Risiko-LV', customer_type: 'person', condition: 'children', min_age: null, max_age: 65, occupations: null, sort: 100 },
  { gap_group: 'rlv', label: 'Risiko-LV', customer_type: 'person', condition: 'partner', min_age: null, max_age: 65, occupations: null, sort: 101 },
  { gap_group: 'kinv', label: 'Kinderinvalidität', customer_type: 'person', condition: 'children', min_age: null, max_age: null, occupations: null, sort: 110 },
  { gap_group: 'kfz', label: 'KFZ', customer_type: 'person', condition: 'car', min_age: null, max_age: null, occupations: null, sort: 120 },
  { gap_group: 'krad', label: 'Motorrad', customer_type: 'person', condition: 'motorcycle', min_age: null, max_age: null, occupations: null, sort: 130 },
  { gap_group: 'hund', label: 'Hundehaftpflicht', customer_type: 'person', condition: 'dog', min_age: null, max_age: null, occupations: null, sort: 140 },
  { gap_group: 'pferd', label: 'Pferdehaftpflicht', customer_type: 'person', condition: 'horse', min_age: null, max_age: null, occupations: null, sort: 150 },
  { gap_group: 'tierkv', label: 'Tier-OP', customer_type: 'person', condition: 'any_pet', min_age: null, max_age: null, occupations: null, sort: 160 },
  { gap_group: 'bhv', label: 'Betriebshaftpflicht', customer_type: 'company', condition: 'always', min_age: null, max_age: null, occupations: null, sort: 200 },
  { gap_group: 'inhalt', label: 'Inhalt', customer_type: 'company', condition: 'always', min_age: null, max_age: null, occupations: null, sort: 210 },
  { gap_group: 'ertrag', label: 'Betriebsunterbrechung', customer_type: 'company', condition: 'always', min_age: null, max_age: null, occupations: null, sort: 220 },
  { gap_group: 'cyber', label: 'Cyber', customer_type: 'company', condition: 'always', min_age: null, max_age: null, occupations: null, sort: 230 },
  { gap_group: 'gewerbe_rs', label: 'Firmenrechtsschutz', customer_type: 'company', condition: 'always', min_age: null, max_age: null, occupations: null, sort: 240 },
  { gap_group: 'av', label: 'bAV', customer_type: 'company', condition: 'employees', min_age: null, max_age: null, occupations: null, sort: 250 },
  { gap_group: 'bkv', label: 'bKV', customer_type: 'company', condition: 'employees', min_age: null, max_age: null, occupations: null, sort: 260 },
];

/** Gruppen, die in Regeln oder Produkten vorkommen, mit lesbarem Namen */
export const GAP_GROUP_LABELS: Record<string, string> = {
  phv: 'Privathaftpflicht', hr: 'Hausrat', rs: 'Rechtsschutz', unf: 'Unfall', akv: 'Arbeitskraft (BU, GF, EU, DU)', av: 'Altersvorsorge',
  kv: 'Krankenvoll', pflege: 'Pflege', wg: 'Wohngebäude', rlv: 'Hinterbliebene (Risiko-LV)', kinv: 'Kinderinvalidität', kinder: 'Kindervorsorge',
  kfz: 'KFZ', krad: 'Motorrad', hund: 'Hundehaftpflicht', pferd: 'Pferdehaftpflicht', tierkv: 'Tier-OP / Tierkranken', bhv: 'Betriebshaftpflicht',
  vsh: 'Vermögensschadenhaftpflicht', inhalt: 'Inhalt', ertrag: 'Betriebsunterbrechung', cyber: 'Cyber', gewerbe_rs: 'Firmenrechtsschutz', bkv: 'bKV',
};

function conditionHolds(c: ConditionId, l: Lifestyle) {
  const vehicles = l.vehicles || [];
  const pets = l.pets || [];
  switch (c) {
    case 'always':
      return true;
    case 'own_home':
      return l.housing === 'own_flat' || l.housing === 'own_house';
    case 'rent':
      return l.housing === 'rent';
    case 'own_household':
      return l.housing !== 'with_parents';
    case 'car':
    case 'motorcycle':
      return vehicles.includes(c);
    case 'dog':
    case 'cat':
    case 'horse':
      return pets.includes(c);
    case 'any_pet':
      return pets.length > 0;
    case 'children':
      return (l.children || 0) > 0;
    case 'partner':
      return l.marital_status === 'married' || l.marital_status === 'partnership';
    case 'employees':
      return (l.employees || 0) > 0;
  }
}

/** Passt die Regel zum Kunden? Unbekanntes Alter: nur Regeln ohne Mindestalter. Unbekannter Beruf zählt als angestellt. */
export function ruleApplies(r: GapRule, l: Lifestyle, today = new Date()) {
  if (!r.active || r.customer_type !== (l.customer_type || 'person')) return false;
  if (!conditionHolds(r.condition, l)) return false;
  const age = l.birth_date ? differenceInYears(today, new Date(`${l.birth_date}T00:00:00`)) : null;
  if (r.min_age != null && (age == null || age < r.min_age)) return false;
  if (r.max_age != null && age != null && age > r.max_age) return false;
  if (r.occupations?.length && !r.occupations.includes(l.occupation || 'employee')) return false;
  return true;
}

/** Fehlende Absicherungen: Regeln, deren Gruppe kein aktiver Vertrag abdeckt (je Gruppe einmal) */
export function customerGaps(rules: GapRule[], l: Lifestyle, coveredGroups: Set<string>) {
  const seen = new Set<string>();
  return rules
    .filter((r) => ruleApplies(r, l))
    .sort((a, b) => a.sort - b.sort)
    .filter((r) => {
      if (coveredGroups.has(r.gap_group) || seen.has(r.gap_group)) return false;
      seen.add(r.gap_group);
      return true;
    })
    .map((r) => r.label);
}
