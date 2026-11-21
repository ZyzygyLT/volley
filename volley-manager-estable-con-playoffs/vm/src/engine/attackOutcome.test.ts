import { describe, expect, it } from 'vitest';
import { makeSquads } from './match';
import { P } from './params';
import { evaluateAttackOutcome } from './attackOutcome';

describe('evaluación de desenlace del ataque', () => {
  const context = {
    phase: 'k1' as const,
    receptionValue: 0.7,
    setterSkill: 80,
    averageOpponentDefense: 70,
    averageOpponentBlock: 72,
    params: P,
  };

  it('devuelve probabilidades válidas que suman uno', () => {
    const [squad] = makeSquads(101);
    const outcome = evaluateAttackOutcome(squad[1], context);

    expect(outcome.kill).toBeGreaterThanOrEqual(0);
    expect(outcome.error).toBeGreaterThanOrEqual(0);
    expect(outcome.blocked).toBeGreaterThanOrEqual(0);
    expect(outcome.continuation).toBeGreaterThanOrEqual(0);
    expect(outcome.kill + outcome.error + outcome.blocked + outcome.continuation)
      .toBeCloseTo(1, 12);
    expect(outcome.expectedPointValue)
      .toBeCloseTo(outcome.kill - outcome.error - outcome.blocked, 12);
  });

  it('es determinista y no modifica al atacante', () => {
    const [squad] = makeSquads(102);
    const attacker = squad[1];
    const before = structuredClone(attacker);

    expect(evaluateAttackOutcome(attacker, context)).toEqual(
      evaluateAttackOutcome(attacker, context),
    );
    expect(attacker).toEqual(before);
  });

  it('usa la fase y la calidad continua de recepción', () => {
    const [squad] = makeSquads(103);
    const attacker = squad[1];
    const k1 = evaluateAttackOutcome(attacker, context);
    const k2 = evaluateAttackOutcome(attacker, { ...context, phase: 'k2' });
    const poorReception = evaluateAttackOutcome(attacker, {
      ...context,
      receptionValue: 0.3,
    });

    expect(k1).not.toEqual(k2);
    expect(poorReception.kill).toBeLessThan(k1.kill);
  });
});
