import type { RallySide, ContactAction } from './rallySequence';

/** Relación temporal entre contactos físicos dentro de una acción ya resuelta. */
export type ContactRelation = 'single' | 'simultaneous' | 'consecutive-within-action';

export interface PhysicalContact {
  playerId: string;
  team: RallySide;
  /** Parte corporal opcional; no interviene en el cómputo reglamentario. */
  bodyPart?: string;
}

export interface ContactGroup {
  relation: ContactRelation;
  contacts: readonly PhysicalContact[];
}

/**
 * Acción compuesta: no representa por sí sola una posesión ni decide quién
 * debe jugar después. Es un conjunto explícito de hechos de contacto.
 */
export interface CompoundRallyAction {
  actionId: string;
  rallyOrder: number;
  kind: ContactAction;
  actingTeam: RallySide;
  groups: readonly ContactGroup[];
  /** Debe ser verdadero solo si el estado del rally demuestra este contexto. */
  isFirstTeamHit?: boolean;
  /** Primer golpe de este equipo después de su propia acción de bloqueo. */
  isFirstHitAfterOwnBlock?: boolean;
  /** Contacto simultáneo de adversarios sobre la red; balón sigue en juego. */
  opponentSimultaneousOverNet?: boolean;
  /** Equipo que recibe el balón en el contacto simultáneo adversario. Hecho explícito. */
  receivingTeam?: RallySide;
}

export interface CompoundContactIssue {
  code:
    | 'invalid-action-id'
    | 'invalid-rally-order'
    | 'invalid-team'
    | 'empty-groups'
    | 'empty-contact-group'
    | 'invalid-player'
    | 'contact-team-mismatch'
    | 'invalid-simultaneous-group'
    | 'unsupported-consecutive-group'
    | 'invalid-first-hit-context'
    | 'invalid-opponent-simultaneous-context'
    | 'multiple-block-teams'
    | 'block-team-mismatch'
    | 'unexpected-receiving-team';
  actionId: string;
  groupIndex?: number;
  message: string;
}

export interface TeamHitDerivation {
  /** Número de golpes atribuibles a esta acción del equipo que actúa. */
  teamHits: number;
  /** El bloqueo no consume un golpe. */
  isBlock: boolean;
  /** Equipo cuyo derecho a tres golpes se reinicia; null si no aplica. */
  allowanceResetFor: RallySide | null;
  issues: CompoundContactIssue[];
}

function issue(
  action: CompoundRallyAction,
  code: CompoundContactIssue['code'],
  message: string,
  groupIndex?: number
): CompoundContactIssue {
  return { code, actionId: action.actionId, ...(groupIndex === undefined ? {} : { groupIndex }), message };
}

/** Valida la estructura y coherencia local de los hechos, sin inferir contactos. */
export function validateCompoundAction(
  action: CompoundRallyAction
): CompoundContactIssue[] {
  const issues: CompoundContactIssue[] = [];

  if (!action.actionId.trim()) {
    issues.push(issue(action, 'invalid-action-id', 'La acción necesita un identificador explícito.'));
  }
  if (!Number.isInteger(action.rallyOrder) || action.rallyOrder < 1) {
    issues.push(issue(action, 'invalid-rally-order', 'El orden de acción debe ser un entero positivo.'));
  }
  if (action.actingTeam !== 0 && action.actingTeam !== 1) {
    issues.push(issue(action, 'invalid-team', 'El equipo actuante debe ser 0 o 1.'));
  }
  if (action.groups.length === 0) {
    issues.push(issue(action, 'empty-groups', 'La acción debe contener al menos un grupo de contactos.'));
  }

  let hasOpponent = false;
  const blockTeams = new Set<RallySide>();

  action.groups.forEach((group, groupIndex) => {
    if (group.contacts.length === 0) {
      issues.push(issue(action, 'empty-contact-group', 'Un grupo temporal no puede estar vacío.', groupIndex));
      return;
    }

    const teams = new Set<RallySide>();
    for (const contact of group.contacts) {
      if (!contact.playerId.trim()) {
        issues.push(issue(action, 'invalid-player', 'Cada contacto necesita un jugador identificado.', groupIndex));
      }
      if (contact.team !== 0 && contact.team !== 1) {
        issues.push(issue(action, 'invalid-team', 'El equipo del contacto debe ser 0 o 1.', groupIndex));
      }
      teams.add(contact.team);
      if (contact.team !== action.actingTeam) hasOpponent = true;
      if (action.kind === 'block') blockTeams.add(contact.team);
    }

    if ((group.relation !== 'simultaneous' || teams.size === 1) && group.contacts.some(contact => contact.team !== action.actingTeam)) {
      issues.push(issue(action, 'contact-team-mismatch', 'Los contactos de otro equipo solo se admiten en el grupo simultáneo adversario explícito.', groupIndex));
    }
    if (group.relation === 'single' && group.contacts.length !== 1) {
      issues.push(issue(action, 'invalid-simultaneous-group', 'Un grupo single debe contener exactamente un contacto.', groupIndex));
    }
    if (group.relation === 'simultaneous' && group.contacts.length < 2) {
      issues.push(issue(action, 'invalid-simultaneous-group', 'Un grupo simultáneo necesita al menos dos contactos.', groupIndex));
    }
    if (group.relation === 'consecutive-within-action' && group.contacts.length < 2) {
      issues.push(issue(action, 'unsupported-consecutive-group', 'Un grupo consecutivo necesita al menos dos contactos.', groupIndex));
    }
    if (group.relation === 'simultaneous' && teams.size > 1 && !action.opponentSimultaneousOverNet) {
      issues.push(issue(action, 'invalid-opponent-simultaneous-context', 'Los contactos simultáneos de adversarios requieren contexto explícito sobre la red.', groupIndex));
    }
    if (group.relation === 'consecutive-within-action') {
      const players = new Set(group.contacts.map(contact => contact.playerId));
      const wrongTeam = group.contacts.some(contact => contact.team !== action.actingTeam);
      // Durante una misma acción de bloqueo pueden producirse contactos
      // consecutivos de uno o varios bloqueadores (FIVB 9.2.3.1).
      // Fuera del bloqueo, este contrato solo normaliza contactos corporales
      // consecutivos del mismo jugador en el primer golpe del equipo.
      if (wrongTeam || (action.kind !== 'block' && players.size !== 1)) {
        issues.push(issue(action, 'unsupported-consecutive-group', 'Los contactos consecutivos deben pertenecer al equipo actuante; fuera de una acción de bloqueo deben ser del mismo jugador.', groupIndex));
      }
    }
  });

  if (action.kind === 'block' && blockTeams.size > 1) {
    issues.push(issue(action, 'multiple-block-teams', 'Una acción de bloqueo no puede mezclar equipos.'));
  }
  if (action.kind === 'block' && [...blockTeams].some(team => team !== action.actingTeam)) {
    issues.push(issue(action, 'block-team-mismatch', 'Los contactos del bloqueo deben pertenecer al equipo actuante.'));
  }
  if (action.isFirstTeamHit && action.kind === 'block') {
    issues.push(issue(action, 'invalid-first-hit-context', 'Una acción de bloqueo no puede ser un golpe del equipo.'));
  }
  if (action.isFirstHitAfterOwnBlock && action.kind === 'block') {
    issues.push(issue(action, 'invalid-first-hit-context', 'El primer golpe posterior al bloqueo no puede ser la propia acción de bloqueo.'));
  }
  if (action.opponentSimultaneousOverNet && action.receivingTeam !== 0 && action.receivingTeam !== 1) {
    issues.push(issue(action, 'invalid-opponent-simultaneous-context', 'Debe indicarse explícitamente qué equipo recibe el balón.'));
  }
  if (!action.opponentSimultaneousOverNet && action.receivingTeam !== undefined) {
    issues.push(issue(action, 'unexpected-receiving-team', 'El equipo receptor solo se especifica para el contacto simultáneo adversario sobre la red.'));
  }
  if (action.opponentSimultaneousOverNet && !hasOpponent) {
    issues.push(issue(action, 'invalid-opponent-simultaneous-context', 'El contexto adversario requiere contactos de ambos equipos.'));
  }
  if (action.opponentSimultaneousOverNet &&
      !action.groups.some(group => group.relation === 'simultaneous' &&
        new Set(group.contacts.map(contact => contact.team)).size > 1)) {
    issues.push(issue(action, 'invalid-opponent-simultaneous-context', 'Debe existir un grupo simultáneo con contactos de ambos equipos.'));
  }

  return issues;
}

/**
 * Deriva el número de golpes de una única acción ya validada.
 * No calcula posesión, continuidad ni el total acumulado del rally.
 * En contextos ambiguos devuelve issues y no aplica una regla por defecto.
 */
export function deriveTeamHits(action: CompoundRallyAction): TeamHitDerivation {
  const issues = validateCompoundAction(action);
  if (issues.length > 0) {
    return { teamHits: 0, isBlock: action.kind === 'block', allowanceResetFor: null, issues };
  }

  if (action.kind === 'block') {
    return { teamHits: 0, isBlock: true, allowanceResetFor: action.actingTeam, issues: [] };
  }

  if (action.opponentSimultaneousOverNet) {
    return { teamHits: 0, isBlock: false, allowanceResetFor: action.receivingTeam!, issues: [] };
  }

  let hits = 0;
  for (const group of action.groups) {
    if (group.relation === 'consecutive-within-action') {
      if (!action.isFirstTeamHit) {
        issues.push(issue(action, 'invalid-first-hit-context', 'Los contactos corporales consecutivos agrupados solo se admiten aquí para el primer golpe del equipo.'));
        continue;
      }
      hits += 1;
    } else if (group.relation === 'simultaneous') {
      const teamContacts = group.contacts.filter(contact => contact.team === action.actingTeam);
      hits += teamContacts.length;
    } else {
      hits += group.contacts.filter(contact => contact.team === action.actingTeam).length;
    }
  }

  if (issues.length > 0) {
    return { teamHits: 0, isBlock: false, allowanceResetFor: null, issues };
  }
  return { teamHits: hits, isBlock: false, allowanceResetFor: null, issues: [] };
}

/** Regla local de doble golpe consecutivo; no sustituye al árbitro ni a la secuencia completa. */
export function canPlayerMakeNextHit(input: {
  previousPlayerId: string | null;
  nextPlayerId: string;
  isFirstHitAfterOwnBlock: boolean;
}): boolean {
  if (!input.nextPlayerId.trim()) return false;
  return input.previousPlayerId === null ||
    input.previousPlayerId !== input.nextPlayerId ||
    input.isFirstHitAfterOwnBlock;
}
