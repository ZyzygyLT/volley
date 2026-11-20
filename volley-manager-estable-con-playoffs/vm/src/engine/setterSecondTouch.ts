/**
 * Evaluación reglamentaria aislada del segundo toque ofensivo del colocador.
 *
 * Basado en las Reglas Oficiales FIVB 2025-2028, reglas 13.1 y 13.2.
 * El llamador debe aportar hechos espaciales del contacto; la rotación por sí
 * sola no permite deducir la legalidad de un ataque zaguero.
 */
export type SetterRow = 'front' | 'backrow';
export type CourtZone = 'front' | 'back';
export type BallHeightAtContact = 'entirely-above-net' | 'not-entirely-above-net';
export type BallOrigin = 'opponent-service' | 'other';

export interface SetterSecondTouchSituation {
  /** Fila reglamentaria del jugador según su posición de rotación. */
  setterRow: SetterRow;
  /** Zona desde la que despega el jugador; 'back' implica detrás de la línea de ataque. */
  takeoffZone: CourtZone;
  /** Zona en la que se encuentra el balón en el momento del contacto. */
  ballZoneAtContact: CourtZone;
  /** Altura del balón respecto del borde superior de la red al contacto. */
  ballHeightAtContact: BallHeightAtContact;
  /** Si el balón que intenta atacar procede directamente del saque rival. */
  ballOrigin: BallOrigin;
  /** El contacto se realiza dentro del espacio de juego propio. */
  contactInOwnPlayingSpace: boolean;
}

export type SetterSecondTouchDecision =
  | { legal: true; reason: 'front-row-player' | 'back-row-behind-attack-line' | 'back-row-front-zone-ball-below-net' }
  | { legal: false; reason: 'contact-outside-own-playing-space' | 'opponent-service-high-front-zone' | 'back-row-front-zone-ball-above-net' };

/**
 * Determina únicamente las restricciones del golpe de ataque aplicables.
 * No evalúa doble contacto, retención, invasión, oportunidad táctica ni éxito.
 */
export function evaluateSetterSecondTouch(
  situation: SetterSecondTouchSituation,
): SetterSecondTouchDecision {
  if (!situation.contactInOwnPlayingSpace) {
    return { legal: false, reason: 'contact-outside-own-playing-space' };
  }

  if (
    situation.ballOrigin === 'opponent-service' &&
    situation.ballZoneAtContact === 'front' &&
    situation.ballHeightAtContact === 'entirely-above-net'
  ) {
    return { legal: false, reason: 'opponent-service-high-front-zone' };
  }

  if (situation.setterRow === 'front') {
    return { legal: true, reason: 'front-row-player' };
  }

  if (situation.takeoffZone === 'back') {
    return { legal: true, reason: 'back-row-behind-attack-line' };
  }

  if (situation.ballHeightAtContact === 'not-entirely-above-net') {
    return { legal: true, reason: 'back-row-front-zone-ball-below-net' };
  }

  return { legal: false, reason: 'back-row-front-zone-ball-above-net' };
}
