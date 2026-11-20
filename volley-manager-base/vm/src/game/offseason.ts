import type { Player, Role } from '../engine/types';
import { makePlayer, gauss, clamp } from '../engine/match';
import { rollYouthAge, retireProb } from './ages';
import { TEAM_SD } from '../engine/params';
import { ECON, marketValue } from './economy';
import { MAX_ROSTER, MIN_BY_ROLE, ROSTER_SLOTS, ROSTER_ORDER, autoLineup, overall, slotOf, uniqueName, validateLineup } from './roster';
import type { GameState } from './season';

// ============== PROGRESIÓN [DISEÑO informado por literatura y datos; magnitudes sin respaldo directo] ==============
// Forma: la literatura sitúa el pico del voleibol en 22-26 años (más tarde en colocadores y líberos); en VNL 2024 los jugadores de más
// edad reciben mejor (+0,28 pp por año) y sacan con menos errores (−0,30 pp por año), con efectos pequeños en ataque (±1-2 pp).
// Por eso: las habilidades "físicas" declinan antes que las "técnicas". Los valores por año son de diseño.
export const PROG = {
  shift: { S: 2, L: 2, OH: 0, MB: 0, OP: 0 } as Record<Role, number>,       // pico más tarde en colocadores y líberos
  physical: (e: number) => (e <= 21 ? 2.0 : e <= 24 ? 1.0 : e <= 29 ? 0 : e <= 33 ? -0.8 : -1.6),
  technical: (e: number) => (e <= 21 ? 2.5 : e <= 25 ? 1.5 : e <= 29 ? 0.3 : e <= 34 ? -0.2 : -1.0),
  noisePhysical: 1.5, noiseTechnical: 1.2,
  reversion: 0.06,                                                             // regresión a la media por año (fracción de la distancia a 70) [DISEÑO, ajustado: sin ella los jugadores de 80 o más pasaban de 10 a 18 en 30 temporadas]
  youthBoost: -7,                                                              // los jóvenes entran con menos valoración (ajustado para mantener estable el nivel de la liga)
};
/** Comportamiento de los equipos de la computadora [DISEÑO, ajustado para que el nivel y la paridad de la liga se mantengan estables en 30 temporadas]. */
export const AI_CFG = { gain: 5, maxUpgrades: 2, clubFactor: 1.2 }; // clubFactor: parte de la fuerza propia del club que heredan los jóvenes de su cantera
type Skill = 'srv' | 'rec' | 'set' | 'atk' | 'blk' | 'def' | 'cons';
const PHYSICAL: Skill[] = ['srv', 'atk', 'blk'], TECHNICAL: Skill[] = ['rec', 'set', 'def', 'cons'];
export const expectedDelta = (age: number, role: Role, kind: 'physical' | 'technical'): number => PROG[kind](age - PROG.shift[role]);

/** Un año de evolución: suma la tendencia por edad más una variación individual. El líbero no tiene ataque ni bloqueo. */
export function progressPlayer(p: Player, rnd: () => number): Player {
  const age = p.age ?? 27, out: Player = { ...p, age: age + 1 };
  const skip = (s: Skill) => p.role === 'L' && (s === 'atk' || s === 'blk');
  for (const s of PHYSICAL) if (!skip(s)) out[s] = clamp(p[s] + expectedDelta(age, p.role, 'physical') - PROG.reversion * (p[s] - 70) + gauss(rnd) * PROG.noisePhysical);
  for (const s of TECHNICAL) out[s] = clamp(p[s] + expectedDelta(age, p.role, 'technical') - PROG.reversion * (p[s] - 70) + gauss(rnd) * PROG.noiseTechnical);
  return out;
}

export interface ProgressEntry { id: string; name: string; role: Role; age: number; from: number; to: number }

// ============== CANTERA Y JÓVENES ==============
function youth(rnd: () => number, role: Role, id: string, used: Set<string>, extraBoost = 0): Player {
  const p = makePlayer(rnd, role, slotOf(role, 0), id, uniqueName(rnd, used), PROG.youthBoost + gauss(rnd) * TEAM_SD * 0.5 + extraBoost);
  return { ...p, age: rollYouthAge(rnd) };
}

const count = (r: Player[], role: Role) => r.filter(p => p.role === role).length;
const sortDesc = (ps: Player[]) => [...ps].sort((a, b) => overall(b) - overall(a) || a.id.localeCompare(b.id));
const STARTERS: Record<Role, number> = { S: 1, OH: 2, MB: 2, OP: 1, L: 1 };

export interface OffseasonResult { g: GameState; news: string[]; progress: ProgressEntry[] }

/**
 * Ventana de fichajes y evolución entre temporadas (se ejecuta al cerrar la temporada, DESPUÉS de que el usuario haya podido operar):
 * 1) todos suman un año y evolucionan; 2) los mayores se retiran según el riesgo por edad; 3) los equipos de la computadora cubren
 *    necesidades y mejoran su plantel con agentes libres dentro de su presupuesto (los peor clasificados eligen primero);
 * 4) cualquier equipo que quede por debajo del mínimo por posición recibe un joven de la cantera; 5) llegan jóvenes nuevos al mercado.
 * Función pura: devuelve un estado nuevo, las noticias y la evolución del plantel del usuario.
 */
export function runOffseason(g0: GameState, rnd: () => number, rankOf: Map<number, number>): OffseasonResult {
  const news: string[] = []; let g = g0;
  const season = g.season; // temporada que acaba de terminar
  // 1) evolución y 2) retiros
  const progress: ProgressEntry[] = [];
  const evolve = (ps: Player[], isUser: boolean, teamName?: string): Player[] => ps.flatMap(p => {
    const q = progressPlayer(p, rnd);
    if (rnd() < retireProb(q.age!)) { if (isUser) news.push(`Se retira ${p.name} (${p.role}, ${q.age} años)`); else if (overall(p) >= 72) news.push(`Se retira ${p.name} (${teamName ?? 'agente libre'}, ${q.age} años)`); return []; }
    if (isUser) progress.push({ id: p.id, name: p.name, role: p.role, age: q.age!, from: Math.round(overall(p)), to: Math.round(overall(q)) });
    return [q];
  });
  let market = evolve(g.market, false);
  let teams = g.teams.map(t => ({ ...t, roster: evolve(t.roster, t.id === g.userTeam, t.name) }));
  const used = new Set([...teams.flatMap(t => t.roster), ...market].map(p => p.name));
  let cant = 0;
  const cantera = (teamId: number, role: Role): Player => youth(rnd, role, `c${season + 1}-${teamId}-${++cant}`, used, (g.teams.find(t => t.id === teamId)?.clubBoost ?? 0) * AI_CFG.clubFactor);

  // 3) computadoras: primero necesidades, luego mejoras (los peor clasificados eligen primero)
  const order = teams.filter(t => t.id !== g.userTeam).sort((a, b) => (rankOf.get(b.id) ?? 0) - (rankOf.get(a.id) ?? 0));
  for (const ai of order) {
    let budget = ECON.aiTransferBudget + (ECON.prizeByRank[Math.min((rankOf.get(ai.id) ?? 8) - 1, ECON.prizeByRank.length - 1)] ?? 0);
    let roster = [...ai.roster];
    const buy = (p: Player, why: string) => { budget -= marketValue(p); market = market.filter(x => x.id !== p.id); roster.push(p); if (overall(p) >= 72) news.push(`${ai.name} ficha a ${p.name} (${p.role}, ${Math.round(overall(p))}) ${why}`); };
    for (const role of ROSTER_ORDER) while (count(roster, role) < ROSTER_SLOTS[role]) { // necesidades
      const cand = sortDesc(market.filter(p => p.role === role && marketValue(p) <= budget))[0];
      if (cand) buy(cand, 'para cubrir una baja'); else break;
    }
    for (let k = 0; k < AI_CFG.maxUpgrades; k++) { // mejoras: mejor candidato que supere al peor titular de su posición por al menos AI_CFG.gain puntos
      let best: { p: Player; gain: number } | null = null;
      for (const role of ROSTER_ORDER) {
        const mine = sortDesc(roster.filter(p => p.role === role)), cut = mine[STARTERS[role] - 1];
        if (!cut) continue;
        for (const p of market) if (p.role === role && marketValue(p) <= budget && overall(p) >= overall(cut) + AI_CFG.gain && (!best || overall(p) - overall(cut) > best.gain)) best = { p, gain: overall(p) - overall(cut) };
      }
      if (!best) break;
      buy(best.p, 'para mejorar el equipo');
      const same = sortDesc(roster.filter(p => p.role === best!.p.role));
      if (same.length > ROSTER_SLOTS[best.p.role] || roster.length > MAX_ROSTER) { const out = same[same.length - 1]; roster = roster.filter(p => p.id !== out.id); market.push(out); }
    }
    teams = teams.map(t => (t.id === ai.id ? { ...t, roster } : t));
  }
  // 4) cantera: mínimos por posición (usuario) y planteles completos (computadoras)
  teams = teams.map(t => {
    const roster = [...t.roster], target = t.id === g.userTeam ? MIN_BY_ROLE : ROSTER_SLOTS;
    for (const role of ROSTER_ORDER) while (count(roster, role) < target[role]) { const y = cantera(t.id, role); roster.push(y); if (t.id === g.userTeam) news.push(`Llega ${y.name} (${role}, ${y.age} años) desde la cantera para cubrir una baja`); }
    const lineup = validateLineup(roster, t.lineup).length ? autoLineup(roster) : t.lineup;
    if (t.id === g.userTeam && lineup !== t.lineup) news.push('Tu alineación se ajustó automáticamente por las bajas');
    return { ...t, roster, lineup };
  });
  // 5) jóvenes nuevos en el mercado y tope del mercado
  const roles: Role[] = []; while (roles.length < ECON.newAgentsPerSeason) roles.push(...ROSTER_ORDER);
  roles.slice(0, ECON.newAgentsPerSeason).forEach((role, k) => market.push(youth(rnd, role, `fa${season + 1}-${k + 1}`, used)));
  market = sortDesc(market).slice(0, ECON.maxMarket);
  return { g: { ...g, teams, market }, news, progress };
}
