import { describe, expect, it } from 'vitest';
import { createMatch, legalSubs, makePlayer, makeSquads, playMatch, substitute } from './match';
import { mulberry32 } from './rng';
import { P } from './params';
import { validateMatch, validateMatchAgainst } from './validation';

describe('validateMatch', () => {
  it('acepta un partido nuevo y uno terminado', () => {
    expect(validateMatch(createMatch(42))).toEqual([]);
    expect(validateMatch(playMatch(createMatch(42)))).toEqual([]);
  });

  it('acepta una sesión después de rotaciones y sustituciones legales', () => {
    const [a, b] = makeSquads(21), rnd = mulberry32(5);
    const bench = (offset: number) => (['S', 'OH', 'OH', 'MB', 'MB', 'OP', 'L'] as const)
      .map((role, i) => makePlayer(rnd, role, 0, `b${offset + i}`, `Sup${offset + i}`, 0));
    let match = createMatch(3, 50, { squads: [a, b], benches: [bench(0), bench(20)] });
    const expected = structuredClone(match);
    const option = legalSubs(match, 0).find(candidate => !candidate.isLibero)!;
    match = substitute(match, 0, option.out.id, option.inn.id);
    expect(validateMatch(match)).toEqual([]);
    expect(validateMatchAgainst(match, expected)).toEqual([]);

    const wrongFixture = structuredClone(match);
    wrongFixture.seed++;
    expect(validateMatchAgainst(wrongFixture, expected).some(error => error.includes('no corresponde al fixture'))).toBe(true);
  });

  it('rechaza semillas que no sean uint32', () => {
    for (const seed of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 0x1_0000_0000]) {
      const match = createMatch(1);
      match.seed = seed;
      expect(validateMatch(match).some(error => error.startsWith('seed:'))).toBe(true);
      expect(() => createMatch(seed)).toThrow(/uint32/);
    }
    expect(validateMatch(createMatch(0))).toEqual([]);
    expect(validateMatch(createMatch(0xffff_ffff))).toEqual([]);
  });

  it('rechaza identidades duplicadas y jugadores fuera de la alineación base', () => {
    const duplicate = structuredClone(createMatch(1));
    duplicate.benches[0].push(duplicate.base[0][0]);
    expect(validateMatch(duplicate).some(error => error.includes('identificador duplicado'))).toBe(true);

    const wrongLineup = structuredClone(createMatch(1));
    wrongLineup.teams[0].lineup[0] = wrongLineup.teams[0].lineup[1];
    expect(validateMatch(wrongLineup).length).toBeGreaterThan(0);
  });

  it('rechaza estados de sustitución incoherentes', () => {
    const match = structuredClone(createMatch(1));
    match.subState[0].count = 2;
    expect(validateMatch(match).some(error => error.includes('subState[0].count'))).toBe(true);
  });

  it('rechaza progresión, estadísticas y parámetros corruptos', () => {
    const badProgress = structuredClone(createMatch(1));
    badProgress.score = [25, 20];
    badProgress.totals = [25, 20];
    expect(validateMatch(badProgress).some(error => error.startsWith('score:'))).toBe(true);

    const badBox = structuredClone(createMatch(1));
    badBox.box.intruder = { gp: 0, serves: 0, aces: 0, serveErr: 0, recs: 0, recPos: 0, recPerf: 0, recErr: 0, recQSum: 0, atks: 0, kills: 0, atkErr: 0, blocked: 0, blocks: 0, digs: 0, assists: 0, otherErr: 0 };
    expect(validateMatch(badBox).some(error => error.includes('jugador ajeno'))).toBe(true);

    const inconsistentStats = structuredClone(playMatch(createMatch(9)));
    inconsistentStats.stats[0].ace++;
    expect(validateMatch(inconsistentStats).some(error => error.includes('no concilia con las estadísticas individuales'))).toBe(true);

    const impossibleBox = structuredClone(createMatch(10));
    const playerId = impossibleBox.base[0][0].id;
    impossibleBox.box[playerId] = {
      gp: 0, serves: 1, aces: 1, serveErr: 1, recs: 0, recPos: 0, recPerf: 0, recErr: 0,
      recQSum: 0, atks: 0, kills: 0, atkErr: 0, blocked: 0, blocks: 0, digs: 0, assists: 0, otherErr: 0,
    };
    expect(validateMatch(impossibleBox).some(error => error.includes('aces + serveErr supera los saques'))).toBe(true);

    const badParams = structuredClone(P);
    badParams.posQ = 0.9;
    badParams.keepProb = 1.2;
    badParams.recWeight.OH = -1;
    const badMatch = createMatch(1, 50, { params: badParams });
    expect(validateMatch(badMatch).some(error => error.startsWith('params.'))).toBe(true);
  });
});
