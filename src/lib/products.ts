// Produktkatalog: alle Versicherungs- und Finanzprodukte mit Bereich, Rechenart und Lebenswerte-Faktor.
// Die Liste liegt in der Datenbank (insurance_products); productCatalog.json ist nur der Startbestand.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import catalog from './productCatalog.json';

export type CalcMethod = 'promille_sum' | 'monthly_multiple' | 'percent_yearly' | 'courtage_rate' | 'percent_sum' | 'fixed';

export type Area = {
  id: string;
  label: string;
  color: string;
  method: CalcMethod;
  rate: number;
  lv: number;
};

/** Bereiche mit Standard-Rechenart, Standard-Satz und Lebenswerte-Faktor */
export const AREAS: Area[] = [
  { id: 'life', label: 'Leben & Vorsorge', color: '#146A68', method: 'promille_sum', rate: 8, lv: 1.142 },
  { id: 'health', label: 'Kranken & Pflege', color: '#C2577A', method: 'monthly_multiple', rate: 3, lv: 0 },
  { id: 'property', label: 'Sach & Haftpflicht', color: '#F2A541', method: 'courtage_rate', rate: 7.5, lv: 20 },
  { id: 'car', label: 'KFZ', color: '#5B8DB8', method: 'courtage_rate', rate: 3, lv: 1 },
  { id: 'legal', label: 'Rechtsschutz', color: '#7A9A5B', method: 'courtage_rate', rate: 5, lv: 20 },
  { id: 'travel', label: 'Reise', color: '#3FA7B5', method: 'percent_yearly', rate: 10, lv: 0 },
  { id: 'pet', label: 'Tier', color: '#A9784B', method: 'courtage_rate', rate: 7.5, lv: 20 },
  { id: 'business', label: 'Gewerbe', color: '#6E64B0', method: 'courtage_rate', rate: 10, lv: 20 },
  { id: 'investment', label: 'Finanzen & Investment', color: '#B59A2F', method: 'percent_sum', rate: 1, lv: 0 },
  { id: 'other', label: 'Sonstige', color: '#9AA39C', method: 'courtage_rate', rate: 5, lv: 20 },
];
export const areaOf = (id: string | null | undefined) => AREAS.find((a) => a.id === id) || AREAS[AREAS.length - 1];
export const areaLabel = (id: string | null | undefined) => areaOf(id).label;

export const METHODS: { id: CalcMethod; label: string; unit: string; hint: string }[] = [
  { id: 'promille_sum', label: 'Promille der Beitragssumme', unit: '‰', hint: 'Jahresbeitrag brutto × Laufzeit (max. 35 Jahre, Biometrie 45 Jahre) × Satz ‰' },
  { id: 'monthly_multiple', label: 'Monatsbeiträge', unit: 'MB', hint: 'Monatsbeitrag brutto × Anzahl Monatsbeiträge' },
  { id: 'percent_yearly', label: 'Prozent vom Jahresbeitrag', unit: '%', hint: 'Einmal: Jahresbeitrag brutto × Satz %' },
  { id: 'courtage_rate', label: 'Laufende Courtage', unit: '%', hint: 'Je Rate: Nettobeitrag × Satz %, Auszahlung zum 31.12.' },
  { id: 'percent_sum', label: 'Prozent der Vertragssumme', unit: '%', hint: 'Anlage-, Bauspar- oder Darlehenssumme × Satz %' },
  { id: 'fixed', label: 'Fester Betrag', unit: '€', hint: 'Fester Euro-Betrag je Vertrag' },
];
export const methodOf = (id: CalcMethod) => METHODS.find((m) => m.id === id)!;

export type Product = {
  id: string;
  name: string;
  area: string;
  calc_method: CalcMethod;
  lv_factor: number;
  default_rate: number;
  gap_group: string | null;
  aliases: string | null;
  active: boolean;
  created_by: string | null;
};

/** Besonderheiten der ursprünglichen Sparten */
const SPECIAL: Record<string, Partial<Pick<Product, 'calc_method' | 'default_rate' | 'lv_factor'>>> = {
  'Reise-KV': { calc_method: 'percent_yearly', default_rate: 10 },
  Sterbegeldversicherung: {},
  Restschuldversicherung: { calc_method: 'percent_yearly', default_rate: 10, lv_factor: 0 },
  Kinderinvaliditätsversicherung: { calc_method: 'courtage_rate', default_rate: 7.5, lv_factor: 20 },
  'Fondssparplan': { calc_method: 'percent_yearly', default_rate: 3 },
  'ETF-Sparplan': { calc_method: 'percent_yearly', default_rate: 1 },
  'Vermögenswirksame Leistungen (VL)': { calc_method: 'fixed', default_rate: 50 },
  Mietkautionsbürgschaft: { calc_method: 'percent_yearly', default_rate: 15, lv_factor: 0 },
};

/** Katalog im Code: Startbestand und Rückfall, falls die Datenbank noch nicht geantwortet hat */
export const SEED_PRODUCTS: Omit<Product, 'id' | 'active' | 'created_by'>[] = Object.entries(catalog as Record<string, string[][]>).flatMap(([area, list]) =>
  list.map(([name, gap, aliases]) => {
    const a = areaOf(area);
    return { name, area, calc_method: a.method, lv_factor: a.lv, default_rate: a.rate, gap_group: gap || null, aliases: aliases || null, ...SPECIAL[name] };
  }),
);

let cache: Product[] = SEED_PRODUCTS.map((p, i) => ({ ...p, id: `seed-${i}`, active: true, created_by: null }));
const listeners = new Set<(p: Product[]) => void>();

export const productByName = (name: string | null | undefined) => (name ? cache.find((p) => p.name === name) : undefined);

/** Laufende Courtage (je Rate, Auszahlung 31.12.) statt einmaliger Provision */
export const isCourtageProduct = (name: string | null | undefined) => productByName(name)?.calc_method === 'courtage_rate';

export async function loadProducts() {
  const { data } = await supabase.from('insurance_products').select('*').order('name');
  if (data?.length) {
    cache = (data as Product[]).map((p) => ({ ...p, lv_factor: Number(p.lv_factor), default_rate: Number(p.default_rate) }));
    listeners.forEach((l) => l(cache));
  }
  return cache;
}

/** Katalog für Komponenten; lädt beim ersten Aufruf und hält alle Nutzer synchron */
export function useProducts() {
  const [products, setProducts] = useState<Product[]>(cache);
  useEffect(() => {
    listeners.add(setProducts);
    loadProducts();
    return () => {
      listeners.delete(setProducts);
    };
  }, []);
  const reload = useCallback(() => loadProducts(), []);
  return { products, reload };
}

/** Suchtext normalisieren: Kleinschreibung, Umlaute, keine Sonderzeichen */
export const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

export const matchesProduct = (p: Product, q: string) => {
  const hay = norm(`${p.name} ${p.aliases || ''} ${areaLabel(p.area)}`);
  return norm(q)
    .split(' ')
    .every((w) => hay.includes(w));
};

/** Biometrie-Produkte (Arbeitskraft, Tod, Pflege, schwere Krankheit): Provision auf bis zu 45 Jahre */
export const BIOMETRIC = [
  'BU', 'Berufsunfähigkeitsversicherung', 'Erwerbsunfähigkeitsversicherung', 'Dienstunfähigkeitsversicherung',
  'Grundfähigkeitsversicherung', 'Existenzschutzversicherung', 'Schwere-Krankheiten-Versicherung',
  'Risikolebensversicherung', 'Pflegerentenversicherung', 'Sterbegeldversicherung', 'Kindervorsorge / Ausbildungsversicherung',
];
/** Höchste Laufzeit für die Provision: Biometrie 45 Jahre, alles andere 35 Jahre */
export const maxYearsFor = (subCategory: string | null | undefined) => (subCategory && BIOMETRIC.includes(subCategory) ? 45 : 35);

/** Provision und Lebenswerte eines Vertrags nach Rechenart */
export function calcCommission(
  method: CalcMethod,
  o: { rate: number; net: number; gross: number; factor: number; duration: number; installments: number; contractSum: number; lvFactor: number; maxYears?: number },
) {
  const netYearly = o.net * o.factor;
  const grossYearly = o.gross * o.factor;
  let valuation = 0;
  let commission = 0;
  let lvBase = netYearly;
  switch (method) {
    case 'promille_sum':
      valuation = grossYearly * Math.min(o.duration, o.maxYears ?? 35);
      commission = valuation * (o.rate / 1000);
      lvBase = valuation;
      break;
    case 'monthly_multiple':
      valuation = o.gross;
      commission = o.gross * o.rate;
      break;
    case 'percent_yearly':
      valuation = grossYearly;
      commission = grossYearly * (o.rate / 100);
      break;
    case 'courtage_rate':
      valuation = netYearly;
      commission = o.net * (o.rate / 100) * o.installments;
      break;
    case 'percent_sum':
      valuation = o.contractSum;
      commission = o.contractSum * (o.rate / 100);
      lvBase = o.contractSum;
      break;
    case 'fixed':
      commission = o.rate;
      break;
  }
  return { valuation, commission, lifeValues: lvBase * o.lvFactor };
}
