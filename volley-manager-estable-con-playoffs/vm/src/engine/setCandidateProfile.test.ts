import { describe, expect, it } from 'vitest';
import { buildAttackContext } from './attackContext';
import { makeSquads } from './match';
import { P } from './params';
import { buildSetCandidateProfiles } from './setCandidateProfile';
import { buildSetTargets } from './setTargets';

describe('perfiles descriptivos de candidatos a colocación', () => {
  it('conserva el número y el orden de los objetivos estructurales', () => {
    const [squad] = makeSquads(41);
    const context = buildAttackContext(squad.slice(0, 6), 0.7, P);
    const targets = buildSetTargets(context);
    const profiles = buildSetCandidateProfiles(context);

    expect(profiles.map(profile => profile.player.id)).toEqual(
      targets.map(target => target.player.id),
    );
    expect(profiles).toHaveLength(targets.length);
  });

  it('expone rol, slot, zona y atributo de ataque reales del jugador', () => {
    const [squad] = makeSquads(42);
    const context = buildAttackContext(squad.slice(0, 6), 0.7, P);
    const profiles = buildSetCandidateProfiles(context);

    for (const profile of profiles) {
      expect(profile.role).toBe(profile.player.role);
      expect(profile.attackSkill).toBe(profile.player.atk);
      expect(profile.slot).toBeGreaterThanOrEqual(0);
      expect(profile.slot).toBeLessThan(6);
      expect(profile.zone).toBe(profile.slot >= 3 ? 'front' : 'backrow');
      expect(profile.player.id).not.toBe(context.setter?.player.id);
      expect(profile).not.toHaveProperty('weight');
      expect(profile).not.toHaveProperty('score');
      expect(profile).not.toHaveProperty('probability');
    }
  });

  it('no modifica el contexto de ataque', () => {
    const [squad] = makeSquads(43);
    const context = buildAttackContext(squad.slice(0, 6), 0.4, P);
    const before = structuredClone(context);

    buildSetCandidateProfiles(context);

    expect(context).toEqual(before);
  });
});
