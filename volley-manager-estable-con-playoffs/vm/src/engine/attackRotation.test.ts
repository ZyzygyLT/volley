import { describe, expect, it } from 'vitest';
import { makeSquads } from './match';
import { P } from './params';
import { buildAttackOptions } from './attackOptions';

describe('elegibilidad de ataque a través de la rotación', () => {
  it('mantiene la regla de zona y rol en las seis rotaciones', () => {
    const [squad] = makeSquads(2026);
    const startingLineup = squad.slice(0, 6);

    for (let rotation = 0; rotation < 6; rotation++) {
      const lineup = [...startingLineup.slice(rotation), ...startingLineup.slice(0, rotation)];
      const options = buildAttackOptions(lineup, 0.7, P);

      for (const option of options) {
        expect(option.slot).toBeGreaterThanOrEqual(0);
        expect(option.slot).toBeLessThan(6);
        expect(option.zone).toBe(option.slot >= 3 ? 'front' : 'backrow');
        expect(P.atkWeight[option.attacker.role]).toBeGreaterThan(0);
        if (option.slot < 3) {
          expect(['OH', 'OP']).toContain(option.attacker.role);
        }
      }

      for (let slot = 0; slot < 6; slot++) {
        const player = lineup[slot];
        const shouldBeEligible = P.atkWeight[player.role] > 0
          && (slot >= 3 || player.role === 'OH' || player.role === 'OP');
        expect(options.some(option => option.slot === slot)).toBe(shouldBeEligible);
      }
    }
  });

  it('no convierte la zona rotacional en una familia táctica de ataque', () => {
    const [squad] = makeSquads(2027);
    const options = buildAttackOptions(squad.slice(0, 6), 0.7, P);

    expect(options.every(option => option.zone === 'front' || option.zone === 'backrow')).toBe(true);
    expect(options.every(option => !('family' in option))).toBe(true);
  });
});
