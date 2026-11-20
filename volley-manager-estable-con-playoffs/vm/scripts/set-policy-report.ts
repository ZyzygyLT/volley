import { buildAttackContext } from '../src/engine/attackContext';
import { makeSquads } from '../src/engine/match';
import { P } from '../src/engine/params';
import { mulberry32 } from '../src/engine/rng';
import { compareSetPolicies } from '../src/engine/setPolicyComparison';

const [squad] = makeSquads(20261120);
const receptions = [0.8, 0.62, 0.3];
const contexts = receptions.flatMap(reception => Array.from({ length: 6 }, (_, rotation) => {
  const lineup = [...squad.slice(0, 6)];
  for (let turn = 0; turn < rotation; turn += 1) lineup.unshift(lineup.pop()!);
  return buildAttackContext(lineup, reception, P);
}));

const report = compareSetPolicies(
  contexts,
  2000,
  index => mulberry32(900_000 + index),
);

console.log(JSON.stringify({
  experiment: 'setter-policy-comparison-v1',
  seed: 20261120,
  samplesPerContext: 2000,
  totalLegacySelections: report.reduce((sum, row) => sum + row.samples, 0),
  rows: report,
}, null, 2));
