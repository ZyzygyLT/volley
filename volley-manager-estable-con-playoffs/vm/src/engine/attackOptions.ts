import type { Player } from './types';
import type { Params } from './params';

/** Zona de ataque según la rotación: índices 0-2 son zaga; 3-5 son primera línea. */
export type AttackZone = 'front' | 'backrow';

/**
 * Opción de atacante disponible en la rotación actual.
 * weight conserva exactamente el peso histórico usado por rally.ts; todavía no representa una decisión táctica del colocador.
 */
export interface AttackOption {
  attacker: Player;
  slot: number;
  zone: AttackZone;
  weight: number;
}

/**
 * Construye las opciones de ataque legales para la alineación actual.
 *
 * - Primera línea: cualquier jugador con peso de ataque positivo, incluido el colocador.
 * - Zaguero: solo OH/OP, como en el modelo previo; el ataque de zaguero sigue siendo una opción abstracta.
 * - Líbero: nunca es opción de ataque.
 *
 * No decide tempo, combinación ni distribución. Es una extracción del filtrado existente
 * para poder probar las restricciones antes de evolucionar el comportamiento del rally.
 */
export function buildAttackOptions(lineup: Player[], receptionQuality: number, params: Params): AttackOption[] {
  return lineup.flatMap((player, slot) => {
    const roleWeight = params.atkWeight[player.role];
    if (roleWeight <= 0) return [];

    const zone: AttackZone = slot >= 3 ? 'front' : 'backrow';
    if (zone === 'backrow' && player.role !== 'OH' && player.role !== 'OP') return [];

    const backrowFactor = zone === 'backrow' ? 0.45 : 1;
    const poorMiddlePassFactor = player.role === 'MB' && receptionQuality < 0.5 ? 0.3 : 1;
    const weight = roleWeight * (player.atk / 70) * backrowFactor * poorMiddlePassFactor;

    return weight > 0 ? [{ attacker: player, slot, zone, weight }] : [];
  });
}
