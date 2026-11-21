import type { Role } from '../src/engine/types';
import { buildAttackContext } from '../src/engine/attackContext';
import { makeSquads } from '../src/engine/match';
import { P } from '../src/engine/params';
import { mulberry32 } from '../src/engine/rng';
import { compareSetPolicies } from '../src/engine/setPolicyComparison';

const ROSTER_COUNT = 20;
const SAMPLES_PER_CONTEXT = 1000;
const FIRST_ROSTER_SEED = 20261120;
const RECEPTIONS = [
  { value: 0.8, label: 'perfect' },
  { value: 0.62, label: 'positive' },
  { value: 0.3, label: 'negative' },
] as const;

const add = (counts: Record<string, number>, key: string, value: number) => {
  counts[key] = (counts[key] ?? 0) + value;
};

const roleCounts: Record<Role, number> = { S: 0, OH: 0, MB: 0, OP: 0, L: 0 };
const zoneCounts: Record<string, number> = { front: 0, backrow: 0 };
const baselineRoleCounts: Record<Role, number> = { S: 0, OH: 0, MB: 0, OP: 0, L: 0 };
const byReception = Object.fromEntries(
  RECEPTIONS.map(({ label }) => [label, {
    samples: 0,
    setterSecondTouchSelections: 0,
    setterFrontRowSamples: 0,
    topAttackSelections: 0,
  }]),
) as Record<string, {
  samples: number;
  setterSecondTouchSelections: number;
  setterFrontRowSamples: number;
  topAttackSelections: number;
}>;

const rosterTopAttackShares: number[] = [];
let contextIndex = 0;
let totalSelections = 0;
let setterSecondTouchSelections = 0;
let setterFrontRowSamples = 0;
let topAttackSelections = 0;

for (let rosterIndex = 0; rosterIndex < ROSTER_COUNT; rosterIndex += 1) {
  const rosterSeed = FIRST_ROSTER_SEED + rosterIndex;
  const [squad] = makeSquads(rosterSeed);
  const contexts = RECEPTIONS.flatMap(({ value }) =>
    Array.from({ length: 6 }, (_, rotation) => {
      const lineup = [...squad.slice(0, 6)];
      for (let turn = 0; turn < rotation; turn += 1) lineup.unshift(lineup.pop()!);
      return buildAttackContext(lineup, value, P);
    }),
  );

  const rows = compareSetPolicies(
    contexts,
    SAMPLES_PER_CONTEXT,
    index => mulberry32(900_000 + rosterIndex * 100 + index),
  );

  let rosterTopAttackCount = 0;
  let rosterSampleCount = 0;

  rows.forEach((row, index) => {
    const context = contexts[index];
    const receptionLabel = row.receptionQuality;
    const receptionSummary = byReception[receptionLabel];
    const optionsById = new Map(context.options.map(option => [option.attacker.id, option]));
    const setterIsFrontRow = context.setter !== null && context.setter.slot >= 3;

    receptionSummary.samples += row.samples;
    if (setterIsFrontRow) {
      receptionSummary.setterFrontRowSamples += row.samples;
      setterFrontRowSamples += row.samples;
    }

    for (const [playerId, count] of Object.entries(row.legacySelections)) {
      const option = optionsById.get(playerId);
      if (!option) throw new Error(`Selección histórica sin opción: ${playerId}`);
      add(roleCounts, option.attacker.role, count);
      add(zoneCounts, option.zone, count);
      totalSelections += count;
      if (playerId === context.setter?.player.id) {
        setterSecondTouchSelections += count;
        receptionSummary.setterSecondTouchSelections += count;
      }
    }

    const topCount = Math.round(row.legacyTopAttackShare * row.samples);
    topAttackSelections += topCount;
    rosterTopAttackCount += topCount;
    rosterSampleCount += row.samples;
    receptionSummary.topAttackSelections += topCount;

    const baselineOption = optionsById.get(row.baselineTargetId);
    if (!baselineOption) throw new Error(`Baseline sin candidato: ${row.baselineTargetId}`);
    add(baselineRoleCounts, baselineOption.attacker.role, 1);

    contextIndex += 1;
  });

  rosterTopAttackShares.push(rosterTopAttackCount / rosterSampleCount);
}

const share = (count: number, total: number) => Number((total > 0 ? count / total : 0).toFixed(5));

console.log(JSON.stringify({
  experiment: 'setter-policy-robustness-v2',
  rosterGenerator: 'makeSquads',
  firstRosterSeed: FIRST_ROSTER_SEED,
  rosterCount: ROSTER_COUNT,
  contextsPerRoster: 18,
  totalContexts: contextIndex,
  samplesPerContext: SAMPLES_PER_CONTEXT,
  totalLegacySelections: totalSelections,
  legacyRoleShare: Object.fromEntries(
    Object.entries(roleCounts).filter(([, count]) => count > 0).map(([role, count]) => [role, share(count, totalSelections)]),
  ),
  legacyZoneShare: Object.fromEntries(
    Object.entries(zoneCounts).map(([zone, count]) => [zone, share(count, totalSelections)]),
  ),
  baselineTargetRoleShare: Object.fromEntries(
    Object.entries(baselineRoleCounts).filter(([, count]) => count > 0)
      .map(([role, count]) => [role, share(count, contextIndex)]),
  ),
  legacySetterSecondTouchShareAllContexts: share(setterSecondTouchSelections, totalSelections),
  legacySetterSecondTouchShareWhenSetterFrontRow: share(setterSecondTouchSelections, setterFrontRowSamples),
  legacyTopAttackShare: share(topAttackSelections, totalSelections),
  rosterTopAttackShareRange: {
    min: Number(Math.min(...rosterTopAttackShares).toFixed(5)),
    max: Number(Math.max(...rosterTopAttackShares).toFixed(5)),
    mean: share(rosterTopAttackShares.reduce((sum, value) => sum + value, 0), rosterTopAttackShares.length),
  },
  byReception: Object.fromEntries(Object.entries(byReception).map(([quality, values]) => [quality, {
    samples: values.samples,
    setterSecondTouchShare: share(values.setterSecondTouchSelections, values.samples),
    setterSecondTouchShareWhenFrontRow: share(
      values.setterSecondTouchSelections,
      values.setterFrontRowSamples,
    ),
    topAttackShare: share(values.topAttackSelections, values.samples),
  }])),
  interpretation: 'Selection frequencies only; not attack efficiency, point probability, tactical quality, or real-world calibration.',
}, null, 2));
