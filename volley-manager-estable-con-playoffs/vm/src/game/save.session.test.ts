import { describe, it, expect } from 'vitest';
import { legalSubs, sideForTeam, stepPoint, substitute } from '../engine/match';
import { finishRound, matchFor, newGame, regularSeasonOver } from './season';
import { finishPlayoffDay, matchForSeries, startPlayoffs, userSeries } from './playoffs';
import { deserializeSession, serialize, serializeSession, SaveError, memoryStore, indexedDbStore } from './save';

function completeRegular(seed = 91) {
  let g = newGame(seed);
  while (!regularSeasonOver(g)) g = finishRound(g);
  return g;
}

describe('tipo de almacenamiento', () => {
  it('distingue almacenamiento persistente de memoria temporal', () => {
    expect(memoryStore().persistent).toBe(false);
    expect(indexedDbStore().persistent).toBe(true);
  });
});

describe('sesiones con partido en curso', () => {
  it('guarda y recupera un partido de liga con marcador, rotación, estadísticas y sustituciones', () => {
    const game = newGame(91);
    const fixture = game.fixtures.find(f => f.round === game.round && (f.home === game.userTeam || f.away === game.userTeam))!;
    let live = matchFor(game, fixture);
    for (let i = 0; i < 9; i++) live = stepPoint(live);
    const sub = legalSubs(live, 0)[0];
    if (!sub) throw new Error('El partido debería ofrecer al menos un cambio legal');
    live = substitute(live, 0, sub.out.id, sub.inn.id);
    const json = serializeSession(game, live, 'liga');
    const restored = deserializeSession(json);
    expect(restored.game).toEqual(game);
    expect(restored.liveKind).toBe('liga');
    expect(restored.liveMatch).toEqual(live);
    expect(restored.liveMatch?.subHistory).toEqual(live.subHistory);
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
    const inconsistentStats = structuredClone(live);
    inconsistentStats.stats[0].ace++;
    expect(() => serializeSession(game, inconsistentStats, 'liga')).toThrow(SaveError);
    const unrelated = structuredClone(live);
    unrelated.teams[0].name = 'Equipo ajeno';
    expect(() => serializeSession(game, unrelated, 'liga')).toThrow(SaveError);

    const foreignRoster = structuredClone(live);
    const alteredPlayer = foreignRoster.base[0][0];
    alteredPlayer.age = (alteredPlayer.age ?? 20) + 1;
    const lineupPlayer = foreignRoster.teams[0].lineup.find(p => p.id === alteredPlayer.id)!;
    lineupPlayer.age = alteredPlayer.age;
    expect(() => serializeSession(game, foreignRoster, 'liga')).toThrow(SaveError);

    const importedForeignRoster = JSON.parse(serializeSession(game, live, 'liga'));
    importedForeignRoster.liveMatch = foreignRoster;
    expect(() => deserializeSession(JSON.stringify(importedForeignRoster))).toThrow(SaveError);
  });

  it('rechaza participantes invertidos o una modalidad que no corresponde', () => {
    const game = newGame(94);
    const fixture = game.fixtures.find(f => f.round === game.round && (f.home === game.userTeam || f.away === game.userTeam))!;
    const live = matchFor(game, fixture);
    const reversed = structuredClone(live);
    reversed.teams.reverse();
    expect(() => serializeSession(game, reversed, 'liga')).toThrow(SaveError);
    expect(() => serializeSession(game, live, 'playoff')).toThrow(SaveError);
    const payload = JSON.parse(serializeSession(game, live, 'liga'));
    payload.liveKind = 'playoff';
    expect(() => deserializeSession(JSON.stringify(payload))).toThrow(SaveError);
  });

  it('valida el orden de localía alterna en el segundo partido de playoffs', () => {
    const first = startPlayoffs(completeRegular(91));
    const afterOneDay = finishPlayoffDay(first);
    const series = userSeries(afterOneDay)!;
    expect(series.games).toHaveLength(1);
    // Forzar al usuario como cabeza de serie: en el segundo partido debe ser visitante.
    const userAsHigh = { ...afterOneDay, userTeam: series.high };
    const live = matchForSeries(userAsHigh, userSeries(userAsHigh)!);
    expect(sideForTeam(live, userAsHigh.teams[userAsHigh.userTeam].name)).toBe(1);
    const restored = deserializeSession(serializeSession(userAsHigh, live, 'playoff'));
    expect(restored.liveMatch).toEqual(live);
    const reversed = structuredClone(live);
    reversed.teams.reverse();
    expect(() => serializeSession(userAsHigh, reversed, 'playoff')).toThrow(SaveError);
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
