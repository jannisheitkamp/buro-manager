// Berichtsheft (Ausbildungsnachweis): Wochen, Status und PDF
import { addDays, addWeeks, format, getISOWeek, parseISO, startOfISOWeek } from 'date-fns';
import { de } from 'date-fns/locale';

export type ReportStatus = 'draft' | 'submitted' | 'approved' | 'returned';
export type TrainingReport = {
  id: string;
  user_id: string;
  week_start: string;
  company: string;
  training: string;
  school: string;
  status: ReportStatus;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  updated_at: string;
};

export const STATUS_LABEL: Record<ReportStatus, string> = {
  draft: 'Entwurf',
  submitted: 'Eingereicht',
  approved: 'Abgezeichnet',
  returned: 'Zurückgegeben',
};
export const STATUS_TONE: Record<ReportStatus, 'gray' | 'sky' | 'emerald' | 'amber'> = {
  draft: 'gray',
  submitted: 'sky',
  approved: 'emerald',
  returned: 'amber',
};

export const SECTIONS = [
  { key: 'company', label: 'Betriebliche Tätigkeiten', hint: 'Was hast du diese Woche im Büro gemacht?' },
  { key: 'training', label: 'Unterweisungen, Schulungen', hint: 'Was wurde dir gezeigt oder erklärt?' },
  { key: 'school', label: 'Berufsschule', hint: 'Themen im Unterricht' },
] as const;
export type SectionKey = (typeof SECTIONS)[number]['key'];

/** Montag der Woche als yyyy-MM-dd */
export const weekKey = (d: Date) => format(startOfISOWeek(d), 'yyyy-MM-dd');
export const weekLabel = (key: string) => {
  const mon = parseISO(key);
  return `KW ${getISOWeek(mon)} · ${format(mon, 'dd.MM.')} – ${format(addDays(mon, 4), 'dd.MM.yyyy')}`;
};
export const shiftWeek = (key: string, n: number) => weekKey(addWeeks(parseISO(key), n));

/** Alle Wochen vom ersten Bericht bis zur aktuellen Woche, neueste zuerst (fehlende inklusive) */
export function weeksSince(reports: Pick<TrainingReport, 'week_start'>[], today = new Date()): string[] {
  const now = weekKey(today);
  const first = reports.map((r) => r.week_start).sort()[0] || now;
  const out: string[] = [];
  for (let k = first; k <= now; k = shiftWeek(k, 1)) out.push(k);
  return out.reverse();
}

const DAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
/** Berufsschultage aus dem Profil als Text, z. B. „Di (ganztags), Do (halbtags)“ */
export const schoolDaysText = (days?: { dayOfWeek: number; type: 'full' | 'half' }[] | null) =>
  (days || [])
    .slice()
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((d) => `${DAYS[d.dayOfWeek]} (${d.type === 'full' ? 'ganztags' : 'halbtags'})`)
    .join(', ');

/** Laufende Nummer des Nachweises: Wochen seit dem ersten Bericht, ab 1 */
export const reportNumber = (key: string, firstKey: string) =>
  Math.round((parseISO(key).getTime() - parseISO(firstKey).getTime()) / (7 * 864e5)) + 1;

/** Ein oder mehrere Berichte als PDF, eine Seite pro Woche */
export async function exportTrainingPdf(reports: TrainingReport[], opts: { name: string; firstWeek: string; names: Map<string, string> }) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  const BRAND: [number, number, number] = [20, 106, 104];
  const sorted = reports.slice().sort((a, b) => a.week_start.localeCompare(b.week_start));

  sorted.forEach((r, i) => {
    if (i > 0) doc.addPage();
    const mon = parseISO(r.week_start);
    doc.setFontSize(16);
    doc.text(`Ausbildungsnachweis Nr. ${reportNumber(r.week_start, opts.firstWeek)}`, 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(`${opts.name} · Woche vom ${format(mon, 'dd.MM.yyyy')} bis ${format(addDays(mon, 4), 'dd.MM.yyyy')} (KW ${getISOWeek(mon)})`, 14, 25);
    doc.setTextColor(0);

    let y = 34;
    for (const s of SECTIONS) {
      doc.setFontSize(11);
      doc.setTextColor(...BRAND);
      doc.text(s.label, 14, y);
      doc.setTextColor(0);
      doc.setFontSize(10);
      const lines = doc.splitTextToSize(r[s.key].trim() || '–', W - 32) as string[];
      const h = Math.max(lines.length * 5 + 6, 22);
      doc.setDrawColor(200);
      doc.rect(14, y + 2, W - 28, h);
      doc.text(lines, 16, y + 8);
      y += h + 12;
      if (y > 230 && s.key !== 'school') {
        doc.addPage();
        y = 20;
      }
    }

    // Unterschriften
    const lineY = Math.max(y + 10, 250);
    doc.setDrawColor(120);
    doc.line(14, lineY, 94, lineY);
    doc.line(W - 94, lineY, W - 14, lineY);
    doc.setFontSize(9);
    doc.text(`Auszubildende/r: ${opts.name}`, 14, lineY + 5);
    if (r.submitted_at) doc.text(`eingereicht am ${format(new Date(r.submitted_at), 'dd.MM.yyyy')}`, 14, lineY + 10);
    // Nicht abgezeichnet: Linie bleibt frei für die Unterschrift von Hand
    const approved = r.status === 'approved' && r.reviewed_at;
    const reviewer = approved && r.reviewed_by ? opts.names.get(r.reviewed_by) || '' : '';
    doc.text(`Ausbilder/in${reviewer ? `: ${reviewer}` : ''}`, W - 94, lineY + 5);
    doc.text(approved ? `elektronisch abgezeichnet am ${format(new Date(r.reviewed_at!), 'dd.MM.yyyy')}` : 'Datum, Unterschrift', W - 94, lineY + 10);
  });

  const file = opts.name.replace(/[^\p{L}\p{N}]+/gu, '_');
  const range = sorted.length === 1 ? `KW${getISOWeek(parseISO(sorted[0].week_start))}_${format(parseISO(sorted[0].week_start), 'yyyy')}` : `${sorted.length}_Wochen`;
  doc.save(`Berichtsheft_${file}_${range}.pdf`);
}

export const formatWeekShort = (key: string) => format(parseISO(key), "'KW' I, d. MMM", { locale: de });
