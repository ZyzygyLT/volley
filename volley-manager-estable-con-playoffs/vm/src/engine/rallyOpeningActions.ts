import type { CompoundRallyAction } from './compoundContacts';
import type { RallyResult, Side } from './types';

/**
 * Proyecta solo los contactos iniciales que playRally ya identifica:
 * el saque ejecutado y, si el saque entra, la recepción seleccionada.
 *
 * No inventa colocación, ataque ni continuidad. Un ace no se transforma
 * en contacto físico del receptor: el evento rec.err solo identifica al
 * jugador al que se atribuyó la recepción fallida.
 */
export function buildOpeningRallyActions(
  rallyId: string,
  result: RallyResult,
  serving: Side
): CompoundRallyAction[] {
  if (!rallyId.trim()) return [];

  const serve = result.trace.ev.find(event => event.k === 'serve');
  if (!serve || serve.k !== 'serve') return [];

  const actions: CompoundRallyAction[] = [{
    actionId: `${rallyId}:serve`,
    rallyOrder: 1,
    kind: 'serve',
    actingTeam: serving,
    groups: [{
      relation: 'single',
      contacts: [{ playerId: serve.p, team: serving }]
    }]
  }];

  if (serve.o !== 'in') return actions;

  const reception = result.trace.ev.find(event => event.k === 'rec');
  if (!reception || reception.k !== 'rec' || reception.err) return actions;

  const receiving = (1 - serving) as Side;
  actions.push({
    actionId: `${rallyId}:reception`,
    rallyOrder: 2,
    kind: 'reception',
    actingTeam: receiving,
    groups: [{
      relation: 'single',
      contacts: [{ playerId: reception.p, team: receiving }]
    }]
  });

  return actions;
}
