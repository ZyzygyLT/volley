import type { Ev, PStats } from './types';
import { P, type Params } from './params';

export const emptyP = (): PStats => ({ gp: 0, serves: 0, aces: 0, serveErr: 0, recs: 0, recPos: 0, recPerf: 0, recErr: 0, recQSum: 0, atks: 0, kills: 0, atkErr: 0, blocked: 0, blocks: 0, digs: 0, assists: 0, otherErr: 0 });

/** Recepción "positiva"/"perfecta": umbrales de calidad AJUSTADOS para reproducir los porcentajes de PlusLiga 2020-23 (46,6 % y 20,6 %). */
export function applyEvents(box: Record<string, PStats>, ev: Ev[], p: Params = P): void {
  const g = (id: string) => (box[id] ??= emptyP());
  for (const e of ev) {
    const s = g(e.p);
    if (e.k === 'serve') { s.serves++; if (e.o === 'ace') s.aces++; if (e.o === 'err') s.serveErr++; }
    else if (e.k === 'rec') { s.recs++; if (e.err) s.recErr++; else { s.recQSum += e.q; if (e.q >= p.posQ) s.recPos++; if (e.q >= p.perfQ) s.recPerf++; } }
    else if (e.k === 'atk') { s.atks++; if (e.o === 'kill') { s.kills++; if (e.ast) g(e.ast).assists++; } if (e.o === 'err') s.atkErr++; if (e.o === 'blk') s.blocked++; }
    else if (e.k === 'blk') s.blocks++;
    else if (e.k === 'dig') s.digs++;
    else if (e.k === 'oerr') s.otherErr++;
  }
}

/** Suma estadísticas de un partido a un acumulado (carrera/temporada). Función pura. */
export function mergeBox(total: Record<string, PStats>, match: Record<string, PStats>, played: string[]): Record<string, PStats> {
  const out: Record<string, PStats> = {};
  for (const [k, v] of Object.entries(total)) out[k] = { ...v };
  for (const id of played) {
    const m = match[id] ?? emptyP(); const t = (out[id] ??= emptyP());
    t.gp++;
    for (const key of Object.keys(m) as (keyof PStats)[]) if (key !== 'gp') t[key] += m[key];
  }
  return out;
}

export const pct = (a: number, b: number) => (b ? a / b : 0);
/** Eficiencia de ataque = (kills - errores - bloqueados) / intentos (definición de PlusLiga y de la fuente A). */
export const hitEff = (s: PStats) => pct(s.kills - s.atkErr - s.blocked, s.atks);
export const points = (s: PStats) => s.aces + s.kills + s.blocks;

/** Suma dos acumulados de estadísticas (por ejemplo, el histórico y la temporada actual). Función pura. */
export function addBoxes(a: Record<string, PStats>, b: Record<string, PStats>): Record<string, PStats> {
  const out: Record<string, PStats> = {};
  for (const [k, v] of Object.entries(a)) out[k] = { ...v };
  for (const [id, s] of Object.entries(b)) { const t = (out[id] ??= emptyP()); for (const key of Object.keys(s) as (keyof PStats)[]) t[key] += s[key]; }
  return out;
}
