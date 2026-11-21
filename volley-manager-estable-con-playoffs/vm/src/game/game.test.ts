import { describe, it, expect } from 'vitest';
import { endSeason, finishRound, fixturesOfRound, leaguePoints, matchFor, newGame, roundRobin, standings, totalRounds, userFixture, leaders } from './season';
import { autoLineup, lineupToSquad, validateLineup, MAX_ROSTER, MIN_BY_ROLE } from './roster';
import { deserialize, memoryStore, metaOf, SaveError, serialize, validateGame } from './save';
import { ECON, marketValue, sell, sign, roundWages } from './economy';
import { playMatch, legalSubs, substitute } from '../engine/match';
import { simulateSeason } from './playoffs';
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

describe('semillas de partida', () => {
  it('acepta uint32 y rechaza semillas fuera de rango al crear una partida', () => {
    expect(newGame(0).seed).toBe(0);
    expect(newGame(0xffff_ffff).seed).toBe(0xffff_ffff);
    for (const seed of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 0x1_0000_0000]) {
      expect(() => newGame(seed)).toThrow(/uint32/);
    }
    expect(() => newGame(1, 0, 1)).toThrow(/entre 2 y 32/);
    expect(() => newGame(1, 0, 3)).toThrow(/entre 2 y 32/);
    expect(() => newGame(1, 32, 8)).toThrow(/equipo del usuario/);
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
  it('cierra una temporada íntegra, archiva estadísticas y prepara la siguiente', () => {
    const completed = playSeason(31);
    const next = endSeason(completed);
    expect(next.season).toBe(2);
    expect(next.round).toBe(0);
    expect(next.results).toEqual([]);
    expect(next.playoffs).toBeNull();
    expect(next.history).toHaveLength(1);
    expect(next.history[0]).toEqual({
      season: 1,
      champion: completed.teams[completed.playoffs!.champion!].name,
      userRank: completed.playoffs!.ranking!.indexOf(completed.userTeam) + 1,
      userPoints: standings(completed).find(x => x.team === completed.userTeam)!.points,
      prize: ECON.prizeByRank[Math.min(completed.playoffs!.ranking!.indexOf(completed.userTeam), ECON.prizeByRank.length - 1)],
    });
    expect(next.allTime).toEqual(completed.career);
    // El nuevo estado no puede volver a cerrar la misma temporada.\n    expect(() => endSeason(next)).toThrow(/todavía no terminó/);
  });

  it('rechaza el cierre si falta un resultado de la fase regular', () => {
    const completed = playSeason(32);
    const corrupt = { ...completed, results: completed.results.slice(1) };
    expect(() => endSeason(corrupt)).toThrow(/fase regular está incompleta/);
    expect(completed.results).toHaveLength(completed.fixtures.length);
  });

  it('rechaza el cierre si el ranking final no coincide con las series', () => {
    const completed = playSeason(33);
    const ranking = [...completed.playoffs!.ranking!];
    [ranking[0], ranking[1]] = [ranking[1], ranking[0]];
    const corrupt = { ...completed, playoffs: { ...completed.playoffs!, ranking } };
    expect(() => endSeason(corrupt)).toThrow(/ranking final incoherente/);
  });

  it('rechaza el cierre si una serie no refleja sus victorias reales', () => {
    const completed = playSeason(34);
    const series = completed.playoffs!.series.map((s, i) => i === 0 ? { ...s, winner: s.high === s.winner ? s.low : s.high } : s);
    const corrupt = { ...completed, playoffs: { ...completed.playoffs!, series } };
    expect(() => endSeason(corrupt)).toThrow(/ganador incorrecto/);
  });

  it('trata como infinito el cociente con sets a favor y cero en contra', () => {
    const g = {
      ...newGame(77),
      results: [
        { round: 0, home: 0, away: 1, sets: [3, 0] as [number, number],
          setScores: [[25, 20], [25, 20], [25, 20]] as [number, number][],
          points: [3, 0] as [number, number], totals: [75, 60] as [number, number], seed: 1 },
        { round: 0, home: 2, away: 3, sets: [3, 1] as [number, number],
          setScores: [[25, 0], [25, 0], [0, 25], [25, 0]] as [number, number][],
          points: [3, 0] as [number, number], totals: [75, 25] as [number, number], seed: 2 },
      ],
    };
    expect(standings(g).slice(0, 2).map(x => x.team)).toEqual([0, 2]);
  });
  it('el partido del usuario jugado a mano se registra igual que simulado', () => {
    const g = newGame(9), f = userFixture(g)!;
    const manual = finishRound(g, playMatch(matchFor(g, f))), auto = finishRound(g);
    expect(manual.results).toEqual(auto.results);
  });
  it('permite cambiar táctica y alineación para el siguiente partido mientras el actual sigue en curso', () => {
    const g = newGame(29), f = userFixture(g)!;
    const manual = playMatch(matchFor(g, f));
    const changedTeams = g.teams.map(team => {
      if (team.id !== f.home) return team;
      const replacement = team.roster.find(p => p.role === 'OH' && !team.lineup.OH.includes(p.id))!;
      return { ...team, risk: 15, lineup: { ...team.lineup, OH: [team.lineup.OH[0], replacement.id] as [string, string] } };
    });
    const changed = { ...g, teams: changedTeams };
    const originalResult = finishRound(g, manual).results.find(r => r.home === f.home && r.away === f.away);
    const changedResult = finishRound(changed, manual).results.find(r => r.home === f.home && r.away === f.away);
    expect(changedResult).toEqual(originalResult);
  });
  it('rechaza partidos manuales incompletos, de otro fixture o con semilla alterada sin modificar la jornada', () => {
    const g = newGame(19), f = userFixture(g)!;
    const incomplete = matchFor(g, f);
    expect(() => finishRound(g, incomplete)).toThrow(/todavía no terminó/);

    const altered = playMatch(matchFor(g, f));
    altered.seed = (altered.seed + 1) >>> 0;
    expect(() => finishRound(g, altered)).toThrow(/semilla|fixture/);

    const other = fixturesOfRound(g).find(x => x !== f)!;
    expect(() => finishRound(g, playMatch(matchFor(g, other)))).toThrow(/fixture/);
    expect(g.round).toBe(0);
    expect(g.results).toHaveLength(0);
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
