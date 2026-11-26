import { describe, expect, it } from 'vitest';
import { circleOf, customerIntent, gapGroupIn } from './assistantCustomers';

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

describe('circleOf', () => {
  const people = [
    { id: 'chef', boss_id: null, is_vocational_student: false },
    { id: 'azubi', boss_id: 'chef', is_vocational_student: true },
    { id: 'andere', boss_id: null, is_vocational_student: false },
  ];
  it('Azubi sieht den Chef', () => expect([...circleOf('azubi', people)].sort()).toEqual(['azubi', 'chef']));
  it('Chef sieht seine Azubis', () => expect([...circleOf('chef', people)].sort()).toEqual(['azubi', 'chef']));
  it('sonst nur sich selbst', () => expect([...circleOf('andere', people)]).toEqual(['andere']));
});
