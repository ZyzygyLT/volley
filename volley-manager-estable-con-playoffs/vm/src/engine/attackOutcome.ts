import type { Params } from './params';
import type { AtkOut, Player } from './types';

export interface AttackOutcomeContext {
  phase: 'k1' | 'k2';
  receptionValue: number;
  setterSkill: number;
  averageOpponentDefense: number;
  averageOpponentBlock: number;
  params: Params;
}

export interface AttackOutcomeProbabilities {
  /** Probabilidades efectivas después de respetar el orden de resolución del motor. */
  kill: number;
  error: number;
  blocked: number;
  continuation: number;
  /** Valor esperado de puntos del equipo atacante: +1 kill, -1 error/bloqueo, 0 continuidad. */
  expectedPointValue: number;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

/**
 * Calcula el desenlace inmediato de un ataque usando exactamente los factores
 * que ya utiliza rally.ts. No modela la calidad/tempo de la colocación ni
 * constituye una estimación validada del rendimiento real del voleibol.
 */
export function evaluateAttackOutcome(
  attacker: Player,
  context: AttackOutcomeContext,
): AttackOutcomeProbabilities {
  const { params: p, phase } = context;
  const qd = context.receptionValue - 0.55;
  const sd = context.setterSkill - 70;
  const baseKill = phase === 'k1' ? p.killK1 : p.killK2;
  const baseError = phase === 'k1' ? p.errK1 : p.errK2;
  const baseBlock = phase === 'k1' ? p.blkK1 : p.blkK2;

  const killChance = clamp(
    baseKill
      + p.roleKill[attacker.role]
      + (attacker.atk - 70) * p.atkW * p.atkSkillScale[attacker.role]
      + sd * p.setW
      - (context.averageOpponentDefense - 65) * p.defW
      - (context.averageOpponentBlock - 65) * p.blkKillW
      + qd * p.qKill,
    0.05,
    0.85,
  );
  const error = clamp(
    baseError
      + p.roleErr[attacker.role]
      - (attacker.atk - 70) * p.errAtkW
      - (attacker.cons - 70) * p.errConsW
      - qd * p.errQ,
    0.01,
    0.35,
  );
  const blocked = clamp(
    baseBlock + (context.averageOpponentBlock - 65) * p.blkW,
    0.01,
    0.3,
  );

  // rally.ts resuelve primero error, luego bloqueo y después kill. Si las
  // probabilidades acumuladas exceden 1, la continuidad queda en cero y la
  // probabilidad efectiva de kill se trunca al espacio restante.
  const kill = Math.min(killChance, 1 - error - blocked);
  const continuation = Math.max(0, 1 - error - blocked - kill);

  return {
    kill,
    error,
    blocked,
    continuation,
    expectedPointValue: kill - error - blocked,
  };
}

/** Resultado de la evaluación junto a la acción candidata que se examinó. */
export interface EvaluatedAttack<T> {
  candidate: T;
  outcome: AttackOutcomeProbabilities;
}

/** Conversión explícita de probabilidades a valor inmediato de punto. */
export function outcomeFor(outcome: AttackOutcomeProbabilities, result: AtkOut): number {
  switch (result) {
    case 'kill': return outcome.kill;
    case 'err': return outcome.error;
    case 'blk': return outcome.blocked;
    case 'cont': return outcome.continuation;
  }
}
