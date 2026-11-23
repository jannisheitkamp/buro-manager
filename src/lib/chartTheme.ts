import { AREAS } from '@/lib/products';

// Gemeinsame Farben für alle Diagramme
export const CHART = {
  primary: '#146A68',
  primaryLight: '#3F9C97',
  accent: '#F2A541',
  grid: 'rgba(110, 120, 114, 0.18)',
  tick: '#9AA39C',
};

// Bereichs-Farben: ruhig, gut unterscheidbar, hell wie dunkel lesbar
export const CATEGORY_COLORS: Record<string, string> = Object.fromEntries(AREAS.map((a) => [a.id, a.color]));

export const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid rgba(110, 120, 114, 0.25)',
  boxShadow: '0 8px 24px -12px rgba(20, 33, 43, 0.25)',
  fontSize: 12,
  padding: '6px 10px',
};
