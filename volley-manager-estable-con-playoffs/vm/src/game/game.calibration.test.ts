import { describe, it, expect } from 'vitest';
import { homeAdvantage } from '../engine/calibrate';
import { HOME_BOOST, P } from '../engine/params';
import { firstServer } from '../engine/match';

describe('ventaja de local', () => {
  it('el local gana algo más de la mitad de los partidos y de los sets, como en PlusLiga (54,2 % y 53,4 %)', () => {
    const r = homeAdvantage(P, HOME_BOOST, 700);
    expect(r.win).toBeGreaterThan(0.5); expect(r.win).toBeLessThan(0.61); expect(r.sets).toBeGreaterThan(0.505); expect(r.sets).toBeLessThan(0.57);
  }, 120000);
  it('sin ventaja de local el reparto es parejo (el sorteo del primer saque no favorece a nadie)', () => {
    const r = homeAdvantage(P, 0, 700); expect(Math.abs(r.win - 0.5)).toBeLessThan(0.045);
  }, 120000);
  it('el primer saque se sortea por semilla y se alterna entre sets', () => {
    for (let seed = 1; seed <= 50; seed++) { expect(firstServer(seed, 2)).toBe(1 - firstServer(seed, 1)); expect(firstServer(seed, 3)).toBe(firstServer(seed, 1)); expect(firstServer(seed, 4)).toBe(firstServer(seed, 2)); }
    const firsts = Array.from({ length: 400 }, (_, s) => firstServer(s + 1, 1)); const share = firsts.filter(x => x === 0).length / 400; expect(share).toBeGreaterThan(0.42); expect(share).toBeLessThan(0.58);
  });
});
