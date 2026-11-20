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

  it('no elige atacante ni cambia los pesos de elegibilidad', () => {
    const [squad] = makeSquads(33);
    const lineup = squad.slice(0, 6);
    const context = buildAttackContext(lineup, 0.4, P);

    expect(context.options.map(option => option.attacker.id))
      .toEqual(buildAttackOptions(lineup, 0.4, P).map(option => option.attacker.id));
    expect(context.options.every(option => option.weight > 0)).toBe(true);
  });
});
