import { describe, expect, it } from 'vitest';
import { validateContactSequence, type RallyContact } from './rallySequence';

const contact = (
  sequence: number,
  possessionId: string,
  team: 0 | 1,
  playerId: string,
  action: RallyContact['action']
): RallyContact => ({ sequence, possessionId, team, playerId, action });

describe('rally contact sequence: isolated structural contract', () => {
  it('accepts a serve followed by reception, set and attack', () => {
    const events = [
      contact(1, 'serve-A', 0, 'server', 'serve'),
      contact(2, 'receive-B', 1, 'receiver', 'reception'),
      contact(3, 'receive-B', 1, 'setter', 'set'),
      contact(4, 'receive-B', 1, 'hitter', 'attack')
    ];

    expect(validateContactSequence(events)).toEqual([]);
  });

  it('does not count a block as one of the three team hits', () => {
    const events = [
      contact(1, 'serve-A', 0, 'server', 'serve'),
      contact(2, 'first-B', 1, 'blocker', 'block'),
      contact(3, 'first-B', 1, 'defender', 'defense'),
      contact(4, 'first-B', 1, 'setter', 'set'),
      contact(5, 'first-B', 1, 'hitter', 'attack')
    ];

    expect(validateContactSequence(events)).toEqual([]);
  });

  it('rejects a fourth counted team hit in the same possession', () => {
    const events = [
      contact(1, 'pos-A', 0, 'p1', 'reception'),
      contact(2, 'pos-A', 0, 'p2', 'set'),
      contact(3, 'pos-A', 0, 'p3', 'cover'),
      contact(4, 'pos-A', 0, 'p4', 'attack')
    ];

    expect(validateContactSequence(events).map(issue => issue.code)).toContain('too-many-team-hits');
  });

  it('requires consecutive sequence numbers beginning at one', () => {
    const events = [
      contact(2, 'pos-A', 0, 'p1', 'reception'),
      contact(3, 'pos-A', 0, 'p2', 'set')
    ];

    expect(validateContactSequence(events).map(issue => issue.code)).toEqual([
      'invalid-sequence',
      'invalid-sequence'
    ]);
  });

  it('rejects mixed teams inside one possession', () => {
    const events = [
      contact(1, 'pos-A', 0, 'p1', 'reception'),
      contact(2, 'pos-A', 1, 'p2', 'set')
    ];

    expect(validateContactSequence(events).map(issue => issue.code)).toContain('mixed-team-possession');
  });

  it('rejects a possession that reappears after another possession', () => {
    const events = [
      contact(1, 'pos-A', 0, 'p1', 'reception'),
      contact(2, 'pos-B', 1, 'p2', 'defense'),
      contact(3, 'pos-A', 0, 'p3', 'set')
    ];

    expect(validateContactSequence(events).map(issue => issue.code)).toContain('non-contiguous-possession');
  });

  it('requires a block to begin the blocking team possession', () => {
    const events = [
      contact(1, 'pos-A', 0, 'p1', 'defense'),
      contact(2, 'pos-A', 0, 'p2', 'block')
    ];

    expect(validateContactSequence(events).map(issue => issue.code)).toContain('block-not-first');
  });

  it('requires the serve to be the first and only serve event', () => {
    const events = [
      contact(1, 'pos-A', 0, 'p1', 'reception'),
      contact(2, 'pos-B', 1, 'p2', 'serve')
    ];

    expect(validateContactSequence(events).map(issue => issue.code)).toContain('multiple-or-late-serve');
  });

  it('does not mutate the supplied sequence', () => {
    const events = Object.freeze([
      Object.freeze(contact(1, 'pos-A', 0, 'p1', 'reception')),
      Object.freeze(contact(2, 'pos-A', 0, 'p2', 'set'))
    ]);
    const before = structuredClone(events);

    validateContactSequence(events);

    expect(events).toEqual(before);
  });

  it('is deterministic for the same input', () => {
    const events = [
      contact(1, 'pos-A', 0, 'p1', 'reception'),
      contact(2, 'pos-A', 0, 'p2', 'set'),
      contact(3, 'pos-A', 0, 'p3', 'attack')
    ];

    expect(validateContactSequence(events)).toEqual(validateContactSequence(events));
  });
});
