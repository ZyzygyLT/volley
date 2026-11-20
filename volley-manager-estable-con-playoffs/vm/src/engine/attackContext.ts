import type { Params } from './params';
import type { Player } from './types';
import { buildAttackOptions, type AttackOption, type AttackZone } from './attackOptions';
import { classifyReception, type ReceptionQuality } from './reception';

/** Ubicación rotacional del colocador en el momento de construir el contexto. */
export interface SetterPosition {
  player: Player;
  slot: number;
  zone: AttackZone;
}

/** Entrada consolidada para la futura decisión de distribución del colocador. */
export interface AttackContext {
  /** Valor continuo original; se conserva para no perder información. */
  receptionValue: number;
  /** Categoría calculada con los umbrales compartidos por las estadísticas. */
  receptionQuality: ReceptionQuality;
  /** Atacantes elegibles según la lógica de rotación actualmente caracterizada. */
  options: AttackOption[];
  /** Colocador y zona rotacional actual; null si la alineación está incompleta. */
  setter: SetterPosition | null;
}

/**
 * Construye el contexto ofensivo sin elegir un atacante ni modificar el rally.
 * Expone la ubicación real del colocador, pero todavía no decide una distribución
 * ni modela el segundo toque, el tempo o la trayectoria de la colocación.
 */
export function buildAttackContext(lineup: Player[], receptionValue: number, params: Params): AttackContext {
  const setterSlot = lineup.findIndex(player => player.role === 'S');
  const setter = setterSlot < 0 ? null : {
    player: lineup[setterSlot],
    slot: setterSlot,
    zone: setterSlot >= 3 ? 'front' as const : 'backrow' as const,
  };

  return {
    receptionValue,
    receptionQuality: classifyReception(receptionValue, params),
    options: buildAttackOptions(lineup, receptionValue, params),
    setter,
  };
}
