import { describe, expect, it } from 'vitest';
import { makeSquads } from './match';
import { mulberry32 } from './rng';
import { playRally } from './rally';
import type { Team } from './types';

function teams(seed: number): [Team, Team] {
  const [a, b] = makeSquads(seed);
  const team = (name: string, squad: typeof a): Team => ({
    name,
    lineup: squad.slice(0, 6),
    libero: squad[6],
    risk: 50
  });
  return [team('A', a), team('B', b)];
}

describe('rally: contrato del ciclo actual', () => {
  it('es determinista para los mismos equipos, semilla y saque', () => {
    const roster = teams(41);
    const first = playRally(roster, 0, mulberry32(991));
    const second = playRally(roster, 0, mulberry32(991));

    expect(second).toEqual(first);
  });

  it('un saque válido siempre inicia con recepción antes de cualquier ataque', () => {
    for (let seed = 1; seed <= 250; seed++) {
      const result = playRally(teams(seed), 0, mulberry32(seed * 17));
      const events = result.trace.ev;

      expect(events[0]?.k).toBe('serve');
      if (result.trace.serve === 'in') {
        expect(events[1]?.k).toBe('rec');
        const firstAttack = events.findIndex(event => event.k === 'atk');
        const reception = events.findIndex(event => event.k === 'rec');
        if (firstAttack !== -1) expect(reception).toBeLessThan(firstAttack);
      } else if (result.trace.serve === 'err') {
        expect(events.some(event => event.k === 'rec' || event.k === 'atk')).toBe(false);
      } else {
        expect(events.some(event => event.k === 'rec' && event.err === true)).toBe(true);
        expect(events.some(event => event.k === 'atk')).toBe(false);
      }
    }
  });

  it('los eventos de ataque y bloqueo tienen jugadores de las dos plantillas', () => {
    for (let seed = 1; seed <= 250; seed++) {
      const roster = teams(seed);
      const ids = new Set([...roster[0].lineup, roster[0].libero, ...roster[1].lineup, roster[1].libero].map(p => p.id));
      const result = playRally(roster, 0, mulberry32(seed * 29));

      for (const event of result.trace.ev) {
        if (event.k === 'atk' || event.k === 'blk' || event.k === 'dig' || event.k === 'rec' || event.k === 'serve' || event.k === 'oerr') {
          expect(ids.has(event.p)).toBe(true);
        }
      }
      expect(result.trace.atks.length).toBe(result.trace.ev.filter(event => event.k === 'atk').length);
    }
  });

  it('todo ataque registrado tiene una resolución válida', () => {
    for (let seed = 1; seed <= 250; seed++) {
      const result = playRally(teams(seed), 0, mulberry32(seed * 43));
      for (const attack of result.trace.atks) {
        expect(['kill', 'err', 'blk', 'cont']).toContain(attack.out);
        expect(['k1', 'k2']).toContain(attack.phase);
        expect(attack.q).toBeGreaterThanOrEqual(0.05);
        expect(attack.q).toBeLessThanOrEqual(1);
      }
    }
  });
});
