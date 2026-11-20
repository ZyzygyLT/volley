import type { AttackContext } from './attackContext';
import { buildSetTargets } from './setTargets';
import type { AttackZone } from './attackOptions';
import type { Player } from './types';

/**
 * Datos descriptivos disponibles de un candidato a recibir la colocación.
 *
 * No representa una puntuación, preferencia, probabilidad ni decisión del
 * colocador. attackSkill es el atributo ofensivo existente del jugador.
 */
export interface SetCandidateProfile {
  player: Player;
  role: Player['role'];
  slot: number;
  zone: AttackZone;
  attackSkill: Player['atk'];
}

/** Construye perfiles en el mismo orden que los objetivos estructurales. */
export function buildSetCandidateProfiles(context: AttackContext): SetCandidateProfile[] {
  return buildSetTargets(context).map(({ player, slot, zone }) => ({
    player,
    role: player.role,
    slot,
    zone,
    attackSkill: player.atk,
  }));
}
