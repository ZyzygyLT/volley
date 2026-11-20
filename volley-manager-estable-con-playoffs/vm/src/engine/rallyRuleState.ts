import type { RallySide } from './rallySequence';
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
  nextActionOrder: number;
  pointWinner: RallySide | null;
  lastActionId: string | null;
}

export interface RallyActionResult {
  /** Resultado explícito de la simulación, no inferido por este módulo. */
  continues: boolean;
  nextTeam?: RallySide;
  pointWinner?: RallySide;
}

export interface RallyStateIssue {
  code:
    | 'rally-already-finished'
    | 'wrong-action-order'
    | 'wrong-acting-team'
    | 'invalid-action'
    | 'too-many-team-hits'
    | 'missing-next-team'
    | 'unexpected-next-team'
    | 'missing-point-winner'
    | 'unexpected-point-winner';
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
    nextActionOrder: 1,
    pointWinner: null,
    lastActionId: null
  };
}

/**
 * Aplica una acción compuesta al estado reglamentario.
 *
 * El módulo valida el orden y los golpes, pero exige que el simulador
 * proporcione el equipo que continúa y si el rally terminó. No calcula
 * trayectorias, posesión física, legalidad espacial ni el ganador del rally.
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

  if (result.continues) {
    if (result.nextTeam !== 0 && result.nextTeam !== 1) {
      add('missing-next-team', 'Una acción que continúa necesita indicar explícitamente el equipo siguiente.');
    }
    if (result.pointWinner !== undefined) {
      add('unexpected-point-winner', 'Un rally que continúa no puede declarar ganador del punto.');
    }
  } else {
    if (result.nextTeam !== undefined) {
      add('unexpected-next-team', 'Un rally terminado no puede dejar un equipo siguiente.');
    }
    if (result.pointWinner !== 0 && result.pointWinner !== 1) {
      add('missing-point-winner', 'Un rally terminado necesita indicar explícitamente el ganador del punto.');
    }
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

  // El contacto simultáneo adversario reinicia el derecho del equipo receptor.
  if (derivation.allowanceResetFor !== null) {
    hits[derivation.allowanceResetFor] = 0;
  }

  if (result.continues && result.nextTeam !== action.actingTeam) {
    // Al recibir la siguiente acción del rival comienza un nuevo derecho.
    hits[result.nextTeam!] = 0;
  }

  const nextState: RallyRuleState = {
    status: result.continues ? 'in-play' : 'finished',
    nextTeam: result.continues ? result.nextTeam! : state.nextTeam,
    hits,
    nextActionOrder: state.nextActionOrder + 1,
    pointWinner: result.continues ? null : result.pointWinner!,
    lastActionId: action.actionId
  };

  return { state: nextState, issues: [] };
}
