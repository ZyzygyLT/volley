import { describe, it, expect } from 'vitest';
import { chooseTeam, endSeason, finishRound, fixturesOfRound, leaguePoints, matchFor, newGame, roundRobin, seasonSummary, standings, totalRounds, userFixture, leaders } from './season';
import { addBoxes } from '../engine/stats';
import { autoLineup, lineupToSquad, validateLineup } from './roster';
import { deserialize, memoryStore, metaOf, SaveError, serialize, validateGame } from './save';
import { ECON, marketValue, sell, sign, roundWages } from './economy';
import { MAX_ROSTER, MIN_BY_ROLE, ROSTER_SLOTS, overall } from './roster';
import { AGE, retireProb } from './ages';
import { matchSummary, performance } from './summary';
import { simulateSeason } from './playoffs';
import { homeAdvantage } from '../engine/calibrate';
import { progressPlayer } from './offseason';
import { mulberry32 } from '../engine/rng';
import { playMatch, legalSubs, substitute, firstServer } from '../engine/match';
import { HOME_BOOST, P } from '../engine/params';
import { emptyP } from '../engine/stats';

const playSeason = (seed: number) => simulateSeason(newGame(seed));

describe('calendario', () => {
  it('doble liga: cada equipo juega una vez por jornada y dos veces contra cada rival (una en casa y otra de visita)', () => {
    for (const n of [4, 8, 12]) {
      const fx = roundRobin(n), rounds = 2 * (n - 1);
      expect(fx.length).toBe(rounds * (n / 2));
      for (let r = 0; r < rounds; r++) { const seen = fixturesOfRound({ fixtures: fx, round: r } as never).flatMap(f => [f.home, f.away]); expect(new Set(seen).size).toBe(n); }
      for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
        const m = fx.filter(f => (f.home === a && f.away === b) || (f.home === b && f.away === a));
        expect(m.length).toBe(2); expect(m[0].home).not.toBe(m[1].home);
      }
    }
  });
  it('puntos de liga FIVB: 3-0 y 3-1 suman 3; 3-2 reparte 2 y 1', () => {
    expect(leaguePoints([3, 0])).toEqual([3, 0]); expect(leaguePoints([1, 3])).toEqual([0, 3]);
    expect(leaguePoints([3, 2])).toEqual([2, 1]); expect(leaguePoints([2, 3])).toEqual([1, 2]);
  });
});

describe('plantel y alineación', () => {
  it('la alineación automática es válida y produce 7 jugadores en el orden del motor', () => {
    const g = newGame(1);
    for (const t of g.teams) { expect(validateLineup(t.roster, t.lineup)).toEqual([]); expect(lineupToSquad(t.roster, t.lineup).map(p => p.role)).toEqual(['S', 'OH', 'MB', 'OP', 'OH', 'MB', 'L']); }
  });
  it('detecta alineaciones inválidas', () => {
    const t = newGame(1).teams[0], bad = { ...autoLineup(t.roster), OH: [autoLineup(t.roster).OH[0], autoLineup(t.roster).OH[0]] as [string, string] };
    expect(validateLineup(t.roster, bad).length).toBeGreaterThan(0);
  });
});

describe('temporada', () => {
  it('es determinista y los puntos de liga suman 3 por partido', () => {
    const a = playSeason(5), b = playSeason(5);
    expect(a.results).toEqual(b.results);
    expect(standings(a).reduce((s, x) => s + x.points, 0)).toBe(3 * a.results.length);
    expect(a.results.length).toBe(4 * totalRounds(a));
    for (const r of a.results) { const w = r.sets[0] > r.sets[1] ? 0 : 1; expect(r.totals[w]).toBeGreaterThanOrEqual(r.sets[w] === 3 && r.sets[1 - w] === 2 ? 65 : 75); }
  });
  it('el partido del usuario jugado a mano se registra igual que simulado', () => {
    const g = newGame(9), f = userFixture(g)!;
    const manual = finishRound(g, playMatch(matchFor(g, f))), auto = finishRound(g);
    expect(manual.results).toEqual(auto.results);
  });
  it('acumula estadísticas individuales de los titulares', () => {
    const g = finishRound(newGame(2));
    expect(Object.keys(g.career).length).toBe(8 * 7);
    expect(leaders(g, 'kills', 3)[0].value).toBeGreaterThan(0);
  });
});

describe('guardado', () => {
  it('serializar y deserializar conserva todo, incluso a mitad de temporada', async () => {
    let g = newGame(3); for (let i = 0; i < 3; i++) g = finishRound(g);
    expect(deserialize(serialize(g))).toEqual(g);
    const store = memoryStore(); await store.put('1', serialize(g), metaOf('1', g, '2026-01-01T00:00:00Z'));
    expect(deserialize((await store.get('1'))!)).toEqual(g); expect((await store.list())[0].round).toBe(3);
    await store.remove('1'); expect(await store.get('1')).toBeNull();
  });
  it('una partida guardada continúa igual que la original', () => {
    let g = newGame(4); for (let i = 0; i < 2; i++) g = finishRound(g);
    const loaded = deserialize(serialize(g));
    expect(finishRound(loaded).results).toEqual(finishRound(g).results);
  });
  it('rechaza archivos corruptos', () => {
    expect(() => deserialize('no es json')).toThrow(SaveError);
    const g = newGame(1); g.teams[0].lineup.L = g.teams[0].roster[0].id;
    expect(validateGame(g).length).toBeGreaterThan(0); expect(() => serialize(g)).toThrow(SaveError);
  });
});

describe('sustituciones en la liga', () => {
  it('el suplente que entra en el partido del usuario suma partido jugado y estadísticas', () => {
    const g = newGame(11), f = userFixture(g)!; let m = matchFor(g, f);
    const side = f.home === g.userTeam ? 0 : 1, o = legalSubs(m, side).find(x => x.out.role === 'OH')!;
    m = playMatch(substitute(m, side, o.out.id, o.inn.id));
    expect(m.onCourt[o.inn.id]).toBeGreaterThan(0);
    delete m.box[o.inn.id]; // estuvo en cancha, pero no generó un evento estadístico
    const after = finishRound(g, m);
    expect(after.career[o.inn.id]?.gp).toBe(1);
  });
});

describe('economía y mercado (valores de diseño)', () => {
  it('los nombres son únicos en toda la liga y el mercado', () => {
    const g = newGame(6), names = [...g.teams.flatMap(t => t.roster), ...g.market].map(p => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
  it('fichar descuenta el valor, mueve al jugador del mercado al plantel y mantiene una alineación válida', () => {
    const g = newGame(7), p = g.market.find(x => x.role === 'OH')!, fee = marketValue(p), s = sign(g, p.id);
    expect(s.finance.budget).toBe(g.finance.budget - fee); expect(s.market.some(x => x.id === p.id)).toBe(false);
    expect(s.teams[s.userTeam].roster.length).toBe(14); expect(validateLineup(s.teams[s.userTeam].roster, s.teams[s.userTeam].lineup)).toEqual([]);
    expect(g.teams[g.userTeam].roster.length).toBe(13); // no muta
  });
  it('no deja fichar sin presupuesto ni con el plantel completo', () => {
    let g = newGame(8); const poor = { ...g, finance: { ...g.finance, budget: 0 } };
    expect(() => sign(poor, g.market[0].id)).toThrow(/Presupuesto/);
    g = { ...g, finance: { ...g.finance, budget: 1e12 } };
    for (const p of g.market.slice(0, MAX_ROSTER - 13)) g = sign(g, p.id);
    expect(g.teams[g.userTeam].roster.length).toBe(MAX_ROSTER); expect(() => sign(g, g.market[0].id)).toThrow(/completo/);
  });
  it('vender cobra el 70 % del valor, respeta el mínimo por posición y repara la alineación', () => {
    const g = newGame(9), t = g.teams[g.userTeam], starter = t.roster.find(p => p.id === t.lineup.S)!, s = sell(g, starter.id);
    expect(s.finance.budget).toBe(g.finance.budget + Math.round(marketValue(starter) * ECON.sellFactor));
    expect(validateLineup(s.teams[s.userTeam].roster, s.teams[s.userTeam].lineup)).toEqual([]); expect(s.market.some(p => p.id === starter.id)).toBe(true);
    let h = g; const onlyL = h.teams[h.userTeam].roster.filter(p => p.role === 'L');
    for (let i = 0; i < onlyL.length - MIN_BY_ROLE.L; i++) h = sell(h, onlyL[i].id);
    expect(() => sell(h, onlyL[onlyL.length - 1].id)).toThrow(/al menos/);
  });
  it('cada jornada registra patrocinio, salarios y (si corresponde) entradas y premio', () => {
    const g = newGame(10), n = g.finance.ledger.length, a = finishRound(g), added = a.finance.ledger.slice(n);
    expect(added.some(e => e.concept === 'Patrocinio')).toBe(true); expect(added.find(e => e.concept === 'Salarios')!.amount).toBe(-roundWages(g));
    expect(a.finance.budget).toBe(g.finance.budget + added.reduce((s, e) => s + e.amount, 0));
  });
  it('el guardado conserva finanzas y mercado, y una partida v1 se migra', () => {
    let g = newGame(12); g = sign(g, g.market[0].id); g = finishRound(g);
    expect(deserialize(serialize(g))).toEqual(g);
    const old = JSON.parse(serialize(g)); old.version = 1; delete old.finance; delete old.market;
    const m = deserialize(JSON.stringify(old)); expect(m.finance.budget).toBe(ECON.startBudget); expect(m.market).toEqual([]);
  });
});

describe('parciales, equipo y cierre de temporada', () => {
  it('los parciales por set son válidos y coherentes con los totales', () => {
    for (const r of playSeason(5).results) {
      expect(r.setScores.length).toBe(r.sets[0] + r.sets[1]);
      let a = 0, b = 0; r.setScores.forEach(([x, y], i) => { expect(Math.max(x, y)).toBeGreaterThanOrEqual(i === 4 ? 15 : 25); expect(Math.abs(x - y)).toBeGreaterThanOrEqual(2); a += x; b += y; });
      expect([a, b]).toEqual(r.totals);
    }
  });
  it('solo se puede elegir equipo antes de jugar', () => {
    const g = newGame(1); expect(chooseTeam(g, 3).userTeam).toBe(3);
    expect(() => chooseTeam(finishRound(g), 2)).toThrow(/antes de jugar/); expect(() => chooseTeam(g, 99)).toThrow(/inexistente/);
  });
  it('cerrar la temporada exige que haya terminado', () => { expect(() => endSeason(newGame(2))).toThrow(/no terminó/); });
  it('la nueva temporada conserva plantillas y dinero, cobra el premio y archiva estadísticas', () => {
    const g1 = playSeason(7), sum = seasonSummary(g1), g2 = endSeason(g1);
    expect([g2.season, g2.round, g2.results.length, g2.history.length]).toEqual([2, 0, 0, 1]); expect(g2.history[0]).toEqual(sum);
    expect(g2.finance.budget).toBe(g1.finance.budget + sum.prize); expect(g2.userTeam).toBe(g1.userTeam);
    g2.teams.forEach((t, i) => { const before = new Map(g1.teams[i].roster.map(p => [p.id, p])); const kept = t.roster.filter(p => before.has(p.id));
      expect(kept.length).toBeGreaterThanOrEqual(Math.floor(g1.teams[i].roster.length * 0.6)); for (const p of kept) expect(p.age).toBe(before.get(p.id)!.age! + 1); });
    const kills = (b: typeof g1.career) => Object.values(b).reduce((s, x) => s + x.kills, 0);
    expect(kills(g2.allTime)).toBe(kills(g1.career)); expect(g2.career).toEqual({});
    const names = [...g2.teams.flatMap(t => t.roster), ...g2.market].map(p => p.name); expect(new Set(names).size).toBe(names.length);
    expect(g2.market.length).toBeLessThanOrEqual(ECON.maxMarket); expect(g2.market.some(p => p.id.startsWith('fa2-'))).toBe(true);
  });
  it('la temporada 2 usa otras semillas y sigue siendo determinista', () => {
    const g1 = playSeason(7), a = playSeason2(g1), b = playSeason2(playSeason(7));
    expect(a.results).toEqual(b.results); expect(a.results[0].seed).not.toBe(g1.results[0].seed);
  });
  it('el guardado funciona tras cerrar la temporada y se migran partidas de versiones anteriores', () => {
    const g2 = endSeason(playSeason(7)); expect(deserialize(serialize(g2))).toEqual(g2);
    const old = JSON.parse(serialize(finishRound(newGame(4)))); old.version = 2; delete old.season; delete old.history; delete old.allTime; old.results.forEach((r: { setScores?: unknown }) => delete r.setScores);
    const m = deserialize(JSON.stringify(old)); expect([m.version, m.season, m.history.length, m.results[0].setScores.length]).toEqual([6, 1, 0, 0]);
  });
  it('addBoxes suma sin mutar', () => {
    const a = { x: { ...emptyP(), kills: 2, gp: 1 } }, b = { x: { ...emptyP(), kills: 3, gp: 1 }, y: { ...emptyP(), aces: 1 } }, c = addBoxes(a, b);
    expect([c.x.kills, c.x.gp, c.y.aces, a.x.kills]).toEqual([5, 2, 1, 2]);
  });
});
const playSeason2 = (g: ReturnType<typeof newGame>) => simulateSeason(endSeason(g));

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
  it('la liga se mantiene estable durante 10 temporadas: edad, nivel y diferencias entre equipos', () => {
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
    for (const seed of [1, 2]) { let g = newGame(seed * 101); const lvl0 = mean(g.teams.filter(t => t.id !== g.userTeam).flatMap(t => t.roster.map(overall)));
      for (let s = 1; s < 10; s++) { g = simulateSeason(g); g = endSeason(g); }
      const ai = g.teams.filter(t => t.id !== g.userTeam), ages = ai.flatMap(t => t.roster.map(p => p.age!)), lvl1 = mean(ai.flatMap(t => t.roster.map(overall)));
      expect(mean(ages)).toBeGreaterThan(25.5); expect(mean(ages)).toBeLessThan(29); expect(Math.abs(lvl1 - lvl0)).toBeLessThan(2.5);
      const st = ai.map(t => mean(lineupToSquad(t.roster, t.lineup).map(overall))), m = mean(st), sd = Math.sqrt(mean(st.map(x => (x - m) ** 2))); expect(sd).toBeGreaterThan(0.8); expect(sd).toBeLessThan(4.8); }
  }, 240000);
});

describe('resumen del partido', () => {
  it('los totales del resumen coinciden con el marcador y el mejor jugador tiene la mayor valoración', () => {
    const g = newGame(13), m = playMatch(matchFor(g, userFixture(g)!)), s = matchSummary(m);
    expect(s.teams[0].total + s.teams[1].total).toBe(m.totals[0] + m.totals[1]); expect([s.teams[0].sets, s.teams[1].sets]).toEqual(m.sets); expect(s.setScores).toEqual(m.setScores);
    const all = [...m.base[0], ...m.benches[0], ...m.base[1], ...m.benches[1]].filter(p => m.box[p.id]);
    expect(s.mvp).toBeTruthy(); expect(s.mvp!.score).toBe(Math.max(...all.map(p => performance(m.box[p.id])))); expect([s.teams[0].name, s.teams[1].name]).toContain(s.mvp!.team);
  });
  it('un jugador sin errores y con más puntos vale más que otro con errores', () => {
    const a = { ...emptyP(), kills: 10, aces: 2 }, b = { ...emptyP(), kills: 10, aces: 2, atkErr: 6, serveErr: 4 };
    expect(performance(a)).toBeGreaterThan(performance(b));
  });
});

describe('compatibilidad con partidas de versiones anteriores', () => {
  it('una partida guardada con ataque o bloqueo negativos del líbero (versión anterior) se limpia y se abre', () => {
    const base = JSON.parse(serialize(newGame(3))); const lib = base.teams[0].roster.find((p: { role: string }) => p.role === 'L'); lib.atk = -6; lib.blk = -2;
    const g = deserialize(JSON.stringify(base)); const l = g.teams[0].roster.find(p => p.role === 'L')!; expect([l.atk, l.blk]).toEqual([0, 0]);
  });
  it('los líberos nuevos nunca tienen ataque ni bloqueo negativos', () => {
    let g = newGame(9); for (let s = 0; s < 8; s++) { g = simulateSeason(g); g = endSeason(g); }
    for (const p of [...g.teams.flatMap(t => t.roster), ...g.market]) { expect(p.atk).toBeGreaterThanOrEqual(0); expect(p.blk).toBeGreaterThanOrEqual(0); }
  });
});

describe('ventaja de local', () => {
  it('el local gana algo más de la mitad de los partidos y de los sets, como en PlusLiga (54,2 % y 53,4 %)', () => {
    const r = homeAdvantage(P, HOME_BOOST, 700);
    expect(r.win).toBeGreaterThan(0.5); expect(r.win).toBeLessThan(0.61); expect(r.sets).toBeGreaterThan(0.505); expect(r.sets).toBeLessThan(0.57);
  }, 120000);
  it('sin ventaja de local el reparto es parejo (el sorteo del primer saque no favorece a nadie)', () => {
    const r = homeAdvantage(P, 0, 700); expect(Math.abs(r.win - 0.5)).toBeLessThan(0.045);
  }, 120000);
  it('el primer saque se sortea por semilla y se alterna entre sets', () => {
    for (let seed = 1; seed <= 50; seed++) { expect(firstServer(seed, 2)).toBe(1 - firstServer(seed, 1)); expect(firstServer(seed, 3)).toBe(firstServer(seed, 1)); expect(firstServer(seed, 4)).toBe(firstServer(seed, 2)); }
    const firsts = Array.from({ length: 400 }, (_, s) => firstServer(s + 1, 1)); const share = firsts.filter(x => x === 0).length / 400; expect(share).toBeGreaterThan(0.42); expect(share).toBeLessThan(0.58);
  });
});
