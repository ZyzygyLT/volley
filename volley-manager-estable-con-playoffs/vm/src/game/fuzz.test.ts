import { describe, it, expect } from 'vitest';
import { legalSubs, stepPoint, substitute, playMatch } from '../engine/match';
import { mulberry32 } from '../engine/rng';
import { ECON, marketValue, sell, sign } from './economy';
import { MAX_ROSTER, autoLineup, validateLineup } from './roster';
import { deserialize, serialize, validateGame } from './save';
import { endSeason, finishRound, isSeasonOver, matchFor, newGame, regularSeasonOver, userFixture, type GameState } from './season';
import { finishPlayoffDay, matchForSeries, startPlayoffs, userSeries } from './playoffs';

/** Secuencias aleatorias de acciones del usuario: tras cada paso se comprueban las reglas del juego. */
function check(g: GameState, tag: string) {
  expect(validateGame(g), tag).toEqual([]);
  const players = [...g.teams.flatMap(t => t.roster), ...g.market];
  expect(new Set(players.map(p => p.id)).size, `${tag}: ids`).toBe(players.length);
  expect(new Set(players.map(p => p.name)).size, `${tag}: nombres`).toBe(players.length);
  for (const t of g.teams) { expect(validateLineup(t.roster, t.lineup), tag).toEqual([]); expect(t.roster.length).toBeLessThanOrEqual(MAX_ROSTER); }
  expect(deserialize(serialize(g)), `${tag}: guardado`).toEqual(g);
}

describe('prueba aleatoria de la liga', () => {
  it('mantiene las reglas con fichajes, ventas, alineaciones, partidos con cambios y cierre de temporada', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rnd = mulberry32(seed * 7919), pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]; let g = newGame(seed * 31);
      for (let step = 0; step < 30; step++) {
        const me = g.teams[g.userTeam], r = rnd(), before = g.finance.budget;
        if (isSeasonOver(g)) g = endSeason(g);
        else if (r < 0.2 && g.market.length) { const p = pick(g.market); try { const n = sign(g, p.id); expect(n.finance.budget).toBe(before - marketValue(p)); g = n; } catch (e) { expect((e as Error).message).toMatch(/Presupuesto|completo/); } }
        else if (r < 0.35) { const p = pick(me.roster); try { const n = sell(g, p.id); expect(n.finance.budget).toBe(before + Math.round(marketValue(p) * ECON.sellFactor)); g = n; } catch (e) { expect((e as Error).message).toMatch(/al menos/); } }
        else if (r < 0.45) { const l = autoLineup(me.roster); g = { ...g, teams: g.teams.map(t => (t.id === g.userTeam ? { ...t, lineup: l, risk: Math.floor(rnd() * 101) } : t)) }; }
        else if (r < 0.8 || regularSeasonOver(g)) {
          const ps = regularSeasonOver(g) ? userSeries(g) : undefined, f = regularSeasonOver(g) ? undefined : userFixture(g)!;
          if (regularSeasonOver(g) && !g.playoffs) g = startPlayoffs(g);
          else if (regularSeasonOver(g) && !ps) g = finishPlayoffDay(g);
          else {
            let m = ps ? matchForSeries(g, ps) : matchFor(g, f!); const side = (ps ? m.teams[0].name === g.teams[g.userTeam].name : f!.home === g.userTeam) ? 0 : 1;
            for (let k = 0; k < 400 && !m.over; k++) { m = stepPoint(m); if (rnd() < 0.06) { const o = legalSubs(m, side); if (o.length) { const s = pick(o); m = substitute(m, side, s.out.id, s.inn.id); } } }
            g = ps ? finishPlayoffDay(g, playMatch(m)) : finishRound(g, playMatch(m));
          }
        } else g = finishRound(g);
        check(g, `semilla ${seed} paso ${step}`);
      }
    }
  }, 240000);
});
