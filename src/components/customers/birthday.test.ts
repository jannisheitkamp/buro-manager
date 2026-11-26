import { describe, expect, it } from 'vitest';
import { birthdayLinks, birthdayText, waNumber } from './shared';

describe('waNumber', () => {
  it.each([
    ['0171 2345678', '491712345678'],
    ['+49 171 2345678', '491712345678'],
    ['0049 (171) 234-5678', '491712345678'],
    ['+43 660 1234567', '436601234567'],
  ])('%s → %s', (input, out) => expect(waNumber(input)).toBe(out));
  it('zu kurz oder leer → null', () => {
    expect(waNumber('123')).toBeNull();
    expect(waNumber(null)).toBeNull();
  });
});

describe('Geburtstagsgruß', () => {
  const c = { first_name: 'Greta', last_name: 'Roth', phone: '0231 8918365', email: 'greta@example.com' };
  it('siezt, voller Name, Absender', () => {
    expect(birthdayText(c, 'Alex Berger')).toBe('Herzlichen Glückwunsch zum Geburtstag, Greta Roth! Ich wünsche Ihnen alles Gute, Gesundheit und einen schönen Tag.\n\nHerzliche Grüße\nAlex Berger');
  });
  it('Links für WhatsApp und Mail', () => {
    const l = birthdayLinks(c, null);
    expect(l.whatsapp).toMatch(/^https:\/\/wa\.me\/492318918365\?text=Herzlichen/);
    expect(l.mail).toMatch(/^mailto:greta@example\.com\?subject=Herzlichen/);
    expect(birthdayLinks({ ...c, phone: null, email: null }, null)).toEqual({ whatsapp: null, mail: null });
  });
});
