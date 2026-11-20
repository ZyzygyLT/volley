import { describe, expect, it } from 'vitest';
import { validateCompoundAction } from './compoundContacts';
import { buildOpeningRallyActions } from './rallyOpeningActions';
import type { RallyResult, Trace } from './types';

function result(serve: Trace['serve'], includeReception: boolean, receptionError = false): RallyResult {
  const ev: Trace['ev'] = [
    { k: 'serve', p: 'server-1', t: 'FS', o: serve }
  ];
  if (includeReception) {
    ev.push({ k: 'rec', p: 'receiver-1', q: receptionError ? 0 : 0.72, ...(receptionError ? { err: true } : {}) });
  }
  return {
    winner: serve === 'err' ? 1 : 0,
    text: 'fixture',
    trace: {
      serve,
      serveType: 'FS',
      atks: [],
      ev,
      }
  };
}

describe('rally opening action projection', () => {
  it('projects the known serve and the selected receiver for an in-serve', () => {
    const actions = buildOpeningRallyActions('rally-1', result('in', true), 0);

    expect(actions).toHaveLength(2);
    expect(actions[0]).toMatchObject({
      actionId: 'rally-1:serve',
      rallyOrder: 1,
      kind: 'serve',
      actingTeam: 0,
      groups: [{ relation: 'single', contacts: [{ playerId: 'server-1', team: 0 }] }]
    });
    expect(actions[1]).toMatchObject({
      actionId: 'rally-1:reception',
      rallyOrder: 2,
      kind: 'reception',
      actingTeam: 1,
      groups: [{ relation: 'single', contacts: [{ playerId: 'receiver-1', team: 1 }] }]
    });
    expect(actions.flatMap(action => validateCompoundAction(action))).toEqual([]);
  });

  it('does not invent a reception after a serve error', () => {
    const actions = buildOpeningRallyActions('rally-error', result('err', false), 0);
    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe('serve');
  });

  it('does not treat the failed-reception attribution on an ace as a physical contact', () => {
    const actions = buildOpeningRallyActions('rally-ace', result('ace', true, true), 0);
    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe('serve');
  });

  it('does not emit incomplete actions when the rally identifier is empty', () => {
    expect(buildOpeningRallyActions('  ', result('in', true), 0)).toEqual([]);
  });

  it('does not mutate the original rally result', () => {
    const rally = result('in', true);
    const before = structuredClone(rally);

    buildOpeningRallyActions('rally-immutable', rally, 0);

    expect(rally).toEqual(before);
  });
});
