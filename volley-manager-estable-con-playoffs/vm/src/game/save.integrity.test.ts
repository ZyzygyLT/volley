import { describe, it, expect } from 'vitest';
import { SaveError, deserialize, serialize, validateGame } from './save';
import { finishRound, newGame, regularSeasonOver, type GameState } from './season';
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
