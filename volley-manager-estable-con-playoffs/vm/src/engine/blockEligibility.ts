import type { Player, Team } from './types';

/**
 * Jugadores que ocupan las tres zonas delanteras de la rotación actual.
 *
 * Esto determina elegibilidad reglamentaria básica, no quién intenta bloquear,
 * qué atacante toma cada jugador ni si llega a realizar un contacto.
 */
export function getEligibleBlockers(team: Team): Player[] {
  if (team.lineup.length !== 6) {
    throw new Error('La alineación debe contener exactamente seis jugadores');
  }

  const ids = team.lineup.map(player => player.id);
  if (new Set(ids).size !== 6) {
    throw new Error('La alineación no puede contener jugadores duplicados');
  }

  const frontRow = team.lineup.slice(3, 6);
  if (frontRow.some(player => player.role === 'L')) {
    throw new Error('El líbero no puede ocupar una posición de primera línea');
  }

  return frontRow;
}
