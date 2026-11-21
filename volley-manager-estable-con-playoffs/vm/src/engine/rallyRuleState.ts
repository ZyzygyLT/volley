import type { RallySide } from './rallySequence';
import type { RallyTermination } from './types';
export type { RallyTermination };
import {
  deriveTeamHits,
  type CompoundRallyAction
} from './compoundContacts';

export interface RallyRuleState {
  status: 'in-play' | 'finished';
  /** Equipo autorizado a realizar la siguiente acción; no se infiere del último contacto. */
  nextTeam: RallySide;
  /** Golpes consumidos en el derecho vigente de cada equipo. */
  hits: Readonly<Record<RallySide, number>>;
  /** Jugadores que tocaron el balón en la última acción, separados por equipo.
   * Permite conservar ambos lados de un contacto simultáneo entre adversarios.
   */
  lastActionContactPlayerIdsByTeam: Readonly<Record<RallySide, readonly string[]>>;
  /** Sigue vigente hasta que ese equipo realice su primer golpe posterior al bloqueo. */
  postBlockFirstHitPendingFor: RallySide | null;
  nextActionOrder: number;
  pointWinner: RallySide | null;
  termination: RallyTermination | null;
  lastActionId: string | null;
}

export interface RallyActionResult {
  /** Resultado explícito de la simulación, no inferido por este módulo. */
  continues: boolean;
  nextTeam?: RallySide;
  pointWinner?: RallySide;
  /** Obligatorio al terminar: distingue falta del equipo responsable de acción ganadora. */
  termination?: RallyTermination;
}

export interface RallyStateIssue {
  code:
    | 'rally-already-finished'
    | 'wrong-action-order'
    | 'wrong-acting-team'
    | 'invalid-action'
    | 'too-many-team-hits'
    | 'same-player-consecutive-hit'
    | 'invalid-first-team-hit-context'
    | 'invalid-opponent-simultaneous-transition'
    | 'missing-next-team'
    | 'unexpected-next-team'
    | 'missing-point-winner'
    | 'unexpected-point-winner'
    | 'missing-termination'
    | 'unexpected-termination'
    | 'invalid-termination-winner';
  actionId: string;
  message: string;
}

export interface RallyTransitionResult {
  state: RallyRuleState | null;
  issues: RallyStateIssue[];
}

export function createRallyRuleState(firstTeam: RallySide): RallyRuleState {
  return {
    status: 'in-play',
    nextTeam: firstTeam,
    hits: { 0: 0, 1: 0 },
    lastActionContactPlayerIdsByTeam: { 0: [], 1: [] },
    postBlockFirstHitPendingFor: null,
    nextActionOrder: 1,
    pointWinner: null,
    termination: null,
    lastActionId: null
  };
}

/**
 * Aplica una acción compuesta al estado reglamentario.
 *
 * Valida orden, equipo, golpes y la restricción de jugador consecutivo.
 * La excepción del primer golpe después del bloqueo se deriva del historial
 * de bloqueos del propio estado; no se acepta una bandera externa como prueba.
 *
 * El simulador sigue proporcionando nextTeam y el resultado del rally.
 */
export function transitionRallyRuleState(
  state: RallyRuleState,
  action: CompoundRallyAction,
  result: RallyActionResult
): RallyTransitionResult {
  const issues: RallyStateIssue[] = [];
  const add = (code: RallyStateIssue['code'], message: string) =>
    issues.push({ code, actionId: action.actionId, message });

  if (state.status === 'finished') {
    add('rally-already-finished', 'No se admiten acciones después de terminar el rally.');
  }
  if (action.rallyOrder !== state.nextActionOrder) {
    add('wrong-action-order', 'La acción no coincide con el siguiente orden esperado.');
  }
  if (action.actingTeam !== state.nextTeam) {
    add('wrong-acting-team', 'El equipo actuante no es el autorizado por el estado anterior.');
  }

  const derivation = deriveTeamHits(action);
  if (derivation.issues.length > 0) {
    add('invalid-action', 'La acción compuesta contiene hechos inválidos o insuficientes.');
  }

  const actionContactPlayerIdsByTeam: Record<RallySide, string[]> = {
    0: [...new Set(action.groups.flatMap(group => group.contacts
      .filter(contact => contact.team === 0).map(contact => contact.playerId)))],
    1: [...new Set(action.groups.flatMap(group => group.contacts
      .filter(contact => contact.team === 1).map(contact => contact.playerId)))]
  };

  // La excepción de contactos corporales consecutivos solo aplica al primer
  // golpe del derecho actual. El estado, no la acción, acredita ese contexto.
  if (action.isFirstTeamHit && state.hits[action.actingTeam] !== 0) {
    add(
      'invalid-first-team-hit-context',
      'La acción declara ser el primer golpe del equipo, pero el estado ya registra golpes en este derecho.'
    );
  }

  const isOwnFirstHitAfterBlock =
    action.kind !== 'block' &&
    state.postBlockFirstHitPendingFor === action.actingTeam;

  if (
    action.kind !== 'block' &&
    !isOwnFirstHitAfterBlock &&
    actionContactPlayerIdsByTeam[action.actingTeam].some(playerId =>
      state.lastActionContactPlayerIdsByTeam[action.actingTeam].includes(playerId)
    )
  ) {
    add(
      'same-player-consecutive-hit',
      'Un jugador no puede realizar dos golpes consecutivos; la excepción post-bloqueo debe proceder del estado.'
    );
  }

  if (result.continues) {
    if (result.nextTeam !== 0 && result.nextTeam !== 1) {
      add('missing-next-team', 'Una acción que continúa necesita indicar explícitamente el equipo siguiente.');
    }
    if (result.pointWinner !== undefined) {
      add('unexpected-point-winner', 'Un rally que continúa no puede declarar ganador del punto.');
    }
    if (result.termination !== undefined) {
      add('unexpected-termination', 'Un rally que continúa no puede declarar una causa de terminación.');
    }
  } else {
    if (result.nextTeam !== undefined) {
      add('unexpected-next-team', 'Un rally terminado no puede dejar un equipo siguiente.');
    }
    if (result.pointWinner !== 0 && result.pointWinner !== 1) {
      add('missing-point-winner', 'Un rally terminado necesita indicar explícitamente el ganador del punto.');
    }
    if (!result.termination) {
      add('missing-termination', 'Un rally terminado necesita indicar si el punto acaba por falta o por acción ganadora.');
    } else if (
      result.pointWinner !== undefined &&
      ((result.termination.kind === 'fault' && result.pointWinner === result.termination.responsibleTeam) ||
       (result.termination.kind === 'winning-action' && result.pointWinner !== result.termination.responsibleTeam))
    ) {
      add('invalid-termination-winner', 'El ganador del punto no coincide con el tipo de terminación y el equipo responsable declarados.');
    }
  }

  // La regla de contacto simultáneo adversario sobre la red solo se aplica
  // si el balón sigue en juego: el equipo receptor debe ser el próximo en jugar
  // y obtiene el reinicio explícito de su derecho a tres golpes.
  if (
    action.opponentSimultaneousOverNet &&
    (!result.continues || result.nextTeam !== action.receivingTeam)
  ) {
    add(
      'invalid-opponent-simultaneous-transition',
      'El contacto simultáneo adversario indicado requiere continuidad y que el equipo receptor sea el siguiente en jugar.'
    );
  }

  const currentHits = state.hits[action.actingTeam] + derivation.teamHits;
  if (currentHits > 3) {
    add('too-many-team-hits', 'La acción supera el máximo de tres golpes del equipo en su derecho vigente.');
  }

  if (issues.length > 0) return { state: null, issues };

  const hits: Record<RallySide, number> = { ...state.hits };
  hits[action.actingTeam] = currentHits;

  // El bloqueo no consume golpe y concede un nuevo derecho de tres golpes
  // al equipo bloqueador (FIVB 14.4.1).
  if (derivation.isBlock) hits[action.actingTeam] = 0;

  if (derivation.allowanceResetFor !== null) {
    hits[derivation.allowanceResetFor] = 0;
  }

  if (result.continues && result.nextTeam !== action.actingTeam) {
    hits[result.nextTeam!] = 0;
  }

  // El bloqueo deja pendiente la excepción para el primer golpe posterior
  // de ese equipo, incluso si antes juega el adversario.
  let postBlockFirstHitPendingFor = state.postBlockFirstHitPendingFor;
  if (derivation.isBlock) {
    postBlockFirstHitPendingFor = action.actingTeam;
  } else if (isOwnFirstHitAfterBlock) {
    postBlockFirstHitPendingFor = null;
  }

  const nextState: RallyRuleState = {
    status: result.continues ? 'in-play' : 'finished',
    nextTeam: result.continues ? result.nextTeam! : state.nextTeam,
    hits,
    lastActionContactPlayerIdsByTeam: actionContactPlayerIdsByTeam,
    postBlockFirstHitPendingFor,
    nextActionOrder: state.nextActionOrder + 1,
    pointWinner: result.continues ? null : result.pointWinner!,
    termination: result.continues ? null : result.termination!,
    lastActionId: action.actionId
  };

  return { state: nextState, issues: [] };
}
