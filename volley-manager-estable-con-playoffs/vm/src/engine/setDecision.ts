import type { SetCandidateProfile } from './setCandidateProfile';

/** Motivo explícito de la selección de referencia, no una explicación táctica real. */
export type SetDecisionReason = 'highest-attack-skill' | 'stable-order-tiebreak';

/** Resultado de la política de referencia aislada para elegir un objetivo. */
export interface SetDecision {
  target: SetCandidateProfile;
  reason: SetDecisionReason;
}

/**
 * Política baseline v1: elige el candidato con mayor atributo atk disponible.
 *
 * No pretende modelar la lectura ni las preferencias reales de un colocador:
 * usa un atributo ya existente como referencia determinista para comparar
 * futuras políticas. En empate conserva el primer candidato recibido.
 * No consume RNG, no asigna probabilidades y no modifica candidatos ni rally.
 */
export function decideSetTarget(candidates: readonly SetCandidateProfile[]): SetDecision {
  if (candidates.length === 0) {
    throw new RangeError('No hay candidatos disponibles para la colocación');
  }

  let best = candidates[0];
  let tied = false;

  for (let index = 1; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate.attackSkill > best.attackSkill) {
      best = candidate;
      tied = false;
    } else if (candidate.attackSkill === best.attackSkill) {
      tied = true;
    }
  }

  return {
    target: best,
    reason: tied ? 'stable-order-tiebreak' : 'highest-attack-skill',
  };
}
