import { describe, expect, it } from 'vitest';
import { cancellationParagraphs, cancellationSubject, type CancellationInput } from './cancellation';

const base: CancellationInput = {
  customerName: 'Greta Roth', customerAddress: 'Lindenweg 56, 44135 Dortmund', insurer: 'HUK-Coburg', insurerAddress: 'Bahnhofsplatz\n96444 Coburg',
  product: 'KFZ', policyNumber: 'KF-100037', plate: 'DO-AB 123', date: '2027-01-01', extraordinary: false, revokeSepa: true, place: 'Dortmund',
};

describe('Kündigungsschreiben', () => {
  it('Betreff mit Schein und Kennzeichen', () => expect(cancellationSubject(base)).toBe('Kündigung KFZ, Versicherungsschein-Nr. KF-100037, Kennzeichen DO-AB 123'));
  it('ordentlich mit Datum und hilfsweise', () => {
    const [first, , sepa] = cancellationParagraphs(base);
    expect(first).toBe('hiermit kündige ich den oben genannten Vertrag fristgerecht zum 01.01.2027, hilfsweise zum nächstmöglichen Zeitpunkt.');
    expect(sepa).toMatch(/SEPA-Lastschriftmandat/);
  });
  it('ohne Datum nur nächstmöglich, ohne SEPA', () => {
    const p = cancellationParagraphs({ ...base, date: '', revokeSepa: false });
    expect(p[0]).toBe('hiermit kündige ich den oben genannten Vertrag fristgerecht zum nächstmöglichen Zeitpunkt.');
    expect(p).toHaveLength(2);
  });
  it('außerordentlich mit Grund', () => {
    expect(cancellationParagraphs({ ...base, extraordinary: true, reason: 'premium' })[0]).toBe('hiermit kündige ich den oben genannten Vertrag außerordentlich aufgrund der Beitragserhöhung zum 01.01.2027, hilfsweise zum nächstmöglichen Zeitpunkt.');
    expect(cancellationParagraphs({ ...base, extraordinary: true, reason: 'other', reasonText: 'wegen Umzugs ins Ausland' })[0]).toMatch(/außerordentlich wegen Umzugs ins Ausland zum/);
  });
});
