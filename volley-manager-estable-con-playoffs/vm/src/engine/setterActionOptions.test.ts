import { describe, expect, it } from 'vitest';
import { buildAttackContext } from './attackContext';
import { makeSquads } from './match';
import { P } from './params';
import { buildSetterActionOptions } from './setterActionOptions';

describe('opciones de acción ofensiva del colocador', () => {
  function context(seed = 20261120) {
    const [squad] = makeSquads(seed);
    return buildAttackContext(squad.slice(0, 6), 0.7, P);
  }

  it('separa las colocaciones a compañeros del candidato de segundo toque', () => {
    const attackContext = context();
    const options = buildSetterActionOptions(attackContext);
    const distributions = options.filter(option => option.kind === 'distribution');
    const secondTouch = options.filter(option => option.kind === 'setter-second-touch-candidate');

    expect(attackContext.setter).not.toBeNull();
    expect(distributions.length).toBeGreaterThan(0);
    expect(secondTouch).toHaveLength(1);
    expect(secondTouch[0].setter.player.id).toBe(attackContext.setter!.player.id);
    expect(distributions.every(option => option.setter.player.id === attackContext.setter!.player.id)).toBe(true);
    expect(distributions.every(option => option.target.player.id !== attackContext.setter!.player.id)).toBe(true);
  });

  it('no inventa opciones cuando no hay colocador identificado', () => {
    const attackContext = { ...context(), setter: null };

    expect(buildSetterActionOptions(attackContext)).toEqual([]);
  });

  it('conserva el orden de los objetivos y no muta el contexto', () => {
    const attackContext = context();
    const before = structuredClone(attackContext);
    const options = buildSetterActionOptions(attackContext);
    const targetIds = attackContext.options
      .filter(option => option.kind === 'hitter-attack')
      .map(option => option.attacker.id);

    expect(options.filter(option => option.kind === 'distribution').map(option => option.target.player.id))
      .toEqual(targetIds);
    expect(attackContext).toEqual(before);
  });

  it('marca el segundo toque como candidato, sin asignarle probabilidad ni resolverlo', () => {
    const options = buildSetterActionOptions(context());
    const secondTouch = options.find(option => option.kind === 'setter-second-touch-candidate');

    expect(secondTouch).toBeDefined();
    expect(secondTouch).not.toHaveProperty('probability');
    expect(secondTouch).not.toHaveProperty('weight');
    expect(secondTouch).not.toHaveProperty('result');
  });
});
