import { describe, it, expect } from 'vitest';
import { legalSubs, stepPoint, substitute } from '../engine/match';
import { finishRound, matchFor, newGame, regularSeasonOver } from './season';
import { matchForSeries, startPlayoffs, userSeries } from './playoffs';
import { deserialize, deserializeSession, serialize, serializeSession, SaveError } from './save';

function completeRegular(seed = 91) {
  let g = newGame(seed);
  while (!regularSeasonOver(g)) g = finishRound(g);
  return g;
}

describe('sesiones con partido en curso', () => {
  it('guarda y recupera un partido de liga con marcador, rotación, estadísticas y sustituciones', () => {
    const game = newGame(91);
    const fixture = game.fixtures.find(f => f.round === game.round && (f.home === game.userTeam || f.away === game.userTeam))!;
    let live = matchFor(game, fixture);
    for (let i = 0; i < 9; i++) live = stepPoint(live);
    const sub = legalSubs(live, 0)[0];
    expect(sub).toBeDefined();
    live = substitute(live, 0, sub.out.id, sub.inn.id);
    const json = serializeSession(game, live, 'liga');
    const restored = deserializeSession(json);
    expect(restored.game).toEqual(game);
    expect(restored.liveKind).toBe('liga');
    expect(restored.liveMatch).toEqual(live);
    expect(deserializeSession(serialize(game)).liveMatch).toBeNull();
  });

  it('guarda y recupera un partido de playoffs y su tipo de competición', () => {
    const regular = completeRegular();
    const game = startPlayoffs(regular);
    const series = userSeries(game)!;
    let live = matchForSeries(game, series);
    for (let i = 0; i < 13; i++) live = stepPoint(live);
    const restored = deserializeSession(serializeSession(game, live, 'playoff'));
    expect(restored.game).toEqual(game);
    expect(restored.liveKind).toBe('playoff');
    expect(restored.liveMatch).toEqual(live);
  });

  it('rechaza un partido alterado o que no pertenece a los participantes de la partida', () => {
    const game = newGame(92);
    const fixture = game.fixtures.find(f => f.round === game.round && (f.home === game.userTeam || f.away === game.userTeam))!;
    const live = matchFor(game, fixture);
    const corrupt = structuredClone(live);
    corrupt.totals[0] += 1;
    expect(() => serializeSession(game, corrupt, 'liga')).toThrow(SaveError);
    const unrelated = structuredClone(live);
    unrelated.teams[0].name = 'Equipo ajeno';
    expect(() => serializeSession(game, unrelated, 'liga')).toThrow(SaveError);
  });

  it('rechaza una sesión importada con marcador inconsistente', () => {
    const game = newGame(93);
    const fixture = game.fixtures.find(f => f.round === game.round && (f.home === game.userTeam || f.away === game.userTeam))!;
    const live = matchFor(game, fixture);
    const parsed = JSON.parse(serializeSession(game, live, 'liga'));
    parsed.liveMatch.score[0] += 1;
    expect(() => deserializeSession(JSON.stringify(parsed))).toThrow(SaveError);
  });
});
