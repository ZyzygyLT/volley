import type { Role } from '../src/engine/types';
import { buildAttackContext } from '../src/engine/attackContext';
import { evaluateAttackOptions, selectBestExpectedAttack } from '../src/engine/attackDecision';
import { makeSquads } from '../src/engine/match';
import { P } from '../src/engine/params';

const ROSTERS = 20;
const FIRST_SEED = 20261120;
const RECEPTIONS = [
  { value: 0.8, label: 'perfect' },
  { value: 0.62, label: 'positive' },
  { value: 0.3, label: 'negative' },
] as const;
const PHASES = ['k1', 'k2'] as const;
const roleCounts = (): Record<Role, number> => ({ S: 0, OH: 0, MB: 0, OP: 0, L: 0 });
const legacyRoles = roleCounts();
const expectedPolicyRoles = roleCounts();
const neutralRoleKillPolicyRoles = roleCounts();
const neutralRoleKillParams = {
  ...P,
  roleKill: { S: 0, OH: 0, MB: 0, OP: 0, L: 0 },
};
const candidateOutcomeByRole = Object.fromEntries(
  (['OH', 'MB', 'OP'] as const).map(role => [role, {
    evaluations: 0, expectedPointValue: 0, kill: 0, error: 0, blocked: 0, front: 0, backrow: 0,
  }]),
) as Record<'OH' | 'MB' | 'OP', {
  evaluations: number; expectedPointValue: number; kill: number; error: number; blocked: number; front: number; backrow: number;
}>;
const byReception = Object.fromEntries(RECEPTIONS.map(({ label }) => [label, {
  contexts: 0,
  legacyExpectedPointValue: 0,
  bestExpectedPointValue: 0,
  improvement: 0,
}])) as Record<string, {
  contexts: number;
  legacyExpectedPointValue: number;
  bestExpectedPointValue: number;
  improvement: number;
}>;

let contextsCount = 0;
let legacyTotal = 0;
let bestTotal = 0;
let neutralRoleKillBestTotal = 0;
let totalCandidates = 0;

for (let rosterIndex = 0; rosterIndex < ROSTERS; rosterIndex += 1) {
  const [squad, opponent] = makeSquads(FIRST_SEED + rosterIndex);
  for (let rotation = 0; rotation < 6; rotation += 1) {
    const lineup = [...squad.slice(0, 6)];
    const defense = [...opponent.slice(0, 6)];
    for (let turn = 0; turn < rotation; turn += 1) {
      lineup.unshift(lineup.pop()!);
      defense.unshift(defense.pop()!);
    }

    for (const reception of RECEPTIONS) {
      const attackContext = buildAttackContext(lineup, reception.value, P);
      const setter = attackContext.setter?.player;
      const frontBlockers = defense.slice(3);
      const effectiveDefense = defense.map((player, slot) =>
        player.role === 'MB' && slot <= 2 ? opponent[6] : player,
      );
      const backDefenders = effectiveDefense.slice(0, 3);
      const evaluationContext = {
        phase: 'k1' as const,
        receptionValue: reception.value,
        setterSkill: setter?.set ?? 70,
        averageOpponentDefense: backDefenders.reduce((sum, player) => sum + player.def, 0) / backDefenders.length,
        averageOpponentBlock: frontBlockers.reduce((sum, player) => sum + player.blk, 0) / frontBlockers.length,
        params: P,
      };
      const candidates = attackContext.options.filter(option => option.kind === 'hitter-attack');
      if (candidates.length === 0) continue;

      for (const phase of PHASES) {
        const context = { ...evaluationContext, phase };
        const evaluated = evaluateAttackOptions(candidates, context);
        const totalWeight = candidates.reduce((sum, option) => sum + option.weight, 0);
        const legacyExpected = evaluated.reduce((sum, item) =>
          sum + item.outcome.expectedPointValue * item.candidate.weight / totalWeight, 0,
        );
        const best = selectBestExpectedAttack(candidates, context);
        const neutralRoleKillContext = { ...context, params: neutralRoleKillParams };
        const neutralRoleKillBest = selectBestExpectedAttack(candidates, neutralRoleKillContext);
        const receptionRow = byReception[reception.label];

        legacyTotal += legacyExpected;
        bestTotal += best.outcome.expectedPointValue;
        neutralRoleKillBestTotal += neutralRoleKillBest.outcome.expectedPointValue;
        receptionRow.legacyExpectedPointValue += legacyExpected;
        receptionRow.bestExpectedPointValue += best.outcome.expectedPointValue;
        receptionRow.contexts += 1;
        for (const item of evaluated) {
          totalCandidates += 1;
          legacyRoles[item.candidate.attacker.role] += item.candidate.weight / totalWeight;
          const diagnostic = candidateOutcomeByRole[item.candidate.attacker.role as 'OH' | 'MB' | 'OP'];
          diagnostic.evaluations += 1;
          diagnostic.expectedPointValue += item.outcome.expectedPointValue;
          diagnostic.kill += item.outcome.kill;
          diagnostic.error += item.outcome.error;
          diagnostic.blocked += item.outcome.blocked;
          diagnostic[item.candidate.zone === 'front' ? 'front' : 'backrow'] += 1;
        }
        expectedPolicyRoles[best.candidate.attacker.role] += 1;
        neutralRoleKillPolicyRoles[neutralRoleKillBest.candidate.attacker.role] += 1;
        contextsCount += 1;
      }
    }
  }
}

const rounded = (value: number) => Number(value.toFixed(6));
for (const row of Object.values(byReception)) {
  row.legacyExpectedPointValue = rounded(row.legacyExpectedPointValue / row.contexts);
  row.bestExpectedPointValue = rounded(row.bestExpectedPointValue / row.contexts);
  row.improvement = rounded(row.bestExpectedPointValue - row.legacyExpectedPointValue);
}

const candidateOutcomeSummary = Object.fromEntries(Object.entries(candidateOutcomeByRole).map(([role, row]) => [role, {
  evaluations: row.evaluations,
  meanExpectedPointValue: rounded(row.expectedPointValue / row.evaluations),
  meanKillProbability: rounded(row.kill / row.evaluations),
  meanErrorProbability: rounded(row.error / row.evaluations),
  meanBlockProbability: rounded(row.blocked / row.evaluations),
  frontRowEvaluations: row.front,
  backRowEvaluations: row.backrow,
}]));

const roleShare = (counts: Record<Role, number>, denominator: number) =>
  Object.fromEntries(Object.entries(counts).filter(([, value]) => value > 0)
    .map(([role, value]) => [role, rounded(value / denominator)]));

console.log(JSON.stringify({
  experiment: 'expected-attack-value-v1',
  rosters: ROSTERS,
  contexts: contextsCount,
  dimensions: '6 rotations x 3 reception qualities x 2 phases per roster',
  selectionScope: 'teammate targets only; setter second-touch candidates excluded',
  legacyPolicy: 'expected value averaged by existing attackOption.weight among teammate targets',
  experimentalPolicy: 'highest expected immediate point value using the current attack outcome equations',
  meanLegacyExpectedPointValue: rounded(legacyTotal / contextsCount),
  meanBestExpectedPointValue: rounded(bestTotal / contextsCount),
  meanDifference: rounded((bestTotal - legacyTotal) / contextsCount),
  legacyWeightedRoleShare: roleShare(legacyRoles, contextsCount),
  bestExpectedRoleShare: roleShare(expectedPolicyRoles, contextsCount),
  counterfactualWithoutRoleKill: {
    description: 'Same candidates and equations, but roleKill is set to zero for every role; diagnostic only, not a proposed calibration.',
    meanBestExpectedPointValue: rounded(neutralRoleKillBestTotal / contextsCount),
    bestExpectedRoleShare: roleShare(neutralRoleKillPolicyRoles, contextsCount),
  },
  candidateOutcomeByRole: candidateOutcomeSummary,
  byReception,
  candidatesEvaluated: totalCandidates,
  limitations: [
    'The result is an analytical comparison inside the current game model, not real-world volleyball validation.',
    'The current blocker penalty is team-average and does not vary by attacker, lane, or block matchup.',
    'Set quality, tempo, approach availability, combinations, and setter execution are not modeled.',
    'The report does not modify rally selection or consume RNG.',
  ],
}, null, 2));
