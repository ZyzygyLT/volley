import type { GameState } from './season';
import { GAME_VERSION } from './season';
import { validateLineup, MIN_BY_ROLE, MAX_ROSTER, type Lineup } from './roster';
import { emptyP } from '../engine/stats';
import { roundRobin } from './season';
import { ECON } from './economy';
import type { Player, Role } from '../engine/types';
import { rollAge } from './ages';
import { mulberry32 } from '../engine/rng';

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
  if (!isStr(p.id, 40) || !isStr(p.name, 60)) { e.push(`${where}: id o nombre inválido`); return false; }
  if (!ROLES.includes(p.role as never) || !SERVES.includes(p.serveType as never)) { e.push(`${where}: posición o tipo de saque inválido (${p.id})`); return false; }
  for (const k of ['srv', 'rec', 'set', 'atk', 'blk', 'def', 'cons']) if (!isNum(p[k], 0, 120)) { e.push(`${where}: ${p.id} tiene ${k} inválido`); return false; }
  if (p.age !== undefined && !isInt(p.age, 15, 50)) { e.push(`${where}: edad inválida (${p.id})`); return false; }
  return true;
}
function checkBox(b: unknown, where: string, e: string[]): void {
  if (!isObj(b)) { e.push(`${where}: estadísticas inválidas`); return; }
  for (const [id, s] of Object.entries(b)) {
    if (!isObj(s)) { e.push(`${where}: estadísticas inválidas de ${id}`); return; }
    // contadores enteros (la suma de calidades de recepción puede ser decimal); tope de 10 millones: muy por encima de lo real y sin riesgo de desbordar al seguir jugando
    for (const k of STAT_KEYS) if (!(k === 'recQSum' ? isNum(s[k], 0, 1e7) : isInt(s[k], 0, 1e7))) { e.push(`${where}: ${id}.${k} inválido`); return; }
  }
}

function checkPlayoffs(p: unknown, n: number, regularOver: boolean, e: string[]): void {
  if (p === null) return;
  if (!isObj(p) || !['semi', 'final', 'done'].includes(p.stage as string) || !Array.isArray(p.series)) { e.push('Playoffs inválidos'); return; }
  if (!regularOver) { e.push('Playoffs antes de terminar la fase regular'); return; }
  const want = p.stage === 'semi' ? 2 : 4;
  if (p.series.length !== want) { e.push('Playoffs: cantidad de series inválida'); return; }
  const ids = ['SF1', 'SF2', 'F', 'B'];
  p.series.forEach((s: unknown, i: number) => {
    const ok = isObj(s) && s.id === ids[i] && isInt(s.high, 0, n - 1) && isInt(s.low, 0, n - 1) && s.high !== s.low && (s.bestOf === 3 || s.bestOf === 5) && Array.isArray(s.games) && s.games.length <= (s.bestOf as number)
      && (s.winner === undefined || s.winner === s.high || s.winner === s.low)
      && (s.games as unknown[]).every((x, k) => isObj(x) && x.game === k + 1 && isInt(x.home, 0, n - 1) && isInt(x.away, 0, n - 1) && x.home !== x.away && isPair(x.sets, y => isInt(y, 0, 3)) && Math.max(...(x.sets as number[])) === 3
        && Array.isArray(x.setScores) && (x.setScores as unknown[]).every(z => isPair(z, y => isInt(y, 0, 200))) && isPair(x.totals, y => isInt(y, 0, 500)) && isNum(x.seed));
    if (!ok) e.push(`Playoffs: serie ${ids[i]} inválida`);
  });
  if (p.stage === 'done') {
    const r = p.ranking;
    if (!Array.isArray(r) || r.length !== n || new Set(r).size !== n || r.some((t: unknown) => !isInt(t, 0, n - 1)) || p.champion !== r[0]) e.push('Playoffs: ranking final inválido');
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
  const teams = g.teams;
  if (!Array.isArray(teams) || teams.length < 2 || teams.length > 32 || teams.length % 2) { e.push('Equipos inválidos'); return; }
  const n = teams.length, seen = new Set<string>();
  teams.forEach((t: unknown, i) => {
    const w = `Equipo ${i}`;
    if (!isObj(t) || t.id !== i || !isStr(t.name, 60) || !isNum(t.risk, 0, 100) || !isNum(t.clubBoost, -50, 50)) { e.push(`${w}: datos inválidos`); return; }
    const roster = t.roster;
    if (!Array.isArray(roster) || roster.length < 7 || roster.length > MAX_ROSTER) { e.push(`${w}: el plantel debe tener entre 7 y ${MAX_ROSTER} jugadores`); return; }
    let ok = true; for (const p of roster) { if (!checkPlayer(p, w, e)) { ok = false; break; } if (seen.has((p as Player).id)) { e.push(`${w}: id repetido ${(p as Player).id}`); ok = false; break; } seen.add((p as Player).id); }
    if (!ok) return;
    for (const role of Object.keys(MIN_BY_ROLE) as Role[]) if ((roster as Player[]).filter(p => p.role === role).length < MIN_BY_ROLE[role]) { e.push(`${w}: faltan jugadores de la posición ${role}`); ok = false; }
    const l = t.lineup;
    if (!isObj(l) || !isStr(l.S, 40) || !isStr(l.OP, 40) || !isStr(l.L, 40) || !isPair(l.OH, x => isStr(x, 40)) || !isPair(l.MB, x => isStr(x, 40))) { e.push(`${w}: alineación inválida`); ok = false; }
    else e.push(...validateLineup(roster as Player[], l as unknown as Lineup).map(m => `${w}: ${m}`));
  });
  if (!isInt(g.userTeam, 0, n - 1)) e.push('Equipo del usuario inválido');
  if (!Array.isArray(g.market) || g.market.length > 80) e.push('Mercado inválido');
  else for (const p of g.market) { if (!checkPlayer(p, 'Mercado', e)) break; if (seen.has((p as Player).id)) { e.push(`Mercado: id repetido ${(p as Player).id}`); break; } seen.add((p as Player).id); }
  // calendario: debe ser exactamente la doble vuelta estándar de ese número de equipos
  const fx = roundRobin(n), rounds = 2 * (n - 1);
  if (!Array.isArray(g.fixtures) || g.fixtures.length !== fx.length || g.fixtures.some((f: unknown, i: number) => !isObj(f) || f.round !== fx[i].round || f.home !== fx[i].home || f.away !== fx[i].away)) e.push('Calendario inválido');
  if (!isInt(g.round, 0, rounds)) e.push('Jornada inválida');
  if (!Array.isArray(g.results) || g.results.length > fx.length) e.push('Resultados inválidos');
  else for (const r of g.results as unknown[]) {
    const ok = isObj(r) && isInt(r.round, 0, rounds - 1) && isInt(r.home, 0, n - 1) && isInt(r.away, 0, n - 1) && r.home !== r.away && isPair(r.sets, x => isInt(x, 0, 3))
      && Math.max(...(r.sets as number[])) === 3 && Math.min(...(r.sets as number[])) < 3 && isPair(r.points, x => isInt(x, 0, 3)) && isPair(r.totals, x => isInt(x, 0, 500)) && isNum(r.seed)
      && Array.isArray(r.setScores) && (r.setScores.length === 0 || r.setScores.length === (r.sets as number[])[0] + (r.sets as number[])[1]) && r.setScores.every((s: unknown) => isPair(s, x => isInt(x, 0, 200)));
    if (!ok) { e.push('Resultado inválido'); break; }
  }
  if (!(isInt(g.season, 1, 1000))) e.push('Temporada inválida');
  if (!isObj(g.finance) || !isNum(g.finance.budget, -1e12, 1e12) || !Array.isArray(g.finance.ledger) || g.finance.ledger.length > 100
    || g.finance.ledger.some((x: unknown) => !isObj(x) || !isInt(x.round, -1, 100) || !isStr(x.concept, 120) || !isNum(x.amount, -1e12, 1e12) || (x.season !== undefined && !isInt(x.season, 1, 1000)))) e.push('Finanzas inválidas');
  if (!Array.isArray(g.history) || g.history.length > 1000 || g.history.some((h: unknown) => !isObj(h) || !isInt(h.season, 1, 1000) || !isStr(h.champion, 60) || !isInt(h.userRank, 1, 32) || !isInt(h.userPoints, 0, 1000) || !isNum(h.prize, 0, 1e12))) e.push('Historial inválido');
  if (!Array.isArray(g.news) || g.news.length > 200 || g.news.some((x: unknown) => !isStr(x, 400))) e.push('Noticias inválidas');
  if (!Array.isArray(g.progressLog) || g.progressLog.length > 100 || g.progressLog.some((x: unknown) => !isObj(x) || !isStr(x.id, 40) || !isStr(x.name, 60) || !ROLES.includes(x.role as never) || !isInt(x.age, 15, 50) || !isNum(x.from, 0, 200) || !isNum(x.to, 0, 200))) e.push('Evolución inválida');
  checkBox(g.career, 'Estadísticas de la temporada', e); checkBox(g.allTime, 'Estadísticas históricas', e);
  checkPlayoffs(g.playoffs, n, g.round === rounds, e);
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
  list(): Promise<SaveMeta[]>;
  get(slot: string): Promise<string | null>;
  put(slot: string, json: string, meta: SaveMeta): Promise<void>;
  remove(slot: string): Promise<void>;
}
export function metaOf(slot: string, g: GameState, savedAt: string): SaveMeta { return { slot, savedAt, team: g.teams[g.userTeam].name, round: g.round }; }

export function memoryStore(): SaveStore {
  const data = new Map<string, { json: string; meta: SaveMeta }>();
  return {
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
      return await new Promise<T>((resolve, reject) => { const r = f(db.transaction('saves', mode).objectStore('saves')); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
    } finally { db.close(); }
  };
  type Row = { slot: string; json: string; meta: SaveMeta };
  return {
    async list() { const rows = await run<Row[]>('readonly', s => s.getAll() as IDBRequest<Row[]>); return rows.map(r => r.meta).sort((a, b) => a.slot.localeCompare(b.slot)); },
    async get(slot) { const r = await run<Row | undefined>('readonly', s => s.get(slot) as IDBRequest<Row | undefined>); return r?.json ?? null; },
    async put(slot, json, meta) { await run('readwrite', s => s.put({ slot, json, meta })); },
    async remove(slot) { await run('readwrite', s => s.delete(slot)); },
  };
}
