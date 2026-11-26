// Kündigungsschreiben für Bestandsverträge: Text und PDF (Brief des Kunden an die Gesellschaft)
import { format } from 'date-fns';

export const REASONS = [
  { id: 'premium', label: 'Beitragserhöhung', text: 'aufgrund der Beitragserhöhung' },
  { id: 'claim', label: 'Schadenfall', text: 'nach Eintritt eines Versicherungsfalls' },
  { id: 'sale', label: 'Fahrzeugverkauf / Wegfall des Risikos', text: 'wegen Wegfalls des versicherten Risikos' },
  { id: 'other', label: 'Sonstiger Grund', text: '' },
] as const;
export type ReasonId = (typeof REASONS)[number]['id'];

export type CancellationInput = {
  customerName: string;
  customerAddress: string;
  insurer: string;
  insurerAddress: string;
  product: string;
  policyNumber: string;
  plate?: string;
  /** yyyy-MM-dd; leer = nur „zum nächstmöglichen Zeitpunkt“ */
  date: string;
  extraordinary: boolean;
  reason?: ReasonId;
  reasonText?: string;
  revokeSepa: boolean;
  place: string;
  today?: Date;
};

const de = (d: string) => format(new Date(`${d}T00:00:00`), 'dd.MM.yyyy');

export const cancellationSubject = (i: CancellationInput) =>
  `Kündigung ${i.product}${i.policyNumber ? `, Versicherungsschein-Nr. ${i.policyNumber}` : ''}${i.plate ? `, Kennzeichen ${i.plate}` : ''}`;

/** Absätze des Briefs (ohne Anrede und Gruß) */
export function cancellationParagraphs(i: CancellationInput): string[] {
  const when = i.date ? `zum ${de(i.date)}, hilfsweise zum nächstmöglichen Zeitpunkt` : 'zum nächstmöglichen Zeitpunkt';
  const reason = i.extraordinary
    ? (i.reason === 'other' ? i.reasonText?.trim() : REASONS.find((r) => r.id === i.reason)?.text) || ''
    : '';
  const first = i.extraordinary
    ? `hiermit kündige ich den oben genannten Vertrag außerordentlich${reason ? ` ${reason}` : ''} ${when}.`
    : `hiermit kündige ich den oben genannten Vertrag fristgerecht ${when}.`;
  return [
    first,
    'Bitte bestätigen Sie mir den Eingang dieser Kündigung und das Vertragsende schriftlich.',
    ...(i.revokeSepa ? ['Das erteilte SEPA-Lastschriftmandat widerrufe ich zum Vertragsende.'] : []),
  ];
}

export async function exportCancellationPdf(i: CancellationInput) {
  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF();
  const W = doc.internal.pageSize.getWidth();
  const L = 25;
  const today = i.today || new Date();

  // Absender (klein über dem Anschriftfeld) und rechts oben
  doc.setFontSize(8);
  doc.setTextColor(110);
  doc.text(`${i.customerName} · ${i.customerAddress.replace(/\n/g, ', ')}`, L, 45);
  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.text([i.customerName, ...i.customerAddress.split(/\n|,\s*/).filter(Boolean)], W - 20, 25, { align: 'right' });

  // Empfänger
  doc.setFontSize(11);
  doc.text([i.insurer, ...i.insurerAddress.split('\n').map((l) => l.trim()).filter(Boolean)], L, 52);

  // Ort, Datum
  doc.setFontSize(10);
  doc.text(`${i.place ? `${i.place}, ` : ''}${format(today, 'dd.MM.yyyy')}`, W - 20, 95, { align: 'right' });

  // Betreff
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  const subject = doc.splitTextToSize(cancellationSubject(i), W - L - 20) as string[];
  doc.text(subject, L, 108);
  doc.setFont('helvetica', 'normal');

  let y = 108 + subject.length * 5.5 + 8;
  doc.text('Sehr geehrte Damen und Herren,', L, y);
  y += 9;
  for (const p of cancellationParagraphs(i)) {
    const lines = doc.splitTextToSize(p, W - L - 20) as string[];
    doc.text(lines, L, y);
    y += lines.length * 5.5 + 4;
  }
  y += 4;
  doc.text('Mit freundlichen Grüßen', L, y);

  // Unterschrift
  y += 28;
  doc.setDrawColor(120);
  doc.line(L, y, L + 75, y);
  doc.setFontSize(9);
  doc.text(i.customerName, L, y + 5);

  const file = `${i.customerName}_${i.product}`.replace(/[^\p{L}\p{N}]+/gu, '_');
  doc.save(`Kuendigung_${file}.pdf`);
}
