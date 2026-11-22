import { describe, it, expect } from 'vitest';
import { newGame, endSeason, roundRobin, fixtureSeed } from './season';
import { simulateSeason } from './playoffs';
import { validateLineup, MIN_BY_ROLE, ROSTER_SLOTS, MAX_ROSTER, lineupToSquad, overall } from './roster';
import { ECON } from './economy';
import { AGE, retireProb } from './ages';
import { makeYouth, progressPlayer, seasonalAgentRoles } from './offseason';
import { mulberry32 } from '../engine/rng';
import { deserialize, serialize } from './save';
describe('semillas de fixtures', () => {
  it('asigna semillas distintas a todos los partidos admitidos, incluidos los de ligas de 32 equipos', () => {
    for (const nTeams of [8, 16, 32]) {
      const game = newGame(0x1234abcd, 0, nTeams);
      const seeds = game.fixtures.map(fixture => fixtureSeed(game, fixture));
      expect(seeds.every(seed => Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff)).toBe(true);
      expect(new Set(seeds).size).toBe(game.fixtures.length);
      expect(game.fixtures).toEqual(roundRobin(nTeams));
    }
  });
});
const playSeason = (seed: number) => simulateSeason(newGame(seed));
const playSeasonFrom = (game: ReturnType<typeof newGame>) => simulateSeason(game);
describe('distribución de agentes libres por temporada', () => {
  it('rota el rol adicional y equilibra las altas en ciclos de cinco temporadas', () => {
    const roles = Array.from({ length: 5 }, (_, i) => seasonalAgentRoles(i + 1, 6)).flat();
    for (const role of ['S', 'OH', 'MB', 'OP', 'L'] as const) {
      expect(roles.filter(x => x === role)).toHaveLength(6);
    }
  });
});

describe('perfiles de saque de la cantera', () => {
  it('alterna las plazas de central y conserva el perfil flotado en el segundo puesto', () => {
    const jump = makeYouth(mulberry32(101), 'MB', 'y-mb-1', new Set(), 0, 0);
    const floating = makeYouth(mulberry32(102), 'MB', 'y-mb-2', new Set(), 0, 1);
    expect(jump.serveType).toBe('JS');
    expect(floating.serveType).not.toBe('JS');
    expect(floating.serveType === 'JFS' || floating.serveType === 'FS').toBe(true);
  });
});

describe('edades, progresión, retiros y fichajes de la computadora', () => {
  it('las edades iniciales siguen la distribución por posición de VNL y están entre 18 y 40', () => {
    const by: Record<string, number[]> = {};
    for (let s = 1; s <= 40; s++) for (const t of newGame(s * 17).teams) for (const p of t.roster) { expect(p.age).toBeGreaterThanOrEqual(18); expect(p.age).toBeLessThanOrEqual(40); (by[p.role] ??= []).push(p.age!); }
    for (const [role, ages] of Object.entries(by)) { const m = ages.reduce((a, b) => a + b, 0) / ages.length; expect(Math.abs(m - AGE[role as keyof typeof AGE].mean), role).toBeLessThan(0.8); }
  });
  it('el riesgo de retiro crece con la edad y es 1 desde los 41', () => {
    let prev = 0; for (let a = 20; a <= 40; a++) { expect(retireProb(a)).toBeGreaterThanOrEqual(prev); prev = retireProb(a); }
    expect(retireProb(41)).toBe(1); expect(retireProb(25)).toBeLessThan(0.02); expect(retireProb(35)).toBeGreaterThan(0.15);
  });
  it('la progresión sigue la curva de edad: los jóvenes mejoran y los veteranos pierden, más en lo físico', () => {
    const rnd = mulberry32(3), base = newGame(1).teams[0].roster.find(p => p.role === 'OH')!;
    const avgDelta = (age: number, keys: readonly ('atk' | 'srv' | 'blk' | 'rec' | 'def')[]) => { let s = 0; const N = 3000;
      for (let i = 0; i < N; i++) { const q = progressPlayer({ ...base, age, atk: 70, srv: 70, blk: 70, rec: 70, def: 70 }, rnd); s += keys.reduce((a, k) => a + (q[k] - 70), 0) / keys.length; } return s / N; };
    const phys = ['atk', 'srv', 'blk'] as const, tech = ['rec', 'def'] as const;
    expect(avgDelta(20, phys)).toBeGreaterThan(1.5); expect(Math.abs(avgDelta(27, phys))).toBeLessThan(0.25); expect(avgDelta(32, phys)).toBeLessThan(-0.4);
    expect(avgDelta(36, phys)).toBeLessThan(avgDelta(36, tech)); expect(avgDelta(36, phys)).toBeLessThan(-1);
  });
  it('la progresión respeta los límites, suma un año y no toca el ataque ni el bloqueo del líbero', () => {
    const rnd = mulberry32(8), lib = newGame(2).teams[0].roster.find(p => p.role === 'L')!;
    for (let i = 0; i < 300; i++) { const q = progressPlayer({ ...lib, age: 19 + (i % 20), srv: 95, rec: 31, def: 94 }, rnd);
      for (const k of ['srv', 'rec', 'def', 'set', 'cons'] as const) { expect(q[k]).toBeGreaterThanOrEqual(30); expect(q[k]).toBeLessThanOrEqual(95); } expect(q.atk).toBe(lib.atk); expect(q.blk).toBe(lib.blk); }
    expect(progressPlayer(lib, rnd).age).toBe(lib.age! + 1);
  });
  it('tras la intersemana los planteles son válidos: computadoras completas, usuario con los mínimos, sin ids ni nombres repetidos', () => {
    let g = newGame(21); for (let s = 0; s < 6; s++) { g = simulateSeason(g); g = endSeason(g);
      const all = [...g.teams.flatMap(t => t.roster), ...g.market]; expect(new Set(all.map(p => p.id)).size).toBe(all.length); expect(new Set(all.map(p => p.name)).size).toBe(all.length);
      for (const t of g.teams) { expect(validateLineup(t.roster, t.lineup)).toEqual([]); for (const r of ['S', 'OH', 'MB', 'OP', 'L'] as const) expect(t.roster.filter(p => p.role === r).length).toBeGreaterThanOrEqual(t.id === g.userTeam ? MIN_BY_ROLE[r] : ROSTER_SLOTS[r]); expect(t.roster.length).toBeLessThanOrEqual(MAX_ROSTER); }
      expect(g.market.length).toBeLessThanOrEqual(ECON.maxMarket); }
  });
  it('no elimina agentes existentes al completar el mercado durante la intersemana', () => {
    const base = playSeason(92);
    const market = Array.from({ length: ECON.maxMarket }, (_, i) => ({
      ...base.market[i % base.market.length], id: `preserve-${i}`, name: `Agente preservado ${i}`,
      srv: 95, rec: 95, set: 95, atk: 95, blk: 95, def: 95, cons: 95, age: 20,
    }));
    const full = { ...base, market };
    const next = endSeason(full);
    expect(next.market).toHaveLength(ECON.maxMarket);
    expect(next.market.map(p => p.id)).toEqual(market.map(p => p.id));
  });
  it('el usuario ve la evolución de su plantel y las noticias, y todo se guarda', () => {
    const g = endSeason(playSeason(30)); expect(g.progressLog.length).toBeGreaterThan(5); expect(g.news.length).toBeGreaterThan(0);
    for (const e of g.progressLog) { const p = g.teams[g.userTeam].roster.find(x => x.id === e.id); expect(p, e.id).toBeTruthy(); expect(p!.age).toBe(e.age); }
    expect(deserialize(serialize(g))).toEqual(g);
  });
  it('migrar una partida v3 asigna edades de forma determinista', () => {
    const base = JSON.parse(serialize(newGame(5))); base.version = 3; delete base.news; delete base.progressLog;
    for (const t of base.teams) { delete t.clubBoost; t.roster.forEach((p: { age?: number }) => delete p.age); } base.market.forEach((p: { age?: number }) => delete p.age);
    const a = deserialize(JSON.stringify(base)), b = deserialize(JSON.stringify(base));
    expect(a.teams[0].roster.map(p => p.age)).toEqual(b.teams[0].roster.map(p => p.age)); expect(a.teams[0].roster.every(p => p.age! >= 18 && p.age! <= 40)).toBe(true); expect(a.version).toBe(6);
  });
  it('archiva las fichas de jugadores retirados y conserva sus estadísticas y último equipo', () => {
    let game = newGame(211);
    const team = game.teams[game.userTeam];
    const player = team.roster.find(p => p.id === team.lineup.S)!;
    const freeAgent = game.market[0];
    game = {
      ...game,
      teams: game.teams.map(t => t.id === game.userTeam
        ? { ...t, roster: t.roster.map(p => p.id === player.id ? { ...p, age: 41 } : p) }
        : t),
      market: game.market.map(p => p.id === freeAgent.id ? { ...p, age: 41 } : p),
    };
    const finished = endSeason(playSeasonFrom(game));
    const archivedPlayer = finished.retiredPlayers.find(p => p.id === player.id);
    const archivedAgent = finished.retiredPlayers.find(p => p.id === freeAgent.id);
    expect(archivedPlayer).toMatchObject({ name: player.name, role: player.role, age: 42, retiredSeason: 1, lastTeam: team.name });
    expect(archivedAgent).toMatchObject({ name: freeAgent.name, retiredSeason: 1, lastTeam: 'Agente libre' });
    expect(finished.allTime[player.id]?.gp).toBeGreaterThan(0);
    expect(finished.teams.flatMap(t => t.roster).some(p => p.id === player.id)).toBe(false);
    expect(finished.market.some(p => p.id === freeAgent.id)).toBe(false);
    expect(deserialize(serialize(finished))).toEqual(finished);
  });
  it('la liga se mantiene estable durante 10 temporadas: edad, nivel y diferencias entre equipos', () => {
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    for (const seed of [1, 2]) { let g = newGame(seed * 101); const lvl0 = mean(g.teams.filter(t => t.id !== g.userTeam).flatMap(t => t.roster.map(overall)));
      for (let s = 1; s < 10; s++) { g = simulateSeason(g); g = endSeason(g); }
      const ai = g.teams.filter(t => t.id !== g.userTeam), ages = ai.flatMap(t => t.roster.map(p => p.age!)), lvl1 = mean(ai.flatMap(t => t.roster.map(overall)));
      expect(mean(ages)).toBeGreaterThan(25.5); expect(mean(ages)).toBeLessThan(29); expect(Math.abs(lvl1 - lvl0)).toBeLessThan(2.5);
      const st = ai.map(t => mean(lineupToSquad(t.roster, t.lineup).map(overall))), m = mean(st), sd = Math.sqrt(mean(st.map(x => (x - m) ** 2))); expect(sd).toBeGreaterThan(0.8); expect(sd).toBeLessThan(4.8); }
  }, 240000);
});
