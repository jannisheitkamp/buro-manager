// Produktion exportieren: CSV für Excel, Produktionsnachweis als PDF und Monatsbericht.
// Aus Production.tsx herausgelöst, damit die Seite nur noch Oberfläche enthält.
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { areaLabel } from '@/lib/products';
import { correctedMonthlyLv, type LvSnapshot } from '@/lib/lifeValues';
import { csvNum, csvText, downloadCsv } from '@/utils/csv';

export type ExportEntry = {
  id: string;
  user_id: string;
  status: string;
  submission_date: string;
  policing_date?: string | null;
  customer_name: string;
  customer_firstname: string | null;
  policy_number: string | null;
  category: string;
  sub_category: string | null;
  payment_method: string | null;
  gross_premium?: number | null;
  net_premium?: number | null;
  valuation_sum?: number | null;
  life_value_factor?: number | null;
  life_values: number | null;
  commission_rate?: number | null;
  commission_amount: number | null;
  manager?: { full_name?: string | null } | null;
};

export type ReportPerson = { id: string; full_name: string; monthly_goal?: number | null; is_approved?: boolean };

export const formatCurrency = (amount: number | null | undefined) => {
  if (amount === null || amount === undefined || isNaN(amount)) return '0,00 €';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
};

export const STATUS_LABEL: Record<string, string> = { submitted: 'Eingereicht', policed: 'Policiert', cancelled: 'Storniert' };
const PAY_LABEL: Record<string, string> = { monthly: 'Monatlich', quarterly: 'Vierteljährlich', half_yearly: 'Halbjährlich', yearly: 'Jährlich', one_time: 'Einmalig' };
const BRAND: [number, number, number] = [20, 106, 104];
const num = (v: number) => new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 }).format(v);
const dmy = (d: string | null | undefined, f = 'dd.MM.yyyy') => (d ? format(new Date(d), f) : '');

/** Eigene Verträge als CSV (Semikolon, für Excel) */
export function exportProductionCsv(entries: ExportEntry[]) {
  downloadCsv(
    `Produktion_Export_Personal_${format(new Date(), 'yyyy-MM-dd')}.csv`,
    ['Status', 'Einreichung', 'Policierung', 'Nachname', 'Vorname', 'Schein-Nr', 'Sparte', 'Tarif', 'Zahlweise', 'Beitrag (Brutto)', 'Beitrag (Netto)', 'Bewertungssumme', 'Faktor (LW)', 'Lebenswerte', 'Satz', 'Provision', 'Betreuer'],
    entries.map((e) => [
      STATUS_LABEL[e.status] || e.status,
      dmy(e.submission_date),
      dmy(e.policing_date),
      csvText(e.customer_name),
      csvText(e.customer_firstname),
      csvText(e.policy_number),
      csvText(areaLabel(e.category)),
      csvText(e.sub_category),
      PAY_LABEL[e.payment_method || ''] || e.payment_method || '',
      csvNum(e.gross_premium),
      csvNum(e.net_premium),
      csvNum(e.valuation_sum),
      csvNum(e.life_value_factor),
      csvNum(e.life_values),
      csvNum(e.commission_rate),
      csvNum(e.commission_amount),
      csvText(e.manager?.full_name),
    ]),
  );
}

/** Produktionsnachweis (persönlich) als PDF */
export async function exportProductionPdf(entries: ExportEntry[], o: { person: string; category: string }) {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF();
  const active = entries.filter((e) => e.status !== 'cancelled');
  const totalCommission = active.reduce((a, e) => a + (e.commission_amount || 0), 0);
  const totalLv = active.reduce((a, e) => a + (e.life_values || 0), 0);
  const nf2 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

  doc.setFontSize(18);
  doc.text('Produktionsnachweis (Persönlich)', 14, 20);
  doc.setFontSize(10);
  doc.text(`Erstellt: ${new Date().toLocaleDateString('de-DE')}`, 14, 28);
  doc.text(`Sparte: ${o.category === 'all' ? 'Alle' : areaLabel(o.category)}`, 14, 33);
  doc.text(`Mitarbeiter: ${o.person}`, 14, 38);

  autoTable(doc, {
    startY: 45,
    head: [['Eingereicht', 'Policiert', 'Kunde', 'Sparte', 'Status', 'Bewertung', 'Lebenswerte', 'Provision']],
    body: entries.map((e) => [
      dmy(e.submission_date, 'dd.MM.yy'),
      dmy(e.policing_date, 'dd.MM.yy') || '-',
      `${e.customer_name}${e.customer_firstname ? `, ${e.customer_firstname}` : ''}`,
      e.sub_category || e.category,
      e.status === 'policed' ? 'Policiert' : e.status === 'cancelled' ? 'Storno' : 'Offen',
      formatCurrency(e.valuation_sum),
      nf2.format(e.life_values || 0),
      formatCurrency(e.commission_amount),
    ]),
    foot: [['', '', '', '', 'Summe ohne Storno:', '', nf2.format(totalLv), formatCurrency(totalCommission)]],
    theme: 'grid',
    headStyles: { fillColor: BRAND },
    footStyles: { fillColor: [243, 244, 246], textColor: [0, 0, 0], fontStyle: 'bold' },
  });
  doc.save(`Produktion_Personal_${format(new Date(), 'yyyy-MM-dd')}.pdf`);
}

/**
 * Monatsbericht als PDF: Übersicht je Person, nach Sparte und (persönlich) alle Verträge.
 * Gibt false zurück, wenn im Monat nichts eingereicht wurde.
 */
export async function exportMonthlyReport(o: {
  entries: ExportEntry[];
  snapshots: LvSnapshot[];
  month: string; // yyyy-MM
  scope: 'me' | 'team';
  userId: string | undefined;
  userName: string;
  people: ReportPerson[];
}): Promise<boolean> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const [y, m] = o.month.split('-').map(Number);
  const monthLabel = format(new Date(y, m - 1, 1), 'MMMM yyyy', { locale: de });
  const inMonth = o.entries.filter((e) => String(e.submission_date || '').startsWith(o.month));
  const scoped = o.scope === 'me' ? inMonth.filter((e) => e.user_id === o.userId) : inMonth;

  const people = o.scope === 'me' ? o.people.filter((p) => p.id === o.userId) : o.people.filter((p) => p.is_approved !== false);
  const rows = people
    .map((p) => {
      const own = scoped.filter((e) => e.user_id === p.id);
      const active = own.filter((e) => e.status !== 'cancelled');
      const lv = correctedMonthlyLv(o.entries as Parameters<typeof correctedMonthlyLv>[0], o.snapshots, p.id, y)[m - 1];
      const comm = active.reduce((a, e) => a + Number(e.commission_amount || 0), 0);
      const goal = Number(p.monthly_goal) || 0;
      return { name: p.full_name, count: active.length, cancelled: own.length - active.length, lv, comm, goal, pct: goal ? Math.round((lv / goal) * 100) : null };
    })
    .filter((r) => o.scope === 'me' || r.count > 0 || r.cancelled > 0)
    .sort((a, b) => b.lv - a.lv);
  if (rows.length === 0) return false;

  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text(`Monatsbericht ${monthLabel}`, 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text(`${o.scope === 'me' ? o.userName : 'Ganzes Team'} · erstellt am ${format(new Date(), 'dd.MM.yyyy')}`, 14, 27);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 34,
    head: [['Person', 'Verträge', 'Storno', 'Lebenswerte', 'Ziel', 'Erreicht', 'Provision']],
    body: rows.map((r) => [r.name, r.count, r.cancelled || '–', num(r.lv), r.goal ? num(r.goal) : '–', r.pct !== null ? `${r.pct} %` : '–', formatCurrency(r.comm)]),
    foot:
      rows.length > 1
        ? [['Summe', rows.reduce((a, r) => a + r.count, 0), rows.reduce((a, r) => a + r.cancelled, 0) || '–', num(rows.reduce((a, r) => a + r.lv, 0)), '', '', formatCurrency(rows.reduce((a, r) => a + r.comm, 0))]]
        : undefined,
    theme: 'grid',
    headStyles: { fillColor: BRAND },
    footStyles: { fillColor: [236, 238, 234], textColor: [0, 0, 0], fontStyle: 'bold' },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
  });

  const byCat: Record<string, { count: number; comm: number; lv: number }> = {};
  scoped
    .filter((e) => e.status !== 'cancelled')
    .forEach((e) => {
      const k = areaLabel(e.category);
      byCat[k] = byCat[k] || { count: 0, comm: 0, lv: 0 };
      byCat[k].count++;
      byCat[k].comm += Number(e.commission_amount || 0);
      byCat[k].lv += Number(e.life_values || 0);
    });
  const lastY = (fallback: number) => ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || fallback) + 10;
  let y2 = lastY(40);
  doc.setFontSize(12);
  doc.text('Nach Sparte', 14, y2);
  autoTable(doc, {
    startY: y2 + 3,
    head: [['Sparte', 'Verträge', 'Lebenswerte', 'Provision']],
    body: Object.entries(byCat)
      .sort((a, b) => b[1].comm - a[1].comm)
      .map(([k, v]) => [k, v.count, num(v.lv), formatCurrency(v.comm)]),
    theme: 'grid',
    headStyles: { fillColor: BRAND },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
  });

  // Einzelne Verträge nur im persönlichen Bericht
  if (o.scope === 'me') {
    y2 = lastY(60);
    doc.setFontSize(12);
    doc.text('Verträge', 14, y2);
    autoTable(doc, {
      startY: y2 + 3,
      head: [['Eingereicht', 'Kunde', 'Tarif', 'Status', 'Lebenswerte', 'Provision']],
      body: scoped.map((e) => [
        dmy(e.submission_date, 'dd.MM.'),
        `${e.customer_name}${e.customer_firstname ? ', ' + e.customer_firstname : ''}`,
        e.sub_category || areaLabel(e.category),
        STATUS_LABEL[e.status] || e.status,
        num(Number(e.life_values || 0)),
        formatCurrency(e.commission_amount),
      ]),
      theme: 'grid',
      headStyles: { fillColor: BRAND },
      columnStyles: { 4: { halign: 'right' }, 5: { halign: 'right' } },
    });
  }

  doc.save(`Monatsbericht_${o.month}${o.scope === 'me' ? '' : '_Team'}.pdf`);
  return true;
}
