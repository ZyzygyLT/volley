import { describe, expect, it } from 'vitest';
import { P } from './params';
import { classifyReception } from './reception';

describe('clasificación de recepción', () => {
  it('usa los umbrales compartidos con las estadísticas', () => {
    expect(classifyReception(P.perfQ, P)).toBe('perfect');
    expect(classifyReception(P.posQ, P)).toBe('positive');
    expect(classifyReception(P.posQ - 0.0001, P)).toBe('negative');
  });

  it('clasifica valores por encima y por debajo de los umbrales', () => {
    expect(classifyReception(1, P)).toBe('perfect');
    expect(classifyReception((P.posQ + P.perfQ) / 2, P)).toBe('positive');
    expect(classifyReception(0.05, P)).toBe('negative');
  });

  it('respeta parámetros alternativos sin introducir cortes propios', () => {
    const custom = { ...P, perfQ: 0.8, posQ: 0.6 };
    expect(classifyReception(0.79, custom)).toBe('positive');
    expect(classifyReception(0.8, custom)).toBe('perfect');
    expect(classifyReception(0.59, custom)).toBe('negative');
  });
});
