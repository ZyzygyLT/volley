import type { Params } from './params';
import type { Player } from './types';
import { buildAttackOptions, type AttackOption } from './attackOptions';
import { classifyReception, type ReceptionQuality } from './reception';

/** Entrada consolidada para la futura decisión de distribución del colocador. */
export interface AttackContext {
  /** Valor continuo original; se conserva para no perder información. */
  receptionValue: number;
  /** Categoría calculada con los umbrales oficiales ya usados por las estadísticas. */
  receptionQuality: ReceptionQuality;
  /** Atacantes elegibles según la lógica de rotación actualmente caracterizada. */
  options: AttackOption[];
}

/**
 * Construye el contexto ofensivo sin elegir un atacante ni modificar pesos.
 * Esta función integra estado de recepción y elegibilidad; no simula todavía
 * tempos, combinaciones ni una decisión táctica del colocador.
 */
export function buildAttackContext(lineup: Player[], receptionValue: number, params: Params): AttackContext {
  return {
    receptionValue,
    receptionQuality: classifyReception(receptionValue, params),
    options: buildAttackOptions(lineup, receptionValue, params),
  };
}
