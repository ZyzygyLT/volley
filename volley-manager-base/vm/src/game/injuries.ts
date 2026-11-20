import type { MatchState, Player, Role } from '../engine/types';
import { mulberry32 } from '../engine/rng';
import type { GameState } from './season';
import { overall } from './roster';
import type { Lineup } from './roster';

// =====================================================================================================================================
// LESIONES. Origen de cada cifra:
//  [DATO] Bere T. et al. (2015), «Injury risk is low among world-class volleyball players: 4-year data from the FIVB Injury Surveillance
//         System», Br J Sports Med 49:1132-1137 (32 torneos FIVB, 440 lesiones, 143 con baja): incidencia, gravedad y localización.
//  [DATO] FIVB, informe técnico de la VNL 2025 (datos de 2024): partido masculino de 1 h 48 min 53 s y 175 rallies → 37,3 s por rally.
//  [DISEÑO] multiplicadores por posición (la fuente indica solo la dirección), semanas de la intersemana y conversión a "jornadas".
// =====================================================================================================================================
export const INJURY = {
  /** Lesiones con baja por 1000 horas-jugador en partidos de nivel senior: 4,8 (IC 95 % 3,7-5,9; 72 lesiones en 15.012 horas). */
  perThousandHours: 4.8,
  /** Segundos de reloj por rally en un partido masculino de VNL 2024 (incluye pausas): 1:48:53 / 175 rallies. */
  secondsPerRally: (1 * 3600 + 48 * 60 + 53) / 175,
  /** Rallies de un partido (VNL 2024 masculina). */
  ralliesPerMatch: 175,
  /** Lesiones con baja de entrenamiento / de partido en la misma base de datos: (143 − 97) / 97. Se aplica como proxy en la liga. */
  trainingRatio: (143 - 97) / 97,
  /** Una jornada = una semana (la PlusLiga juega semanalmente). */
  daysPerRound: 7,
  /** Jornadas que "pasan" en la intersemana para curarse [DISEÑO]. */
  offseasonRounds: 16,
};
/** Duración de las lesiones con baja (n = 143): 1-2 días 77, 3-7 días 31, 8-28 días 25, más de 4 semanas 7, 6 meses o más 3. Dentro de cada tramo, uniforme [DISEÑO]. */
export const SEVERITY: { count: number; minDays: number; maxDays: number }[] = [
  { count: 77, minDays: 1, maxDays: 2 }, { count: 31, minDays: 3, maxDays: 7 }, { count: 25, minDays: 8, maxDays: 28 },
  { count: 7, minDays: 29, maxDays: 180 }, { count: 3, minDays: 181, maxDays: 365 },
];
/** Localización (todas las lesiones, n = 438 con dato): se usa como proxy de las lesiones con baja, que la fuente no desglosa. */
export const BODY: [string, number][] = [['cara', 20], ['cabeza', 7], ['cuello', 4], ['zona alta de la espalda', 4], ['costillas', 3], ['zona lumbar', 39], ['abdomen', 6], ['pelvis', 6],
  ['hombro', 22], ['brazo', 2], ['codo', 4], ['antebrazo', 1], ['muñeca', 5], ['mano', 11], ['dedos', 47], ['cadera', 8], ['ingle', 4], ['muslo', 19], ['rodilla', 67], ['pierna', 20],
  ['tendón de Aquiles', 8], ['tobillo', 114], ['pie', 17]];
/** La fuente indica más lesiones en los centrales y menos en los líberos; las magnitudes son de diseño y promedian 1 con la exposición real (2 OH + 1 central + S + OP + L). */
export const POSITION_MULT: Record<Role, number> = { S: 1, OH: 1, MB: 1.5, OP: 1, L: 0.5 };

export interface Injury { kind: string; weeks: number; total: number; season: number; round: number; where: 'partido' | 'entrenamiento' }
export type Injuries = Record<string, Injury>;
export interface NewInjury { id: string; side: 0 | 1; kind: string; days: number; weeks: number; where: Injury['where'] }

const pickWeighted = <T,>(items: [T, number][], rnd: () => number): T => { let r = rnd() * items.reduce((s, x) => s + x[1], 0); for (const [v, w] of items) { r -= w; if (r <= 0) return v; } return items[0][0]; };

/** Sortea la gravedad y la zona de una lesión con baja. `weeks` = jornadas que se pierde (esperanza = días / 7). */
export function sampleInjury(rnd: () => number): { kind: string; days: number; weeks: number } {
  const sev = pickWeighted(SEVERITY.map(s => [s, s.count] as [typeof SEVERITY[number], number]), rnd);
  const days = sev.minDays + Math.floor(rnd() * (sev.maxDays - sev.minDays + 1));
  const weeks = Math.floor(days / INJURY.daysPerRound) + (rnd() < (days % INJURY.daysPerRound) / INJURY.daysPerRound ? 1 : 0);
  return { kind: pickWeighted(BODY, rnd), days, weeks };
}
/** Probabilidad de lesión con baja de un jugador con `hours` horas de exposición. */
export const injuryProb = (role: Role, hours: number, scale = 1): number => 1 - Math.exp(-(INJURY.perThousandHours / 1000) * POSITION_MULT[role] * hours * scale);
export const hoursOf = (rallies: number): number => (rallies * INJURY.secondsPerRally) / 3600;

/** Todas las lesiones con baja sorteadas en un partido (incluso las que no hacen perder ninguna jornada). Determinista por la semilla del partido. */
/** `scale` multiplica la frecuencia (1 = datos reales de la FIVB; 0 = sin lesiones). */
export function rollMatchInjuriesRaw(m: MatchState, scale = 1): NewInjury[] {
  const rnd = mulberry32((m.seed ^ 0x1a2b3c4d) >>> 0), role = new Map<string, Role>(), side = new Map<string, 0 | 1>();
  for (const s of [0, 1] as const) for (const p of [...m.base[s], ...m.benches[s]]) { role.set(p.id, p.role); side.set(p.id, s); }
  const out: NewInjury[] = [];
  for (const id of Object.keys(m.onCourt).sort()) {
    if (rnd() < injuryProb(role.get(id) ?? 'OH', hoursOf(m.onCourt[id]), scale)) { const x = sampleInjury(rnd); out.push({ id, side: side.get(id) ?? 0, kind: x.kind, days: x.days, weeks: x.weeks, where: 'partido' }); }
  }
  return out;
}
/** Lesiones de un partido que hacen perder al menos una jornada. */
export const rollMatchInjuries = (m: MatchState, scale = 1): NewInjury[] => rollMatchInjuriesRaw(m, scale).filter(x => x.weeks >= 1);

/** Lesiones de entrenamiento de un equipo en una jornada: esperanza = proporción de entrenamiento × lesiones de un partido, repartida entre su plantel sano según la posición. */
export function rollTrainingInjuries(roster: Player[], injured: ReadonlySet<string>, seed: number, scale = 1): NewInjury[] {
  const rnd = mulberry32(seed >>> 0), healthy = roster.filter(p => !injured.has(p.id)), total = healthy.reduce((s, p) => s + POSITION_MULT[p.role], 0);
  const expected = INJURY.trainingRatio * 6 * hoursOf(INJURY.ralliesPerMatch) * (INJURY.perThousandHours / 1000) * scale;
  const out: NewInjury[] = [];
  for (const p of healthy) if (rnd() < expected * POSITION_MULT[p.role] / total) { const x = sampleInjury(rnd); if (x.weeks >= 1) out.push({ id: p.id, side: 0, kind: x.kind, days: x.days, weeks: x.weeks, where: 'entrenamiento' }); }
  return out;
}

export const injuredSet = (g: Pick<GameState, 'injuries'>): Set<string> => new Set(Object.keys(g.injuries));
/** Una jornada de recuperación para todos. */
export function tickInjuries(inj: Injuries, rounds = 1): Injuries {
  const out: Injuries = {};
  for (const [id, x] of Object.entries(inj)) if (x.weeks - rounds >= 1) out[id] = { ...x, weeks: x.weeks - rounds };
  return out;
}
/** Reemplaza a los titulares lesionados por el mejor sano de su posición (si no hay uno sano, se mantiene). Devuelve el mismo objeto si no cambia nada. */
export function repairLineup(roster: Player[], lineup: Lineup, injured: ReadonlySet<string>): Lineup {
  const taken = new Set([lineup.S, ...lineup.OH, ...lineup.MB, lineup.OP, lineup.L]);
  const swap = (id: string, role: Role): string => {
    if (!injured.has(id)) return id;
    const cand = roster.filter(p => p.role === role && !injured.has(p.id) && !taken.has(p.id)).sort((a, b) => overall(b) - overall(a) || a.id.localeCompare(b.id))[0];
    if (!cand) return id; taken.add(cand.id); return cand.id;
  };
  const next: Lineup = { S: swap(lineup.S, 'S'), OH: [swap(lineup.OH[0], 'OH'), swap(lineup.OH[1], 'OH')], MB: [swap(lineup.MB[0], 'MB'), swap(lineup.MB[1], 'MB')], OP: swap(lineup.OP, 'OP'), L: swap(lineup.L, 'L') };
  const same = next.S === lineup.S && next.OP === lineup.OP && next.L === lineup.L && next.OH.every((x, i) => x === lineup.OH[i]) && next.MB.every((x, i) => x === lineup.MB[i]);
  return same ? lineup : next;
}
/** Titulares lesionados que SÍ tienen un reemplazo sano en el plantel (si no lo tienen, juegan lesionados). */
export function lineupInjuryErrors(roster: Player[], lineup: Lineup, injured: ReadonlySet<string>): string[] {
  const byId = new Map(roster.map(p => [p.id, p])), out: string[] = [];
  for (const id of [lineup.S, ...lineup.OH, ...lineup.MB, lineup.OP, lineup.L]) {
    const p = byId.get(id); if (!p || !injured.has(id)) continue;
    if (roster.some(q => q.role === p.role && !injured.has(q.id) && ![lineup.S, ...lineup.OH, ...lineup.MB, lineup.OP, lineup.L].includes(q.id))) out.push(`${p.name} está lesionado`);
  }
  return out;
}
