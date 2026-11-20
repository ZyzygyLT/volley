import { describe, expect, it } from 'vitest';
import { buildAttackContext } from './attackContext';
import { makeSquads } from './match';
import { P } from './params';
import { buildSetTargets } from './setTargets';

describe('objetivos de colocación', () => {
  it('excluye al colocador en las seis rotaciones y conserva el orden de los atacantes', () => {
    const [squad] = makeSquads(31);

    for (let rotation = 0; rotation < 6; rotation++) {
      const lineup = [...squad.slice(0, 6)];
      const context = buildAttackContext(lineup, 0.7, P);
      const targets = buildSetTargets(context);

      expect(context.setter).not.toBeNull();
      expect(targets.some(target => target.player.id === context.setter?.player.id)).toBe(false);
      expect(targets.map(target => target.player.id)).toEqual(
        context.options.filter(option => option.kind === 'hitter-attack').map(option => option.attacker.id),
      );
      expect(targets.every(target => target.zone === (target.slot >= 3 ? 'front' : 'backrow'))).toBe(true);

      // El equipo rota una posición por iteración, igual que al recuperar el saque.
      lineup.unshift(lineup.pop()!);
    }
  });

  it('no inventa objetivos cuando el colocador es la única opción con peso', () => {
    const [squad] = makeSquads(32);
    const lineup = [squad[1], squad[2], squad[3], squad[0], squad[4], squad[5]];
    const setterOnlyParams = {
      ...P,
      atkWeight: { ...P.atkWeight, OH: 0, MB: 0, OP: 0, L: 0 },
    };
    const context = buildAttackContext(lineup, 0.7, setterOnlyParams);

    expect(context.options).toHaveLength(1);
    expect(context.options[0].kind).toBe('setter-attack-legacy');
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
