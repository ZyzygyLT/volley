import { describe, it, expect } from 'vitest';
import { playMatch } from '../engine/match';
import { ECON } from './economy';
import { deserialize, serialize } from './save';
import { endSeason, finalRanking, finishRound, isSeasonOver, newGame, regularSeasonOver, seasonSummary, standings, type GameState } from './season';
import { advance, finishPlayoffDay, matchForSeries, simulateSeason, startPlayoffs, userSeries, winsOf } from './playoffs';

const regular = (seed: number): GameState => { let g = newGame(seed); while (!regularSeasonOver(g)) g = finishRound(g); return g; };

describe('playoffs', () => {
  it('no empiezan antes de terminar la fase regular ni dos veces', () => {
    expect(() => startPlayoffs(newGame(1))).toThrow(/no terminó/); const g = startPlayoffs(regular(1)); expect(() => startPlayoffs(g)).toThrow(/ya empezaron/);
  });
  it('no permite iniciar playoffs con menos de cuatro equipos', () => {
    let g = newGame(17, 0, 2);
    while (!regularSeasonOver(g)) g = finishRound(g);
    expect(() => startPlayoffs(g)).toThrow(/al menos 4 equipos/);
  });
  it('las semifinales enfrentan 1°-4° y 2°-3° de la fase regular, al mejor de 3', () => {
    const g = regular(2), t = standings(g).map(s => s.team), p = startPlayoffs(g).playoffs!;
    expect(p.stage).toBe('semi'); expect(p.series.map(s => [s.id, s.high, s.low, s.bestOf])).toEqual([['SF1', t[0], t[3], 3], ['SF2', t[1], t[2], 3]]);
  });
  it('cada serie termina cuando alguien llega a las victorias necesarias, sin partidos de más', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const p = simulateSeason(newGame(seed)).playoffs!; expect(p.stage).toBe('done'); expect(p.series.map(s => s.id)).toEqual(['SF1', 'SF2', 'F', 'B']);
      for (const s of p.series) {
        const need = s.bestOf === 3 ? 2 : 3; expect(s.winner).toBeTruthy; expect(winsOf(s, s.winner!)).toBe(need); expect(winsOf(s, s.winner === s.high ? s.low : s.high)).toBeLessThan(need);
        expect(s.games.length).toBeGreaterThanOrEqual(need); expect(s.games.length).toBeLessThanOrEqual(s.bestOf);
        s.games.forEach((x, i) => expect(x.home).toBe((i + 1) % 2 === 1 ? s.high : s.low)); // el mejor clasificado es local en los partidos impares
      }
      expect(p.series[2].bestOf).toBe(5); expect(p.series[3].bestOf).toBe(3);
    }
  });
  it('la final la juegan los ganadores de las semifinales y el bronce los perdedores; el ranking es una permutación coherente', () => {
    const g = simulateSeason(newGame(4)), p = g.playoffs!, [sf1, sf2, f, b] = p.series, lose = (s: typeof sf1) => (s.winner === s.high ? s.low : s.high);
    expect(new Set([f.high, f.low])).toEqual(new Set([sf1.winner, sf2.winner])); expect(new Set([b.high, b.low])).toEqual(new Set([lose(sf1), lose(sf2)]));
    const r = p.ranking!; expect(new Set(r).size).toBe(8); expect(r.slice(0, 4)).toEqual([f.winner, lose(f), b.winner, lose(b)]);
    const reg = standings(g).map(s => s.team).filter(t => !r.slice(0, 4).includes(t)); expect(r.slice(4)).toEqual(reg); expect(p.champion).toBe(r[0]);
  });
  it('es determinista y un partido de playoffs jugado a mano da lo mismo que simulado', () => {
    expect(simulateSeason(newGame(6)).playoffs).toEqual(simulateSeason(newGame(6)).playoffs);
    for (let seed = 1; seed <= 30; seed++) {
      let g = newGame(seed); g = { ...g, userTeam: 0 }; while (!regularSeasonOver(g)) g = finishRound(g); g = startPlayoffs(g); const s = userSeries(g); if (!s) continue;
      expect(finishPlayoffDay(g, playMatch(matchForSeries(g, s)))).toEqual(finishPlayoffDay(g)); return;
    }
    throw new Error('ningún equipo 0 clasificó en 30 semillas');
  });
  it('rechaza partidos manuales incompletos o ajenos a la serie activa', () => {
    const completed = regular(31);
    const g = startPlayoffs({ ...completed, userTeam: standings(completed)[0].team });
    const series = userSeries(g)!;
    const incomplete = matchForSeries(g, series);
    expect(() => finishPlayoffDay(g, incomplete)).toThrow(/todavía no terminó/);

    const altered = playMatch(matchForSeries(g, series));
    altered.seed = (altered.seed + 1) >>> 0;
    expect(() => finishPlayoffDay(g, altered)).toThrow(/fixture o serie/);
    expect(g.playoffs?.series.every(s => s.games.length === 0)).toBe(true);

    const eliminated = { ...g, userTeam: standings(g)[7].team };
    const foreignSeries = eliminated.playoffs!.series[0];
    expect(() => finishPlayoffDay(eliminated, playMatch(matchForSeries(eliminated, foreignSeries))))
      .toThrow(/no tiene una serie activa/);
  });
  it('la temporada solo termina con los playoffs y el premio sale del puesto final', () => {
    let g = regular(8); expect(isSeasonOver(g)).toBe(false); expect(() => endSeason(g)).toThrow(/no terminó/);
    g = startPlayoffs(g); expect(() => endSeason(g)).toThrow(/no terminó/);
    while (!isSeasonOver(g)) g = advance(g);
    const rec = seasonSummary(g), rank = finalRanking(g); expect(rec.userRank).toBe(rank.indexOf(g.userTeam) + 1); expect(rec.champion).toBe(g.teams[rank[0]].name);
    expect(rec.prize).toBe(ECON.prizeByRank[rec.userRank - 1]); const n = endSeason(g); expect(n.playoffs).toBeNull(); expect(n.history[0].champion).toBe(rec.champion);
  });
  it('el usuario cobra entradas y premio de victoria en sus partidos de playoffs', () => {
    for (let seed = 1; seed <= 30; seed++) {
      let g = { ...newGame(seed), userTeam: 0 }; while (!regularSeasonOver(g)) g = finishRound(g); g = startPlayoffs(g); if (!userSeries(g)) continue;
      const k = g.finance.ledger.length, after = finishPlayoffDay(g), added = after.finance.ledger.slice(k);
      expect(added.every(e => e.concept.includes('playoffs'))).toBe(true); expect(after.finance.budget).toBe(g.finance.budget + added.reduce((s, e) => s + e.amount, 0)); expect(added.length).toBeGreaterThan(0); return;
    }
    throw new Error('ningún equipo 0 clasificó');
  });
  it('el guardado funciona a mitad de playoffs y las partidas v4 se migran', () => {
    let g = startPlayoffs(regular(9)); g = finishPlayoffDay(g); expect(deserialize(serialize(g))).toEqual(g);
    const old = JSON.parse(serialize(regular(9))); old.version = 4; delete old.playoffs; const m = deserialize(JSON.stringify(old)); expect([m.version, m.playoffs]).toEqual([6, null]);
    expect(() => deserialize(JSON.stringify({ ...JSON.parse(serialize(newGame(2))), playoffs: { stage: 'semi', series: [] } }))).toThrow();
  });
});
