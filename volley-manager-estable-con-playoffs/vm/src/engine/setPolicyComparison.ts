import type { AttackContext } from './attackContext';
import { buildSetCandidateProfiles } from './setCandidateProfile';
import { decideSetTarget } from './setDecision';
import { selectAttackTarget } from './distribution';

export interface SetPolicyComparisonRow {
  receptionQuality: AttackContext['receptionQuality'];
  setterSlot: number | null;
  samples: number;
  baselineTargetId: string;
  baselineAttackSkill: number;
  legacySelections: Record<string, number>;
  legacyTopAttackShare: number;
}

/**
 * Compara políticas solo en la capa de elección del objetivo.
 * No simula la ejecución del ataque ni modifica/invoca el motor de rally.
 * Cada contexto recibe su propio flujo RNG mediante rndForContext(index).
 */
export function compareSetPolicies(
  contexts: readonly AttackContext[],
  samplesPerContext: number,
  rndForContext: (contextIndex: number) => () => number,
): SetPolicyComparisonRow[] {
  if (!Number.isInteger(samplesPerContext) || samplesPerContext < 1) {
    throw new RangeError('samplesPerContext debe ser un entero positivo');
  }

  return contexts.map((context, contextIndex) => {
    const candidates = buildSetCandidateProfiles(context);
    const baseline = decideSetTarget(candidates);
    const candidateIds = new Set(candidates.map(candidate => candidate.player.id));
    const topSkill = Math.max(...candidates.map(candidate => candidate.attackSkill));
    const topSkillIds = new Set(
      candidates.filter(candidate => candidate.attackSkill === topSkill).map(candidate => candidate.player.id),
    );
    const legacySelections: Record<string, number> = Object.fromEntries(
      candidates.map(candidate => [candidate.player.id, 0]),
    );
    const rnd = rndForContext(contextIndex);
    let legacyTopAttackCount = 0;

    for (let sample = 0; sample < samplesPerContext; sample += 1) {
      const selectedId = selectAttackTarget(context, rnd).attacker.id;
      if (!candidateIds.has(selectedId)) {
        throw new Error('El selector histórico devolvió un jugador ajeno a los candidatos de colocación');
      }
      legacySelections[selectedId] += 1;
      if (topSkillIds.has(selectedId)) legacyTopAttackCount += 1;
    }

    return {
      receptionQuality: context.receptionQuality,
      setterSlot: context.setter?.slot ?? null,
      samples: samplesPerContext,
      baselineTargetId: baseline.target.player.id,
      baselineAttackSkill: baseline.target.attackSkill,
      legacySelections,
      legacyTopAttackShare: legacyTopAttackCount / samplesPerContext,
    };
  });
}
