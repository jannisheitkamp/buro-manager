// Kundenakte als PDF: eine Übersicht fürs Beratungsgespräch.
// Ohne Provision, das Blatt kann auch beim Kunden auf dem Tisch liegen.
import { differenceInYears, format } from 'date-fns';
import { loadHistory, mergeHistory } from './history';
import { day, fullName, lifestyleText, product, type CustomerRow } from './shared';

const BRAND: [number, number, number] = [20, 106, 104];
const NOTES_IN_PDF = 10;

const d = (s: string | null | undefined, f = 'dd.MM.yyyy') => (s ? format(day(s), f) : '–');
const status = (s: string) => (s === 'policed' ? 'Policiert' : s === 'cancelled' ? 'Storniert' : 'Eingereicht');

export async function exportCustomerPdf(r: CustomerRow, names: Map<string, string>) {
  const [{ default: jsPDF }, { default: autoTable }, history] = await Promise.all([import('jspdf'), import('jspdf-autotable'), loadHistory(r.customer.id)]);
  const c = r.customer;
  const doc = new jsPDF();
  const last = () => (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 30;
  const heading = (text: string, y: number) => {
    doc.setFontSize(11);
    doc.setTextColor(...BRAND);
    doc.text(text, 14, y);
    doc.setTextColor(0);
    return y + 2;
  };
  const table = { theme: 'grid' as const, styles: { fontSize: 8.5, cellPadding: 1.8 }, headStyles: { fillColor: BRAND }, margin: { left: 14, right: 14 } };

  doc.setFontSize(17);
  doc.text(fullName(c), 14, 18);
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(`Kundenakte · Stand ${format(new Date(), 'dd.MM.yyyy')}`, 14, 24);
  doc.setTextColor(0);

  // Stammdaten
  const base: [string, string][] =
    c.customer_type === 'company'
      ? [
          ['Firma', [c.industry, c.employees != null ? `${c.employees} Mitarbeiter` : null].filter(Boolean).join(' · ') || '–'],
          ['Ansprechpartner', c.contact_person || '–'],
        ]
      : [['Geburtstag', c.birth_date ? `${d(c.birth_date)} (${differenceInYears(new Date(), day(c.birth_date))} Jahre)` : '–']];
  base.push(['Telefon', c.phone || '–'], ['E-Mail', c.email || '–'], ['Adresse', c.address || '–']);
  if (c.household) base.push(['Haushalt', c.household]);
  if (c.customer_type !== 'company' && lifestyleText(c)) base.push(['Lebenslage', lifestyleText(c)]);
  if (c.notes) base.push(['Notizen', c.notes]);
  autoTable(doc, { ...table, startY: 29, body: base, theme: 'plain', columnStyles: { 0: { fontStyle: 'bold', cellWidth: 35 } } });

  // Verträge aus der Produktion
  if (r.entries.length) {
    autoTable(doc, {
      ...table,
      startY: heading('Verträge', last() + 9),
      head: [['Vertrag', 'Schein-Nr.', 'Beginn', 'Status']],
      body: r.entries.map((e) => [product(e), e.policy_number || '–', d(e.start_date), status(e.status)]),
    });
  }

  // Bestandsverträge
  if (r.existing.length) {
    autoTable(doc, {
      ...table,
      startY: heading('Bestandsverträge', last() + 9),
      head: [['Vertrag', 'Gesellschaft', 'Schein-Nr.', 'Beginn', 'Ablauf', 'Fällig', 'Beitrag']],
      body: r.existing.map((x) => [
        x.sub_category,
        x.insurer || '–',
        x.policy_number || '–',
        d(x.start_date),
        d(x.end_date),
        d(x.main_due, 'dd.MM.'),
        x.premium != null ? new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(x.premium)) : '–',
      ]),
    });
  }

  // Lücken
  if (r.gaps.length) {
    autoTable(doc, { ...table, startY: heading('Offene Lücken', last() + 9), body: [[r.gaps.join(', ')]], theme: 'plain' });
  }

  // Gesprächshistorie
  const items = mergeHistory(history.notes, history.callbacks).slice(0, NOTES_IN_PDF);
  if (items.length) {
    autoTable(doc, {
      ...table,
      startY: heading('Gesprächshistorie', last() + 9),
      head: [['Datum', 'Von', 'Notiz']],
      body: items.map((it) => [
        format(new Date(it.at), 'dd.MM.yyyy'),
        (it.by && names.get(it.by)) || '–',
        it.kind === 'callback' ? `Rückruf ${it.done ? 'erledigt' : 'offen'}: ${it.text}` : it.text,
      ]),
      columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 35 } },
    });
  }

  const file = fullName(c).replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '');
  doc.save(`Kundenakte_${file}.pdf`);
}
