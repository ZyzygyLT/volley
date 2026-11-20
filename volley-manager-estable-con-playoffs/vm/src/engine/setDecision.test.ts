import { describe, expect, it } from 'vitest';
import { buildAttackContext } from './attackContext';
import { makeSquads } from './match';
import { P } from './params';
import { buildSetCandidateProfiles } from './setCandidateProfile';
import { decideSetTarget } from './setDecision';

describe('decisión de colocación baseline v1', () => {
  function candidates(seed = 51) {
    const [squad] = makeSquads(seed);
    const context = buildAttackContext(squad.slice(0, 6), 0.7, P);
    return buildSetCandidateProfiles(context);
  }

  it('elige el candidato con mayor atributo de ataque disponible', () => {
    const available = candidates();
    const decision = decideSetTarget(available);
    const maximum = Math.max(...available.map(candidate => candidate.attackSkill));

    expect(decision.target.attackSkill).toBe(maximum);
    expect(available).toContain(decision.target);
    expect(decision.reason).toBe('highest-attack-skill');
  });

  it('resuelve empates conservando el orden original', () => {
    const available = candidates().slice(0, 2).map(candidate => ({
      ...candidate,
      attackSkill: 75,
    }));

    const decision = decideSetTarget(available);

    expect(decision.target).toBe(available[0]);
    expect(decision.reason).toBe('stable-order-tiebreak');
  });

  it('falla explícitamente cuando no hay candidatos', () => {
    expect(() => decideSetTarget([])).toThrowError(
      new RangeError('No hay candidatos disponibles para la colocación'),
    );
  });

  it('es determinista y no modifica la lista ni sus perfiles', () => {
    const available = candidates();
    const before = structuredClone(available);

    const first = decideSetTarget(available);
    const second = decideSetTarget(available);

    expect(first).toEqual(second);
    expect(available).toEqual(before);
  });

  it('no consulta RNG ni incorpora candidatos ajenos a la lista', () => {
    const available = candidates();
    const decision = decideSetTarget(available);

    expect(available.some(candidate => candidate === decision.target)).toBe(true);
    expect(decision).not.toHaveProperty('probability');
    expect(decision).not.toHaveProperty('weight');
  });

  it('mantiene una decisión entre candidatos elegibles en las seis rotaciones y calidades de recepción', () => {
    const [squad] = makeSquads(52);
    const lineup = [...squad.slice(0, 6)];

    for (let rotation = 0; rotation < 6; rotation += 1) {
      for (const reception of [0.7, 0.5, 0.3]) {
        const context = buildAttackContext(lineup, reception, P);
        const available = buildSetCandidateProfiles(context);
        const decision = decideSetTarget(available);

        expect(available.length).toBeGreaterThan(0);
        expect(available).toContain(decision.target);
        expect(decision.target.player.id).not.toBe(context.setter?.player.id);
        expect(decision.target.attackSkill).toBe(
          Math.max(...available.map(candidate => candidate.attackSkill)),
        );
      }

      lineup.unshift(lineup.pop()!);
    }
  });
});
