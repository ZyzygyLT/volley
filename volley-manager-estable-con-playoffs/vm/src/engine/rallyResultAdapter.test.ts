import { describe, expect, it } from 'vitest';
import { adaptRallyTermination } from './rallyResultAdapter';
import type { RallyResult } from './types';

const result = (overrides: Partial<RallyResult> = {}): RallyResult => ({
  winner: 1,
  text: 'Error de ataque',
  trace: {
    serve: 'in',
    serveType: 'FS',
    atks: [],
    ev: [],
    },
  termination: { kind: 'fault', responsibleTeam: 0 },
  ...overrides
});

describe('adaptRallyTermination', () => {
  it('adapts a fault with the actual point winner and responsible team', () => {
    expect(adaptRallyTermination(result())).toEqual({
      continues: false,
      pointWinner: 1,
      termination: { kind: 'fault', responsibleTeam: 0 }
    });
  });

  it('adapts a winning action', () => {
    expect(adaptRallyTermination(result({
      winner: 0,
      termination: { kind: 'winning-action', responsibleTeam: 0 }
    }))).toEqual({
      continues: false,
      pointWinner: 0,
      termination: { kind: 'winning-action', responsibleTeam: 0 }
    });
  });

  it('does not invent a termination for a capped rally', () => {
    expect(adaptRallyTermination(result({
      winner: 0,
      termination: undefined,
      trace: {
        serve: 'in',
        serveType: 'FS',
        atks: [],
        ev: [],
        capped: true
      }
    }))).toBeNull();
  });

  it('rejects inconsistent winner and termination facts', () => {
    expect(adaptRallyTermination(result({
      winner: 0,
      termination: { kind: 'fault', responsibleTeam: 0 }
    }))).toBeNull();
    expect(adaptRallyTermination(result({
      winner: 1,
      termination: { kind: 'winning-action', responsibleTeam: 0 }
    }))).toBeNull();
  });
});
