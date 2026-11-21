import type {
  BallOrigin,
  SetterRow,
  SetterSecondTouchSituation,
} from './setterSecondTouch';

/** Medidas reglamentarias de una cancha cubierta FIVB. */
export const COURT_LENGTH_METERS = 18;
export const COURT_WIDTH_METERS = 9;
export const ATTACK_LINE_DISTANCE_FROM_NET_METERS = 3;

/**
 * Coordenadas en metros del campo propio:
 * - x: lateral, desde la línea lateral izquierda (0 a 9 dentro de la cancha).
 * - depth: distancia desde el plano de la red hacia la línea de fondo propia (0 a 9).
 *
 * No se restringen los puntos al rectángulo de juego: puede ser necesario describir
 * un despegue o contacto en la zona libre. La pertenencia al espacio de juego propio
 * se recibe por separado porque requiere conocer también el lado y el espacio aéreo.
 */
export interface OwnCourtPoint {
  x: number;
  depth: number;
}

export interface SetterSecondTouchGeometryInput {
  setterRow: SetterRow;
  takeoffPoint: OwnCourtPoint;
  ballContactPoint: OwnCourtPoint;
  /** Altura del borde inferior del balón, en metros sobre el suelo. */
  ballBottomHeightMeters: number;
  /** Altura de la red aplicable a la competición: por ejemplo 2.43 m o 2.24 m. */
  netHeightMeters: number;
  ballOrigin: BallOrigin;
  contactInOwnPlayingSpace: boolean;
}

function assertFinitePoint(point: OwnCourtPoint, name: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.depth)) {
    throw new RangeError(`${name} debe contener coordenadas finitas`);
  }
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} debe ser un número positivo y finito`);
  }
}

/**
 * Convierte geometría explícita en los hechos que consume el evaluador FIVB.
 * El límite de 3 m se trata como zona de frente: un zaguero debe despegar
 * estrictamente detrás de la línea, sin tocarla.
 */
export function buildSetterSecondTouchSituation(
  input: SetterSecondTouchGeometryInput,
): SetterSecondTouchSituation {
  assertFinitePoint(input.takeoffPoint, 'takeoffPoint');
  assertFinitePoint(input.ballContactPoint, 'ballContactPoint');
  assertPositiveFinite(input.netHeightMeters, 'netHeightMeters');

  if (!Number.isFinite(input.ballBottomHeightMeters) || input.ballBottomHeightMeters < 0) {
    throw new RangeError('ballBottomHeightMeters debe ser finito y no negativo');
  }

  return {
    setterRow: input.setterRow,
    takeoffZone: input.takeoffPoint.depth > ATTACK_LINE_DISTANCE_FROM_NET_METERS
      ? 'back'
      : 'front',
    ballZoneAtContact: input.ballContactPoint.depth <= ATTACK_LINE_DISTANCE_FROM_NET_METERS
      ? 'front'
      : 'back',
    ballHeightAtContact: input.ballBottomHeightMeters > input.netHeightMeters
      ? 'entirely-above-net'
      : 'not-entirely-above-net',
    ballOrigin: input.ballOrigin,
    contactInOwnPlayingSpace: input.contactInOwnPlayingSpace,
  };
}
