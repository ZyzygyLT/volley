import type { Player, Role } from '../engine/types';
import { makePlayer } from '../engine/match';
import { rollAge } from './ages';
import { RATING_SD } from '../engine/params';

/** Plantel de 13: 2 colocadores, 4 receptores-atacantes, 3 centrales, 2 opuestos y 2 líberos. */
export const ROSTER_SLOTS: Record<Role, number> = { S: 2, OH: 4, MB: 3, OP: 2, L: 2 };
export const ROSTER_ORDER: Role[] = ['S', 'OH', 'MB', 'OP', 'L'];
export interface Lineup { S: string; OH: [string, string]; MB: [string, string]; OP: string; L: string }

// Posición en el plantel de 7 del motor (decide el tipo de saque por defecto): 0 S, 1/4 OH, 2/5 MB, 3 OP, 6 L
export const slotOf = (role: Role, n: number): number => ({ S: 0, OH: n % 2 ? 4 : 1, MB: n % 2 ? 5 : 2, OP: 3, L: 6 }[role]);

// Nombres ficticios. Cada jugador de la liga recibe una combinación inicial + apellido única.
const FIRST = ['Juan', 'Martín', 'Lucas', 'Mateo', 'Nicolás', 'Agustín', 'Franco', 'Tomás', 'Santiago', 'Gonzalo', 'Facundo', 'Emiliano', 'Bruno', 'Ezequiel', 'Matías', 'Joaquín', 'Ramiro', 'Ignacio', 'Federico', 'Leandro'];
const LAST = ['Ruiz', 'Costa', 'Vega', 'Lima', 'Soto', 'Mena', 'Paz', 'Gil', 'Roca', 'Luna', 'Vera', 'Núñez', 'Sosa', 'Ibarra', 'Rey', 'Arce', 'Toro', 'Bravo', 'Cruz', 'Pino', 'Moya', 'Lara', 'Duarte', 'Peña', 'Ferro', 'Olmos', 'Vidal', 'Rojo',
  'Acosta', 'Benítez', 'Cabrera', 'Domínguez', 'Espinoza', 'Figueroa', 'Giménez', 'Herrera', 'Juárez', 'Molina', 'Navarro', 'Ortega', 'Paredes', 'Quiroga', 'Ramos', 'Suárez', 'Torres', 'Urquiza', 'Villalba', 'Zapata'];
export function uniqueName(rnd: () => number, used: Set<string>): string {
  for (let i = 0; i < 500; i++) {
    const n = `${FIRST[Math.floor(rnd() * FIRST.length)][0]}. ${LAST[Math.floor(rnd() * LAST.length)]}`;
    if (!used.has(n)) { used.add(n); return n; }
  }
  const n = `J. Jugador${used.size}`; used.add(n); return n;
}

export function makeRoster(rnd: () => number, boost: number, teamIdx: number, used = new Set<string>(), sd = RATING_SD): Player[] {
  const out: Player[] = [];
  for (const role of ROSTER_ORDER) for (let n = 0; n < ROSTER_SLOTS[role]; n++)
    out.push({ ...makePlayer(rnd, role, slotOf(role, n), `t${teamIdx}-${role}${n + 1}`, uniqueName(rnd, used), boost, sd), age: rollAge(rnd, role) });
  return out;
}

/** Agentes libres iniciales: un plantel entero de jugadores sueltos, de fuerza variable. */
export function makeFreeAgents(rnd: () => number, used: Set<string>, boostSd: number): Player[] {
  const out: Player[] = []; let k = 0;
  for (const role of ROSTER_ORDER) for (let n = 0; n < ROSTER_SLOTS[role]; n++, k++) {
    const boost = Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd()) * boostSd;
    out.push({ ...makePlayer(rnd, role, slotOf(role, n), `fa${k + 1}`, uniqueName(rnd, used), boost), age: rollAge(rnd, role) });
  }
  return out;
}

/** Mínimo de jugadores por posición para poder alinear un equipo. */
export const MIN_BY_ROLE: Record<Role, number> = { S: 1, OH: 2, MB: 2, OP: 1, L: 1 };
export const MAX_ROSTER = 16;

/** Valoración global de un jugador en su puesto (para ordenar y para el alineador automático). */
export function overall(p: Player): number {
  const w: Record<Role, [keyof Player, number][]> = {
    S: [['set', 3], ['srv', 1], ['blk', 1], ['def', 1], ['cons', 1]],
    OH: [['atk', 3], ['rec', 3], ['srv', 1.5], ['def', 1.5], ['blk', 1], ['cons', 1]],
    MB: [['atk', 3], ['blk', 3], ['srv', 1], ['cons', 1]],
    OP: [['atk', 4], ['srv', 2], ['blk', 1.5], ['cons', 1]],
    L: [['rec', 4], ['def', 4], ['cons', 1]],
  };
  const parts = w[p.role]; const tot = parts.reduce((s, [, x]) => s + x, 0);
  return parts.reduce((s, [k, x]) => s + (p[k] as number) * x, 0) / tot;
}

const best = (roster: Player[], role: Role, n: number, injured?: ReadonlySet<string>): string[] => {
  const pool = roster.filter(p => p.role === role).sort((a, b) => overall(b) - overall(a) || a.id.localeCompare(b.id));
  // primero los sanos; si no alcanzan, se completa con lesionados (no hay alternativa)
  return [...pool.filter(p => !injured?.has(p.id)), ...pool.filter(p => injured?.has(p.id))].slice(0, n).map(p => p.id);
};

export function autoLineup(roster: Player[], injured?: ReadonlySet<string>): Lineup {
  const oh = best(roster, 'OH', 2, injured), mb = best(roster, 'MB', 2, injured);
  return { S: best(roster, 'S', 1, injured)[0], OH: [oh[0], oh[1]], MB: [mb[0], mb[1]], OP: best(roster, 'OP', 1, injured)[0], L: best(roster, 'L', 1, injured)[0] };
}

/** Errores de una alineación (lista vacía = válida). */
export function validateLineup(roster: Player[], l: Lineup): string[] {
  const err: string[] = [], byId = new Map(roster.map(p => [p.id, p]));
  const check = (id: string, role: Role, label: string) => { const p = byId.get(id); if (!p) err.push(`${label}: jugador inexistente (${id})`); else if (p.role !== role) err.push(`${label}: ${p.name} no es ${role}`); };
  check(l.S, 'S', 'Colocador'); check(l.OH[0], 'OH', 'Receptor 1'); check(l.OH[1], 'OH', 'Receptor 2'); check(l.MB[0], 'MB', 'Central 1'); check(l.MB[1], 'MB', 'Central 2');
  check(l.OP, 'OP', 'Opuesto'); check(l.L, 'L', 'Líbero');
  if (l.OH[0] === l.OH[1]) err.push('Los dos receptores son el mismo jugador');
  if (l.MB[0] === l.MB[1]) err.push('Los dos centrales son el mismo jugador');
  return err;
}

/** Plantel de 7 en el orden que espera el motor: [S, OH, MB, OP, OH, MB, L]. */
export function lineupToSquad(roster: Player[], l: Lineup): Player[] {
  const byId = new Map(roster.map(p => [p.id, p]));
  return [l.S, l.OH[0], l.MB[0], l.OP, l.OH[1], l.MB[1], l.L].map(id => byId.get(id)!);
}
