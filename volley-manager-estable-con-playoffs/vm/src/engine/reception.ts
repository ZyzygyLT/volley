import type { Params } from './params';

/** Estado discreto de recepción, derivado de los mismos umbrales usados por las estadísticas. */
export type ReceptionQuality = 'perfect' | 'positive' | 'negative';

/**
 * Clasifica la calidad continua de recepción sin perder ni modificar el valor original.
 * Los umbrales proceden de params.perfQ y params.posQ, ya usados para las estadísticas.
 */
export function classifyReception(quality: number, params: Params): ReceptionQuality {
  if (quality >= params.perfQ) return 'perfect';
  if (quality >= params.posQ) return 'positive';
  return 'negative';
}
