import type { ContactGroup } from './compoundContacts';
import type { RallySide } from './rallySequence';
import { getEligibleBlockers } from './blockEligibility';
import type { Team } from './types';

/**
 * Observación defensiva vinculada a un ataque concreto.
 *
 * Este contrato registra datos suministrados por una política táctica o una
 * fuente externa. No selecciona bloqueadores, no infiere emparejamientos y no
 * convierte un resultado del ataque en una observación retrospectiva.
 */
interface BlockObservationBase {
  attackId: string;
  attackerId: string;
  attackingTeam: RallySide;
  defendingTeam: RallySide;
  source: 'tactical-model' | 'external-observation';
}

/** No se dispone de observación: no equivale a cero intentos ni a cero contactos. */
export interface UnavailableBlockObservation extends BlockObservationBase {
  status: 'unavailable';
}

/**
 * Observación disponible. Las listas vacías son hechos explícitos:
 * ningún intento observado y/o ningún contacto observado.
 */
export interface ObservedBlockAttempt extends BlockObservationBase {
  status: 'observed';
  eligibleBlockerIds: readonly string[];
  attemptingBlockerIds: readonly string[];
  contactGroups: readonly ContactGroup[];
}

export type BlockObservation = UnavailableBlockObservation | ObservedBlockAttempt;

export type BlockObservationIssueCode =
  | 'invalid-attack-id'
  | 'invalid-attacker-id'
  | 'invalid-teams'
  | 'same-attacking-and-defending-team'
  | 'invalid-source'
  | 'invalid-eligible-blocker-id'
  | 'duplicate-eligible-blocker'
  | 'invalid-attempting-blocker-id'
  | 'duplicate-attempting-blocker'
  | 'attempting-player-not-eligible'
  | 'attacker-listed-as-blocker'
  | 'empty-contact-group'
  | 'invalid-contact-group-relation'
  | 'invalid-contact-group-size'
  | 'contact-team-mismatch'
  | 'contact-without-attempt'
  | 'attacker-not-in-attacking-team'
  | 'invalid-attacking-lineup'
  | 'invalid-defending-lineup'
  | 'eligible-blockers-do-not-match-lineup'
  | 'invalid-observation'
  | 'invalid-observation-status'
  | 'invalid-eligible-blocker-list'
  | 'invalid-attempting-blocker-list'
  | 'invalid-contact-groups'
  | 'invalid-contact-group'
  | 'invalid-contact';

export interface BlockObservationIssue {
  code: BlockObservationIssueCode;
  message: string;
  groupIndex?: number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonBlank = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const hasBlank = (values: readonly unknown[]) => values.some(value => !isNonBlank(value));
const hasDuplicates = (values: readonly unknown[]) => new Set(values).size !== values.length;

/**
 * Valida coherencia local de una observación. No determina si la táctica
 * elegida es buena, legal en una situación concreta o estadísticamente probable.
 */
export function validateBlockObservation(
  observation: BlockObservation
): BlockObservationIssue[] {
  const issues: BlockObservationIssue[] = [];

  if (!isRecord(observation)) {
    return [{ code: 'invalid-observation', message: 'La observación debe ser un objeto válido.' }];
  }

  if (!isNonBlank(observation.attackId)) {
    issues.push({ code: 'invalid-attack-id', message: 'La observación debe identificar el ataque.' });
  }
  if (!isNonBlank(observation.attackerId)) {
    issues.push({ code: 'invalid-attacker-id', message: 'La observación debe identificar al atacante.' });
  }
  if ((observation.attackingTeam !== 0 && observation.attackingTeam !== 1) ||
      (observation.defendingTeam !== 0 && observation.defendingTeam !== 1)) {
    issues.push({ code: 'invalid-teams', message: 'Los equipos deben ser 0 o 1.' });
  }
  if (observation.attackingTeam === observation.defendingTeam) {
    issues.push({ code: 'same-attacking-and-defending-team', message: 'El equipo defensor debe ser distinto del atacante.' });
  }
  if (observation.source !== 'tactical-model' && observation.source !== 'external-observation') {
    issues.push({ code: 'invalid-source', message: 'La procedencia debe estar identificada.' });
  }

  if (observation.status === 'unavailable') return issues;
  if (observation.status !== 'observed') {
    issues.push({ code: 'invalid-observation-status', message: 'El estado de la observación no está reconocido.' });
    return issues;
  }

  if (!Array.isArray(observation.eligibleBlockerIds)) {
    issues.push({ code: 'invalid-eligible-blocker-list', message: 'La lista de elegibles debe ser un arreglo.' });
  }
  if (!Array.isArray(observation.attemptingBlockerIds)) {
    issues.push({ code: 'invalid-attempting-blocker-list', message: 'La lista de participantes debe ser un arreglo.' });
  }
  if (!Array.isArray(observation.contactGroups)) {
    issues.push({ code: 'invalid-contact-groups', message: 'Los grupos de contacto deben ser un arreglo.' });
  }
  if (!Array.isArray(observation.eligibleBlockerIds) ||
      !Array.isArray(observation.attemptingBlockerIds) ||
      !Array.isArray(observation.contactGroups)) return issues;

  const eligible = observation.eligibleBlockerIds;
  const attempting = observation.attemptingBlockerIds;

  if (hasBlank(eligible)) {
    issues.push({ code: 'invalid-eligible-blocker-id', message: 'La lista de elegibles contiene IDs vacíos.' });
  }
  if (hasDuplicates(eligible)) {
    issues.push({ code: 'duplicate-eligible-blocker', message: 'La lista de elegibles contiene IDs duplicados.' });
  }
  if (hasBlank(attempting)) {
    issues.push({ code: 'invalid-attempting-blocker-id', message: 'La lista de participantes contiene IDs vacíos.' });
  }
  if (hasDuplicates(attempting)) {
    issues.push({ code: 'duplicate-attempting-blocker', message: 'La lista de participantes contiene IDs duplicados.' });
  }
  if (attempting.some(id => !eligible.includes(id))) {
    issues.push({ code: 'attempting-player-not-eligible', message: 'Todo participante del intento debe pertenecer al conjunto elegible declarado.' });
  }
  if (eligible.includes(observation.attackerId) || attempting.includes(observation.attackerId)) {
    issues.push({ code: 'attacker-listed-as-blocker', message: 'El atacante no puede figurar como bloqueador de su propio ataque.' });
  }

  observation.contactGroups.forEach((group, groupIndex) => {
    if (!isRecord(group) || !Array.isArray(group.contacts)) {
      issues.push({ code: 'invalid-contact-group', message: 'Cada grupo debe contener un arreglo de contactos.', groupIndex });
      return;
    }
    if (group.contacts.length === 0) {
      issues.push({ code: 'empty-contact-group', message: 'Un grupo de contactos no puede estar vacío.', groupIndex });
      return;
    }
    const validRelation = group.relation === 'single' ||
      group.relation === 'simultaneous' ||
      group.relation === 'consecutive-within-action';
    if (!validRelation) {
      issues.push({ code: 'invalid-contact-group-relation', message: 'La relación del grupo de contactos no está reconocida.', groupIndex });
    } else if ((group.relation === 'single' && group.contacts.length !== 1) ||
        (group.relation !== 'single' && group.contacts.length < 2)) {
      issues.push({ code: 'invalid-contact-group-size', message: 'La cantidad de contactos no coincide con la relación declarada.', groupIndex });
    }
    for (const contact of group.contacts) {
      if (!isRecord(contact) || !isNonBlank(contact.playerId)) {
        issues.push({ code: 'invalid-contact', message: 'Cada contacto debe identificar a un jugador.', groupIndex });
        continue;
      }
      if (contact.team !== observation.defendingTeam) {
        issues.push({ code: 'contact-team-mismatch', message: 'Los contactos deben pertenecer al equipo defensor.', groupIndex });
      }
      if (!attempting.includes(contact.playerId)) {
        issues.push({ code: 'contact-without-attempt', message: 'Todo jugador que toca el balón debe figurar entre quienes intentaron bloquear.', groupIndex });
      }
    }
  });

  return issues;
}


/**
 * Valida referencias contra las alineaciones actuales del partido.
 *
 * A diferencia de validateBlockObservation, esta comprobación necesita el
 * contexto de ambos equipos. La elegibilidad declarada debe coincidir con
 * los tres ocupantes actuales de primera línea del equipo defensor.
 */
export function validateBlockObservationContext(
  observation: BlockObservation,
  teams: [Team, Team]
): BlockObservationIssue[] {
  const issues: BlockObservationIssue[] = [];

  if ((observation.attackingTeam !== 0 && observation.attackingTeam !== 1) ||
      (observation.defendingTeam !== 0 && observation.defendingTeam !== 1) ||
      observation.attackingTeam === observation.defendingTeam) {
    return issues;
  }

  const attackingTeam = teams[observation.attackingTeam];
  const defendingTeam = teams[observation.defendingTeam];

  try {
    getEligibleBlockers(attackingTeam);
  } catch {
    issues.push({
      code: 'invalid-attacking-lineup',
      message: 'No se puede validar la observación porque la alineación atacante no es válida.',
    });
    return issues;
  }

  if (!attackingTeam.lineup.some(player => player.id === observation.attackerId)) {
    issues.push({
      code: 'attacker-not-in-attacking-team',
      message: 'El atacante debe pertenecer a la alineación actual del equipo atacante.',
    });
  }

  if (observation.status === 'unavailable') return issues;

  let expectedEligibleIds: string[];
  try {
    expectedEligibleIds = getEligibleBlockers(defendingTeam).map(player => player.id);
  } catch {
    issues.push({
      code: 'invalid-defending-lineup',
      message: 'No se puede validar la observación porque la alineación defensora no es válida.',
    });
    return issues;
  }

  const declared = new Set(observation.eligibleBlockerIds);
  const expected = new Set(expectedEligibleIds);
  if (declared.size !== expected.size ||
      [...expected].some(id => !declared.has(id))) {
    issues.push({
      code: 'eligible-blockers-do-not-match-lineup',
      message: 'Los elegibles declarados deben coincidir con los tres jugadores actuales de primera línea.',
    });
  }

  return issues;
}

 
/**
 * Ejecuta ambas capas de validación para el contexto actual del partido:
 * coherencia interna de la observación y referencias contra las alineaciones.
 */
export function validateBlockObservationForMatch(
  observation: BlockObservation,
  teams: [Team, Team]
): BlockObservationIssue[] {
  return [
    ...validateBlockObservation(observation),
    ...validateBlockObservationContext(observation, teams),
  ];
}
