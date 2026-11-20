import { describe, expect, it } from 'vitest';
import {
  canPlayerMakeNextHit,
  deriveTeamHits,
  validateCompoundAction,
  type CompoundRallyAction
} from './compoundContacts';

const action = (overrides: Partial<CompoundRallyAction> = {}): CompoundRallyAction => ({
  actionId: 'action-1',
  rallyOrder: 1,
  kind: 'reception',
  actingTeam: 0,
  groups: [{ relation: 'single', contacts: [{ playerId: 'p1', team: 0 }] }],
  ...overrides
});

describe('compound rally contacts: isolated model', () => {
  it('counts a single contact as one team hit', () => {
    expect(deriveTeamHits(action()).teamHits).toBe(1);
  });

  it('counts consecutive body contacts during the first team hit as one', () => {
    const result = deriveTeamHits(action({
      isFirstTeamHit: true,
      groups: [{
        relation: 'consecutive-within-action',
        contacts: [
          { playerId: 'p1', team: 0, bodyPart: 'forearm' },
          { playerId: 'p1', team: 0, bodyPart: 'hand' }
        ]
      }]
    }));
    expect(result).toMatchObject({ teamHits: 1, issues: [] });
  });

  it('does not silently treat consecutive contacts as one outside the first-hit context', () => {
    const result = deriveTeamHits(action({
      groups: [{
        relation: 'consecutive-within-action',
        contacts: [{ playerId: 'p1', team: 0 }, { playerId: 'p1', team: 0 }]
      }]
    }));
    expect(result.teamHits).toBe(0);
    expect(result.issues.map(item => item.code)).toContain('invalid-first-hit-context');
  });

  it('counts simultaneous contacts by two teammates as two hits', () => {
    const result = deriveTeamHits(action({
      groups: [{
        relation: 'simultaneous',
        contacts: [{ playerId: 'p1', team: 0 }, { playerId: 'p2', team: 0 }]
      }]
    }));
    expect(result).toMatchObject({ teamHits: 2, issues: [] });
  });

  it('counts simultaneous contacts by three teammates as three hits', () => {
    const result = deriveTeamHits(action({
      groups: [{
        relation: 'simultaneous',
        contacts: [
          { playerId: 'p1', team: 0 },
          { playerId: 'p2', team: 0 },
          { playerId: 'p3', team: 0 }
        ]
      }]
    }));
    expect(result.teamHits).toBe(3);
  });

  it('does not count one or multiple block contacts as team hits', () => {
    const result = deriveTeamHits(action({
      kind: 'block',
      groups: [{
        relation: 'simultaneous',
        contacts: [{ playerId: 'p1', team: 0 }, { playerId: 'p2', team: 0 }]
      }]
    }));
    expect(result).toMatchObject({ teamHits: 0, isBlock: true, issues: [] });
  });

  it('flags simultaneous opponents over the net as a special allowance reset', () => {
    const result = deriveTeamHits(action({
      opponentSimultaneousOverNet: true,
      receivingTeam: 1,
      groups: [{
        relation: 'simultaneous',
        contacts: [{ playerId: 'p1', team: 0 }, { playerId: 'p2', team: 1 }]
      }]
    }));
    expect(result).toMatchObject({
      teamHits: 0,
      allowanceResetFor: 1,
      issues: []
    });
  });

  it('rejects an opponent simultaneous group without explicit over-net context', () => {
    const issues = validateCompoundAction(action({
      groups: [{
        relation: 'simultaneous',
        contacts: [{ playerId: 'p1', team: 0 }, { playerId: 'p2', team: 1 }]
      }]
    }));
    expect(issues.map(item => item.code)).toContain('invalid-opponent-simultaneous-context');
  });

  it('allows a blocker to make the first hit after own block', () => {
    expect(canPlayerMakeNextHit({
      previousPlayerId: 'blocker',
      nextPlayerId: 'blocker',
      isFirstHitAfterOwnBlock: true
    })).toBe(true);
  });

  it('rejects the same player making consecutive hits without the block exception', () => {
    expect(canPlayerMakeNextHit({
      previousPlayerId: 'p1',
      nextPlayerId: 'p1',
      isFirstHitAfterOwnBlock: false
    })).toBe(false);
  });

  it('allows a different player to make the next hit', () => {
    expect(canPlayerMakeNextHit({
      previousPlayerId: 'p1',
      nextPlayerId: 'p2',
      isFirstHitAfterOwnBlock: false
    })).toBe(true);
  });

  it('rejects a single group with multiple physical contacts', () => {
    const issues = validateCompoundAction(action({
      groups: [{
        relation: 'single',
        contacts: [{ playerId: 'p1', team: 0 }, { playerId: 'p2', team: 0 }]
      }]
    }));
    expect(issues.map(item => item.code)).toContain('invalid-simultaneous-group');
  });

  it('does not mutate action facts', () => {
    const input = Object.freeze(action({
      groups: Object.freeze([Object.freeze({
        relation: 'simultaneous' as const,
        contacts: Object.freeze([
          Object.freeze({ playerId: 'p1', team: 0 as const }),
          Object.freeze({ playerId: 'p2', team: 0 as const })
        ])
      })])
    }));
    const before = structuredClone(input);
    deriveTeamHits(input);
    expect(input).toEqual(before);
  });

  it('is deterministic', () => {
    const input = action({ isFirstTeamHit: true });
    expect(deriveTeamHits(input)).toEqual(deriveTeamHits(input));
  });

  it('rejects a block action whose contacts belong to the other team', () => {
    const result = deriveTeamHits(action({
      kind: 'block',
      actingTeam: 0,
      groups: [{ relation: 'simultaneous', contacts: [
        { playerId: 'opponent-1', team: 1 },
        { playerId: 'opponent-2', team: 1 }
      ] }]
    }));
    expect(result.issues.map(issue => issue.code)).toContain('contact-team-mismatch');
  });

  it('requires the receiving team to be one of the simultaneous opponents', () => {
    const result = deriveTeamHits(action({
      opponentSimultaneousOverNet: true,
      receivingTeam: 1,
      groups: [{ relation: 'simultaneous', contacts: [
        { playerId: 'p1', team: 0 },
        { playerId: 'p2', team: 0 }
      ] }]
    }));
    expect(result.issues.map(issue => issue.code)).toContain('invalid-opponent-simultaneous-context');
  });

});
