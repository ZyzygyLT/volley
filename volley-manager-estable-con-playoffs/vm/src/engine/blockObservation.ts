import type { ContactGroup } from './compoundContacts';
import type { RallySide } from './rallySequence';

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
  | 'duplicate-eligible-blocker'
  | 'duplicate-attempting-blocker'
  | 'attempting-player-not-eligible'
  | 'attacker-listed-as-blocker'
  | 'empty-contact-group'
  | 'invalid-contact-group-size'
  | 'contact-team-mismatch'
  | 'contact-without-attempt';

export interface BlockObservationIssue {
  code: BlockObservationIssueCode;
  message: string;
  groupIndex?: number;
}

const hasBlank = (values: readonly string[]) => values.some(value => !value.trim());
const hasDuplicates = (values: readonly string[]) => new Set(values).size !== values.length;

/**
 * Valida coherencia local de una observación. No determina si la táctica
 * elegida es buena, legal en una situación concreta o estadísticamente probable.
 */
export function validateBlockObservation(
  observation: BlockObservation
): BlockObservationIssue[] {
  const issues: BlockObservationIssue[] = [];

  if (!observation.attackId.trim()) {
    issues.push({ code: 'invalid-attack-id', message: 'La observación debe identificar el ataque.' });
  }
  if (!observation.attackerId.trim()) {
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

  const eligible = observation.eligibleBlockerIds;
  const attempting = observation.attemptingBlockerIds;

  if (hasBlank(eligible) || hasDuplicates(eligible)) {
    issues.push({ code: 'duplicate-eligible-blocker', message: 'La lista de elegibles contiene IDs vacíos o duplicados.' });
  }
  if (hasBlank(attempting) || hasDuplicates(attempting)) {
    issues.push({ code: 'duplicate-attempting-blocker', message: 'La lista de participantes contiene IDs vacíos o duplicados.' });
  }
  if (attempting.some(id => !eligible.includes(id))) {
    issues.push({ code: 'attempting-player-not-eligible', message: 'Todo participante del intento debe pertenecer al conjunto elegible declarado.' });
  }
  if (eligible.includes(observation.attackerId) || attempting.includes(observation.attackerId)) {
    issues.push({ code: 'attacker-listed-as-blocker', message: 'El atacante no puede figurar como bloqueador de su propio ataque.' });
  }

  observation.contactGroups.forEach((group, groupIndex) => {
    if (group.contacts.length === 0) {
      issues.push({ code: 'empty-contact-group', message: 'Un grupo de contactos no puede estar vacío.', groupIndex });
      return;
    }
    if ((group.relation === 'single' && group.contacts.length !== 1) ||
        (group.relation !== 'single' && group.contacts.length < 2)) {
      issues.push({ code: 'invalid-contact-group-size', message: 'La cantidad de contactos no coincide con la relación declarada.', groupIndex });
    }
    for (const contact of group.contacts) {
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
