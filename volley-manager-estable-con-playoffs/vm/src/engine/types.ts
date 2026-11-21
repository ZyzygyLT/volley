export type Role = 'S' | 'OH' | 'MB' | 'OP' | 'L';
export type Side = 0 | 1;
/** JS = saque potente en salto, JFS = saque flotado en salto, FS = saque flotado de pie (clasificación de la fuente [A]). */
export type ServeType = 'JS' | 'JFS' | 'FS';
export interface Player {
  id: string; name: string; role: Role; serveType: ServeType;
  srv: number; rec: number; set: number; atk: number; blk: number; def: number;
  cons: number; // consistencia: reduce errores no forzados (saque, ataque)
  age?: number; // solo la capa de gestión la usa (el motor del partido la ignora)
}
// lineup[0]=zona 1 (saque), [1]=z6, [2]=z5, [3]=z4, [4]=z3, [5]=z2. El líbero sustituye al central de la zaga.
export interface Team { name: string; lineup: Player[]; libero: Player; risk: number }
export interface Stats { ace: number; kill: number; blk: number; err: number }
export type AtkOut = 'kill' | 'err' | 'blk' | 'cont';
/**
 * Observación del objetivo ofensivo seleccionado por el selector heredado.
 * No representa un contacto físico de colocación ni una decisión táctica
 * calibrada del colocador.
 */
export interface SetPlayObservation {
  phase: 'k1' | 'k2';
  setterId: string;
  selectedAttackerId: string;
  selection: 'teammate-target' | 'setter-second-touch';
  source: 'legacy-weighted-target-selector';
  receptionQuality: 'perfect' | 'positive' | 'negative';
}
/** Eventos individuales de un rally: base de las estadísticas por jugador. */
export type Ev =
  | { k: 'serve'; p: string; t: ServeType; o: 'ace' | 'err' | 'in' }
  | { k: 'rec'; p: string; q: number; err?: boolean }
  | { k: 'atk'; p: string; o: AtkOut; ast?: string }
  | { k: 'blk'; p: string }
  | { k: 'dig'; p: string }
  | { k: 'oerr'; p: string }; // error de manejo (toque de red, doble, rotación…), atribuido al colocador
export interface Trace {
  serve: 'ace' | 'err' | 'in'; serveType: ServeType;
  atks: { phase: 'k1' | 'k2'; out: AtkOut; q: number; swap?: boolean }[];
  ev: Ev[];
  /** Observaciones tácticas del selector; no son contactos físicos ni eventos estadísticos. */
  setPlayObservations?: SetPlayObservation[];
}
export type RallyTermination =
  | { kind: 'fault'; responsibleTeam: Side }
  | { kind: 'winning-action'; responsibleTeam: Side };
export interface RallyResult { winner: Side; text: string; stat?: { team: Side; key: keyof Stats }; trace: Trace; termination?: RallyTermination }
/** Estadísticas individuales (acumulables entre partidos). */
export interface PStats {
  gp: number; serves: number; aces: number; serveErr: number;
  recs: number; recPos: number; recPerf: number; recErr: number; recQSum: number;
  atks: number; kills: number; atkErr: number; blocked: number;
  blocks: number; digs: number; assists: number; otherErr: number;
}
import type { Params } from './params';
export interface MatchState {
  seed: number; params?: Params; teams: [Team, Team]; base: [Player[], Player[]];
  score: [number, number]; totals: [number, number]; sets: [number, number]; setScores: [number, number][]; setNo: number;
  serving: Side; over: boolean; stats: [Stats, Stats]; box: Record<string, PStats>; log: string[];
  benches: [Player[], Player[]]; subState: [SubState, SubState]; // suplentes y control de sustituciones del set actual
  playedIds?: string[]; // suplentes que ingresaron en cualquier set; opcional para sesiones antiguas
}
/** Control de sustituciones de un equipo en el set (reglas FIVB: máx. 6; un titular solo es reemplazado una vez y vuelve a su posición). */
export interface SubState { count: number; swaps: Record<string, string>; replaced: string[]; usedIn: string[] }
