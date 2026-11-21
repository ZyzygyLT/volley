import { describe, expect, it, vi } from 'vitest';
import { buildAttackContext } from './attackContext';
import { makeSquads } from './match';
import { P } from './params';
import { evaluateAttackOptions, selectBestExpectedAttack } from './attackDecision';

describe('selección experimental por valor esperado del ataque', () => {
  function setup() {
    const [squad, opponent] = makeSquads(204);
    const context = buildAttackContext(squad.slice(0, 6), 0.7, P);
    const front = opponent.slice(3, 6);
    const back = opponent.slice(0, 3);
    const evaluationContext = {
      phase: 'k1' as const,
      receptionValue: context.receptionValue,
      setterSkill: context.setter?.player.set ?? 70,
      averageOpponentDefense: back.reduce((sum, player) => sum + player.def, 0) / back.length,
      averageOpponentBlock: front.reduce((sum, player) => sum + player.blk, 0) / front.length,
      params: P,
    };
    return { context, evaluationContext };
  }

  it('solo evalúa candidatos elegibles y conserva su identidad', () => {
    const { context, evaluationContext } = setup();
    const evaluated = evaluateAttackOptions(context.options, evaluationContext);

    expect(evaluated).toHaveLength(context.options.length);
    expect(evaluated.map(item => item.candidate)).toEqual(context.options);
  });

  it('elige el mayor valor esperado y desempata por orden estable', () => {
    const { context, evaluationContext } = setup();
    const evaluated = evaluateAttackOptions(context.options, evaluationContext);
    const expected = evaluated.reduce((best, item) =>
      item.outcome.expectedPointValue > best.outcome.expectedPointValue ? item : best,
    );

    expect(selectBestExpectedAttack(context.options, evaluationContext)).toEqual(expected);
  });

  it('falla explícitamente si no hay candidatos', () => {
    const { evaluationContext } = setup();

    expect(() => selectBestExpectedAttack([], evaluationContext))
      .toThrowError(new RangeError('No hay opciones de ataque para evaluar'));
  });

  it('no consume RNG ni modifica las opciones', () => {
    const { context, evaluationContext } = setup();
    const before = structuredClone(context.options);
    const rnd = vi.fn(() => 0.5);

    selectBestExpectedAttack(context.options, evaluationContext);

    expect(rnd).not.toHaveBeenCalled();
    expect(context.options).toEqual(before);
  });
});
