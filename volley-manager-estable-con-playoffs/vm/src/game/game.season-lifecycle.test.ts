import { describe, it, expect } from 'vitest';
import { chooseTeam, endSeason, finishRound, newGame, seasonSummary } from './season';
import { serialize, deserialize } from './save';
import { simulateSeason } from './playoffs';
import { ECON } from './economy';
import { addBoxes } from '../engine/stats';
import { emptyP } from '../engine/stats';
const playSeason = (seed: number) => simulateSeason(newGame(seed));

describe('parciales, equipo y cierre de temporada', () => {
  it('los parciales por set son válidos y coherentes con los totales', () => {
    for (const r of playSeason(5).results) {
      expect(r.setScores.length).toBe(r.sets[0] + r.sets[1]);
      let a = 0, b = 0; r.setScores.forEach(([x, y], i) => { expect(Math.max(x, y)).toBeGreaterThanOrEqual(i === 4 ? 15 : 25); expect(Math.abs(x - y)).toBeGreaterThanOrEqual(2); a += x; b += y; });
      expect([a, b]).toEqual(r.totals);
    }
  });
  it('solo se puede elegir equipo antes de jugar', () => {
    const g = newGame(1); expect(chooseTeam(g, 3).userTeam).toBe(3);
    expect(() => chooseTeam(finishRound(g), 2)).toThrow(/antes de jugar/); expect(() => chooseTeam(g, 99)).toThrow(/inexistente/);
  });
  it('cerrar la temporada exige que haya terminado', () => { expect(() => endSeason(newGame(2))).toThrow(/no terminó/); });
  it('la nueva temporada conserva plantillas y dinero, cobra el premio y archiva estadísticas', () => {
    const g1 = playSeason(7), sum = seasonSummary(g1), g2 = endSeason(g1);
    expect([g2.season, g2.round, g2.results.length, g2.history.length]).toEqual([2, 0, 0, 1]); expect(g2.history[0]).toEqual(sum);
    expect(g2.finance.budget).toBe(g1.finance.budget + sum.prize); expect(g2.userTeam).toBe(g1.userTeam);
    g2.teams.forEach((t, i) => { const before = new Map(g1.teams[i].roster.map(p => [p.id, p])); const kept = t.roster.filter(p => before.has(p.id));
      expect(kept.length).toBeGreaterThanOrEqual(Math.floor(g1.teams[i].roster.length * 0.6)); for (const p of kept) expect(p.age).toBe(before.get(p.id)!.age! + 1); });
    const kills = (b: typeof g1.career) => Object.values(b).reduce((s, x) => s + x.kills, 0);
    expect(kills(g2.allTime)).toBe(kills(g1.career)); expect(g2.career).toEqual({});
    const names = [...g2.teams.flatMap(t => t.roster), ...g2.market].map(p => p.name); expect(new Set(names).size).toBe(names.length);
    expect(g2.market.length).toBeLessThanOrEqual(ECON.maxMarket); expect(g2.market.some(p => p.id.startsWith('fa2-'))).toBe(true);
  });
  it('la temporada 2 usa otras semillas y sigue siendo determinista', () => {
    const g1 = playSeason(7), a = playSeason2(g1), b = playSeason2(playSeason(7));
    expect(a.results).toEqual(b.results); expect(a.results[0].seed).not.toBe(g1.results[0].seed);
  });
  it('el guardado funciona tras cerrar la temporada y se migran partidas de versiones anteriores', () => {
    const g2 = endSeason(playSeason(7)); expect(deserialize(serialize(g2))).toEqual(g2);
    const old = JSON.parse(serialize(finishRound(newGame(4)))); old.version = 2; delete old.season; delete old.history; delete old.allTime; old.results.forEach((r: { setScores?: unknown }) => delete r.setScores);
    const m = deserialize(JSON.stringify(old)); expect([m.version, m.season, m.history.length, m.results[0].setScores.length]).toEqual([5, 1, 0, 0]);
  });
  it('addBoxes suma sin mutar', () => {
    const a = { x: { ...emptyP(), kills: 2, gp: 1 } }, b = { x: { ...emptyP(), kills: 3, gp: 1 }, y: { ...emptyP(), aces: 1 } }, c = addBoxes(a, b);
    expect([c.x.kills, c.x.gp, c.y.aces, a.x.kills]).toEqual([5, 2, 1, 2]);
  });
});
const playSeason2 = (g: ReturnType<typeof newGame>) => simulateSeason(endSeason(g));
