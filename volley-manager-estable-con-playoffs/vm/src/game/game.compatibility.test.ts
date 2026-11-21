import { describe, it, expect } from 'vitest';
import { newGame, finishRound, endSeason } from './season';
import { serialize, deserialize, validateGame } from './save';
import { simulateSeason } from './playoffs';

describe('compatibilidad con partidas de versiones anteriores', () => {
  it('una partida guardada con ataque o bloqueo negativos del líbero (versión anterior) se limpia y se abre', () => {
    const base = JSON.parse(serialize(newGame(3))); const lib = base.teams[0].roster.find((p: { role: string }) => p.role === 'L'); lib.atk = -6; lib.blk = -2;
    const g = deserialize(JSON.stringify(base)); const l = g.teams[0].roster.find(p => p.role === 'L')!; expect([l.atk, l.blk]).toEqual([0, 0]);
  });
  it('migra cada versión histórica hasta el esquema actual', () => {
    const current = JSON.parse(serialize(finishRound(newGame(120))));
    const legacy = (version: 1 | 2 | 3 | 4 | 5) => {
      const value = structuredClone(current);
      value.version = version;
      if (version <= 3) {
        for (const team of value.teams) {
          delete team.clubBoost;
          for (const player of team.roster) delete player.age;
        }
        for (const player of value.market) delete player.age;
      }
      if (version <= 2) {
        delete value.season;
        delete value.history;
        delete value.allTime;
        value.results = value.results.map((result: Record<string, unknown>) => {
          const copy = { ...result };
          delete copy.setScores;
          return copy;
        });
      }
      if (version === 1) {
        delete value.finance;
        delete value.market;
      }
      if (version <= 3) {
        delete value.news;
        delete value.progressLog;
      }
      if (version <= 4) delete value.playoffs;
      if (version <= 5) delete value.retiredPlayers;
      return value;
    };

    for (const version of [1, 2, 3, 4, 5] as const) {
      const migrated = deserialize(JSON.stringify(legacy(version)));
      expect(migrated.version).toBe(6);
      expect(migrated.teams).toHaveLength(current.teams.length);
      expect(migrated.fixtures).toEqual(current.fixtures);
      expect(migrated.results).toEqual(current.results.map((result: Record<string, unknown>) =>
        version <= 2 ? { ...result, setScores: [] } : result,
      ));
      expect(migrated.playoffs).toBeNull();
      expect(migrated.news).toEqual([]);
      expect(migrated.progressLog).toEqual([]);
      expect(validateGame(migrated)).toEqual([]);
    }
  });

  it('aplica los valores por defecto de cada transición y asigna edades deterministas', () => {
    const current = JSON.parse(serialize(newGame(121)));
    const v1 = structuredClone(current);
    v1.version = 1;
    delete v1.finance;
    delete v1.market;
    delete v1.season;
    delete v1.history;
    delete v1.allTime;
    delete v1.news;
    delete v1.progressLog;
    delete v1.playoffs;
    for (const team of v1.teams) {
      delete team.clubBoost;
      for (const player of team.roster) delete player.age;
    }

    const first = deserialize(JSON.stringify(v1));
    const second = deserialize(JSON.stringify(v1));
    expect(first.finance).toEqual({ budget: current.finance.budget, ledger: [] });
    expect(first.market).toEqual([]);
    expect(first.season).toBe(1);
    expect(first.history).toEqual([]);
    expect(first.allTime).toEqual({});
    expect(first.playoffs).toBeNull();
    expect(first.teams.map(team => team.roster.map(player => player.age)))
      .toEqual(second.teams.map(team => team.roster.map(player => player.age)));
    expect(first.teams.every(team => team.clubBoost === 0)).toBe(true);
    expect(validateGame(first)).toEqual([]);
  });

  it('conserva el historial y las estadísticas al migrar una partida evolucionada de v4', () => {
    const progressed = endSeason(simulateSeason(newGame(122)));
    const legacy = JSON.parse(serialize(progressed));
    legacy.version = 4;
    delete legacy.playoffs;

    const migrated = deserialize(JSON.stringify(legacy));
    expect(migrated.version).toBe(5);
    expect(migrated.season).toBe(2);
    expect(migrated.history).toEqual(legacy.history);
    expect(migrated.allTime).toEqual(legacy.allTime);
    expect(migrated.teams).toEqual(legacy.teams);
    expect(migrated.playoffs).toBeNull();
    expect(validateGame(migrated)).toEqual([]);
  });

  it('reconstruye edades sin perder estadísticas acumuladas al migrar una partida evolucionada de v3', () => {
    const progressed = endSeason(simulateSeason(newGame(123)));
    const legacy = JSON.parse(serialize(progressed));
    legacy.version = 3;
    delete legacy.news;
    delete legacy.progressLog;
    for (const team of legacy.teams) {
      delete team.clubBoost;
      for (const player of team.roster) delete player.age;
    }
    for (const player of legacy.market) delete player.age;

    const migrated = deserialize(JSON.stringify(legacy));
    expect(migrated.version).toBe(5);
    expect(migrated.season).toBe(2);
    expect(migrated.history).toEqual(legacy.history);
    expect(migrated.allTime).toEqual(legacy.allTime);
    expect(migrated.teams.every(team => team.roster.every(player => Number.isInteger(player.age)))).toBe(true);
    expect(migrated.teams.every(team => team.clubBoost === 0)).toBe(true);
    expect(validateGame(migrated)).toEqual([]);
  });

  it('la migración histórica no muta el JSON de origen y es estable al volver a guardar', () => {
    const current = JSON.parse(serialize(finishRound(newGame(125))));
    const legacy = structuredClone(current);
    legacy.version = 3;
    delete legacy.news;
    delete legacy.progressLog;
    for (const team of legacy.teams) {
      delete team.clubBoost;
      for (const player of team.roster) delete player.age;
    }
    for (const player of legacy.market) delete player.age;
    const original = structuredClone(legacy);

    const migrated = deserialize(JSON.stringify(legacy));
    expect(legacy).toEqual(original);
    const savedAgain = serialize(migrated);
    const reopened = deserialize(savedAgain);
    expect(reopened).toEqual(migrated);
    expect(serialize(reopened)).toBe(savedAgain);
  });

  it('rechaza versiones desconocidas sin intentar tratarlas como partidas actuales', () => {
    const current = JSON.parse(serialize(newGame(124)));
    for (const version of [0, 7, 999, -1, '5', null]) {
      const unsupported = { ...current, version };
      expect(() => deserialize(JSON.stringify(unsupported))).toThrow(/Versión no soportada/);
    }
    const missingVersion = { ...current };
    delete missingVersion.version;
    expect(() => deserialize(JSON.stringify(missingVersion))).toThrow(/Versión no soportada/);
  });

  it('rechaza raíces JSON que no representan una partida', () => {
    for (const value of [null, [], 'partida', 42, true]) {
      expect(() => deserialize(JSON.stringify(value))).toThrow(/Partida inválida/);
    }
  });

  it('los líberos nuevos nunca tienen ataque ni bloqueo negativos', () => {
    let g = newGame(9); for (let s = 0; s < 8; s++) { g = simulateSeason(g); g = endSeason(g); }
    for (const p of [...g.teams.flatMap(t => t.roster), ...g.market]) { expect(p.atk).toBeGreaterThanOrEqual(0); expect(p.blk).toBeGreaterThanOrEqual(0); }
  });
});
