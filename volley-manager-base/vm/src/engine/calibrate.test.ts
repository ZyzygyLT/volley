import { describe, it, expect } from 'vitest';
import { P } from './params';
import { report } from './calibrate';
import { TARGETS, VALIDATION } from './targets';

describe('calibración contra datos publicados', () => {
  it('el motor reproduce los objetivos y las validaciones independientes', () => {
    const { got } = report(P, 60000);
    for (const t of [...TARGETS, ...VALIDATION]) {
      expect(Math.abs(got[t.key] - t.value), `${t.key}: modelo ${got[t.key].toFixed(3)} vs objetivo ${t.value}`).toBeLessThanOrEqual(t.tol);
    }
  }, 180000);
});
