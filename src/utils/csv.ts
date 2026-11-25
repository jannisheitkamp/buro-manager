// CSV für Excel (Semikolon, BOM, deutsche Zahlen)

/** Text für CSV: Anführungszeichen verdoppeln, Formel-Anfänge entschärfen (Excel würde sie ausführen) */
export const csvText = (val: string | number | null | undefined) => {
  const v = String(val ?? '');
  return `"${(/^[=+\-@\t\r]/.test(v) ? "'" + v : v).replace(/"/g, '""')}"`;
};

/** Zahl mit Komma als Dezimaltrenner */
export const csvNum = (val: number | null | undefined) => (val === null || val === undefined ? '' : String(val).replace('.', ','));

/** Zeilen als CSV-Datei herunterladen; Zellen werden vorher mit csvText/csvNum aufbereitet */
export function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const content = ['﻿' + headers.map(csvText).join(';'), ...rows.map((r) => r.join(';'))].join('\n');
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
