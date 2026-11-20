import type { MatchState, PStats, Player } from '../engine/types';
import { points } from '../engine/stats';
import { rollMatchInjuries } from './injuries';

export interface TeamSummary { name: string; aces: number; kills: number; blocks: number; errors: number; total: number; sets: number }
export interface Mvp { player: Player; team: string; side: 0 | 1; score: number; line: string }
export interface MatchInjury { name: string; team: string; kind: string; weeks: number }
export interface MatchSummary { teams: [TeamSummary, TeamSummary]; setScores: [number, number][]; mvp: Mvp | null; injuries: MatchInjury[] }

/**
 * Valor de la actuación de un jugador en el partido. HEURÍSTICA DE JUEGO (no una métrica oficial): puntos propios (aces, kills, bloqueos)
 * menos la mitad de los errores no forzados, menos un cuarto por cada ataque bloqueado, más un poco por asistencias y defensas.
 */
export const performance = (s: PStats): number => points(s) - 0.5 * (s.serveErr + s.atkErr + s.otherErr) - 0.25 * s.blocked + 0.2 * s.assists + 0.1 * s.digs;

export function matchSummary(m: MatchState, injuryScale = 1): MatchSummary {
  const team = (i: 0 | 1): TeamSummary => ({ name: m.teams[i].name, aces: m.stats[i].ace, kills: m.stats[i].kill, blocks: m.stats[i].blk, errors: m.stats[i].err, total: m.totals[i], sets: m.sets[i] });
  let best: Mvp | null = null;
  for (const side of [0, 1] as const) for (const p of [...m.base[side], ...m.benches[side]]) {
    const s = m.box[p.id]; if (!s) continue;
    const score = performance(s);
    if (!best || score > best.score) best = { player: p, team: m.teams[side].name, side, score, line: `${points(s)} puntos (${s.kills} ataques, ${s.aces} aces, ${s.blocks} bloqueos), ${s.digs} defensas, ${s.assists} asistencias` };
  }
  // Las lesiones del partido se sortean con la semilla del partido: las mismas que se aplican al cerrar la jornada.
  const byId = new Map(([0, 1] as const).flatMap(s => [...m.base[s], ...m.benches[s]].map(p => [p.id, { name: p.name, team: m.teams[s].name }] as const)));
  const injuries = rollMatchInjuries(m, injuryScale).map(x => ({ name: byId.get(x.id)?.name ?? x.id, team: byId.get(x.id)?.team ?? '', kind: x.kind, weeks: x.weeks }));
  return { teams: [team(0), team(1)], setScores: m.setScores, mvp: best, injuries };
}
