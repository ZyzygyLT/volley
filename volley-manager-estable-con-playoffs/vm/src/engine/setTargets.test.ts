import { describe, expect, it } from 'vitest';
import { buildAttackContext } from './attackContext';
import { makeSquads } from './match';
import { P } from './params';
import { buildSetTargets } from './setTargets';

describe('objetivos de colocación', () => {
  it('excluye al colocador y conserva el orden y la zona de los demás atacantes', () => {
    const [squad] = makeSquads(31);
    const lineup = [squad[1], squad[2], squad[3], squad[0], squad[4], squad[5]];
    const context = buildAttackContext(lineup, 0.7, P);
    const targets = buildSetTargets(context);

    expect(targets.some(target => target.player.role === 'S')).toBe(false);
    expect(targets.map(target => target.player.id)).toEqual(
      context.options.filter(option => option.kind === 'hitter-attack').map(option => option.attacker.id),
    );
    expect(targets.every(target => target.zone === (target.slot >= 3 ? 'front' : 'backrow'))).toBe(true);
  });

  it('no inventa objetivos cuando no hay opciones distintas del colocador', () => {
    const [squad] = makeSquads(32);
    const lineup = [squad[1], squad[2], squad[3], squad[0], squad[4], squad[5]];
    const setterOnlyParams = {
      ...P,
      atkWeight: { ...P.atkWeight, OH: 0, MB: 0, OP: 0, L: 0 },
    };
    const context = buildAttackContext(lineup, 0.7, setterOnlyParams);

    expect(buildSetTargets(context)).toEqual([]);
  });

  it('no modifica el contexto ni convierte los pesos heredados en pesos de distribución', () => {
    const [squad] = makeSquads(33);
    const context = buildAttackContext(squad.slice(0, 6), 0.4, P);
    const before = structuredClone(context);

    const targets = buildSetTargets(context);

    expect(context).toEqual(before);
    expect(targets.every(target => !('weight' in target))).toBe(true);
  });
});
