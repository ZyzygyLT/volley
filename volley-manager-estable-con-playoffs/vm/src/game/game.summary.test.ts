import { describe, it, expect } from 'vitest';
import { newGame, matchFor, userFixture } from './season';
import { matchSummary, performance } from './summary';
import { playMatch } from '../engine/match';
import { emptyP } from '../engine/stats';

describe('resumen del partido', () => {
  it('los totales del resumen coinciden con el marcador y el mejor jugador tiene la mayor valoración', () => {
    const g = newGame(13), m = playMatch(matchFor(g, userFixture(g)!)), s = matchSummary(m);
    expect(s.teams[0].total + s.teams[1].total).toBe(m.totals[0] + m.totals[1]); expect([s.teams[0].sets, s.teams[1].sets]).toEqual(m.sets); expect(s.setScores).toEqual(m.setScores);
    const all = [...m.base[0], ...m.benches[0], ...m.base[1], ...m.benches[1]].filter(p => m.box[p.id]);
    expect(s.mvp).toBeTruthy(); expect(s.mvp!.score).toBe(Math.max(...all.map(p => performance(m.box[p.id])))); expect([s.teams[0].name, s.teams[1].name]).toContain(s.mvp!.team);
  });
  it('un jugador sin errores y con más puntos vale más que otro con errores', () => {
    const a = { ...emptyP(), kills: 10, aces: 2 }, b = { ...emptyP(), kills: 10, aces: 2, atkErr: 6, serveErr: 4 };
    expect(performance(a)).toBeGreaterThan(performance(b));
  });
});
