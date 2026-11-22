import { describe, it, expect } from 'vitest';
import { HOME_BOOST, P, TEAM_SD } from './params';
import { fit, report, scoreDistribution, scoreDist } from './calibrate';
import { TARGETS, VALIDATION } from './targets';

describe('calibración contra datos publicados', () => {
  it('no infiere errores de ataque por posición a partir del agregado error+bloqueado de VNL', () => {
    const fitted = fit(P, 1200, 1);
    expect(fitted.roleErr).toEqual(P.roleErr);
  }, 30000);

  it('el motor reproduce los objetivos y las validaciones complementarias', () => {
    const { got } = report(P, 60000);
    for (const t of [...TARGETS, ...VALIDATION]) {
      expect(Math.abs(got[t.key] - t.value), `${t.key}: modelo ${got[t.key].toFixed(3)} vs objetivo ${t.value}`).toBeLessThanOrEqual(t.tol);
    }
  }, 180000);
});


describe('distribución de marcadores', () => {
  it('devuelve conteos y frecuencias coherentes y reproducibles', () => {
    const a = scoreDistribution(P, 36, TEAM_SD);
    const b = scoreDistribution(P, 36, TEAM_SD);
    expect(a).toEqual(b);
    expect(a.counts['3-0'] + a.counts['3-1'] + a.counts['3-2']).toBe(36);
    expect(a.frequencies['3-0'] + a.frequencies['3-1'] + a.frequencies['3-2']).toBeCloseTo(1, 12);
    expect(a.rallies).toBeGreaterThan(0);
    expect(a.sets).toBeGreaterThan(0);
    expect(a.ralliesPerSet).toBeCloseTo(a.rallies / a.sets, 12);
    expect(a.homeBoost).toBe(HOME_BOOST);
    expect(scoreDistribution(P, 12, TEAM_SD, 0).homeBoost).toBe(0);
  });

  it('rechaza tamaños de muestra y dispersiones inválidos', () => {
    expect(() => scoreDistribution(P, 0)).toThrow();
    expect(() => scoreDistribution(P, 1.5)).toThrow();
    expect(() => scoreDistribution(P, 10, -1)).toThrow();
    expect(() => scoreDistribution(P, 10, Number.NaN)).toThrow();
  });

  it('mantiene disponible el informe de texto usado por la CLI', () => {
    expect(scoreDist(P, 12)).toContain('marcadores 3-0 / 3-1 / 3-2');
  });
});
