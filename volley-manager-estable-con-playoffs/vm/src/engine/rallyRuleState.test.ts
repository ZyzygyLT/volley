import { describe, expect, it } from 'vitest';
import {
  createRallyRuleState,
  transitionRallyRuleState
} from './rallyRuleState';
import type { CompoundRallyAction } from './compoundContacts';

const action = (
  rallyOrder: number,
  actingTeam: 0 | 1,
  kind: CompoundRallyAction['kind'] = 'reception',
  playerId = 'p1'
): CompoundRallyAction => ({
  actionId: `action-${rallyOrder}`,
  rallyOrder,
  actingTeam,
  kind,
  groups: [{ relation: 'single', contacts: [{ playerId, team: actingTeam }] }]
});

describe('rally rule state: explicit transitions', () => {
  it('starts with the supplied first team and zero hits', () => {
    expect(createRallyRuleState(0)).toEqual({
      status: 'in-play',
      nextTeam: 0,
      hits: { 0: 0, 1: 0 },
      lastActionContactPlayerIdsByTeam: { 0: [], 1: [] },
      postBlockFirstHitPendingFor: null,
      nextActionOrder: 1,
      pointWinner: null,
      lastActionId: null
    });
  });

  it('starts the rally with a serve that consumes no team hit', () => {
    const result = transitionRallyRuleState(
      createRallyRuleState(0),
      action(1, 0, 'serve', 'server'),
      { continues: true, nextTeam: 1 }
    );
    expect(result.issues).toEqual([]);
    expect(result.state?.hits).toEqual({ 0: 0, 1: 0 });
    expect(result.state?.nextTeam).toBe(1);
  });

  it('keeps the same team hit count while its actions continue', () => {
    let state = createRallyRuleState(0);
    const first = transitionRallyRuleState(state, action(1, 0), { continues: true, nextTeam: 0 });
    expect(first.issues).toEqual([]);
    state = first.state!;
    const second = transitionRallyRuleState(state, action(2, 0, 'set', 'p2'), { continues: true, nextTeam: 0 });
    expect(second.state?.hits[0]).toBe(2);
  });

  it('allows exactly three team hits', () => {
    let state = createRallyRuleState(0);
    for (let order = 1; order <= 3; order++) {
      const result = transitionRallyRuleState(
        state,
        action(order, 0, order === 1 ? 'reception' : order === 2 ? 'set' : 'attack', `p${order}`),
        { continues: true, nextTeam: 0 }
      );
      expect(result.issues).toEqual([]);
      state = result.state!;
    }
    expect(state.hits[0]).toBe(3);
  });

  it('rejects a fourth counted hit without mutating the previous state', () => {
    let state = createRallyRuleState(0);
    for (let order = 1; order <= 3; order++) {
      state = transitionRallyRuleState(
        state,
        action(order, 0, order === 1 ? 'reception' : order === 2 ? 'set' : 'cover', `p${order}`),
        { continues: true, nextTeam: 0 }
      ).state!;
    }
    const before = structuredClone(state);
    const result = transitionRallyRuleState(state, action(4, 0, 'attack', 'p4'), { continues: true, nextTeam: 0 });
    expect(result.state).toBeNull();
    expect(result.issues.map(issue => issue.code)).toContain('too-many-team-hits');
    expect(state).toEqual(before);
  });

  it('resets the receiving team allowance when the next team changes', () => {
    let state = createRallyRuleState(0);
    state = transitionRallyRuleState(state, action(1, 0), { continues: true, nextTeam: 1 }).state!;
    expect(state.nextTeam).toBe(1);
    expect(state.hits[1]).toBe(0);
  });

  it('does not count a block and resets the blocking team allowance', () => {
    let state = createRallyRuleState(0);
    state = transitionRallyRuleState(state, action(1, 0), { continues: true, nextTeam: 1 }).state!;
    state = transitionRallyRuleState(state, action(2, 1), { continues: true, nextTeam: 0 }).state!;
    // The next action is a block by team 0. The state explicitly grants that team a fresh allowance.
    const block = action(3, 0, 'block', 'middle');
    const result = transitionRallyRuleState(state, block, { continues: true, nextTeam: 0 });
    expect(result.issues).toEqual([]);
    expect(result.state?.hits[0]).toBe(0);
    expect(result.state?.nextTeam).toBe(0);
  });

  it('resets the explicitly identified receiving team after simultaneous opponents over the net', () => {
    let state = createRallyRuleState(0);
    const simultaneous = action(1, 0);
    simultaneous.opponentSimultaneousOverNet = true;
    simultaneous.receivingTeam = 1;
    simultaneous.groups = [{
      relation: 'simultaneous',
      contacts: [{ playerId: 'p1', team: 0 }, { playerId: 'p2', team: 1 }]
    }];
    const result = transitionRallyRuleState(state, simultaneous, { continues: true, nextTeam: 1 });
    expect(result.issues).toEqual([]);
    expect(result.state?.hits[1]).toBe(0);
  });

  it('requires the receiving team to be the next team after simultaneous opponents over the net', () => {
    const simultaneous: CompoundRallyAction = {
      ...action(1, 0),
      opponentSimultaneousOverNet: true,
      receivingTeam: 1,
      groups: [{
        relation: 'simultaneous',
        contacts: [
          { playerId: 'p0', team: 0 },
          { playerId: 'p1', team: 1 }
        ]
      }]
    };
    const result = transitionRallyRuleState(
      createRallyRuleState(0),
      simultaneous,
      { continues: true, nextTeam: 0 }
    );
    expect(result.state).toBeNull();
    expect(result.issues.map(issue => issue.code)).toContain('invalid-opponent-simultaneous-transition');
  });

  it('requires the ball to remain in play for the simultaneous-over-net allowance reset', () => {
    const simultaneous: CompoundRallyAction = {
      ...action(1, 0),
      opponentSimultaneousOverNet: true,
      receivingTeam: 1,
      groups: [{
        relation: 'simultaneous',
        contacts: [
          { playerId: 'p0', team: 0 },
          { playerId: 'p1', team: 1 }
        ]
      }]
    };
    const result = transitionRallyRuleState(
      createRallyRuleState(0),
      simultaneous,
      { continues: false, pointWinner: 0 }
    );
    expect(result.state).toBeNull();
    expect(result.issues.map(issue => issue.code)).toContain('invalid-opponent-simultaneous-transition');
  });

  it('rejects an action by a team that is not authorized to act', () => {
    const result = transitionRallyRuleState(
      createRallyRuleState(0),
      action(1, 1),
      { continues: true, nextTeam: 0 }
    );
    expect(result.state).toBeNull();
    expect(result.issues.map(issue => issue.code)).toContain('wrong-acting-team');
  });

  it('rejects an action with an unexpected order', () => {
    const result = transitionRallyRuleState(
      createRallyRuleState(0),
      action(2, 0),
      { continues: true, nextTeam: 1 }
    );
    expect(result.issues.map(issue => issue.code)).toContain('wrong-action-order');
  });

  it('requires an explicit next team while the rally continues', () => {
    const result = transitionRallyRuleState(
      createRallyRuleState(0),
      action(1, 0),
      { continues: true }
    );
    expect(result.issues.map(issue => issue.code)).toContain('missing-next-team');
  });

  it('requires an explicit point winner when the rally ends', () => {
    const result = transitionRallyRuleState(
      createRallyRuleState(0),
      action(1, 0),
      { continues: false }
    );
    expect(result.issues.map(issue => issue.code)).toContain('missing-point-winner');
  });

  it('does not allow actions after a terminal rally', () => {
    const terminal = transitionRallyRuleState(
      createRallyRuleState(0),
      action(1, 0),
      { continues: false, pointWinner: 0 }
    );
    const next = transitionRallyRuleState(terminal.state!, action(2, 0), { continues: true, nextTeam: 0 });
    expect(next.issues.map(issue => issue.code)).toContain('rally-already-finished');
  });

  it('returns a new state and leaves the input immutable', () => {
    const state = createRallyRuleState(0);
    const before = structuredClone(state);
    const result = transitionRallyRuleState(state, action(1, 0), { continues: true, nextTeam: 1 });
    expect(state).toEqual(before);
    expect(result.state).not.toBe(state);
  });

  it('rejects the same player making consecutive team contacts', () => {
    let state = createRallyRuleState(0);
    state = transitionRallyRuleState(state, action(1, 0, 'reception', 'p1'), { continues: true, nextTeam: 0 }).state!;
    const result = transitionRallyRuleState(state, action(2, 0, 'set', 'p1'), { continues: true, nextTeam: 0 });
    expect(result.state).toBeNull();
    expect(result.issues.map(issue => issue.code)).toContain('same-player-consecutive-hit');
  });

  it('allows a different player to make the next team contact', () => {
    let state = createRallyRuleState(0);
    state = transitionRallyRuleState(state, action(1, 0, 'reception', 'p1'), { continues: true, nextTeam: 0 }).state!;
    const result = transitionRallyRuleState(state, action(2, 0, 'set', 'p2'), { continues: true, nextTeam: 0 });
    expect(result.issues).toEqual([]);
    expect(result.state?.lastActionContactPlayerIdsByTeam[0]).toEqual(['p2']);
  });

  it('allows the blocker to make the first hit after the own block', () => {
    let state = createRallyRuleState(0);
    state = transitionRallyRuleState(state, action(1, 0), { continues: true, nextTeam: 1 }).state!;
    state = transitionRallyRuleState(state, action(2, 1), { continues: true, nextTeam: 0 }).state!;
    state = transitionRallyRuleState(state, action(3, 0, 'block', 'middle'), { continues: true, nextTeam: 0 }).state!;
    const result = transitionRallyRuleState(state, action(4, 0, 'defense', 'middle'), { continues: true, nextTeam: 0 });
    expect(result.issues).toEqual([]);
    expect(result.state?.postBlockFirstHitPendingFor).toBeNull();
  });

  it('keeps the post-block exception pending while the opponent plays first', () => {
    let state = createRallyRuleState(0);
    state = transitionRallyRuleState(state, action(1, 0), { continues: true, nextTeam: 1 }).state!;
    state = transitionRallyRuleState(state, action(2, 1), { continues: true, nextTeam: 0 }).state!;
    state = transitionRallyRuleState(state, action(3, 0, 'block', 'middle'), { continues: true, nextTeam: 1 }).state!;
    expect(state.postBlockFirstHitPendingFor).toBe(0);
    state = transitionRallyRuleState(state, action(4, 1, 'attack', 'opponent'), { continues: true, nextTeam: 0 }).state!;
    const result = transitionRallyRuleState(state, action(5, 0, 'defense', 'middle'), { continues: true, nextTeam: 0 });
    expect(result.issues).toEqual([]);
    expect(result.state?.postBlockFirstHitPendingFor).toBeNull();
  });

  it('does not accept an external post-block flag without a block in state history', () => {
    let state = createRallyRuleState(0);
    state = transitionRallyRuleState(state, action(1, 0, 'reception', 'p1'), { continues: true, nextTeam: 0 }).state!;
    const forged = { ...action(2, 0, 'set', 'p1'), isFirstHitAfterOwnBlock: true };
    const result = transitionRallyRuleState(state, forged, { continues: true, nextTeam: 0 });
    expect(result.state).toBeNull();
    expect(result.issues.map(issue => issue.code)).toContain('same-player-consecutive-hit');
  });

  it('does not trust a forged first-team-hit flag after a counted hit', () => {
    let state = createRallyRuleState(0);
    state = transitionRallyRuleState(
      state,
      action(1, 0, 'reception', 'receiver'),
      { continues: true, nextTeam: 0 }
    ).state!;
    const forgedFirstHit: CompoundRallyAction = {
      ...action(2, 0, 'set', 'setter'),
      isFirstTeamHit: true,
      groups: [{
        relation: 'consecutive-within-action',
        contacts: [
          { playerId: 'setter', team: 0 },
          { playerId: 'setter', team: 0, bodyPart: 'hand' }
        ]
      }]
    };
    const result = transitionRallyRuleState(
      state,
      forgedFirstHit,
      { continues: true, nextTeam: 0 }
    );
    expect(result.state).toBeNull();
    expect(result.issues.map(issue => issue.code)).toContain('invalid-first-team-hit-context');
  });

  it('remembers contacts from both teams in an opponent simultaneous action', () => {
    const simultaneous: CompoundRallyAction = {
      ...action(1, 0),
      opponentSimultaneousOverNet: true,
      receivingTeam: 1,
      groups: [{
        relation: 'simultaneous',
        contacts: [
          { playerId: 'attacker', team: 0 },
          { playerId: 'blocker', team: 1 }
        ]
      }]
    };
    const first = transitionRallyRuleState(
      createRallyRuleState(0),
      simultaneous,
      { continues: true, nextTeam: 1 }
    );
    expect(first.issues).toEqual([]);
    expect(first.state?.lastActionContactPlayerIdsByTeam).toEqual({
      0: ['attacker'],
      1: ['blocker']
    });
    const repeated = transitionRallyRuleState(
      first.state!,
      action(2, 1, 'defense', 'blocker'),
      { continues: true, nextTeam: 1 }
    );
    expect(repeated.state).toBeNull();
    expect(repeated.issues.map(issue => issue.code)).toContain('same-player-consecutive-hit');
  });

  it('remembers every player in a simultaneous teammate contact group', () => {
    let state = createRallyRuleState(0);
    const simultaneous = action(1, 0);
    simultaneous.groups = [{
      relation: 'simultaneous',
      contacts: [{ playerId: 'p1', team: 0 }, { playerId: 'p2', team: 0 }]
    }];
    state = transitionRallyRuleState(state, simultaneous, { continues: true, nextTeam: 0 }).state!;
    const repeated = transitionRallyRuleState(state, action(2, 0, 'set', 'p2'), { continues: true, nextTeam: 0 });
    expect(repeated.issues.map(issue => issue.code)).toContain('same-player-consecutive-hit');
  });

});
