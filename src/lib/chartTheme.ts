// Gemeinsame Farben für alle Diagramme
export const CHART = {
  primary: '#146A68',
  primaryLight: '#3F9C97',
  accent: '#F2A541',
  grid: 'rgba(110, 120, 114, 0.18)',
  tick: '#9AA39C',
};

// Sparten-Farben: ruhig, gut unterscheidbar, hell wie dunkel lesbar
export const CATEGORY_COLORS: Record<string, string> = {
  life: '#146A68',
  health: '#C2577A',
  property: '#F2A541',
  car: '#5B8DB8',
  legal: '#7A9A5B',
  other: '#9AA39C',
};

export const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid rgba(110, 120, 114, 0.25)',
  boxShadow: '0 8px 24px -12px rgba(20, 33, 43, 0.25)',
  fontSize: 12,
  padding: '6px 10px',
};
