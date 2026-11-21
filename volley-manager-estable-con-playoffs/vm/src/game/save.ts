import type { GameState } from './season';
import { GAME_VERSION } from './season';
import { validateLineup, MIN_BY_ROLE, MAX_ROSTER, type Lineup } from './roster';
import { emptyP } from '../engine/stats';
import { roundRobin, leaguePoints, standings } from './season';
import { ECON } from './economy';
import type { MatchState, Player, Role } from '../engine/types';
import { rollAge } from './ages';
import { mulberry32 } from '../engine/rng';
import { validateMatch } from '../engine/validation';

export class SaveError extends Error {}
export interface SaveMeta { slot: string; savedAt: string; team: string; round: number }

const ROLES = ['S', 'OH', 'MB', 'OP', 'L'] as const;
const SERVES = ['JS', 'JFS', 'FS'];
const STAT_KEYS = Object.keys(emptyP());
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown, lo = -Infinity, hi = Infinity): x is number => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
const isInt = (x: unknown, lo = -Infinity, hi = Infinity): x is number => isNum(x, lo, hi) && Number.isInteger(x);
const isStr = (x: unknown, max = 200): x is string => typeof x === 'string' && x.length <= max;
const isPair = (x: unknown, ok: (n: unknown) => boolean): boolean => Array.isArray(x) && x.length === 2 && ok(x[0]) && ok(x[1]);
export const MAX_SAVE_CHARS = 3_000_000;

function checkPlayer(p: unknown, where: string, e: string[]): boolean {
  if (!isObj(p)) { e.push(`${where}: jugador inválido`); return false; }
  if (!isStr(p.id, 40) || !p.id.trim() || !isStr(p.name, 60) || !p.name.trim()) { e.push(`${where}: id o nombre vacío o inválido`); return false; }
  if (!ROLES.includes(p.role as never) || !SERVES.includes(p.serveType as never)) { e.push(`${where}: posición o tipo de saque inválido (${p.id})`); return false; }
  for (const k of ['srv', 'rec', 'set', 'atk', 'blk', 'def', 'cons']) if (!isNum(p[k], 0, 120)) { e.push(`${where}: ${p.id} tiene ${k} inválido`); return false; }
  if (p.age !== undefined && !isInt(p.age, 15, 50)) { e.push(`${where}: edad inválida (${p.id})`); return false; }
  return true;
}
function checkBox(b: unknown, where: string, e: string[]): void {
  if (!isObj(b)) { e.push(where + ': estadísticas inválidas'); return; }
  for (const [id, s] of Object.entries(b)) {
    if (!id.trim() || id.length > 40 || !isObj(s)) { e.push(where + ': estadísticas inválidas de ' + id); return; }
    const keys = Object.keys(s);
    if (keys.length !== STAT_KEYS.length || STAT_KEYS.some(k => !Object.prototype.hasOwnProperty.call(s, k))) {
      e.push(where + ': estructura incompleta de estadísticas de ' + id); return;
    }
    // Contadores enteros; recQSum admite decimales.
    for (const k of STAT_KEYS) if (!(k === 'recQSum' ? isNum(s[k], 0, 1e7) : isInt(s[k], 0, 1e7))) {
      e.push(where + ': ' + id + '.' + k + ' inválido'); return;
    }
  }
}

function validMatchScore(sets: unknown, setScores: unknown, totals: unknown): boolean {
  if (!isPair(sets, x => isInt(x, 0, 3))) return false;
  const [a, b] = sets as number[];
  if (!((a === 3 && b < 3) || (b === 3 && a < 3))) return false;
  if (!isPair(totals, x => isInt(x, 0, 500)) || !Array.isArray(setScores)) return false;
  // Los saves antiguos pueden no contener parciales; si existen, deben reconstruir sets y puntos.
  if (setScores.length === 0) return true;
  if (setScores.length !== a + b || !setScores.every(s => isPair(s, x => isInt(x, 0, 200)))) return false;
  let winsA = 0, winsB = 0, sumA = 0, sumB = 0;
  for (let i = 0; i < setScores.length; i++) {
    const [x, y] = setScores[i] as number[];
    const target = i === 4 ? 15 : 25;
    if (Math.max(x, y) < target || Math.abs(x - y) < 2) return false;
    if (x > y) winsA++; else winsB++;
    sumA += x; sumB += y;
  }
  const [totalA, totalB] = totals as number[];
  return winsA === a && winsB === b && sumA === totalA && sumB === totalB;
}

function checkPlayoffs(p: unknown, n: number, regularOver: boolean, teams: unknown[], results: unknown[], e: string[]): void {
  if (p === null) return;
  if (!isObj(p) || !['semi', 'final', 'done'].includes(p.stage as string) || !Array.isArray(p.series)) { e.push('Playoffs inválidos'); return; }
  if (!regularOver) { e.push('Playoffs antes de terminar la fase regular'); return; }
  const stage = p.stage as 'semi' | 'final' | 'done';
  const expectedIds = stage === 'semi' ? ['SF1', 'SF2'] : ['SF1', 'SF2', 'F', 'B'];
  if (p.series.length !== expectedIds.length) { e.push('Playoffs: cantidad de series inválida'); return; }
  const ranked = standings({ teams, results } as unknown as GameState).map(x => x.team);
  const rank = new Map(ranked.map((team, i) => [team, i]));
  const better = (a: number, b: number): [number, number] => (rank.get(a)! < rank.get(b)! ? [a, b] : [b, a]);
  const expectedSemi: [number, number][] = [[ranked[0], ranked[3]], [ranked[1], ranked[2]]];
  const seriesById = new Map<string, Record<string, unknown>>();
  p.series.forEach((raw: unknown, i: number) => {
    const id = expectedIds[i];
    if (!isObj(raw)) { e.push(`Playoffs: serie ${id} inválida`); return; }
    const s = raw;
    seriesById.set(id, s);
    const bestOf = id === 'F' ? 5 : 3;
    const validBase = s.id === id && isInt(s.high, 0, n - 1) && isInt(s.low, 0, n - 1)
      && s.high !== s.low && s.bestOf === bestOf && Array.isArray(s.games)
      && s.games.length <= bestOf;
    if (!validBase) { e.push(`Playoffs: serie ${id} inválida`); return; }
    const high = s.high as number, low = s.low as number;
    if (i < 2) {
      const [wantHigh, wantLow] = expectedSemi[i];
      if (high !== wantHigh || low !== wantLow) e.push(`Playoffs: participantes incorrectos en ${id}`);
    }
    const needed = bestOf === 3 ? 2 : 3;
    let winsHigh = 0, winsLow = 0, gamesValid = true;
    (s.games as unknown[]).forEach((rawGame, k) => {
      // La serie debe detenerse inmediatamente al alcanzar las victorias necesarias.
      if (winsHigh >= needed || winsLow >= needed) gamesValid = false;
      if (!isObj(rawGame)) { gamesValid = false; return; }
      const game = rawGame;
      const expectedHome = (k % 2 === 0) ? high : low;
      const expectedAway = expectedHome === high ? low : high;
      const winner = isPair(game.sets, x => isInt(x, 0, 3))
        ? ((game.sets as number[])[0] > (game.sets as number[])[1] ? game.home : game.away) : -1;
      if (game.game !== k + 1 || game.home !== expectedHome || game.away !== expectedAway
        || !validMatchScore(game.sets, game.setScores, game.totals) || !isNum(game.seed)
        || (winner !== high && winner !== low)) gamesValid = false;
      if (winner === high) winsHigh++; else if (winner === low) winsLow++;
    });
    if (!gamesValid) e.push(`Playoffs: partidos inválidos en ${id}`);
    const expectedWinner = winsHigh >= needed ? high : winsLow >= needed ? low : undefined;
    if (s.winner !== expectedWinner) e.push(`Playoffs: ganador incoherente en ${id}`);
    if ((winsHigh >= needed && winsLow >= needed) || (s.winner !== undefined && (s.games as unknown[]).length > bestOf)) e.push(`Playoffs: serie ${id} continuó después de cerrarse`);
  });

  const sf1 = seriesById.get('SF1'), sf2 = seriesById.get('SF2');
  if (stage === 'semi' && sf1 && sf2 && sf1.winner !== undefined && sf2.winner !== undefined)
    e.push('Playoffs: semifinales terminadas sin avanzar de etapa');
  if (stage !== 'semi' && sf1 && sf2) {
    const w1 = sf1.winner, w2 = sf2.winner;
    const l1 = w1 === sf1.high ? sf1.low : sf1.high;
    const l2 = w2 === sf2.high ? sf2.low : sf2.high;
    if (w1 === undefined || w2 === undefined) e.push('Playoffs: no se pueden abrir final y bronce sin semifinales terminadas');
    else {
      const [fh, fl] = better(w1 as number, w2 as number);
      const [bh, bl] = better(l1 as number, l2 as number);
      const f = seriesById.get('F'), b = seriesById.get('B');
      if (f && (f.high !== fh || f.low !== fl)) e.push('Playoffs: participantes incorrectos en la final');
      if (b && (b.high !== bh || b.low !== bl)) e.push('Playoffs: participantes incorrectos en el bronce');
    }
  }
  const finalSeries = seriesById.get('F'), bronzeSeries = seriesById.get('B');
  if (stage === 'final' && finalSeries && bronzeSeries && finalSeries.winner !== undefined && bronzeSeries.winner !== undefined)
    e.push('Playoffs: etapa final cerrada sin actualizar el estado');
  if (stage === 'done') {
    const r = p.ranking, fWinner = finalSeries?.winner;
    const f = finalSeries, b = bronzeSeries;
    const expectedTop = f && f.winner !== undefined && b && b.winner !== undefined
      ? [f.winner, f.winner === f.high ? f.low : f.high, b.winner, b.winner === b.high ? b.low : b.high] : [];
    const expectedRanking = [...expectedTop, ...ranked.filter(t => !expectedTop.includes(t))];
    if (!Array.isArray(r) || r.length !== n || new Set(r).size !== n || r.some((t: unknown) => !isInt(t, 0, n - 1))
      || expectedTop.length !== 4 || JSON.stringify(r) !== JSON.stringify(expectedRanking)
      || p.champion !== fWinner || p.champion !== r[0]) e.push('Playoffs: ranking final inválido');
  }
}

/** Errores de coherencia y de estructura de una partida (lista vacía = válida). Nunca lanza: cualquier entrada rara produce mensajes. */
export function validateGame(input: unknown): string[] {
  const e: string[] = [];
  try { check(input, e); } catch (x) { e.push(`Estructura inválida (${(x as Error).message})`); }
  return e;
}
function check(input: unknown, e: string[]): void {
  if (!isObj(input)) { e.push('No es un objeto'); return; }
  const g = input as Record<string, unknown>;
  if (g.version !== GAME_VERSION) e.push(`Versión no soportada: ${String(g.version)}`);
  if (!isInt(g.seed, 0, 0xffff_ffff)) e.push('Semilla de partida inválida: debe ser un entero uint32');
  const teams = g.teams;
  if (!Array.isArray(teams) || teams.length < 2 || teams.length > 32 || teams.length % 2) { e.push('Equipos inválidos'); return; }
  const n = teams.length, seen = new Set<string>(), seenNames = new Set<string>();
  teams.forEach((t: unknown, i) => {
    const w = `Equipo ${i}`;
    if (!isObj(t) || t.id !== i || !isStr(t.name, 60) || !isNum(t.risk, 0, 100) || !isNum(t.clubBoost, -50, 50)) { e.push(`${w}: datos inválidos`); return; }
    const roster = t.roster;
    if (!Array.isArray(roster) || roster.length < 7 || roster.length > MAX_ROSTER) { e.push(`${w}: el plantel debe tener entre 7 y ${MAX_ROSTER} jugadores`); return; }
    let ok = true; for (const p of roster) { if (!checkPlayer(p, w, e)) { ok = false; break; } if (seen.has((p as Player).id)) { e.push(`${w}: id repetido ${(p as Player).id}`); ok = false; break; } seen.add((p as Player).id);
      if (!(p as Player).name.trim() || seenNames.has((p as Player).name)) { e.push(`${w}: nombre vacío o repetido ${(p as Player).name}`); ok = false; break; } seenNames.add((p as Player).name); }
    if (!ok) return;
    for (const role of Object.keys(MIN_BY_ROLE) as Role[]) if ((roster as Player[]).filter(p => p.role === role).length < MIN_BY_ROLE[role]) { e.push(`${w}: faltan jugadores de la posición ${role}`); ok = false; }
    const l = t.lineup;
    if (!isObj(l) || !isStr(l.S, 40) || !isStr(l.OP, 40) || !isStr(l.L, 40) || !isPair(l.OH, x => isStr(x, 40)) || !isPair(l.MB, x => isStr(x, 40))) { e.push(`${w}: alineación inválida`); ok = false; }
    else e.push(...validateLineup(roster as Player[], l as unknown as Lineup).map(m => `${w}: ${m}`));
  });
  if (!isInt(g.userTeam, 0, n - 1)) e.push('Equipo del usuario inválido');
  if (!Array.isArray(g.market) || g.market.length > ECON.maxMarket) e.push(`Mercado inválido: máximo ${ECON.maxMarket} agentes libres`);
  else for (const p of g.market) { if (!checkPlayer(p, 'Mercado', e)) break; if (seen.has((p as Player).id)) { e.push(`Mercado: id repetido ${(p as Player).id}`); break; } seen.add((p as Player).id); if (!(p as Player).name.trim() || seenNames.has((p as Player).name)) { e.push(`Mercado: nombre vacío o repetido ${(p as Player).name}`); break; } seenNames.add((p as Player).name); }
  // calendario: debe ser exactamente la doble vuelta estándar de ese número de equipos
  const fx = roundRobin(n), rounds = 2 * (n - 1);
  if (!Array.isArray(g.fixtures) || g.fixtures.length !== fx.length || g.fixtures.some((f: unknown, i: number) => !isObj(f) || f.round !== fx[i].round || f.home !== fx[i].home || f.away !== fx[i].away)) e.push('Calendario inválido');
  if (!isInt(g.round, 0, rounds)) e.push('Jornada inválida');
  if (!Array.isArray(g.results) || g.results.length > fx.length) e.push('Resultados inválidos');
  else {
    const expectedCount = isInt(g.round, 0, rounds) ? g.round * (n / 2) : -1;
    if (g.results.length !== expectedCount) e.push('Resultados: cantidad incoherente con las jornadas completadas');
    const expected = new Map(fx.filter(f => f.round < (isInt(g.round, 0, rounds) ? g.round : 0)).map(f => [`${f.round}/${f.home}/${f.away}`, f]));
    const seenResults = new Set<string>();
    for (const r of g.results as unknown[]) {
      if (!isObj(r) || !isInt(r.round, 0, rounds - 1) || !isInt(r.home, 0, n - 1) || !isInt(r.away, 0, n - 1)) { e.push('Resultado inválido'); break; }
      const key = `${r.round}/${r.home}/${r.away}`;
      const fixture = expected.get(key);
      if (!fixture || seenResults.has(key) || r.round >= (g.round as number)) { e.push('Resultados: fixture inexistente, duplicado o de una jornada no completada'); break; }
      seenResults.add(key);
      const valid = r.home !== r.away && validMatchScore(r.sets, r.setScores, r.totals)
        && isPair(r.points, x => isInt(x, 0, 3))
        && JSON.stringify(r.points) === JSON.stringify(leaguePoints(r.sets as [number, number]))
        && isNum(r.seed);
      if (!valid) { e.push('Resultado inválido o puntos de liga incoherentes'); break; }
    }
    if (seenResults.size !== expected.size) e.push('Resultados: faltan partidos del calendario completado');
  }
  if (!(isInt(g.season, 1, 1000))) e.push('Temporada inválida');
  if (!isObj(g.finance) || !isNum(g.finance.budget, -1e12, 1e12) || !Array.isArray(g.finance.ledger) || g.finance.ledger.length > 60
    || g.finance.ledger.some((x: unknown) => !isObj(x) || !isInt(x.round, 0, rounds) || !isStr(x.concept, 120) || !x.concept.trim() || !isNum(x.amount, -1e12, 1e12) || (x.season !== undefined && (!isInt(x.season, 1, 1000) || x.season > (g.season as number))))) e.push('Finanzas inválidas');
  if (!Array.isArray(g.history) || g.history.length > 1000
    || (isInt(g.season, 1, 1000) && g.history.length !== g.season - 1)
    || g.history.some((h: unknown, i: number) => !isObj(h) || h.season !== i + 1
      || !isStr(h.champion, 60) || !h.champion.trim() || !isInt(h.userRank, 1, n)
      || !isInt(h.userPoints, 0, 6 * (n - 1)) || !isNum(h.prize, 0, 1e12))) e.push('Historial inválido');
  if (!Array.isArray(g.news) || g.news.length > 200 || g.news.some((x: unknown) => !isStr(x, 400))) e.push('Noticias inválidas');
  if (!Array.isArray(g.progressLog) || g.progressLog.length > 100 || g.progressLog.some((x: unknown) => !isObj(x) || !isStr(x.id, 40) || !isStr(x.name, 60) || !ROLES.includes(x.role as never) || !isInt(x.age, 15, 50) || !isNum(x.from, 0, 200) || !isNum(x.to, 0, 200))) e.push('Evolución inválida');
  checkBox(g.career, 'Estadísticas de la temporada', e); checkBox(g.allTime, 'Estadísticas históricas', e);
  checkPlayoffs(g.playoffs, n, g.round === rounds, teams, g.results as unknown[], e);
}

function validLiveMatch(input: unknown): input is MatchState {
  if (!isObj(input)) return false;
  const m = input;
  if (!isNum(m.seed) || !Array.isArray(m.teams) || m.teams.length !== 2
    || !Array.isArray(m.base) || m.base.length !== 2
    || !isPair(m.score, x => isInt(x, 0, 100)) || !isPair(m.totals, x => isInt(x, 0, 10000))
    || !isPair(m.sets, x => isInt(x, 0, 3)) || !Array.isArray(m.setScores)
    || !isInt(m.setNo, 1, 5) || (m.serving !== 0 && m.serving !== 1) || typeof m.over !== 'boolean'
    || !Array.isArray(m.stats) || m.stats.length !== 2 || !isObj(m.box) || !Array.isArray(m.log)
    || !Array.isArray(m.benches) || m.benches.length !== 2
    || !Array.isArray(m.subState) || m.subState.length !== 2) return false;
  const validPlayer = (p: unknown) => checkPlayer(p, 'Partido', []);
  for (let side = 0; side < 2; side++) {
    const t = m.teams[side], base = m.base[side], bench = m.benches[side], sub = m.subState[side], stats = m.stats[side];
    if (!isObj(t) || !isStr(t.name, 60) || !Array.isArray(t.lineup) || t.lineup.length !== 6
      || !t.lineup.every(validPlayer) || !validPlayer(t.libero) || !isNum(t.risk, 0, 100)
      || !Array.isArray(base) || base.length < 7 || base.length > MAX_ROSTER || !base.every(validPlayer)
      || !Array.isArray(bench) || bench.length > MAX_ROSTER || !bench.every(validPlayer)
      || !isObj(stats) || !['ace', 'kill', 'blk', 'err'].every(k => isInt(stats[k], 0, 1e7))
      || !isObj(sub) || !isInt(sub.count, 0, 6) || !isObj(sub.swaps)
      || !Object.entries(sub.swaps).every(([k, v]) => isStr(k, 40) && isStr(v, 40))
      || !Array.isArray(sub.replaced) || !sub.replaced.every(x => isStr(x, 40))
      || !Array.isArray(sub.usedIn) || !sub.usedIn.every(x => isStr(x, 40))) return false;
  }
  for (const s of Object.values(m.box)) {
    if (!isObj(s) || !STAT_KEYS.every(k => k === 'recQSum' ? isNum(s[k], 0, 1e7) : isInt(s[k], 0, 1e7))) return false;
  }
  if (m.log.length > 5000 || !m.log.every(x => isStr(x, 400))) return false;
  if (m.setScores.length !== (m.sets as number[])[0] + (m.sets as number[])[1]) return false;
  let winsA = 0, winsB = 0, pointsA = 0, pointsB = 0;
  for (let i = 0; i < m.setScores.length; i++) {
    const pair = m.setScores[i];
    if (!isPair(pair, x => isInt(x, 0, 200))) return false;
    const [a, b] = pair as number[], target = i === 4 ? 15 : 25;
    if (Math.max(a, b) < target || Math.abs(a - b) < 2) return false;
    if (a > b) winsA++; else winsB++;
    pointsA += a; pointsB += b;
  }
  if (winsA !== (m.sets as number[])[0] || winsB !== (m.sets as number[])[1]
    || m.setNo !== m.setScores.length + 1 && !m.over
    || (m.over && !((m.sets as number[])[0] === 3 && (m.sets as number[])[1] < 3)
      && !((m.sets as number[])[1] === 3 && (m.sets as number[])[0] < 3))
    || (!m.over && ((m.sets as number[])[0] === 3 || (m.sets as number[])[1] === 3))) return false;
  const expectedA = pointsA + (m.over ? 0 : (m.score as number[])[0]);
  const expectedB = pointsB + (m.over ? 0 : (m.score as number[])[1]);
  return (m.totals as number[])[0] === expectedA && (m.totals as number[])[1] === expectedB
    && validateMatch(m).length === 0;
}

function sessionTeamNames(game: GameState, kind: 'liga' | 'playoff'): [string, string] | null {
  if (kind === 'liga') {
    if (game.playoffs) return null;
    const fixture = game.fixtures.find(x => x.round === game.round && (x.home === game.userTeam || x.away === game.userTeam));
    if (!fixture) return null;
    return [game.teams[fixture.home]?.name, game.teams[fixture.away]?.name];
  }
  const playoffs = game.playoffs;
  if (!playoffs || playoffs.stage === 'done') return null;
  const series = playoffs.series.find(x => x.winner === undefined && (x.high === game.userTeam || x.low === game.userTeam));
  if (!series) return null;
  const home = (series.games.length + 1) % 2 === 1 ? series.high : series.low;
  const away = home === series.high ? series.low : series.high;
  return [game.teams[home]?.name, game.teams[away]?.name];
}

export interface SaveSession {
  game: GameState;
  liveMatch: MatchState | null;
  liveKind: 'liga' | 'playoff';
}

/** Serializa la partida de gestión y, si existe, el partido en curso como una única sesión recuperable. */
export function serializeSession(game: GameState, liveMatch: MatchState | null, liveKind: 'liga' | 'playoff'): string {
  const gameJson = serialize(game);
  if (liveMatch && !validLiveMatch(liveMatch)) throw new SaveError('No se puede guardar: el estado del partido en curso es inválido');
  if (liveMatch) {
    const expected = sessionTeamNames(game, liveKind);
    if (!expected || liveMatch.teams[0].name !== expected[0] || liveMatch.teams[1].name !== expected[1])
      throw new SaveError('El partido en curso no corresponde a la partida guardada');
  }
  return JSON.stringify({ format: 'volley-session-v1', game: JSON.parse(gameJson), liveMatch, liveKind });
}

/** Acepta sesiones nuevas y partidas antiguas sin partido en curso. */
export function deserializeSession(json: string): SaveSession {
  if (typeof json !== 'string' || json.length > MAX_SAVE_CHARS) throw new SaveError('El texto es demasiado grande o no es texto');
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new SaveError('El archivo no es JSON válido'); }
  if (!isObj(parsed) || parsed.format !== 'volley-session-v1') {
    return { game: deserialize(json), liveMatch: null, liveKind: 'liga' };
  }
  const game = deserialize(JSON.stringify(parsed.game));
  const liveKind = parsed.liveKind === 'playoff' ? 'playoff' : parsed.liveKind === 'liga' ? 'liga' : null;
  if (!liveKind || (parsed.liveMatch !== null && !validLiveMatch(parsed.liveMatch))) throw new SaveError('La sesión guardada contiene un partido en curso inválido');
  const liveMatch = parsed.liveMatch as MatchState | null;
  if (liveMatch) {
    const expected = sessionTeamNames(game, liveKind);
    if (!expected || liveMatch.teams[0].name !== expected[0] || liveMatch.teams[1].name !== expected[1])
      throw new SaveError('El partido guardado no corresponde a la partida o a su modalidad');
  }
  return { game, liveMatch, liveKind };
}

export function serialize(g: GameState): string {
  const errs = validateGame(g);
  if (errs.length) throw new SaveError(`No se puede guardar: ${errs[0]}`);
  return JSON.stringify(g);
}
/** Migra partidas de versiones anteriores. */
function migrate(input: GameState): GameState {
  let g = input as unknown as Record<string, unknown> & { version: number; results?: Record<string, unknown>[] };
  if (g && typeof g === 'object' && g.version === 1) g = { ...g, version: 2, finance: { budget: ECON.startBudget, ledger: [] }, market: [] };
  if (g && typeof g === 'object' && g.version === 2) g = { ...g, version: 3, season: 1, history: [], allTime: {}, results: (g.results ?? []).map(r => ({ setScores: [], ...r })) };
  if (g && typeof g === 'object' && g.version === 3) { // v4: edades (asignadas de forma determinista por jugador), noticias y evolución
    const addAge = (p: { id: string; role: Role; age?: number }) => ({ ...p, age: p.age ?? rollAge(mulberry32([...p.id].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0), p.role) });
    const gg = g as unknown as { teams: { roster: { id: string; role: Role; age?: number }[] }[]; market: { id: string; role: Role; age?: number }[] };
    g = { ...g, version: 4, news: [], progressLog: [], teams: gg.teams.map(t => ({ clubBoost: 0, ...t, roster: t.roster.map(addAge) })), market: (gg.market ?? []).map(addAge) } as unknown as typeof g;
  }
  if (g && typeof g === 'object' && g.version === 4) g = { ...g, version: 5, playoffs: null };
  return sanitize(g as unknown as GameState);
}
/** Limpieza de datos benignos de versiones anteriores: el ataque y el bloqueo del líbero (que no se usan) podían quedar negativos. */
function sanitize(g: GameState): GameState {
  const fix = (p: Player): Player => (p && typeof p === 'object' && p.role === 'L' && (p.atk < 0 || p.blk < 0) ? { ...p, atk: Math.max(0, p.atk), blk: Math.max(0, p.blk) } : p);
  if (!g || !Array.isArray(g.teams) || !Array.isArray(g.market)) return g;
  return { ...g, teams: g.teams.map(t => (t && Array.isArray(t.roster) ? { ...t, roster: t.roster.map(fix) } : t)), market: g.market.map(fix) };
}
export function deserialize(json: string): GameState {
  if (typeof json !== 'string' || json.length > MAX_SAVE_CHARS) throw new SaveError('El texto es demasiado grande o no es texto');
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { throw new SaveError('El archivo no es JSON válido'); }
  let g: GameState;
  try { g = migrate(parsed as GameState); } catch { throw new SaveError('Partida inválida: no se pudo migrar'); }
  const errs = validateGame(g);
  if (errs.length) throw new SaveError(`Partida inválida: ${errs[0]}`);
  return g;
}

/** Almacén de partidas (ranuras). Hay una versión en memoria (tests) y otra en IndexedDB (navegador). */
export interface SaveStore {
  readonly persistent: boolean;
  list(): Promise<SaveMeta[]>;
  get(slot: string): Promise<string | null>;
  put(slot: string, json: string, meta: SaveMeta): Promise<void>;
  remove(slot: string): Promise<void>;
}
export function metaOf(slot: string, g: GameState, savedAt: string): SaveMeta { return { slot, savedAt, team: g.teams[g.userTeam].name, round: g.round }; }

export function memoryStore(): SaveStore {
  const data = new Map<string, { json: string; meta: SaveMeta }>();
  return {
    persistent: false,
    async list() { return [...data.values()].map(v => v.meta).sort((a, b) => a.slot.localeCompare(b.slot)); },
    async get(slot) { return data.get(slot)?.json ?? null; },
    async put(slot, json, meta) { data.set(slot, { json, meta }); },
    async remove(slot) { data.delete(slot); },
  };
}

/** Almacén sobre IndexedDB del navegador (sin dependencias). */
export function indexedDbStore(dbName = 'volley-manager'): SaveStore {
  const open = () => new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('saves', { keyPath: 'slot' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const run = async <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const tx = db.transaction('saves', mode);
        let result: T;
        let requestDone = false;
        const request = f(tx.objectStore('saves'));
        request.onsuccess = () => { result = request.result; requestDone = true; };
        request.onerror = () => reject(request.error ?? new Error('Falló la operación de IndexedDB'));
        tx.oncomplete = () => {
          if (requestDone) resolve(result);
        };
        tx.onabort = () => reject(tx.error ?? new Error('La transacción de IndexedDB fue cancelada'));
        tx.onerror = () => reject(tx.error ?? new Error('Falló la transacción de IndexedDB'));
      });
    } finally { db.close(); }
  };
  type Row = { slot: string; json: string; meta: SaveMeta };
  return {
    persistent: true,
    async list() { const rows = await run<Row[]>('readonly', s => s.getAll() as IDBRequest<Row[]>); return rows.map(r => r.meta).sort((a, b) => a.slot.localeCompare(b.slot)); },
    async get(slot) { const r = await run<Row | undefined>('readonly', s => s.get(slot) as IDBRequest<Row | undefined>); return r?.json ?? null; },
    async put(slot, json, meta) { await run('readwrite', s => s.put({ slot, json, meta })); },
    async remove(slot) { await run('readwrite', s => s.delete(slot)); },
  };
}
