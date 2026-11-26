import { describe, expect, it } from 'vitest';
import { diffUpdate, updateLink, updateMessage } from './customerUpdate';

describe('diffUpdate', () => {
  const current = { address: 'Alte Str. 1, 44135 Dortmund', phone: '0231 1', email: null, marital_status: 'single', children: 0, occupation: 'employee', housing: 'rent' };
  it('zeigt nur echte Änderungen mit lesbaren Werten', () => {
    const d = diffUpdate(current, { address: 'Neue Str. 2, 44137 Dortmund', phone: '0231 1', marital_status: 'married', children: 1, message: 'Umzug' });
    expect(d.map((x) => [x.key, x.old, x.next])).toEqual([
      ['address', 'Alte Str. 1, 44135 Dortmund', 'Neue Str. 2, 44137 Dortmund'],
      ['marital_status', 'Ledig', 'Verheiratet'],
      ['children', '0', '1'],
    ]);
  });
  it('leere Payload → nichts', () => expect(diffUpdate(current, null)).toEqual([]));
  it('neues Feld ohne alten Wert', () => expect(diffUpdate(current, { email: 'a@b.de' })[0]).toMatchObject({ key: 'email', old: '', next: 'a@b.de' }));
});

describe('Link und Nachricht', () => {
  it('Link mit Token', () => expect(updateLink('abc', 'https://example.com')).toBe('https://example.com/update/abc'));
  it('Nachricht mit Vorname, Link und Absender', () => {
    const m = updateMessage('Greta', 'https://x/update/abc', 'Alex Berger');
    expect(m).toMatch(/^Hallo Greta, /);
    expect(m).toContain('https://x/update/abc');
    expect(m).toMatch(/Alex Berger$/);
  });
});
