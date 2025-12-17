import jsPDF from 'jspdf';
import { Absence, Profile } from '@/types';
import { format, differenceInBusinessDays, parseISO, addDays } from 'date-fns';
import { de } from 'date-fns/locale';

export const generateVacationRequestPDF = (absence: Absence, profile: Profile) => {
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
  const days = differenceInBusinessDays(addDays(endDate, 1), startDate);
  
  const startStr = format(startDate, 'dd.MM.yyyy', { locale: de });
  const endStr = format(endDate, 'dd.MM.yyyy', { locale: de });
  
  doc.text(`hiermit beantrage ich Urlaub vom`, 20, y);
  doc.text(startStr, 75, y - 1);
  doc.line(73, y, 103, y); 
  
  doc.text(`bis`, 107, y);
  doc.text(endStr, 115, y - 1);
  doc.line(113, y, 143, y); 
  
  doc.text(`(Tage:  ${Math.max(0, days)})`, 148, y);
  
  y += 8;
  doc.text('Es handelt sich dabei um', 20, y);
  
  y += 6;
  const isVacation = absence.type === 'vacation';
  const isSpecial = absence.type === 'other' || absence.type === 'sick_leave'; 
  
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
  if (isSpecial && absence.type === 'sick_leave') {
      doc.text('Krankheit', 80, y - 1);
  }
  
  y += 10;
  doc.text('Ich bitte um Genehmigung des Urlaubs und eine schriftliche Bestätigung.', 20, y);
  
  y += 20; // Reduced
  
  const today = format(new Date(), 'dd.MM.yyyy', { locale: de });
  doc.text(`Ort, Datum`, 20, y + 5);
  doc.text(today, 45, y - 1);
  doc.line(20, y, 80, y);
  
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
  doc.line(20, y, 80, y);
  
  doc.text('Unterschrift des Arbeitgebers', 120, y + 5);
  doc.line(120, y, 190, y); 
  
  doc.save(`Urlaubsantrag_${lastName}_${startStr}.pdf`);
};
