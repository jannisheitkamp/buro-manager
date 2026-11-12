import jsPDF from 'jspdf';
import { Absence, Profile } from '@/types';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { getVacationDayBreakdown } from '@/utils/dateUtils';
import { getSignedUrl } from '@/lib/storage';
import { supabase } from '@/lib/supabase';

const formatDays = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 1 });

/** Lädt eine Unterschrift aus dem Speicher als Bild (null, wenn nicht verfügbar). */
const loadSignature = async (path?: string | null) => {
  if (!path) return null;
  try {
    const blob = await (await fetch(await getSignedUrl('absence_documents', path, 60))).blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    const img = new Image();
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = dataUrl; });

    // Striche dunkel einfärben: ältere Unterschriften aus dem Dunkelmodus sind weiß (unsichtbar auf dem PDF)
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { dataUrl, ratio: img.width / img.height };
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = pixels.data;
    let opaque = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 200) opaque++;
    // Mit hellem Hintergrund: dunkle Striche behalten, Hintergrund durchsichtig machen
    const hasBackground = opaque > (d.length / 4) * 0.5;
    for (let i = 0; i < d.length; i += 4) {
      if (hasBackground) d[i + 3] = Math.round(d[i + 3] * (1 - (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255));
      d[i] = 30;      // #1e293b
      d[i + 1] = 41;
      d[i + 2] = 59;
    }
    ctx.putImageData(pixels, 0, 0);
    return { dataUrl: canvas.toDataURL('image/png'), ratio: img.width / img.height };
  } catch {
    return null;
  }
};

/** Unterschrift über die Linie setzen (max. 60 x 16 mm, Seitenverhältnis bleibt). */
const drawSignature = (doc: jsPDF, sig: { dataUrl: string, ratio: number } | null, x: number, lineY: number) => {
  if (!sig) return;
  let w = 60;
  let h = w / sig.ratio;
  if (h > 16) { h = 16; w = h * sig.ratio; }
  doc.addImage(sig.dataUrl, 'PNG', x, lineY - h - 1, w, h);
};

export const generateVacationRequestPDF = async (absence: Absence, profile: Profile) => {
  const [requesterSig, approverSig, approver] = await Promise.all([
    loadSignature(absence.signature_url),
    absence.status === 'approved' ? loadSignature(absence.approver_signature_url) : null,
    absence.approved_by
      ? supabase.from('profiles').select('full_name').eq('id', absence.approved_by).maybeSingle().then(r => r.data)
      : null,
  ]);

  const doc = new jsPDF();
  let y = 15; // Start higher

  // Title
  doc.setFontSize(16); 
  doc.setFont('helvetica', 'bold');
  doc.text('Urlaubsantrag', 20, y);
  
  y += 12; // Reduced
  
  // Personal Data
  doc.setFontSize(10); // Smaller font for data
  doc.setFont('helvetica', 'normal');
  
  // Name
  const fullName = profile.full_name || '';
  const nameParts = fullName.split(' ');
  const lastName = nameParts.length > 1 ? nameParts.pop() : '';
  const firstName = nameParts.join(' ');
  
  doc.text('Name', 20, y);
  doc.text(lastName || '', 60, y - 1); 
  doc.line(60, y, 110, y); 
  
  doc.text('Vorname', 120, y);
  doc.text(firstName || '', 150, y - 1);
  doc.line(150, y, 190, y); 
  
  y += 8; // Reduced
  
  // Address
  doc.text('Adresse', 20, y);
  
  const addressLines = (profile.address || '').split('\n').filter(l => l.trim());
  
  if (addressLines.length > 0) {
      doc.text(addressLines[0], 60, y - 1);
  }
  doc.line(60, y, 110, y);
  y += 6; // Reduced
  
  if (addressLines.length > 1) {
      doc.text(addressLines[1], 60, y - 1);
  }
  doc.line(60, y, 110, y);
  y += 6; // Reduced
  
  if (addressLines.length > 2) {
      doc.text(addressLines[2], 60, y - 1);
  }
  doc.line(60, y, 110, y);
  
  y += 8; // Reduced
  
  // Personal Nr
  doc.text('Personal-Nr.', 20, y);
  doc.line(60, y, 110, y);
  
  y += 15; // Reduced section break
  
  // To
  doc.text('An', 20, y);
  y += 6;
  doc.text('Firma', 20, y);
  // doc.text('Büro Manager', 60, y - 1); // Removed hardcoded text
  doc.line(60, y, 110, y);
  
  y += 6;
  doc.text('Abteilung', 20, y);
  doc.line(60, y, 110, y);
  
  y += 15; // Reduced
  
  // Body
  doc.text('Sehr geehrte Damen und Herren,', 20, y);
  y += 8;
  
  const startDate = parseISO(absence.start_date);
  const endDate = parseISO(absence.end_date);
  const breakdown = getVacationDayBreakdown(startDate, endDate, profile);
  const noDeduction = absence.deduct_vacation_days === false;
  const computedDays = absence.half_day ? Math.min(breakdown.days, 0.5) : breakdown.days;
  const days = noDeduction ? 0 : absence.used_days ?? computedDays;
  
  const startStr = format(startDate, 'dd.MM.yyyy', { locale: de });
  const endStr = format(endDate, 'dd.MM.yyyy', { locale: de });
  
  doc.text(`hiermit beantrage ich Urlaub vom`, 20, y);
  doc.text(startStr, 75, y - 1);
  doc.line(73, y, 103, y); 
  
  doc.text(`bis`, 107, y);
  doc.text(endStr, 115, y - 1);
  doc.line(113, y, 143, y); 
  
  doc.text(`(Tage:  ${formatDays(Math.max(0, days))})`, 148, y);

  // Wie die Tage zustande kommen
  const notes: string[] = [];
  if (absence.half_day) notes.push('halber Urlaubstag');
  if (noDeduction) notes.push('ohne Abzug vom Urlaubskonto');
  else if (absence.used_days != null) notes.push('Tage von der genehmigenden Person festgelegt');
  if (breakdown.holidays.length) {
    notes.push('Feiertage nicht gezählt: ' + breakdown.holidays.map(h => `${format(h.date, 'dd.MM.')} ${h.name}`).join(', '));
  }
  if (breakdown.schoolFull) notes.push(`${breakdown.schoolFull} Berufsschultag${breakdown.schoolFull > 1 ? 'e' : ''} nicht gezählt`);
  if (breakdown.schoolHalf) notes.push(`${breakdown.schoolHalf} halbe${breakdown.schoolHalf > 1 ? '' : 'r'} Berufsschultag${breakdown.schoolHalf > 1 ? 'e' : ''} als halber Urlaubstag`);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(100);
  const noteLines = doc.splitTextToSize(`Wochenenden nicht gezählt${notes.length ? '; ' + notes.join('; ') : ''}.`, 170);
  doc.text(noteLines, 20, y);
  y += (noteLines.length - 1) * 3.5;
  doc.setTextColor(0);
  doc.setFontSize(10);
  
  y += 8;
  doc.text('Es handelt sich dabei um', 20, y);
  
  y += 6;
  const isVacation = absence.type === 'vacation';
  const isSpecial = ['other', 'sick_leave', 'seminar', 'school'].includes(absence.type);
  
  doc.rect(25, y - 4, 4, 4);
  if (isVacation) {
    doc.setFontSize(14);
    doc.text('x', 26, y - 0.5);
    doc.setFontSize(10);
  }
  doc.text('Erholungsurlaub', 35, y);
  
  y += 6;
  doc.rect(25, y - 4, 4, 4);
  if (isSpecial) {
    doc.setFontSize(14);
    doc.text('x', 26, y - 0.5);
    doc.setFontSize(10);
  }
  doc.text('Sonderurlaub wegen', 35, y);
  doc.line(75, y, 180, y);
  
  let specialReason = '';
  if (absence.type === 'sick_leave') specialReason = 'Krankheit';
  else if (absence.type === 'seminar') specialReason = 'Seminar';
  else if (absence.type === 'school') specialReason = 'Schule';
  else if (absence.type === 'other') specialReason = absence.note || 'Sonstiges';

  // Append note for others if available
  if (['seminar', 'school'].includes(absence.type) && absence.note) {
      specialReason += ` (${absence.note})`;
  }
  
  if (isSpecial && specialReason) {
      doc.text(specialReason, 80, y - 1);
  }
  
  y += 10;
  doc.text('Ich bitte um Genehmigung des Urlaubs und eine schriftliche Bestätigung.', 20, y);
  
  y += 20; // Reduced
  
  const requestDate = format(absence.created_at ? parseISO(absence.created_at) : new Date(), 'dd.MM.yyyy', { locale: de });
  doc.text(`Ort, Datum`, 20, y + 5);
  doc.text(requestDate, 22, y - 1);
  doc.line(20, y, 80, y);
  
  drawSignature(doc, requesterSig, 122, y);
  doc.text('Unterschrift des Antragstellers', 120, y + 5);
  doc.line(120, y, 190, y); 
  
  y += 25; // Reduced section break
  
  // Employer Section
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Vermerk des Arbeitgebers', 20, y);
  
  y += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Der beantragte Urlaub', 20, y);
  
  y += 6;
  
  const isApproved = absence.status === 'approved';
  const isRejected = absence.status === 'rejected';
  
  doc.rect(25, y - 4, 4, 4);
  if (isApproved) {
    doc.setFontSize(14);
    doc.text('x', 26, y - 0.5);
    doc.setFontSize(10);
  }
  doc.text('wird genehmigt', 35, y);
  
  y += 6;
  doc.rect(25, y - 4, 4, 4);
  doc.text('wird genehmigt von: _______________ bis _______________', 35, y);
  
  y += 6;
  doc.rect(25, y - 4, 4, 4);
  if (isRejected) {
    doc.setFontSize(14);
    doc.text('x', 26, y - 0.5);
    doc.setFontSize(10);
  }
  doc.text('wird nicht genehmigt', 35, y);
  
  y += 8;
  doc.text('Begründung:', 25, y);
  doc.line(50, y, 190, y);
  
  y += 12;
  doc.setFontSize(9); // Smaller hint
  doc.text('Eine Änderung des oben genehmigten Urlaubs benötigt die Zustimmung des Arbeitgebers.', 20, y);
  
  y += 20;
  doc.setFontSize(10);
  doc.text('Ort, Datum', 20, y + 5);
  if (absence.status !== 'pending' && absence.approved_at) {
    doc.text(format(parseISO(absence.approved_at), 'dd.MM.yyyy', { locale: de }), 22, y - 1);
  }
  doc.line(20, y, 80, y);
  
  drawSignature(doc, approverSig, 122, y);
  doc.text(approver?.full_name ? `Unterschrift des Arbeitgebers (${approver.full_name})` : 'Unterschrift des Arbeitgebers', 120, y + 5);
  doc.line(120, y, 190, y); 
  
  doc.save(`Urlaubsantrag_${lastName}_${startStr}.pdf`);
};
