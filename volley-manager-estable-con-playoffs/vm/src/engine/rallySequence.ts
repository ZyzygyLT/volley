/** Lado de un equipo dentro de un rally. */
export type RallySide = 0 | 1;

/** Acciones que pueden aparecer en un registro explícito de contactos. */
export type ContactAction =
  | 'serve'
  | 'reception'
  | 'set'
  | 'attack'
  | 'defense'
  | 'cover'
  | 'free-ball'
  | 'block';

/**
 * Hecho de contacto ya resuelto por la simulación.
 * possessionId debe ser asignado explícitamente por quien resuelve la continuidad
 * del balón; este módulo no intenta inferir posesión a partir del orden.
 */
export interface RallyContact {
  sequence: number;
  possessionId: string;
  team: RallySide;
  playerId: string;
  action: ContactAction;
}

export interface ContactSequenceIssue {
  code:
    | 'invalid-sequence'
    | 'empty-possession'
    | 'invalid-player'
    | 'invalid-team'
    | 'non-contiguous-possession'
    | 'mixed-team-possession'
    | 'multiple-or-late-serve'
    | 'serve-shares-possession'
    | 'block-not-first'
    | 'too-many-team-hits';
  contactSequence: number;
  message: string;
}

const TEAM_HIT_ACTIONS = new Set<ContactAction>([
  'reception', 'set', 'attack', 'defense', 'cover', 'free-ball'
]);

/**
 * Valida únicamente invariantes estructurales y el máximo de tres golpes
 * reglamentarios por posesión explícita. No decide si la posesión asignada
 * es correcta ni valida todas las excepciones FIVB.
 *
 * El bloqueo no consume uno de los tres golpes. El contacto de saque tampoco
 * se cuenta entre los golpes de la posesión receptora.
 */
export function validateContactSequence(
  contacts: readonly RallyContact[]
): ContactSequenceIssue[] {
  const issues: ContactSequenceIssue[] = [];
  const seenPossessions = new Set<string>();
  const possessionTeam = new Map<string, RallySide>();
  const possessionHits = new Map<string, number>();
  const possessionActions = new Map<string, ContactAction[]>();
  let previousPossession: string | undefined;
  let serveCount = 0;

  const add = (
    code: ContactSequenceIssue['code'],
    contact: RallyContact,
    message: string
  ) => issues.push({ code, contactSequence: contact.sequence, message });

  contacts.forEach((contact, index) => {
    if (!Number.isInteger(contact.sequence) || contact.sequence !== index + 1) {
      add('invalid-sequence', contact, 'La secuencia debe ser consecutiva y comenzar en 1.');
    }
    if (!contact.possessionId.trim()) {
      add('empty-possession', contact, 'Cada contacto necesita un identificador de posesión explícito.');
    }
    if (!contact.playerId.trim()) {
      add('invalid-player', contact, 'Cada contacto necesita un identificador de jugador.');
    }
    if (contact.team !== 0 && contact.team !== 1) {
      add('invalid-team', contact, 'El equipo debe ser 0 o 1.');
    }

    if (contact.possessionId !== previousPossession) {
      if (seenPossessions.has(contact.possessionId)) {
        add('non-contiguous-possession', contact, 'Una posesión no puede reaparecer después de otra posesión.');
      }
      seenPossessions.add(contact.possessionId);
      previousPossession = contact.possessionId;
    }

    const assignedTeam = possessionTeam.get(contact.possessionId);
    if (assignedTeam !== undefined && assignedTeam !== contact.team) {
      add('mixed-team-possession', contact, 'Una posesión solo puede pertenecer a un equipo.');
    } else {
      possessionTeam.set(contact.possessionId, contact.team);
    }

    const actions = possessionActions.get(contact.possessionId) ?? [];
    actions.push(contact.action);
    possessionActions.set(contact.possessionId, actions);

    if (contact.action === 'serve') {
      serveCount++;
      if (index !== 0 || serveCount > 1) {
        add('multiple-or-late-serve', contact, 'El saque debe ser el primer y único contacto de saque del rally.');
      }
    } else if (TEAM_HIT_ACTIONS.has(contact.action)) {
      const hits = (possessionHits.get(contact.possessionId) ?? 0) + 1;
      possessionHits.set(contact.possessionId, hits);
      if (hits > 3) {
        add('too-many-team-hits', contact, 'La posesión supera el máximo de tres golpes del equipo.');
      }
    } else if (contact.action === 'block' && actions.length > 1) {
      add('block-not-first', contact, 'El bloqueo debe iniciar la posesión del equipo bloqueador.');
    }
  });

  for (const [possessionId, actions] of possessionActions) {
    if (actions.includes('serve') && actions.length > 1) {
      const contact = contacts.find(item => item.possessionId === possessionId)!;
      add('serve-shares-possession', contact, 'El saque no comparte posesión con los contactos posteriores.');
    }
  }

  return issues;
}
