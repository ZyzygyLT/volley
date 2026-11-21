import type { AttackOption } from './attackOptions';
import {
  evaluateAttackOutcome,
  type AttackOutcomeContext,
  type EvaluatedAttack,
} from './attackOutcome';

/**
 * Política experimental: maximiza el valor esperado del desenlace inmediato
 * bajo las probabilidades actuales del motor. No modela bloqueo por atacante,
 * tempo, disponibilidad de carrera ni precisión de colocación.
 */
export function evaluateAttackOptions(
  options: readonly AttackOption[],
  context: AttackOutcomeContext,
): EvaluatedAttack<AttackOption>[] {
  return options.map(candidate => ({
    candidate,
    outcome: evaluateAttackOutcome(candidate.attacker, context),
  }));
}

/**
 * Baseline de decisión basado en el modelo de desenlace existente.
 * En empate conserva el orden original. No consume RNG ni muta candidatos.
 */
export function selectBestExpectedAttack(
  options: readonly AttackOption[],
  context: AttackOutcomeContext,
): EvaluatedAttack<AttackOption> {
  if (options.length === 0) {
    throw new RangeError('No hay opciones de ataque para evaluar');
  }

  const evaluated = evaluateAttackOptions(options, context);
  let best = evaluated[0];

  for (let index = 1; index < evaluated.length; index += 1) {
    if (evaluated[index].outcome.expectedPointValue > best.outcome.expectedPointValue) {
      best = evaluated[index];
    }
  }

  return best;
}
