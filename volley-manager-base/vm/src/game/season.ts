import type { MatchState, PStats } from '../engine/types';
import { boostPlayers, createMatch, gauss, playMatch } from '../engine/match';
import { mulberry32 } from '../engine/rng';
import { HOME_BOOST, TEAM_SD } from '../engine/params';
import { addBoxes, mergeBox } from '../engine/stats';
import { autoLineup, lineupToSquad, makeFreeAgents, makeRoster, overall as overallOf, type Lineup } from './roster';
import { runOffseason, type ProgressEntry } from './offseason';
import { INJURY, repairLineup, rollMatchInjuries, rollTrainingInjuries, tickInjuries, type Injuries, type NewInjury } from './injuries';
import { ECON, roundCashflow, type Finance } from './economy';
import type { Player } from '../engine/types';

export const GAME_VERSION = 6;
const TEAM_NAMES = ['Río Plata', 'Andes', 'Pampa', 'Costa Azul', 'Patagonia', 'Delta', 'Sierras', 'Quebrada', 'Litoral', 'Cuyo', 'Atlántico', 'Mesopotamia'];

export interface TeamData { id: number; name: string; roster: Player[]; lineup: Lineup; risk: number; clubBoost: number }
export interface Fixture { round: number; home: number; away: number }
export interface Result { round: number; home: number; away: number; sets: [number, number]; setScores: [number, number][]; points: [number, number]; totals: [number, number]; seed: number }
// ---- Playoffs (adaptación de la PlusLiga a una liga de 8 equipos: cuadro de 4) ----
export interface PlayoffGame { game: number; home: number; away: number; sets: [number, number]; setScores: [number, number][]; totals: [number, number]; seed: number }
export interface Series { id: 'SF1' | 'SF2' | 'F' | 'B'; high: number; low: number; bestOf: 3 | 5; games: PlayoffGame[]; winner?: number }
export interface PlayoffState { stage: 'semi' | 'final' | 'done'; series: Series[]; champion?: number; ranking?: number[] }

export interface SeasonRecord { season: number; champion: string; userRank: number; userPoints: number; prize: number }
export interface GameState { version: number; seed: number; userTeam: number; teams: TeamData[]; fixtures: Fixture[]; round: number; results: Result[]; career: Record<string, PStats>; finance: Finance; market: Player[]; season: number; history: SeasonRecord[]; allTime: Record<string, PStats>; news: string[]; progressLog: ProgressEntry[]; playoffs: PlayoffState | null; injuries: Injuries; injuryScale: number }

/** Doble liga todos contra todos (método del círculo): cada equipo juega una vez por jornada y dos veces contra cada rival. */
export function roundRobin(n: number): Fixture[] {
  if (n % 2) throw new Error('El número de equipos debe ser par');
  const ids = Array.from({ length: n }, (_, i) => i), out: Fixture[] = [], half = n - 1;
  for (let r = 0; r < half; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i], b = ids[n - 1 - i];
      const flip = (r + i) % 2 === 1; // alterna la localía
      out.push({ round: r, home: flip ? b : a, away: flip ? a : b });
    }
    ids.splice(1, 0, ids.pop()!); // rota todos menos el primero
  }
  const second = out.map(f => ({ round: f.round + half, home: f.away, away: f.home }));
  return [...out, ...second];
}

/** Puntos de liga de un 3-0 / 3-1 / 3-2: reglamento FIVB (ganador 3-0 y 3-1 suma 3; 3-2 reparte 2 y 1). */
export function leaguePoints(sets: [number, number]): [number, number] {
  const [a, b] = sets, win = a > b ? 0 : 1, lo = Math.min(a, b);
  const pts: [number, number] = [0, 0]; pts[win] = lo === 2 ? 2 : 3; pts[1 - win] = lo === 2 ? 1 : 0; return pts;
}

export function newGame(seed: number, userTeam = 0, nTeams = 8): GameState {
  const rnd = mulberry32(seed), used = new Set<string>();
  const teams: TeamData[] = Array.from({ length: nTeams }, (_, i) => {
    const boost = gauss(rnd) * TEAM_SD, roster = makeRoster(rnd, boost, i, used);
    return { id: i, name: TEAM_NAMES[i % TEAM_NAMES.length], roster, lineup: autoLineup(roster), risk: 50, clubBoost: boost };
  });
  const market = makeFreeAgents(rnd, used, TEAM_SD);
  return { version: GAME_VERSION, seed, userTeam, teams, fixtures: roundRobin(nTeams), round: 0, results: [], career: {}, finance: { budget: ECON.startBudget, ledger: [] }, market, season: 1, history: [], allTime: {}, news: [], progressLog: [], playoffs: null, injuries: {}, injuryScale: 1 };
}

export const totalRounds = (g: GameState) => (g.fixtures.length ? Math.max(...g.fixtures.map(f => f.round)) + 1 : 0);
/** La fase regular (doble vuelta) terminó. */
export const regularSeasonOver = (g: GameState) => g.round >= totalRounds(g);
/** La temporada terminó solo cuando también terminaron los playoffs. */
export const isSeasonOver = (g: GameState) => g.playoffs?.stage === 'done';
export const fixturesOfRound = (g: GameState, round = g.round) => g.fixtures.filter(f => f.round === round);
export const userFixture = (g: GameState) => fixturesOfRound(g).find(f => f.home === g.userTeam || f.away === g.userTeam);
// La temporada 1 conserva la fórmula original (partidas guardadas reproducibles); desde la 2 se mezcla el número de temporada.
export const fixtureSeed = (g: GameState, f: Fixture) => (((g.seed ^ Math.imul(f.round * 131 + f.home * 17 + f.away + 1, 0x9e3779b1)) ^ Math.imul((g.season ?? 1) - 1, 0x85ebca6b)) >>> 0);

/** Partido entre dos equipos con sus alineaciones y tácticas actuales (estado inicial, listo para jugarse punto a punto). */
export function matchBetween(g: GameState, homeId: number, awayId: number, seed: number): MatchState {
  const h = g.teams[homeId], a = g.teams[awayId];
  const sh = lineupToSquad(h.roster, h.lineup), sa = lineupToSquad(a.roster, a.lineup);
  const bench = (t: TeamData, sq: Player[]) => t.roster.filter(p => !sq.some(q => q.id === p.id));
  // Ventaja de local (ver HOME_BOOST): el local suma puntos de valoración, también sus suplentes.
  return createMatch(seed, h.risk, { squads: [boostPlayers(sh, HOME_BOOST), sa], benches: [boostPlayers(bench(h, sh), HOME_BOOST), bench(a, sa)], riskB: a.risk, names: [h.name, a.name] });
}
/** Partido de una jornada de la fase regular. */
export const matchFor = (g: GameState, f: Fixture): MatchState => matchBetween(g, f.home, f.away, fixtureSeed(g, f));

/**
 * Fin de una jornada (o de un día de playoffs): una jornada de recuperación para los lesionados, lesiones nuevas de los partidos jugados y del
 * entrenamiento de los equipos indicados, y reparación de las alineaciones (un titular lesionado se reemplaza por el mejor sano de su posición).
 * Devuelve las piezas del estado que cambian y las noticias. Función pura y determinista.
 */
export function afterRound(g: GameState, played: { m: MatchState }[], trainingTeams: number[], key: number): { injuries: Injuries; teams: TeamData[]; news: string[] } {
  const inj: Injuries = tickInjuries(g.injuries), news: string[] = [], byId = new Map(g.teams.flatMap(t => t.roster.map(p => [p.id, { p, t }] as const)));
  const fresh: NewInjury[] = [];
  for (const { m } of played) fresh.push(...rollMatchInjuries(m, g.injuryScale));
  for (const tid of trainingTeams) {
    const t = g.teams[tid], seed = (g.seed ^ Math.imul(g.season * 131 + key * 17 + tid + 1, 0x85ebca6b)) >>> 0;
    fresh.push(...rollTrainingInjuries(t.roster, new Set([...Object.keys(inj), ...fresh.map(x => x.id)]), seed, g.injuryScale));
  }
  for (const x of fresh) {
    const info = byId.get(x.id); if (!info || inj[x.id]) continue;
    inj[x.id] = { kind: x.kind, weeks: x.weeks, total: x.weeks, season: g.season, round: key, where: x.where };
    if (info.t.id === g.userTeam || overallOf(info.p) >= 72) news.push(`${info.p.name} (${info.t.name}) se lesionó en ${x.where}: ${x.kind}, ${x.weeks} ${x.weeks === 1 ? 'jornada' : 'jornadas'} de baja`);
  }
  const injured = new Set(Object.keys(inj));
  const teams = g.teams.map(t => { const l = repairLineup(t.roster, t.lineup, injured); if (l !== t.lineup && t.id === g.userTeam) news.push('Tu alineación se ajustó por las lesiones'); return l === t.lineup ? t : { ...t, lineup: l }; });
  return { injuries: inj, teams, news };
}

/**
 * Cierra la jornada: simula los demás partidos, registra resultados y acumula estadísticas individuales.
 * `userMatch` es el partido del usuario ya terminado (si se jugó a mano); si falta, se simula entero.
 * Función pura: devuelve un estado nuevo.
 */
export function finishRound(g: GameState, userMatch?: MatchState): GameState {
  if (regularSeasonOver(g)) return g;
  const uf = userFixture(g), results: Result[] = [...g.results], playedMatches: { m: MatchState }[] = []; let career = g.career, userHome = false, userWon = false;
  for (const f of fixturesOfRound(g)) {
    let m: MatchState = f === uf && userMatch ? userMatch : matchFor(g, f);
    if (!m.over) m = playMatch(m);
    // Participan los titulares y quien haya tenido alguna acción (suplentes que entraron).
    const played = [...new Set([...lineupToSquad(g.teams[f.home].roster, g.teams[f.home].lineup), ...lineupToSquad(g.teams[f.away].roster, g.teams[f.away].lineup)].map(p => p.id).concat(Object.keys(m.box)))];
    career = mergeBox(career, m.box, played); playedMatches.push({ m });
    results.push({ round: f.round, home: f.home, away: f.away, sets: [m.sets[0], m.sets[1]], setScores: m.setScores.map(x => [x[0], x[1]] as [number, number]), points: leaguePoints([m.sets[0], m.sets[1]]), totals: [m.totals[0], m.totals[1]], seed: m.seed });
    if (f === uf) { userHome = f.home === g.userTeam; userWon = userHome ? m.sets[0] > m.sets[1] : m.sets[1] > m.sets[0]; }
  }
  // Finanzas del equipo del usuario (valores de diseño, ver economy.ts)
  let budget = g.finance.budget; const ledger = [...g.finance.ledger];
  for (const c of roundCashflow(g, userHome, userWon)) { budget += c.amount; ledger.push({ round: g.round, season: g.season, concept: c.concept, amount: c.amount }); }
  const after = afterRound(g, playedMatches, g.teams.map(t => t.id), g.round);
  return { ...g, round: g.round + 1, results, career, finance: { budget, ledger: ledger.slice(-60) }, injuries: after.injuries, teams: after.teams,
    news: [...g.news, ...after.news.map(n => `Jornada ${g.round + 1}: ${n}`)].slice(-40) };
}

export interface Standing { team: number; name: string; played: number; won: number; lost: number; setsFor: number; setsAgainst: number; pointsFor: number; pointsAgainst: number; points: number }
export function standings(g: GameState): Standing[] {
  const s: Standing[] = g.teams.map(t => ({ team: t.id, name: t.name, played: 0, won: 0, lost: 0, setsFor: 0, setsAgainst: 0, pointsFor: 0, pointsAgainst: 0, points: 0 }));
  for (const r of g.results) {
    const h = s[r.home], a = s[r.away];
    h.played++; a.played++; h.setsFor += r.sets[0]; h.setsAgainst += r.sets[1]; a.setsFor += r.sets[1]; a.setsAgainst += r.sets[0];
    if (r.sets[0] > r.sets[1]) { h.won++; a.lost++; } else { a.won++; h.lost++; }
    h.pointsFor += r.totals[0]; h.pointsAgainst += r.totals[1]; a.pointsFor += r.totals[1]; a.pointsAgainst += r.totals[0];
    h.points += r.points[0]; a.points += r.points[1];
  }
  const ratio = (a: number, b: number) => (b ? a / b : a);
  // Desempate como en las competencias FIVB: puntos de partido, partidos ganados, cociente de sets, cociente de puntos.
  return s.sort((x, y) => y.points - x.points || y.won - x.won || ratio(y.setsFor, y.setsAgainst) - ratio(x.setsFor, x.setsAgainst) || ratio(y.pointsFor, y.pointsAgainst) - ratio(x.pointsFor, x.pointsAgainst) || x.team - y.team);
}

/** Líderes de temporada en una estadística acumulada. */
export function leaders(g: GameState, key: keyof PStats, n = 10, minRecs = 0): { player: Player; team: string; value: number }[] {
  const out: { player: Player; team: string; value: number }[] = [];
  for (const t of g.teams) for (const p of t.roster) { const s = g.career[p.id]; if (s && s.recs >= minRecs) out.push({ player: p, team: t.name, value: s[key] }); }
  return out.sort((a, b) => b.value - a.value).slice(0, n);
}

/** Frecuencia de lesiones: 0 = sin lesiones, 1 = datos reales de la FIVB, 2 y 3 = modo dramático (no real). */
export function setInjuryScale(g: GameState, scale: number): GameState {
  if (![0, 1, 2, 3].includes(scale)) throw new Error('Frecuencia de lesiones inválida');
  return { ...g, injuryScale: scale };
}

/** Elegir el equipo que se dirige: solo antes de jugar la primera jornada. */
export function chooseTeam(g: GameState, team: number): GameState {
  if (g.results.length > 0) throw new Error('Solo se puede elegir equipo antes de jugar');
  if (!(team >= 0 && team < g.teams.length)) throw new Error('Equipo inexistente');
  return { ...g, userTeam: team };
}

/** Posición final de todos los equipos: campeón, finalista, bronce, cuarto y luego por la fase regular. */
export function finalRanking(g: GameState): number[] {
  return g.playoffs?.ranking ?? standings(g).map(s => s.team);
}

/** Resumen de la temporada terminada (campeón de los playoffs, puesto final del usuario y premio). */
export function seasonSummary(g: GameState): SeasonRecord {
  const rank = finalRanking(g), pos = rank.indexOf(g.userTeam) + 1, st = standings(g).find(x => x.team === g.userTeam)!;
  return { season: g.season, champion: g.teams[rank[0]].name, userRank: pos, userPoints: st.points, prize: ECON.prizeByRank[Math.min(pos - 1, ECON.prizeByRank.length - 1)] ?? 0 };
}

/**
 * Cierra la temporada y arranca la siguiente conservando equipos, alineaciones y dinero.
 * Cobra el premio por la posición final, archiva las estadísticas en el histórico y ejecuta la intersemana (src/game/offseason.ts):
 * evolución por edad, retiros, fichajes de las computadoras, cantera y jóvenes nuevos. Lanza Error si la temporada no terminó.
 * El usuario puede operar en el mercado ANTES de llamarla (ficha primero).
 */
export function endSeason(g: GameState): GameState {
  if (!isSeasonOver(g)) throw new Error('La temporada todavía no terminó');
  const rec = seasonSummary(g), rnd = mulberry32((g.seed ^ Math.imul(g.season, 0x27d4eb2f)) >>> 0);
  const rankOf = new Map(finalRanking(g).map((team, i) => [team, i + 1]));
  const { g: g1, news, progress } = runOffseason(g, rnd, rankOf);
  const ledger = [...g.finance.ledger, { round: g.round - 1, season: g.season, concept: `Premio de liga (puesto ${rec.userRank})`, amount: rec.prize }].slice(-60);
  // Lesiones: pasa la intersemana (se curan la mayoría); se descartan las de jugadores retirados y se reparan las alineaciones.
  const alive = new Set(g1.teams.flatMap(t => t.roster.map(p => p.id))), healed = tickInjuries(g.injuries, INJURY.offseasonRounds), injuries: Injuries = {};
  for (const [id, x] of Object.entries(healed)) if (alive.has(id)) injuries[id] = x;
  const injuredNow = new Set(Object.keys(injuries)), extraNews: string[] = [];
  const teams = g1.teams.map(t => { const l = repairLineup(t.roster, t.lineup, injuredNow); if (l !== t.lineup && t.id === g.userTeam) extraNews.push('Tu alineación se ajustó por lesiones que siguen abiertas'); return l === t.lineup ? t : { ...t, lineup: l }; });
  return { ...g1, teams, injuries, season: g.season + 1, round: 0, results: [], playoffs: null, career: {}, allTime: addBoxes(g.allTime ?? {}, g.career),
    history: [...g.history, rec], finance: { budget: g.finance.budget + rec.prize, ledger },
    news: [...(g.news ?? []), ...[...news, ...extraNews].map(n => `Temporada ${g.season} → ${g.season + 1}: ${n}`)].slice(-40), progressLog: progress };
}
