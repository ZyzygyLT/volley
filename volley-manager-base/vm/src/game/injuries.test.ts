import { describe, it, expect } from 'vitest';
import type { MatchState, Player } from '../engine/types';
import { createMatch, makeSquads, playMatch } from '../engine/match';
import { mulberry32 } from '../engine/rng';
import { BODY, INJURY, POSITION_MULT, SEVERITY, injuryProb, lineupInjuryErrors, repairLineup, rollMatchInjuries, rollMatchInjuriesRaw, rollTrainingInjuries, sampleInjury, tickInjuries, hoursOf } from './injuries';
import { sell } from './economy';
import { deserialize, serialize, validateGame } from './save';
import { endSeason, finishRound, matchFor, newGame, regularSeasonOver, setInjuryScale, userFixture, type GameState } from './season';
import { simulateSeason } from './playoffs';

const fakeMatch = (seed: number, players: Player[], rallies: number): MatchState => ({ seed, base: [players, []], benches: [[], []], onCourt: Object.fromEntries(players.map(p => [p.id, rallies])) } as unknown as MatchState);
const squad = () => makeSquads(3)[0]; // S, OH, MB, OP, OH, MB, L

describe('lesiones: calibración con los datos de la FIVB (Bere et al. 2015)', () => {
  it('en cada rally hay 6 jugadores por equipo en cancha; el líbero casi siempre y los dos centrales, en conjunto, algo más que un puesto', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const sq = makeSquads(seed), m = playMatch(createMatch(seed, 50, { squads: sq })), rallies = m.totals[0] + m.totals[1];
      for (const side of [0, 1] as const) { const ids = [...m.base[side], ...m.benches[side]].map(p => p.id); expect(ids.reduce((s, id) => s + (m.onCourt[id] ?? 0), 0)).toBe(6 * rallies); }
      const [, , mb1, , , mb2, lib] = sq[0]; expect(m.onCourt[lib.id] / rallies).toBeGreaterThan(0.7); expect(m.onCourt[lib.id] / rallies).toBeLessThanOrEqual(1);
      expect((m.onCourt[mb1.id] + m.onCourt[mb2.id]) / rallies).toBeGreaterThan(1.0); expect((m.onCourt[mb1.id] + m.onCourt[mb2.id]) / rallies).toBeLessThan(1.3);
    }
  });
  it('un partido dura 1 h 48 min 53 s y 175 rallies: 37,3 s por rally', () => {
    expect(INJURY.secondsPerRally).toBeGreaterThan(37.2); expect(INJURY.secondsPerRally).toBeLessThan(37.4); expect(hoursOf(175) * 3600).toBeGreaterThan(6532); expect(hoursOf(175) * 3600).toBeLessThan(6534);
  });
  it('la incidencia simulada es de 4,8 lesiones con baja por 1000 horas-jugador (con las 6 posiciones en cancha un partido completo)', () => {
    const sq = squad(), team = [sq[0], sq[1], sq[2], sq[3], sq[4], sq[6]]; // 2 receptores, 1 central, colocador, opuesto y líbero = la formación de la fuente
    let count = 0, hours = 0; const N = 40000;
    for (let i = 0; i < N; i++) { count += rollMatchInjuriesRaw(fakeMatch(i + 1, team, 175)).length; hours += team.length * hoursOf(175); }
    const rate = (count / hours) * 1000; expect(rate).toBeGreaterThan(4.8 * 0.93); expect(rate).toBeLessThan(4.8 * 1.07);
    expect(rate).toBeGreaterThan(3.7); expect(rate).toBeLessThan(5.9); // dentro del intervalo de confianza de la fuente
  });
  it('los centrales se lesionan más y los líberos menos; el promedio por exposición real es 1', () => {
    const exp = 2 * POSITION_MULT.OH + POSITION_MULT.MB + POSITION_MULT.S + POSITION_MULT.OP + POSITION_MULT.L;
    expect(exp / 6).toBe(1); expect(POSITION_MULT.MB).toBeGreaterThan(1); expect(POSITION_MULT.L).toBeLessThan(1);
    expect(injuryProb('MB', 1)).toBeGreaterThan(injuryProb('OH', 1)); expect(injuryProb('L', 1)).toBeLessThan(injuryProb('OH', 1));
  });
  it('la frecuencia se escala: sin lesiones (0), datos reales (1) y doble (2)', () => {
    const sq = squad(); let c0 = 0, c1 = 0, c2 = 0;
    for (let i = 0; i < 20000; i++) { const m = fakeMatch(i + 1, sq, 175); c0 += rollMatchInjuriesRaw(m, 0).length; c1 += rollMatchInjuriesRaw(m, 1).length; c2 += rollMatchInjuriesRaw(m, 2).length; }
    expect(c0).toBe(0); expect(c2 / c1).toBeGreaterThan(1.8); expect(c2 / c1).toBeLessThan(2.2);
  });
  it('la gravedad sigue la distribución de la fuente (1-2 días 53,8 %, 3-7 días 21,7 %, 8-28 días 17,5 %, más de 4 semanas 4,9 %, 6 meses o más 2,1 %)', () => {
    const rnd = mulberry32(5), N = 60000, cnt = SEVERITY.map(() => 0); let weeks = 0;
    for (let i = 0; i < N; i++) { const x = sampleInjury(rnd); cnt[SEVERITY.findIndex(s => x.days >= s.minDays && x.days <= s.maxDays)]++; weeks += x.weeks; }
    const total = SEVERITY.reduce((s, x) => s + x.count, 0);
    SEVERITY.forEach((s, k) => expect(Math.abs(cnt[k] / N - s.count / total), `tramo ${k}`).toBeLessThan(0.008));
    const expectedWeeks = SEVERITY.reduce((s, x) => s + (x.count / total) * ((x.minDays + x.maxDays) / 2 / 7), 0); expect(Math.abs(weeks / N - expectedWeeks) / expectedWeeks).toBeLessThan(0.05);
  });
  it('la zona más frecuente es el tobillo (26 %), luego la rodilla (15 %) y los dedos (11 %)', () => {
    const rnd = mulberry32(9), N = 60000, c: Record<string, number> = {}; for (let i = 0; i < N; i++) { const k = sampleInjury(rnd).kind; c[k] = (c[k] ?? 0) + 1; }
    const total = BODY.reduce((s, x) => s + x[1], 0); expect(Math.abs(c['tobillo'] / N - 114 / total)).toBeLessThan(0.01); expect(Math.abs(c['rodilla'] / N - 67 / total)).toBeLessThan(0.01); expect(Math.abs(c['dedos'] / N - 47 / total)).toBeLessThan(0.01);
    expect(Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0])).toEqual(['tobillo', 'rodilla', 'dedos']);
  });
  it('el entrenamiento aporta 0,47 lesiones por cada lesión de partido (proporción de la fuente) a nivel de equipo', () => {
    const g = newGame(2), roster = g.teams[0].roster; let n = 0; const T = 30000;
    for (let i = 0; i < T; i++) n += rollTrainingInjuries(roster, new Set(), i + 1).length * 1; // solo cuenta las que pierden jornadas
    const matchRaw = 6 * hoursOf(175) * 4.8 / 1000, trainingRaw = INJURY.trainingRatio * matchRaw, share = 0.515; // P(pierde al menos una jornada)
    expect(Math.abs(n / T - trainingRaw * share) / (trainingRaw * share)).toBeLessThan(0.1);
  });
});

describe('lesiones en la liga', () => {
  it('es determinista y las lesiones de un partido son las mismas que se previsualizan en el resumen', () => {
    const g = newGame(11), f = userFixture(g)!, m = playMatch(matchFor(g, f));
    expect(rollMatchInjuries(m)).toEqual(rollMatchInjuries(m)); expect(simulateSeason(newGame(4)).injuries).toEqual(simulateSeason(newGame(4)).injuries);
  });
  it('los lesionados se recuperan una jornada por vez y los titulares lesionados se reemplazan por el mejor sano de su posición', () => {
    expect(tickInjuries({ a: { kind: 'tobillo', weeks: 3, total: 3, season: 1, round: 0, where: 'partido' } }).a.weeks).toBe(2);
    expect(tickInjuries({ a: { kind: 'tobillo', weeks: 1, total: 1, season: 1, round: 0, where: 'partido' } })).toEqual({});
    const g = newGame(7), t = g.teams[3], inj = new Set([t.lineup.S, t.lineup.OH[0]]), l = repairLineup(t.roster, t.lineup, inj);
    expect(l.S).not.toBe(t.lineup.S); expect(l.OH).not.toContain(t.lineup.OH[0]); expect(lineupInjuryErrors(t.roster, l, inj)).toEqual([]);
    expect(lineupInjuryErrors(t.roster, t.lineup, inj).length).toBe(2); expect(repairLineup(t.roster, t.lineup, new Set())).toBe(t.lineup);
  });
  it('a lo largo de temporadas, ningún equipo juega con un titular lesionado si tiene un reemplazo sano, y a escala 3 siempre hay lesiones', () => {
    let g = setInjuryScale(newGame(8), 3), seen = 0;
    for (let s = 0; s < 3; s++) {
      while (!regularSeasonOver(g)) { g = finishRound(g); seen += Object.keys(g.injuries).length; for (const t of g.teams) expect(lineupInjuryErrors(t.roster, t.lineup, new Set(Object.keys(g.injuries))), t.name).toEqual([]); }
      g = endSeason(simulateSeason(g));
    }
    expect(seen).toBeGreaterThan(0);
  });
  it('a escala real el promedio es inferior a 2 lesiones por equipo y temporada, y a escala 0 no hay ninguna', () => {
    const count = (scale: number) => { let n = 0, seasons = 0; for (let s = 1; s <= 4; s++) { let g = setInjuryScale(newGame(s * 7), scale); const seen = new Set<string>();
      while (g.round < 14) { g = finishRound(g); Object.keys(g.injuries).forEach(id => seen.add(id)); } n += seen.size; seasons++; } return n / (seasons * 8); };
    expect(count(0)).toBe(0); const real = count(1); expect(real).toBeGreaterThan(0.1); expect(real).toBeLessThan(2);
  }, 120000);
  it('vender a un lesionado borra su lesión; las lesiones de jugadores inexistentes invalidan la partida; el guardado las conserva', () => {
    let g = setInjuryScale(newGame(5), 3); while (g.round < 14 && Object.keys(g.injuries).length === 0) g = finishRound(g);
    expect(deserialize(serialize(g))).toEqual(g);
    const mine = g.teams[g.userTeam].roster.find(p => g.injuries[p.id]); if (mine) { const s = sell(g, mine.id); expect(s.injuries[mine.id]).toBeUndefined(); }
    const bad: GameState = { ...g, injuries: { ...g.injuries, zzz: { kind: 'x', weeks: 2, total: 2, season: 1, round: 0, where: 'partido' } } }; expect(validateGame(bad).length).toBeGreaterThan(0);
    expect(() => setInjuryScale(g, 7)).toThrow();
  });
});
