import type { AttackContext, SetterPosition } from './attackContext';
import { buildSetTargets, type SetTarget } from './setTargets';

/**
 * Acción ofensiva candidata del colocador.
 *
 * 'setter-second-touch-candidate' solo hace explícita la posibilidad de
 * evaluar un segundo toque. No afirma que sea legal o tácticamente oportuno
 * en cualquier situación, ni decide que deba ejecutarse.
 */
export type SetterActionOption =
  | {
      kind: 'distribution';
      setter: SetterPosition;
      target: SetTarget;
    }
  | {
      kind: 'setter-second-touch-candidate';
      setter: SetterPosition;
    };

/**
 * Expone por separado las dos familias de acción sin elegir entre ellas.
 *
 * La distribución requiere un colocador identificado y objetivos compañeros.
 * El segundo toque se devuelve como candidato cuando conocemos al colocador;
 * su legalidad situacional, oportunidad, ejecución y probabilidad quedan fuera
 * de este contrato y deberán modelarse antes de integrarlo en el rally.
 */
export function buildSetterActionOptions(context: AttackContext): SetterActionOption[] {
  if (!context.setter) return [];

  const distributions: SetterActionOption[] = buildSetTargets(context).map(target => ({
    kind: 'distribution',
    setter: context.setter!,
    target,
  }));

  return [
    ...distributions,
    {
      kind: 'setter-second-touch-candidate',
      setter: context.setter,
    },
  ];
}
