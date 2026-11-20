import { describe, expect, it } from 'vitest';
import { createMatch, makeSquads, substitute } from './match';
import { getEligibleBlockers } from './blockEligibility';
import type { Player, Team } from './types';

const teamFrom = (lineup: Player[], libero: Player): Team => ({
  name: 'Test',
  lineup,
  libero,
  risk: 50,
});

describe('elegibilidad básica de bloqueo', () => {
  it('devuelve exactamente los ocupantes de las zonas 4, 3 y 2 en las seis rotaciones', () => {
    const [squad] = makeSquads(3101);
    const initial = squad.slice(0, 6);
    const libero = squad[6];

    for (let rotation = 0; rotation < 6; rotation += 1) {
      const lineup = [...initial.slice(rotation), ...initial.slice(0, rotation)];
      const eligible = getEligibleBlockers(teamFrom(lineup, libero));

      expect(eligible.map(player => player.id)).toEqual(lineup.slice(3, 6).map(player => player.id));
      expect(eligible).toHaveLength(3);
      expect(eligible.every(player => player.role !== 'L')).toBe(true);
    }
  });

  it('incluye a cualquier rol no líbero en primera línea, sin filtrar por valoración', () => {
    const [squad] = makeSquads(3102);
    const lineup = [...squad.slice(0, 6)];
    lineup[3] = { ...lineup[3], blk: 0 };
    lineup[4] = { ...lineup[4], blk: 1 };
    const eligible = getEligibleBlockers(teamFrom(lineup, squad[6]));

    expect(eligible.map(player => player.id)).toEqual(lineup.slice(3, 6).map(player => player.id));
  });

  it('actualiza la elegibilidad cuando una sustitución reglamentaria cambia un jugador delantero', () => {
    const [squad] = makeSquads(3103);
    const benchPlayer: Player = { ...squad[4], id: 'bench-oh', name: 'Bench OH' };
    const state = createMatch(3103, 50, {
      squads: [squad, makeSquads(3104)[1]],
      benches: [[benchPlayer], []],
    });
    const before = getEligibleBlockers(state.teams[0]);
    const replaced = state.teams[0].lineup[4];
    const next = substitute(state, 0, replaced.id, benchPlayer.id);
    const after = getEligibleBlockers(next.teams[0]);

    expect(before.some(player => player.id === replaced.id)).toBe(true);
    expect(after.some(player => player.id === benchPlayer.id)).toBe(true);
    expect(after.some(player => player.id === replaced.id)).toBe(false);
    expect(state.teams[0].lineup[4].id).toBe(replaced.id);
  });

  it('restaura la elegibilidad del titular cuando regresa a su puesto original', () => {
    const [squad] = makeSquads(3107);
    const benchPlayer: Player = { ...squad[4], id: 'bench-oh-return', name: 'Bench OH Return' };
    const state = createMatch(3107, 50, {
      squads: [squad, makeSquads(3108)[1]],
      benches: [[benchPlayer], []],
    });
    const originalIds = getEligibleBlockers(state.teams[0]).map(player => player.id);
    const replaced = state.teams[0].lineup[4];
    const entered = substitute(state, 0, replaced.id, benchPlayer.id);
    const returned = substitute(entered, 0, benchPlayer.id, replaced.id);

    expect(getEligibleBlockers(entered.teams[0]).map(player => player.id)).not.toEqual(originalIds);
    expect(getEligibleBlockers(returned.teams[0]).map(player => player.id)).toEqual(originalIds);
    expect(entered.teams[0].lineup[4].id).toBe(benchPlayer.id);
    expect(state.teams[0].lineup[4].id).toBe(replaced.id);
  });

  it('mantiene la elegibilidad de bloqueo al sustituir únicamente al líbero', () => {
    const [squad] = makeSquads(3109);
    const benchLibero: Player = { ...squad[6], id: 'bench-libero', name: 'Bench Libero' };
    const state = createMatch(3109, 50, {
      squads: [squad, makeSquads(3110)[1]],
      benches: [[benchLibero], []],
    });
    const before = getEligibleBlockers(state.teams[0]).map(player => player.id);
    const next = substitute(state, 0, state.teams[0].libero.id, benchLibero.id);

    expect(next.teams[0].libero.id).toBe(benchLibero.id);
    expect(getEligibleBlockers(next.teams[0]).map(player => player.id)).toEqual(before);
    expect(state.teams[0].libero.id).toBe(squad[6].id);
  });

  it('no incorpora al líbero, que permanece separado de la alineación', () => {
    const [squad] = makeSquads(3105);
    const team = teamFrom(squad.slice(0, 6), squad[6]);
    const eligible = getEligibleBlockers(team);

    expect(eligible.some(player => player.id === team.libero.id)).toBe(false);
  });

  it('rechaza alineaciones incompletas, duplicadas o con líbero en primera línea', () => {
    const [squad] = makeSquads(3106);

    expect(() => getEligibleBlockers(teamFrom(squad.slice(0, 5), squad[6]))).toThrow(/exactamente seis/);
    expect(() => getEligibleBlockers(teamFrom([squad[0], squad[1], squad[2], squad[3], squad[3], squad[5]], squad[6]))).toThrow(/duplicados/);
    expect(() => getEligibleBlockers(teamFrom([squad[0], squad[1], squad[2], squad[6], squad[4], squad[5]], squad[6]))).toThrow(/líbero/);
  });
});
