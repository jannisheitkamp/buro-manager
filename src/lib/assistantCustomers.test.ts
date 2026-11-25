import { describe, expect, it } from 'vitest';
import { customerIntent, gapGroupIn } from './assistantCustomers';

// Eingaben kommen normalisiert an: klein, Umlaute als ae/oe/ue
describe('customerIntent', () => {
  it.each([
    ['wer hat keine haftpflicht?', 'gap'],
    ['welche kunden haben keine bu', 'gap'],
    ['zeig mir die luecken', 'gap'],
    ['geburtstage diese woche', 'birthday'],
    ['welche vertraege laufen ab', 'deadline'],
    ['kuendigungsfristen im team', 'deadline'],
    ['telefonnummer von mueller', 'lookup'],
    ['kundin schmidt', 'lookup'],
  ])('%s → %s', (t, intent) => expect(customerIntent(t)).toBe(intent));

  it.each(['provision im oktober', 'wer ist morgen am empfang', 'wie viele urlaubstage habe ich noch'])('keine Kundenfrage: %s', (t) =>
    expect(customerIntent(t)).toBeNull(),
  );
});

describe('gapGroupIn', () => {
  it.each([
    ['wer hat keine haftpflicht', 'phv'],
    ['ohne hundehaftpflicht', 'hund'],
    ['kunden ohne bu', 'akv'],
    ['keine risiko lv', 'rlv'],
    ['fehlt hausrat', 'hr'],
  ])('%s → %s', (t, g) => expect(gapGroupIn(t)).toBe(g));
});
