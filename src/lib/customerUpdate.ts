// Daten-Update per Link: Felder, Vergleich alt/neu und Texte zum Verschicken
import { HOUSING, MARITAL, OCCUPATIONS } from '@/lib/gaps';

export type UpdatePayload = {
  address?: string;
  phone?: string;
  email?: string;
  marital_status?: string;
  children?: number;
  occupation?: string;
  housing?: string;
  message?: string;
};
export type UpdateRequest = {
  id: string;
  customer_id: string;
  status: 'open' | 'submitted' | 'applied' | 'rejected' | 'expired';
  submitted_at: string | null;
  payload: UpdatePayload | null;
};
/** Felder, die direkt in die Kundenakte übernommen werden können */
export type UpdateField = Exclude<keyof UpdatePayload, 'message'>;

const label = (list: readonly { id: string; label: string }[], id: unknown) => list.find((x) => x.id === id)?.label || (id == null || id === '' ? '' : String(id));

export const FIELDS: { key: UpdateField; label: string; show: (v: unknown) => string }[] = [
  { key: 'address', label: 'Adresse', show: (v) => (v ? String(v) : '') },
  { key: 'phone', label: 'Telefon', show: (v) => (v ? String(v) : '') },
  { key: 'email', label: 'E-Mail', show: (v) => (v ? String(v) : '') },
  { key: 'marital_status', label: 'Familienstand', show: (v) => label(MARITAL, v) },
  { key: 'children', label: 'Kinder', show: (v) => (v == null ? '' : String(v)) },
  { key: 'occupation', label: 'Beruf', show: (v) => label(OCCUPATIONS, v) },
  { key: 'housing', label: 'Wohnsituation', show: (v) => label(HOUSING, v) },
];

/** Was hat der Kunde geändert? Gleiche Werte fallen weg. */
export function diffUpdate(current: Partial<Record<UpdateField, unknown>>, payload: UpdatePayload | null) {
  if (!payload) return [];
  return FIELDS.filter((f) => payload[f.key] != null && String(payload[f.key]) !== String(current[f.key] ?? '')).map((f) => ({
    key: f.key,
    label: f.label,
    old: f.show(current[f.key]),
    next: f.show(payload[f.key]),
    value: payload[f.key] as string | number,
  }));
}

export const updateLink = (token: string, origin = window.location.origin) => `${origin}/update/${token}`;

export const updateMessage = (firstName: string | null, link: string, sender?: string | null) =>
  `Hallo${firstName ? ` ${firstName}` : ''}, damit Ihre Unterlagen bei uns aktuell bleiben: Unter diesem Link können Sie geänderte Daten (z. B. neue Adresse oder Telefonnummer) direkt eintragen. Der Link gilt 14 Tage.\n${link}${sender ? `\n\nViele Grüße\n${sender}` : ''}`;
