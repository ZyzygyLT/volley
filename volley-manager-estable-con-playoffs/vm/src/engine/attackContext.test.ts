import { describe, expect, it } from 'vitest';
import { makeSquads } from './match';
import { P } from './params';
import { buildAttackContext } from './attackContext';
import { buildAttackOptions } from './attackOptions';

describe('contexto ofensivo', () => {
  it('combina calidad de recepción y opciones legales sin alterar el valor continuo', () => {
    const [squad] = makeSquads(31);
    const lineup = squad.slice(0, 6);
    const q = P.perfQ + 0.01;
    const context = buildAttackContext(lineup, q, P);

    expect(context.receptionValue).toBe(q);
    expect(context.receptionQuality).toBe('perfect');
    expect(context.options).toEqual(buildAttackOptions(lineup, q, P));
  });

  it('clasifica cada nivel usando los umbrales compartidos', () => {
    const [squad] = makeSquads(32);
    const lineup = squad.slice(0, 6);

    expect(buildAttackContext(lineup, P.perfQ, P).receptionQuality).toBe('perfect');
    expect(buildAttackContext(lineup, P.posQ, P).receptionQuality).toBe('positive');
    expect(buildAttackContext(lineup, P.posQ - 0.001, P).receptionQuality).toBe('negative');
  });

  it('expone la posición rotacional del colocador y la actualiza al rotar', () => {
    const [squad] = makeSquads(34);
    const startingLineup = squad.slice(0, 6);

    for (let rotation = 0; rotation < 6; rotation++) {
      const lineup = [...startingLineup.slice(rotation), ...startingLineup.slice(0, rotation)];
      const context = buildAttackContext(lineup, 0.7, P);
      const setterSlot = lineup.findIndex(player => player.role === 'S');

      expect(context.setter?.player.id).toBe(squad[0].id);
      expect(context.setter?.slot).toBe(setterSlot);
      expect(context.setter?.zone).toBe(setterSlot >= 3 ? 'front' : 'backrow');
    }
  });

  it('representa una alineación sin colocador sin inventar una posición', () => {
    const [squad] = makeSquads(35);
    const lineup = squad.slice(0, 6).filter(player => player.role !== 'S');

    expect(buildAttackContext(lineup, 0.7, P).setter).toBeNull();
  });

  it('no elige atacante ni cambia los pesos de elegibilidad', () => {
    const [squad] = makeSquads(33);
    const lineup = squad.slice(0, 6);
    const context = buildAttackContext(lineup, 0.4, P);

    expect(context.options.map(option => option.attacker.id))
      .toEqual(buildAttackOptions(lineup, 0.4, P).map(option => option.attacker.id));
    expect(context.options.every(option => option.weight > 0)).toBe(true);
  });
});
