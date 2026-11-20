import { describe, expect, it } from 'vitest';
import { makeSquads } from './match';
import { P } from './params';
import { buildAttackOptions } from './attackOptions';

describe('opciones legales de ataque', () => {
  it('solo ofrece atacantes de primera línea y OH/OP de zaga', () => {
    const [squad] = makeSquads(18);
    const lineup = squad.slice(0, 6);
    const options = buildAttackOptions(lineup, 0.7, P);

    expect(options.map(option => option.slot).sort()).toEqual([1, 3, 4, 5]);
    expect(options.every(option => option.zone === (option.slot >= 3 ? 'front' : 'backrow'))).toBe(true);
    expect(options.some(option => option.attacker.role === 'L')).toBe(false);
  });

  it('excluye a los jugadores de zaga que no son OH/OP', () => {
    const [squad] = makeSquads(19);
    const options = buildAttackOptions(squad.slice(0, 6), 0.7, P);

    expect(options.some(option => option.slot === 0)).toBe(false);
    expect(options.some(option => option.slot === 2)).toBe(false);
  });

  it('permite al colocador atacar cuando ocupa primera línea', () => {
    const [squad] = makeSquads(20);
    const lineup = [squad[1], squad[2], squad[3], squad[0], squad[4], squad[5]];
    const options = buildAttackOptions(lineup, 0.7, P);

    expect(options.find(option => option.slot === 3)?.attacker.role).toBe('S');
  });

  it('mantiene los pesos de selección históricos, incluida la penalización del central con recepción baja', () => {
    const [squad] = makeSquads(21);
    const lineup = squad.slice(0, 6);
    const good = buildAttackOptions(lineup, 0.7, P);
    const poor = buildAttackOptions(lineup, 0.4, P);
    const middleGood = good.find(option => option.attacker.role === 'MB' && option.slot === 5)!;
    const middlePoor = poor.find(option => option.attacker.role === 'MB' && option.slot === 5)!;
    const wingBack = good.find(option => option.slot === 1)!;

    expect(middlePoor.weight).toBeCloseTo(middleGood.weight * 0.3);
    expect(wingBack.weight).toBeCloseTo(P.atkWeight.OH * (lineup[1].atk / 70) * 0.45);
  });

  it('no incluye jugadores con peso o capacidad de ataque nulos', () => {
    const [squad] = makeSquads(22);
    const lineup = squad.slice(0, 6).map((player, index) => index === 4 ? { ...player, atk: 0 } : player);
    const options = buildAttackOptions(lineup, 0.7, P);

    expect(options.some(option => option.slot === 4)).toBe(false);
  });
});
