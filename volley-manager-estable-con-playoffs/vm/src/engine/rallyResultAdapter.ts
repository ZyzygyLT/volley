import type { RallyActionResult } from './rallyRuleState';
import type { RallyResult } from './types';

/**
 * Adapta únicamente el desenlace explícito de playRally al contrato de la
 * máquina reglamentaria. No fabrica CompoundRallyAction ni contactos.
 *
 * Devuelve null cuando el resultado no contiene evidencia explícita de una acción terminal.
 */
export function adaptRallyTermination(
  result: RallyResult
): RallyActionResult | null {
  const termination = result.termination;
  if (!termination) return null;

  const winnerMatches =
    termination.kind === 'fault'
      ? result.winner !== termination.responsibleTeam
      : result.winner === termination.responsibleTeam;

  if (!winnerMatches) return null;

  return {
    continues: false,
    pointWinner: result.winner,
    termination
  };
}
