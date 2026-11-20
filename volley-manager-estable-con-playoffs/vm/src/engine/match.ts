import type { MatchState, Player, PStats, Role, RallyResult, ServeType, Side, SubState, Team } from './types';
import { P, RATING_SD, TEAM_SD, type Params } from './params';
import { mulberry32 } from './rng';
import { playRally } from './rally';
import { applyEvents } from './stats';

/** Orden de un plantel: 6 titulares (S, OH, MB, OP, OH, MB) + líbero. Los ids siguen este orden. */
export const ROLES7: Role[] = ['S', 'OH', 'MB', 'OP', 'OH', 'MB', 'L'];

/** Devuelve el lado del equipo dentro de un partido; null si no participa. */
export function sideForTeam(match: MatchState, teamName: string): Side | null {
  if (match.teams[0].name === teamName) return 0;
  if (match.teams[1].name === teamName) return 1;
  return null;
}
export const roleOfId = (id: string): Role => ROLES7[+id.slice(1) % 7];
type Base = Omit<Player, 'id' | 'name' | 'role' | 'serveType'>;
// Valoraciones medias por rol. Las diferencias de rendimiento entre posiciones (p. ej. el ataque del central) viven en
// params.role*, ajustadas con datos; aquí la valoración es "relativa a la posición" (70 = jugador medio de su puesto).
export const PROF: Record<Role, Base> = {
  S: { srv: 65, rec: 50, set: 80, atk: 50, blk: 70, def: 70, cons: 70 },
  OH: { srv: 70, rec: 72, set: 50, atk: 70, blk: 66, def: 72, cons: 70 },
  MB: { srv: 66, rec: 50, set: 45, atk: 70, blk: 74, def: 60, cons: 70 },
  OP: { srv: 72, rec: 55, set: 45, atk: 70, blk: 68, def: 62, cons: 70 },
  L: { srv: 50, rec: 78, set: 55, atk: 30, blk: 30, def: 78, cons: 70 },
};
// Probabilidad de saque en salto potente por rol (derivada de VNL 2024 con los perfiles por tipo de la fuente A).
// Por posición del plantel (S, OH, MB, OP, OH, MB, L). Los dos centrales: uno con saque en salto y otro flotado (reparto 50 %),
// para que la composición de tipos de saque varíe poco entre equipos (la variación real entre equipos en PlusLiga es pequeña).
const JS_PROB_SLOT = [0.4, 0.95, 1, 1, 0.95, 0, 0];
const REF_TYPES: ServeType[] = ['JFS', 'JS', 'JFS', 'JS', 'JS', 'JS', 'JFS'];
export const NAMES = ['Ruiz', 'Costa', 'Vega', 'Lima', 'Soto', 'Mena', 'Paz', 'Gil', 'Roca', 'Luna', 'Vera', 'Núñez', 'Sosa', 'Ibarra',
  'Rey', 'Arce', 'Toro', 'Bravo', 'Cruz', 'Pino', 'Moya', 'Lara', 'Duarte', 'Peña', 'Ferro', 'Olmos', 'Vidal', 'Rojo'];
export const clamp = (x: number) => Math.max(30, Math.min(95, Math.round(x)));
export const gauss = (rnd: () => number) => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

/** Crea un jugador. `slot` = posición en el plantel de 7 (0 S, 1/4 OH, 2/5 MB, 3 OP, 6 L): decide el tipo de saque por defecto. */
export function makePlayer(rnd: () => number, role: Role, slot: number, id: string, name: string, boost: number, sd = RATING_SD): Player {
  const b = PROF[role], j = () => gauss(rnd) * sd;
  const u = rnd(), u2 = rnd();
  const serveType: ServeType = sd === 0 ? REF_TYPES[slot] : u < JS_PROB_SLOT[slot] ? 'JS' : u2 < 0.03 && role !== 'L' ? 'FS' : 'JFS';
  const keep = (v: number, role_ok: boolean) => (role_ok ? clamp(v) : Math.max(0, Math.round(v))); // el líbero no ataca ni bloquea: valores de relleno, nunca negativos
  return { id, name, role, serveType,
    srv: clamp(b.srv + boost + j()), rec: clamp(b.rec + boost + j()), set: clamp(b.set + boost + j()),
    atk: keep(b.atk + boost + j(), role !== 'L'), blk: keep(b.blk + boost + j(), role !== 'L'), def: clamp(b.def + boost + j()), cons: clamp(b.cons + boost + j()) };
}

export function makeSquad(rnd: () => number, boost: number, offset: number, sd = RATING_SD): Player[] {
  return ROLES7.map((role, i) => makePlayer(rnd, role, i, `p${offset + i}`, NAMES[(offset + i) % NAMES.length], boost, sd));
}

/** Dos plantillas (7 jugadores cada una; ids p0-p6 y p7-p13). */
export function makeSquads(seed: number, boostA = 2, boostB = 0, sd = RATING_SD): [Player[], Player[]] {
  const rnd = mulberry32(seed);
  return [makeSquad(rnd, boostA, 0, sd), makeSquad(rnd, boostB, 7, sd)];
}
/** Liga: equipos con fuerza ~ N(0, TEAM_SD), ajustada para reproducir la distribución de marcadores de PlusLiga. */
export function makeLeague(nTeams: number, seed: number, teamSd = TEAM_SD): Player[][] {
  const rnd = mulberry32(seed);
  return Array.from({ length: nTeams }, (_, i) => makeSquad(rnd, gauss(rnd) * teamSd, i * 7));
}

/** Quién saca primero en un set: sorteo determinista por semilla en el set 1 y en el 5; en los demás sets se alterna. */
export const firstServer = (seed: number, setNo: number): Side => {
  const coin = (k: number): Side => (mulberry32((seed ^ Math.imul(k, 0x9e3779b1)) >>> 0)() < 0.5 ? 0 : 1);
  return setNo === 5 ? coin(5) : setNo % 2 ? coin(1) : ((1 - coin(1)) as Side);
};
export const emptySub = (): SubState => ({ count: 0, swaps: {}, replaced: [], usedIn: [] });
/** Suma `x` puntos a todas las valoraciones de un jugador (el líbero no tiene ataque ni bloqueo). Devuelve copias. */
export const boostPlayers = (ps: Player[], x: number): Player[] => x === 0 ? ps : ps.map(p => ({ ...p, srv: p.srv + x, rec: p.rec + x, set: p.set + x, def: p.def + x, cons: p.cons + x,
  atk: p.role === 'L' ? p.atk : p.atk + x, blk: p.role === 'L' ? p.blk : p.blk + x }));

const emptyStats = () => ({ ace: 0, kill: 0, blk: 0, err: 0 });
export interface MatchOpts { benches?: [Player[], Player[]]; names?: [string, string]; boostA?: number; boostB?: number; sd?: number; riskB?: number; params?: Params; squads?: [Player[], Player[]] }

export function createMatch(seed: number, myRisk = 50, opts: MatchOpts = {}): MatchState {
  const [a, b] = opts.squads ?? makeSquads(seed, opts.boostA ?? 2, opts.boostB ?? 0, opts.sd ?? RATING_SD);
  const mk = (name: string, sq: Player[], risk: number): Team => ({ name, lineup: sq.slice(0, 6), libero: sq[6], risk });
  return { params: opts.params, seed, teams: [mk(opts.names?.[0] ?? 'Tu equipo', a, myRisk), mk(opts.names?.[1] ?? 'Rival', b, opts.riskB ?? 50)], base: [a, b],
    score: [0, 0], totals: [0, 0], sets: [0, 0], setScores: [], setNo: 1, serving: firstServer(seed, 1), over: false, stats: [emptyStats(), emptyStats()], box: {}, log: [],
    benches: opts.benches ?? [[], []], subState: [emptySub(), emptySub()] };
}

/** Avanza un punto. Devuelve un estado nuevo (el original no se modifica). */
export function stepPoint(prev: MatchState, onRally?: (r: RallyResult, serving: Side) => void): MatchState {
  if (prev.over) return prev;
  const s: MatchState = structuredClone(prev);
  // Una RNG por punto, derivada de semilla + nº de punto: reproducible sin guardar el estado interno.
  const n = s.score[0] + s.score[1] + (s.sets[0] + s.sets[1]) * 1000 + s.log.length * 7;
  const res = playRally(s.teams, s.serving, mulberry32((s.seed ^ Math.imul(n + 1, 0x9e3779b1)) >>> 0), s.params);
  onRally?.(res, prev.serving);
  applyEvents(s.box, res.trace.ev, s.params ?? P);
  const w = res.winner;
  if (res.stat) s.stats[res.stat.team][res.stat.key]++;
  s.score[w]++; s.totals[w]++;
  s.log.unshift(`${s.score[0]}-${s.score[1]} · ${res.text}`);
  if (w !== s.serving) { s.serving = w; const l = s.teams[w].lineup; s.teams[w].lineup = [l[5], ...l.slice(0, 5)]; }
  const target = s.setNo === 5 ? 15 : 25;
  if (s.score[w] >= target && s.score[w] - s.score[1 - w] >= 2) {
    s.sets[w]++; s.setScores.push([s.score[0], s.score[1]]);
    s.log.unshift(`— Set ${s.setNo} para ${s.teams[w].name} (${s.score[0]}-${s.score[1]}) —`);
    if (s.sets[w] === 3) s.over = true;
    else { s.setNo++; s.score = [0, 0]; s.serving = firstServer(s.seed, s.setNo); s.teams[0].lineup = s.base[0].slice(0, 6); s.teams[1].lineup = s.base[1].slice(0, 6); s.teams[0].libero = s.base[0][6]; s.teams[1].libero = s.base[1][6]; s.subState = [emptySub(), emptySub()]; }
  }
  return s;
}

export const MAX_SUBS = 6;
export interface SubOption { out: Player; inn: Player; isLibero: boolean }
/** Cambios legales ahora mismo para un equipo (reglas FIVB: 6 por set; el cambio de líbero no cuenta; un titular solo puede ser reemplazado una vez por set y vuelve a su posición original). */
export function legalSubs(s: MatchState, side: Side): SubOption[] {
  if (s.over) return [];
  const st = s.subState[side], team = s.teams[side], bench = s.benches[side], out: SubOption[] = [];
  for (const o of [...team.lineup, team.libero]) {
    if (o.role === 'L') { for (const b of bench) if (b.role === 'L') out.push({ out: o, inn: b, isLibero: true }); continue; }
    if (st.count >= MAX_SUBS) continue;
    if (o.id in st.swaps) { const back = bench.find(b => b.id === st.swaps[o.id]); if (back) out.push({ out: o, inn: back, isLibero: false }); } // el suplente solo puede ser reemplazado por el titular al que sustituyó
    else if (!st.replaced.includes(o.id)) for (const b of bench) if (b.role === o.role && !st.usedIn.includes(b.id) && !st.replaced.includes(b.id)) out.push({ out: o, inn: b, isLibero: false });
  }
  return out;
}
/** Aplica un cambio. Lanza un Error si no es legal. Devuelve un estado nuevo. */
export function substitute(prev: MatchState, side: Side, outId: string, inId: string): MatchState {
  const opt = legalSubs(prev, side).find(o => o.out.id === outId && o.inn.id === inId);
  if (!opt) throw new Error('Cambio no permitido por el reglamento');
  const s: MatchState = structuredClone(prev), team = s.teams[side], st = s.subState[side];
  const swap = (p: Player) => (p.id === outId ? opt.inn : p);
  if (opt.isLibero) team.libero = opt.inn; else team.lineup = team.lineup.map(swap);
  s.base[side] = s.base[side].map(swap);
  s.benches[side] = s.benches[side].map(b => (b.id === inId ? opt.out : b));
  if (!opt.isLibero) {
    st.count++;
    if (outId in st.swaps) delete st.swaps[outId]; // vuelve el titular
    else { st.swaps[inId] = outId; st.replaced.push(outId); st.usedIn.push(inId); }
  }
  s.log.unshift(`Cambio (${team.name}): entra ${opt.inn.name}, sale ${opt.out.name}`);
  return s;
}

export function playMatch(state: MatchState, onRally?: (r: RallyResult, serving: Side) => void): MatchState {
  let s = state; while (!s.over) s = stepPoint(s, onRally); return s;
}

export type { PStats };
