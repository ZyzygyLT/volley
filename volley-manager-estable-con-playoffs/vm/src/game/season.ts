import type { MatchState, PStats } from '../engine/types';
import { boostPlayers, createMatch, gauss, playMatch, startingPlayerIds } from '../engine/match';
import { mulberry32 } from '../engine/rng';
import { HOME_BOOST, TEAM_SD } from '../engine/params';
import { addBoxes, mergeBox } from '../engine/stats';
import { autoLineup, lineupToSquad, makeFreeAgents, makeRoster, type Lineup } from './roster';
import { runOffseason, type ProgressEntry } from './offseason';
import { ECON, roundCashflow, type Finance } from './economy';
import type { Player } from '../engine/types';
import { validateMatchAgainst } from '../engine/validation';

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
export interface RetiredPlayer extends Player { retiredSeason: number; lastTeam: string }
export interface GameState { version: number; seed: number; userTeam: number; teams: TeamData[]; fixtures: Fixture[]; round: number; results: Result[]; career: Record<string, PStats>; finance: Finance; market: Player[]; season: number; history: SeasonRecord[]; allTime: Record<string, PStats>; retiredPlayers: RetiredPlayer[]; /** IDs históricos sin ficha recuperable en saves anteriores al archivo de retirados. */ legacyAllTimeIds?: string[]; news: string[]; progressLog: ProgressEntry[]; playoffs: PlayoffState | null }

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
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) throw new Error('La semilla de la partida debe ser un entero uint32');
  if (!Number.isInteger(nTeams) || nTeams < 2 || nTeams > 32 || nTeams % 2 !== 0) throw new Error('La liga debe tener entre 2 y 32 equipos, en número par');
  if (!Number.isInteger(userTeam) || userTeam < 0 || userTeam >= nTeams) throw new Error('El equipo del usuario no existe');
  const rnd = mulberry32(seed), used = new Set<string>();
  const teams: TeamData[] = Array.from({ length: nTeams }, (_, i) => {
    const boost = gauss(rnd) * TEAM_SD, roster = makeRoster(rnd, boost, i, used);
    return { id: i, name: TEAM_NAMES[i % TEAM_NAMES.length], roster, lineup: autoLineup(roster), risk: 50, clubBoost: boost };
  });
  const market = makeFreeAgents(rnd, used, TEAM_SD);
  return { version: GAME_VERSION, seed, userTeam, teams, fixtures: roundRobin(nTeams), round: 0, results: [], career: {}, finance: { budget: ECON.startBudget, ledger: [] }, market, season: 1, history: [], allTime: {}, retiredPlayers: [], news: [], progressLog: [], playoffs: null };
}

export const totalRounds = (g: GameState) => (g.fixtures.length ? Math.max(...g.fixtures.map(f => f.round)) + 1 : 0);
/** La fase regular (doble vuelta) terminó. */
export const regularSeasonOver = (g: GameState) => g.round >= totalRounds(g);
/** La temporada terminó solo cuando también terminaron los playoffs. */
export const isSeasonOver = (g: GameState) => g.playoffs?.stage === 'done';
export const fixturesOfRound = (g: GameState, round = g.round) => g.fixtures.filter(f => f.round === round);
export const userFixture = (g: GameState) => fixturesOfRound(g).find(f => f.home === g.userTeam || f.away === g.userTeam);
// La temporada 1 conserva la fórmula original (partidas guardadas reproducibles); desde la 2 se mezcla el número de temporada.
// Codifica sin solapamientos los campos del fixture (hasta 32 equipos y 62 jornadas).
// La multiplicación por un impar y XOR conservan la unicidad entre fixtures de una misma temporada.
export const fixtureSeed = (g: GameState, f: Fixture) => {
  const fixtureKey = (f.round << 10) | (f.home << 5) | f.away;
  return ((g.seed ^ Math.imul(fixtureKey, 0x9e3779b1) ^ Math.imul((g.season ?? 1) - 1, 0x85ebca6b)) >>> 0);
};

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
 * Cierra la jornada: simula los demás partidos, registra resultados y acumula estadísticas individuales.
 * `userMatch` es el partido del usuario ya terminado (si se jugó a mano); si falta, se simula entero.
 * Función pura: devuelve un estado nuevo.
 */
export function finishRound(g: GameState, userMatch?: MatchState): GameState {
  if (regularSeasonOver(g)) {
    if (userMatch) throw new Error('No se puede registrar un partido manual: la fase regular ya terminó');
    return g;
  }
  const uf = userFixture(g);
  if (userMatch) {
    if (!uf) throw new Error('No existe un fixture del usuario para esta jornada');
    if (!userMatch.over) throw new Error('El partido manual todavía no terminó');
    const errors = validateMatchAgainst(userMatch, matchFor(g, uf));
    if (errors.length) throw new Error(`Partido manual inválido: ${errors.join('; ')}`);
  }
  const results: Result[] = [...g.results]; let career = g.career, userHome = false, userWon = false;
  for (const f of fixturesOfRound(g)) {
    let m: MatchState = f === uf && userMatch ? userMatch : matchFor(g, f);
    if (!m.over) m = playMatch(m);
    // Participan los titulares y quien haya tenido alguna acción (suplentes que entraron).
    const starters = f === uf && userMatch
      ? startingPlayerIds(m)
      : [...lineupToSquad(g.teams[f.home].roster, g.teams[f.home].lineup), ...lineupToSquad(g.teams[f.away].roster, g.teams[f.away].lineup)].map(p => p.id);
    const played = [...new Set([...starters, ...(m.playedIds ?? []), ...Object.keys(m.box)])];
    career = mergeBox(career, m.box, played);
    results.push({ round: f.round, home: f.home, away: f.away, sets: [m.sets[0], m.sets[1]], setScores: m.setScores.map(x => [x[0], x[1]] as [number, number]), points: leaguePoints([m.sets[0], m.sets[1]]), totals: [m.totals[0], m.totals[1]], seed: m.seed });
    if (f === uf) { userHome = f.home === g.userTeam; userWon = userHome ? m.sets[0] > m.sets[1] : m.sets[1] > m.sets[0]; }
  }
  // Finanzas del equipo del usuario (valores de diseño, ver economy.ts)
  let budget = g.finance.budget; const ledger = [...g.finance.ledger];
  for (const c of roundCashflow(g, userHome, userWon)) { budget += c.amount; ledger.push({ round: g.round, season: g.season, concept: c.concept, amount: c.amount }); }
  return { ...g, round: g.round + 1, results, career, finance: { budget, ledger: ledger.slice(-60) } };
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
  const ratio = (a: number, b: number) => (b === 0 ? (a === 0 ? 0 : Number.POSITIVE_INFINITY) : a / b);
  // Desempate como en las competencias FIVB: puntos de partido, partidos ganados, cociente de sets, cociente de puntos.
  return s.sort((x, y) => y.points - x.points || y.won - x.won || ratio(y.setsFor, y.setsAgainst) - ratio(x.setsFor, x.setsAgainst) || ratio(y.pointsFor, y.pointsAgainst) - ratio(x.pointsFor, x.pointsAgainst) || x.team - y.team);
}

/** Líderes de temporada en una estadística acumulada, incluidos los jugadores vendidos que siguen en el mercado. */
export function leaders(g: GameState, key: keyof PStats, n = 10, minRecs = 0): { player: Player; team: string; value: number }[] {
  const out: { player: Player; team: string; value: number }[] = [];
  for (const t of g.teams) for (const p of t.roster) {
    const s = g.career[p.id];
    if (s && s.recs >= minRecs) out.push({ player: p, team: t.name, value: s[key] });
  }
  for (const p of g.market) {
    const s = g.career[p.id];
    if (s && s.recs >= minRecs) out.push({ player: p, team: 'Agente libre', value: s[key] });
  }
  return out.sort((a, b) => b.value - a.value).slice(0, n);
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
function assertSeasonCanClose(g: GameState): void {
  if (!isSeasonOver(g) || !g.playoffs) throw new Error('La temporada todavía no terminó');
  const rounds = totalRounds(g);
  if (g.round !== rounds || g.results.length < g.fixtures.length) {
    throw new Error('No se puede cerrar la temporada: la fase regular está incompleta');
  }
  const fixtures = new Set(g.fixtures.map(f => `${f.round}/${f.home}/${f.away}`));
  const results = new Set(g.results.map(r => `${r.round}/${r.home}/${r.away}`));
  const scoreMatches = (sets: number[], scores: number[][], totals: number[], allowLegacyEmpty = false): boolean => {
    if (!Array.isArray(sets) || sets.length !== 2 || !((sets[0] === 3 && sets[1] <= 2) || (sets[1] === 3 && sets[0] <= 2))
      || !Array.isArray(totals) || totals.length !== 2 || !totals.every(x => Number.isInteger(x) && x >= 0)
      || !Array.isArray(scores)) return false;
    if (allowLegacyEmpty && scores.length === 0) return true;
    if (scores.length !== sets[0] + sets[1]) return false;
    let winsA = 0, winsB = 0, sumA = 0, sumB = 0;
    for (let i = 0; i < scores.length; i++) {
      const pair = scores[i];
      if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(x => Number.isInteger(x) && x >= 0 && x <= 200)) return false;
      const [a, b] = pair, target = i === 4 ? 15 : 25;
      if (Math.max(a, b) < target || Math.abs(a - b) < 2) return false;
      if (a > b) winsA++; else winsB++;
      sumA += a; sumB += b;
    }
    return winsA === sets[0] && winsB === sets[1] && sumA === totals[0] && sumB === totals[1];
  };
  if (fixtures.size !== g.fixtures.length || g.results.length !== g.fixtures.length
    || results.size !== g.fixtures.length || [...fixtures].some(key => !results.has(key))
    || g.results.some(r => !scoreMatches(r.sets, r.setScores, r.totals, true)
      || r.points[0] !== leaguePoints(r.sets)[0] || r.points[1] !== leaguePoints(r.sets)[1]
      || !Number.isInteger(r.seed) || r.seed < 0 || r.seed > 0xffff_ffff)) {
    throw new Error('No se puede cerrar la temporada: los resultados no coinciden con el calendario o son inválidos');
  }

  const p = g.playoffs;
  const expectedIds = ['SF1', 'SF2', 'F', 'B'];
  if (p.stage !== 'done' || p.series.length !== expectedIds.length
    || p.series.some((s, i) => s.id !== expectedIds[i] || s.bestOf !== (i === 2 ? 5 : 3) || s.winner === undefined
      || (s.winner !== s.high && s.winner !== s.low)
      || s.games.length < (s.bestOf === 3 ? 2 : 3) || s.games.length > s.bestOf)) {
    throw new Error('No se puede cerrar la temporada: las series de playoffs están incompletas o son inválidas');
  }
  // El cuadro debe respetar la clasificación regular, no solo ser coherente consigo mismo.
  const ranked = standings(g).map(s => s.team);
  const rank = new Map(ranked.map((team, i) => [team, i]));
  const better = (a: number, b: number): [number, number] =>
    rank.get(a)! < rank.get(b)! ? [a, b] : [b, a];
  const sf1 = p.series[0], sf2 = p.series[1], finalSeries = p.series[2], bronzeSeries = p.series[3];
  const expectedSemis: [number, number][] = [[ranked[0], ranked[3]], [ranked[1], ranked[2]]];
  if (sf1.high !== expectedSemis[0][0] || sf1.low !== expectedSemis[0][1]
    || sf2.high !== expectedSemis[1][0] || sf2.low !== expectedSemis[1][1]) {
    throw new Error('No se puede cerrar la temporada: semifinales incompatibles con la clasificación regular');
  }

  for (const s of p.series) {
    const needed = s.bestOf === 3 ? 2 : 3;
    let highWins = 0, lowWins = 0;
    for (let i = 0; i < s.games.length; i++) {
      const game = s.games[i];
      const expectedHome = i % 2 === 0 ? s.high : s.low;
      const expectedAway = expectedHome === s.high ? s.low : s.high;
      if (game.game !== i + 1 || game.home !== expectedHome || game.away !== expectedAway
        || !scoreMatches(game.sets, game.setScores, game.totals)
        || !Number.isInteger(game.seed) || game.seed < 0 || game.seed > 0xffff_ffff) {
        throw new Error(`No se puede cerrar la temporada: partido inválido en la serie ${s.id}`);
      }
      const winner = game.sets[0] > game.sets[1] ? game.home : game.away;
      if (winner === s.high) highWins++; else if (winner === s.low) lowWins++;
      else throw new Error(`No se puede cerrar la temporada: participante inválido en la serie ${s.id}`);
      if (highWins >= needed || lowWins >= needed) {
        if (i !== s.games.length - 1) throw new Error(`No se puede cerrar la temporada: la serie ${s.id} continuó después de decidirse`);
      }
    }
    const actualWinner = highWins >= needed ? s.high : lowWins >= needed ? s.low : undefined;
    if (actualWinner !== s.winner) throw new Error(`No se puede cerrar la temporada: ganador incorrecto en la serie ${s.id}`);
  }

  const sfWinners = [sf1.winner!, sf2.winner!];
  const sfLosers = [sf1.winner === sf1.high ? sf1.low : sf1.high, sf2.winner === sf2.high ? sf2.low : sf2.high];
  const [expectedFinalHigh, expectedFinalLow] = better(sfWinners[0], sfWinners[1]);
  const [expectedBronzeHigh, expectedBronzeLow] = better(sfLosers[0], sfLosers[1]);
  if (finalSeries.high !== expectedFinalHigh || finalSeries.low !== expectedFinalLow
    || bronzeSeries.high !== expectedBronzeHigh || bronzeSeries.low !== expectedBronzeLow) {
    throw new Error('No se puede cerrar la temporada: final o bronce incompatibles con las semifinales y la clasificación');
  }
  const final = p.series.find(s => s.id === 'F')!, bronze = p.series.find(s => s.id === 'B')!;
  const expectedTop = [final.winner!, final.winner === final.high ? final.low : final.high,
    bronze.winner!, bronze.winner === bronze.high ? bronze.low : bronze.high];
  const expectedRanking = [...expectedTop, ...standings(g).map(s => s.team).filter(t => !expectedTop.includes(t))];
  if (p.champion !== final.winner || !p.ranking || p.ranking.length !== g.teams.length
    || new Set(p.ranking).size !== g.teams.length
    || p.ranking.some((team, i) => team !== expectedRanking[i])) {
    throw new Error('No se puede cerrar la temporada: campeón o ranking final incoherente');
  }
  if (!Number.isFinite(g.finance.budget) || !Array.isArray(g.finance.ledger)
    || !Array.isArray(g.history) || g.history.length !== g.season - 1
    || g.history.some((record, i) => record.season !== i + 1)) {
    throw new Error('No se puede cerrar la temporada: historial o finanzas inválidos');
  }
}

/** Cierra la temporada solo después de verificar calendario, playoffs, ranking, historial y finanzas. */
export function endSeason(g: GameState): GameState {
  assertSeasonCanClose(g);
  const rec = seasonSummary(g), rnd = mulberry32((g.seed ^ Math.imul(g.season, 0x27d4eb2f)) >>> 0);
  const rankOf = new Map(finalRanking(g).map((team, i) => [team, i + 1]));
  const { g: g1, news, progress } = runOffseason(g, rnd, rankOf);
  const ledger = [...g.finance.ledger, { round: g.round - 1, season: g.season, concept: `Premio de liga (puesto ${rec.userRank})`, amount: rec.prize }].slice(-60);
  return { ...g1, season: g.season + 1, round: 0, results: [], playoffs: null, career: {}, allTime: addBoxes(g.allTime ?? {}, g.career),
    history: [...g.history, rec], finance: { budget: g.finance.budget + rec.prize, ledger },
    news: [...(g.news ?? []), ...news.map(n => `Temporada ${g.season} → ${g.season + 1}: ${n}`)].slice(-40), progressLog: progress };
}
