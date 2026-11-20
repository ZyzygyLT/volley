import { describe, expect, it } from 'vitest';
import { buildAttackContext } from './attackContext';
import { makeSquads } from './match';
import { P } from './params';
import { mulberry32 } from './rng';
import { compareSetPolicies } from './setPolicyComparison';

function experimentalContexts() {
  const [squad] = makeSquads(20261120);
  const receptions = [0.8, 0.62, 0.3];
  return receptions.flatMap(reception => Array.from({ length: 6 }, (_, rotation) => {
    const lineup = [...squad.slice(0, 6)];
    for (let turn = 0; turn < rotation; turn += 1) lineup.unshift(lineup.pop()!);
    return buildAttackContext(lineup, reception, P);
  }));
}

function runComparison() {
  return compareSetPolicies(experimentalContexts(), 2000, index => mulberry32(900_000 + index));
}

describe('comparación aislada de políticas de selección', () => {
  it('cubre seis rotaciones y tres calidades de recepción', () => {
    const rows = runComparison();

    expect(rows).toHaveLength(18);
    expect(new Set(rows.map(row => row.receptionQuality))).toEqual(
      new Set(['perfect', 'positive', 'negative']),
    );
    expect(new Set(rows.map(row => row.setterSlot))).toEqual(new Set([0, 1, 2, 3, 4, 5]));
  });

  it('compara 2000 muestras históricas por contexto con el baseline determinista', () => {
    for (const row of runComparison()) {
      expect(Object.values(row.legacySelections).reduce((sum, count) => sum + count, 0)).toBe(2000);
      expect(row.legacySelections[row.baselineTargetId]).toBeGreaterThanOrEqual(0);
      expect(row.legacyTopAttackShare).toBeGreaterThanOrEqual(0);
      expect(row.legacyTopAttackShare).toBeLessThanOrEqual(1);
      expect(row.baselineAttackSkill).toBeGreaterThanOrEqual(0);
    }
  });

  it('produce el mismo informe con los mismos contextos y flujos RNG', () => {
    expect(runComparison()).toEqual(runComparison());
  });

  it('rechaza un número de muestras no válido', () => {
    const [context] = experimentalContexts();
    expect(() => compareSetPolicies([context], 0, () => mulberry32(1))).toThrow(RangeError);
  });
});
