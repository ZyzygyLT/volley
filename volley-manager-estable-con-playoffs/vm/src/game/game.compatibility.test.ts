import { describe, it, expect } from 'vitest';
import { newGame, endSeason } from './season';
import { serialize, deserialize } from './save';
import { simulateSeason } from './playoffs';

describe('compatibilidad con partidas de versiones anteriores', () => {
  it('una partida guardada con ataque o bloqueo negativos del líbero (versión anterior) se limpia y se abre', () => {
    const base = JSON.parse(serialize(newGame(3))); const lib = base.teams[0].roster.find((p: { role: string }) => p.role === 'L'); lib.atk = -6; lib.blk = -2;
    const g = deserialize(JSON.stringify(base)); const l = g.teams[0].roster.find(p => p.role === 'L')!; expect([l.atk, l.blk]).toEqual([0, 0]);
  });
  it('los líberos nuevos nunca tienen ataque ni bloqueo negativos', () => {
    let g = newGame(9); for (let s = 0; s < 8; s++) { g = simulateSeason(g); g = endSeason(g); }
    for (const p of [...g.teams.flatMap(t => t.roster), ...g.market]) { expect(p.atk).toBeGreaterThanOrEqual(0); expect(p.blk).toBeGreaterThanOrEqual(0); }
  });
});
