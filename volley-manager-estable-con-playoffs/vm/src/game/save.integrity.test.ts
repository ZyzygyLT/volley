import { describe, it, expect } from 'vitest';
import { SaveError, deserialize, serialize, validateGame } from './save';
import { endSeason, finishRound, newGame, regularSeasonOver, type GameState } from './season';
import { sell } from './economy';
import { finishPlayoffDay, simulateSeason, startPlayoffs } from './playoffs';

const regular = (rounds: number, seed = 41): GameState => {
  let g = newGame(seed);
  for (let i = 0; i < rounds; i++) g = finishRound(g);
  return g;
};
const jsonCopy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const rejected = (g: unknown) => expect(validateGame(g).length).toBeGreaterThan(0);

describe('integridad semántica de guardados: fase regular', () => {
  it('acepta el inicio, una jornada intermedia y la fase regular completa', () => {
    const start = newGame(41);
    const middle = regular(5);
    let complete = newGame(41);
    while (!regularSeasonOver(complete)) complete = finishRound(complete);
    for (const g of [start, middle, complete]) {
      expect(validateGame(g)).toEqual([]);
      expect(deserialize(serialize(g))).toEqual(g);
    }
  });

  it('exige exactamente los partidos de las jornadas declaradas', () => {
    const missing = jsonCopy(regular(3));
    missing.results.pop();
    rejected(missing);

    const duplicate = jsonCopy(regular(3));
    duplicate.results.push({ ...duplicate.results[0] });
    rejected(duplicate);

    const future = jsonCopy(regular(3));
    future.results[0].round = future.round;
    rejected(future);
  });

  it('exige que cada resultado corresponda al fixture y que los puntos de liga sean correctos', () => {
    const wrongFixture = jsonCopy(regular(2));
    [wrongFixture.results[0].home, wrongFixture.results[0].away] =
      [wrongFixture.results[0].away, wrongFixture.results[0].home];
    rejected(wrongFixture);

    const wrongPoints = jsonCopy(regular(2));
    wrongPoints.results[0].points = [wrongPoints.results[0].points[1], wrongPoints.results[0].points[0]];
    rejected(wrongPoints);
  });

  it('rechaza semillas de resultados de liga que no sean uint32', () => {
    const negative = jsonCopy(regular(1));
    negative.results[0].seed = -1;
    rejected(negative);

    const fractional = jsonCopy(regular(1));
    fractional.results[0].seed = 1.5;
    rejected(fractional);

    const overflow = jsonCopy(regular(1));
    overflow.results[0].seed = 0x1_0000_0000;
    rejected(overflow);
  });

  it('valida marcadores de sets y parciales sin romper saves antiguos sin parciales', () => {
    const impossible = jsonCopy(regular(1));
    impossible.results[0].sets = [3, 3];
    rejected(impossible);

    const badPartials = jsonCopy(regular(1));
    badPartials.results[0].setScores[0][0] += 1;
    rejected(badPartials);

    const legacy = jsonCopy(regular(1));
    legacy.results.forEach(r => { r.setScores = []; });
    expect(validateGame(legacy)).toEqual([]);
    expect(deserialize(JSON.stringify(legacy)).results[0].setScores).toEqual([]);
  });

  it('alinea los límites de valoración con el motor de partidos', () => {
    const highServe = jsonCopy(newGame(74));
    highServe.teams[0].roster.find(p => p.role !== 'L')!.srv = 101;
    rejected(highServe);

    const highAttack = jsonCopy(newGame(75));
    highAttack.teams[0].roster.find(p => p.role !== 'L')!.atk = 101;
    rejected(highAttack);

    const highLiberoServe = jsonCopy(newGame(76));
    highLiberoServe.teams[0].roster.find(p => p.role === 'L')!.srv = 101;
    rejected(highLiberoServe);

    const validLibero = jsonCopy(newGame(77));
    const libero = validLibero.teams[0].roster.find(p => p.role === 'L')!;
    libero.atk = 120;
    libero.blk = 120;
    expect(validateGame(validLibero)).toEqual([]);
  });

  it('rechaza mercados por encima del límite y nombres de jugadores duplicados', () => {
    const full = jsonCopy(newGame(42));
    full.market = Array.from({ length: 25 }, (_, i) => ({ ...full.market[i % full.market.length], id: `over-cap-${i}`, name: `Agente extra ${i}` }));
    rejected(full);

    const duplicate = jsonCopy(newGame(43));
    duplicate.market[0].name = duplicate.teams[0].roster[0].name;
    rejected(duplicate);

    const blank = jsonCopy(newGame(44));
    blank.teams[0].roster[0].name = '   ';
    rejected(blank);

    const blankRosterId = jsonCopy(newGame(45));
    blankRosterId.teams[0].roster[0].id = '   ';
    rejected(blankRosterId);

    const blankMarketId = jsonCopy(newGame(46));
    blankMarketId.market[0].id = '';
    rejected(blankMarketId);
  });

  it('limita el libro financiero y valida sus movimientos', () => {
    const tooMany = jsonCopy(newGame(47));
    tooMany.finance.ledger = Array.from({ length: 61 }, (_, i) => ({
      round: i % 14, season: 1, concept: 'Movimiento', amount: 100,
    }));
    rejected(tooMany);

    const blankConcept = jsonCopy(newGame(48));
    blankConcept.finance.ledger = [{ round: 0, season: 1, concept: '   ', amount: 100 }];
    rejected(blankConcept);

    const invalidRound = jsonCopy(newGame(49));
    invalidRound.finance.ledger = [{ round: 15, season: 1, concept: 'Movimiento', amount: 100 }];
    rejected(invalidRound);

    const futureSeason = jsonCopy(newGame(50));
    futureSeason.finance.ledger = [{ round: 0, season: 2, concept: 'Movimiento futuro', amount: 100 }];
    rejected(futureSeason);

    const legacyWithoutSeason = jsonCopy(newGame(51));
    legacyWithoutSeason.finance.ledger = [{ round: 0, concept: 'Movimiento antiguo', amount: 100 }];
    expect(validateGame(legacyWithoutSeason)).toEqual([]);
  });

  it('exige registros completos y sin campos desconocidos en las estadísticas acumuladas', () => {
    const missing = jsonCopy(regular(1));
    const playerId = Object.keys(missing.career)[0];
    expect(playerId).toBeDefined();
    delete (missing.career[playerId] as Partial<typeof missing.career[string]>).aces;
    rejected(missing);

    const extra = jsonCopy(regular(1));
    const extraId = Object.keys(extra.career)[0];
    (extra.career[extraId] as typeof extra.career[string] & { unexpected?: number }).unexpected = 1;
    rejected(extra);
  });
  it('rechaza relaciones imposibles entre contadores individuales', () => {
    const base = jsonCopy(regular(1));
    const corruptions = [
      (s: typeof base.career[string]) => { s.serves = 1; s.aces = 1; s.serveErr = 1; },
      (s: typeof base.career[string]) => { s.recs = 1; s.recErr = 2; },
      (s: typeof base.career[string]) => { s.recs = 1; s.recErr = 1; s.recPos = 1; },
      (s: typeof base.career[string]) => { s.recs = 1; s.recPos = 0; s.recPerf = 1; },
      (s: typeof base.career[string]) => { s.atks = 1; s.kills = 1; s.atkErr = 1; },
    ];
    for (const corrupt of corruptions) {
      const game = jsonCopy(base);
      const id = Object.keys(game.career)[0];
      expect(id).toBeDefined();
      const stats = game.career[id];
      for (const key of Object.keys(stats) as (keyof typeof stats)[]) stats[key] = 0;
      corrupt(stats);
      rejected(game);
    }
  });

  it('rechaza estadísticas de temporada asociadas a un jugador inexistente', () => {
    const game = jsonCopy(regular(1));
    const id = Object.keys(game.career)[0];
    game.career['ghost-player'] = { ...game.career[id] };
    rejected(game);
  });

  it('conserva estadísticas de jugadores vendidos que permanecen en el mercado', () => {
    const game = jsonCopy(regular(1));
    const team = game.teams[game.userTeam];
    const player = team.roster.find(p => game.career[p.id] !== undefined)!;
    const sold = sell(game, player.id);
    expect(sold.market.some(p => p.id === player.id)).toBe(true);
    expect(validateGame(sold)).toEqual([]);
  });

  it('valida la identidad y los metadatos del archivo de retirados', () => {
    const activeDuplicate = jsonCopy(newGame(431));
    const player = activeDuplicate.teams[0].roster[0];
    activeDuplicate.retiredPlayers.push({ ...player, retiredSeason: 1, lastTeam: 'Río Plata' });
    rejected(activeDuplicate);

    const invalidSeason = jsonCopy(newGame(432));
    invalidSeason.retiredPlayers.push({ ...invalidSeason.market[0], retiredSeason: 2, lastTeam: 'Agente libre' });
    rejected(invalidSeason);

    const blankTeam = jsonCopy(newGame(433));
    blankTeam.retiredPlayers.push({ ...blankTeam.market[0], retiredSeason: 1, lastTeam: '   ' });
    rejected(blankTeam);

    const valid = jsonCopy(newGame(434));
    const [retired] = valid.market.splice(0, 1);
    valid.retiredPlayers.push({ ...retired, retiredSeason: 1, lastTeam: 'Agente libre' });
    expect(validateGame(valid)).toEqual([]);
  });

  it('acepta asistencias acreditadas al colocador aunque no tenga kills', () => {
    const game = jsonCopy(regular(1));
    const id = Object.keys(game.career)[0];
    const stats = game.career[id];
    stats.kills = 0;
    stats.assists = 1;
    expect(validateGame(game)).toEqual([]);
  });

  it('exige un historial cronológico y coherente con la temporada actual', () => {
    const completed = endSeason(simulateSeason(newGame(52)));
    expect(completed.season).toBe(2);
    expect(completed.history).toHaveLength(1);
    expect(validateGame(completed)).toEqual([]);

    const missing = jsonCopy(completed);
    missing.history = [];
    rejected(missing);

    const wrongSeason = jsonCopy(completed);
    wrongSeason.history[0].season = 2;
    rejected(wrongSeason);

    const blankChampion = jsonCopy(completed);
    blankChampion.history[0].champion = '   ';
    rejected(blankChampion);

    const invalidRank = jsonCopy(completed);
    invalidRank.history[0].userRank = invalidRank.teams.length + 1;
    rejected(invalidRank);

    const invalidPoints = jsonCopy(completed);
    invalidPoints.history[0].userPoints = 6 * (invalidPoints.teams.length - 1) + 1;
    rejected(invalidPoints);
  });

  it('conserva las estadísticas históricas y reinicia solo el acumulado de temporada', () => {
    const firstSeason = simulateSeason(newGame(61));
    expect(Object.keys(firstSeason.career).length).toBeGreaterThan(0);
    const firstCareer = jsonCopy(firstSeason.career);
    const afterFirst = endSeason(firstSeason);
    expect(afterFirst.career).toEqual({});
    expect(afterFirst.allTime).toEqual(firstCareer);
    for (const id of Object.keys(firstCareer)) expect(afterFirst.allTime[id]).toEqual(firstCareer[id]);

    const secondSeason = simulateSeason(afterFirst);
    const secondCareer = jsonCopy(secondSeason.career);
    const afterSecond = endSeason(secondSeason);
    expect(afterSecond.career).toEqual({});
    for (const [id, stats] of Object.entries(secondCareer)) {
      const prior = firstCareer[id] ?? Object.fromEntries(Object.keys(stats).map(k => [k, 0]));
      for (const key of Object.keys(stats) as (keyof typeof stats)[])
        expect(afterSecond.allTime[id][key]).toBe(prior[key] + stats[key]);
    }
    expect(validateGame(afterSecond)).toEqual([]);
  });

  it('rechaza semillas persistidas que no sean uint32', () => {
    const corrupt = jsonCopy(newGame(41));
    corrupt.seed = -1;
    rejected(corrupt);
    expect(() => serialize(corrupt)).toThrow(SaveError);
  });
  it('deserialize rechaza los mismos datos incoherentes que validateGame', () => {
    const corrupt = jsonCopy(regular(2));
    corrupt.results.pop();
    expect(() => deserialize(JSON.stringify(corrupt))).toThrow(SaveError);
  });
});

describe('integridad semántica de guardados: playoffs', () => {
  const completed = () => simulateSeason(newGame(73));

  it('acepta un estado intermedio y una serie a mitad de camino', () => {
    let g = regular(14, 73);
    g = startPlayoffs(g);
    g = finishPlayoffDay(g);
    expect(g.playoffs?.stage).toBe('semi');
    expect(validateGame(g)).toEqual([]);
    expect(deserialize(serialize(g))).toEqual(g);
  });

  it('rechaza participantes de semifinales que no corresponden a la clasificación', () => {
    const g = regular(14, 73);
    const p = startPlayoffs(g);
    const corrupt = jsonCopy(p);
    corrupt.playoffs!.series[0].low = corrupt.playoffs!.series[1].low;
    rejected(corrupt);
  });

  it('rechaza final y bronce con participantes ajenos a los ganadores y perdedores de semifinales', () => {
    const g = completed();
    const corrupt = jsonCopy(g);
    const f = corrupt.playoffs!.series[2];
    f.high = (f.high + 1) % corrupt.teams.length;
    rejected(corrupt);
  });

  it('rechaza ganador de serie prematuro y partidos posteriores al cierre', () => {
    const g = completed();
    const premature = jsonCopy(g);
    const semi = premature.playoffs!.series[0];
    semi.winner = semi.games[0].home;
    rejected(premature);

    const extra = jsonCopy(g);
    const final = extra.playoffs!.series[2];
    final.games.push({ ...final.games[final.games.length - 1], game: final.games.length + 1 });
    rejected(extra);
  });

  it('rechaza semillas de partidos de playoffs que no sean uint32', () => {
    const negative = jsonCopy(completed());
    negative.playoffs!.series[0].games[0].seed = -1;
    rejected(negative);

    const fractional = jsonCopy(completed());
    fractional.playoffs!.series[0].games[0].seed = 2.5;
    rejected(fractional);

    const overflow = jsonCopy(completed());
    overflow.playoffs!.series[0].games[0].seed = 0x1_0000_0000;
    rejected(overflow);
  });

  it('rechaza localía no alternada y campeón/ranking incoherentes', () => {
    const g = completed();
    const home = jsonCopy(g);
    home.playoffs!.series[0].games[1].home = home.playoffs!.series[0].high;
    rejected(home);

    const champion = jsonCopy(g);
    champion.playoffs!.champion = champion.playoffs!.ranking![1];
    rejected(champion);

    const ranking = jsonCopy(g);
    [ranking.playoffs!.ranking![0], ranking.playoffs!.ranking![1]] =
      [ranking.playoffs!.ranking![1], ranking.playoffs!.ranking![0]];
    rejected(ranking);
  });

  it('deserialize no admite un cuadro final manipulado', () => {
    const corrupt = jsonCopy(completed());
    corrupt.playoffs!.champion = (corrupt.playoffs!.champion! + 1) % corrupt.teams.length;
    expect(() => deserialize(JSON.stringify(corrupt))).toThrow(SaveError);
  });
});
