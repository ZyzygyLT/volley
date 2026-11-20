import type { MatchState } from '../engine/types';
import { playMatch } from '../engine/match';
import { mergeBox } from '../engine/stats';
import { ECON } from './economy';
import { lineupToSquad } from './roster';
import { finishRound, isSeasonOver, matchBetween, regularSeasonOver, standings, totalRounds, type GameState, type PlayoffGame, type PlayoffState, type Series } from './season';

// FORMATO [DISEÑO inspirado en la PlusLiga]: las series de playoffs se juegan al mejor de 3 y la final al mejor de 5; el mejor clasificado
// de la fase regular es local en el primer partido y la localía alterna después de cada partido (Volleyball World, fórmula de la PlusLiga).
// La PlusLiga clasifica a 8 equipos; esta liga tiene 8, así que se adapta a un cuadro de 4: semifinales 1°-4° y 2°-3°, final y partido por el bronce.
export const QUALIFIED = 4;
const need = (s: Series) => (s.bestOf === 3 ? 2 : 3);
export const winsOf = (s: Series, team: number): number => s.games.filter(x => (x.sets[0] > x.sets[1] ? x.home : x.away) === team).length;
const isDone = (s: Series) => s.winner !== undefined;
/** Localía alterna: los partidos impares los juega de local el mejor clasificado. */
const homeOf = (s: Series, gameNo: number) => (gameNo % 2 === 1 ? s.high : s.low);
const mk = (id: Series['id'], high: number, low: number, bestOf: 3 | 5): Series => ({ id, high, low, bestOf, games: [] });
const seedOf = (g: GameState, s: Series, gameNo: number) => (((g.seed ^ Math.imul(s.id.charCodeAt(0) * 31 + s.id.length + gameNo * 977 + g.season * 7919, 0x9e3779b1)) ^ 0x5bd1e995) >>> 0);

/** Empieza los playoffs con los 4 mejores de la fase regular. Lanza Error si la fase regular no terminó o ya empezaron. */
export function startPlayoffs(g: GameState): GameState {
  if (!regularSeasonOver(g)) throw new Error('La fase regular todavía no terminó');
  if (g.playoffs) throw new Error('Los playoffs ya empezaron');
  const t = standings(g).slice(0, QUALIFIED).map(x => x.team);
  return { ...g, playoffs: { stage: 'semi', series: [mk('SF1', t[0], t[3], 3), mk('SF2', t[1], t[2], 3)] } };
}

/** Serie en curso del equipo del usuario (si sigue vivo en la etapa actual). */
export function userSeries(g: GameState): Series | undefined {
  const p = g.playoffs; if (!p || p.stage === 'done') return undefined;
  return p.series.find(s => !isDone(s) && (s.high === g.userTeam || s.low === g.userTeam));
}
/** Partido que sigue en una serie, con su localía y semilla. */
export function matchForSeries(g: GameState, s: Series): MatchState {
  const n = s.games.length + 1, home = homeOf(s, n), away = home === s.high ? s.low : s.high;
  return matchBetween(g, home, away, seedOf(g, s, n));
}

function advanceStage(g: GameState, p: PlayoffState): PlayoffState {
  const regRank = new Map(standings(g).map((x, i) => [x.team, i]));
  const better = (a: number, b: number): [number, number] => ((regRank.get(a) ?? 0) < (regRank.get(b) ?? 0) ? [a, b] : [b, a]);
  const loser = (s: Series) => (s.winner === s.high ? s.low : s.high);
  if (p.stage === 'semi' && p.series.every(isDone)) {
    const [sf1, sf2] = p.series, [fh, fl] = better(sf1.winner!, sf2.winner!), [bh, bl] = better(loser(sf1), loser(sf2));
    return { ...p, stage: 'final', series: [...p.series, mk('F', fh, fl, 5), mk('B', bh, bl, 3)] };
  }
  if (p.stage === 'final' && p.series.filter(s => s.id === 'F' || s.id === 'B').every(isDone)) {
    const f = p.series.find(s => s.id === 'F')!, b = p.series.find(s => s.id === 'B')!;
    const top = [f.winner!, loser(f), b.winner!, loser(b)], rest = standings(g).map(x => x.team).filter(t => !top.includes(t));
    return { ...p, stage: 'done', champion: f.winner, ranking: [...top, ...rest] };
  }
  return p;
}

/**
 * Juega UN partido de cada serie abierta de la etapa actual (un "día" de playoffs). `userMatch` es el partido del usuario ya terminado
 * (si se jugó a mano). Registra estadísticas y finanzas del usuario y avanza de etapa cuando todas las series terminan. Función pura.
 */
export function finishPlayoffDay(g: GameState, userMatch?: MatchState): GameState {
  const p0 = g.playoffs; if (!p0 || p0.stage === 'done') return g;
  const mine = userSeries(g); let career = g.career, budget = g.finance.budget; const ledger = [...g.finance.ledger];
  const series = p0.series.map(s => {
    if (isDone(s)) return s;
    let m = s === mine && userMatch ? userMatch : matchForSeries(g, s);
    if (!m.over) m = playMatch(m);
    const n = s.games.length + 1, home = homeOf(s, n), away = home === s.high ? s.low : s.high;
    const played = [...new Set([...lineupToSquad(g.teams[home].roster, g.teams[home].lineup), ...lineupToSquad(g.teams[away].roster, g.teams[away].lineup)].map(x => x.id).concat(Object.keys(m.box)))];
    career = mergeBox(career, m.box, played);
    const game: PlayoffGame = { game: n, home, away, sets: [m.sets[0], m.sets[1]], setScores: m.setScores.map(x => [x[0], x[1]] as [number, number]), totals: [m.totals[0], m.totals[1]], seed: m.seed };
    const next: Series = { ...s, games: [...s.games, game] };
    for (const t of [s.high, s.low]) if (winsOf(next, t) >= need(next)) next.winner = t;
    if (s === mine) { // finanzas del usuario (diseño): entradas si juega de local y premio por victoria
      const userHome = home === g.userTeam, won = (m.sets[0] > m.sets[1] ? home : away) === g.userTeam, add = (concept: string, amount: number) => { budget += amount; ledger.push({ round: totalRounds(g), season: g.season, concept, amount }); };
      if (userHome) add('Entradas (playoffs)', ECON.playoffTicketHome); if (won) add('Premio por victoria (playoffs)', ECON.winBonus);
    }
    return next;
  });
  const p1 = advanceStage(g, { ...p0, series });
  return { ...g, playoffs: p1, career, finance: { budget, ledger: ledger.slice(-60) } };
}

/** Un paso de la temporada: jornada de la fase regular, comienzo de playoffs o día de playoffs. Sirve para simular sin pensar en la etapa. */
export function advance(g: GameState, userMatch?: MatchState): GameState {
  if (isSeasonOver(g)) return g;
  if (!regularSeasonOver(g)) return finishRound(g, userMatch);
  if (!g.playoffs) return startPlayoffs(g);
  return finishPlayoffDay(g, userMatch);
}
/** Simula todo lo que falta de la temporada (fase regular y playoffs). */
export function simulateSeason(g: GameState): GameState { let x = g; while (!isSeasonOver(x)) x = advance(x); return x; }
