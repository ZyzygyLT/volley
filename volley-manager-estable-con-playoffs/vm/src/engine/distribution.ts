import type { AttackContext } from './attackContext';
import type { AttackOption } from './attackOptions';

/**
 * Selección ponderada del objetivo con los pesos históricos del motor.
 *
 * Esto formaliza el sorteo actual; no representa todavía una decisión táctica
 * del colocador ni utiliza su habilidad, tempo o combinaciones ofensivas.
 * Consume exactamente una muestra RNG cuando hay opciones disponibles.
 */
export function selectAttackTarget(context: AttackContext, rnd: () => number): AttackOption {
  const options = context.options;
  const totalWeight = options.reduce((sum, option) => sum + option.weight, 0);
  if (options.length === 0 || !Number.isFinite(totalWeight) || totalWeight <= 0) {
    throw new RangeError('No hay opciones de ataque con peso válido');
  }

  let roll = rnd() * totalWeight;
  for (const option of options) {
    roll -= option.weight;
    if (roll <= 0) return option;
  }
  return options[0];
}
