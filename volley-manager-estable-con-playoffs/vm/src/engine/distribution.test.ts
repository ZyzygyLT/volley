import { describe, expect, it } from 'vitest';
import { makeSquads } from './match';
import { P } from './params';
import { buildAttackContext } from './attackContext';
import { selectAttackTarget } from './distribution';

describe('selección actual del objetivo de ataque', () => {
  it('reproduce los intervalos ponderados y el orden de opciones', () => {
    const [squad] = makeSquads(71);
    const context = buildAttackContext(squad.slice(0, 6), 0.7, P);
    const total = context.options.reduce((sum, option) => sum + option.weight, 0);
    let cumulative = 0;

    for (const option of context.options) {
      const midpoint = (cumulative + option.weight / 2) / total;
      expect(selectAttackTarget(context, () => midpoint)).toBe(option);
      cumulative += option.weight;
    }
  });

  it('consume exactamente una muestra aleatoria cuando existen opciones', () => {
    const [squad] = makeSquads(72);
    const context = buildAttackContext(squad.slice(0, 6), 0.7, P);
    let calls = 0;

    selectAttackTarget(context, () => { calls++; return 0.5; });
    expect(calls).toBe(1);
  });

  it('rechaza un contexto sin opciones en lugar de producir un atacante indefinido', () => {
    const [squad] = makeSquads(73);
    const context = buildAttackContext(squad.slice(0, 6), 0.7, P);

    expect(() => selectAttackTarget({ ...context, options: [] }, () => 0.5))
      .toThrow(RangeError);
  });

  it('no altera el contexto ni depende de la habilidad del colocador', () => {
    const [squad] = makeSquads(74);
    const context = buildAttackContext(squad.slice(0, 6), 0.7, P);
    const before = structuredClone(context);

    selectAttackTarget(context, () => 0.5);
    expect(context).toEqual(before);
  });
});
