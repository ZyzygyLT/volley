import type { AttackContext } from './attackContext';
import type { AttackZone } from './attackOptions';
import type { Player } from './types';

/**
 * Jugador al que el colocador podría dirigir una colocación.
 *
 * No contiene pesos: los pesos heredados de selección de atacante no son
 * probabilidades de elección del colocador y no deben reutilizarse como tales.
 */
export interface SetTarget {
  player: Player;
  slot: number;
  zone: AttackZone;
}

/**
 * Extrae objetivos de colocación distintos del colocador.
 *
 * Esta función solo formaliza elegibilidad estructural a partir de las
 * opciones actuales. No decide distribución, tempo, combinación ni calidad
 * de colocación. El ataque propio del colocador queda fuera de este carril.
 */
export function buildSetTargets(context: AttackContext): SetTarget[] {
  return context.options
    .filter(option => option.kind === 'hitter-attack')
    .map(({ attacker, slot, zone }) => ({ player: attacker, slot, zone }));
}
