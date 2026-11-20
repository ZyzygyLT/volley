import { describe, expect, it } from 'vitest';
import {
  validateBlockObservation,
  type BlockObservation,
  type ObservedBlockAttempt,
} from './blockObservation';

const observed = (overrides: Partial<ObservedBlockAttempt> = {}): ObservedBlockAttempt => ({
  attackId: 'attack-1',
  attackerId: 'attacker',
  attackingTeam: 0,
  defendingTeam: 1,
  source: 'tactical-model',
  status: 'observed',
  eligibleBlockerIds: ['middle', 'opposite', 'outside'],
  attemptingBlockerIds: ['middle', 'opposite'],
  contactGroups: [],
  ...overrides,
});

describe('observación explícita de intento de bloqueo', () => {
  it('acepta un intento sin contacto físico', () => {
    expect(validateBlockObservation(observed({
      attemptingBlockerIds: ['middle'],
      contactGroups: [],
    }))).toEqual([]);
  });

  it('acepta un bloqueo colectivo con contacto simultáneo de dos participantes', () => {
    expect(validateBlockObservation(observed({
      contactGroups: [{
        relation: 'simultaneous',
        contacts: [
          { playerId: 'middle', team: 1 },
          { playerId: 'opposite', team: 1 },
        ],
      }],
    }))).toEqual([]);
  });

  it('acepta una observación disponible con cero intentos y cero contactos', () => {
    expect(validateBlockObservation(observed({
      attemptingBlockerIds: [],
      contactGroups: [],
    }))).toEqual([]);
  });

  it('distingue la ausencia de observación de una observación vacía', () => {
    const unavailable: BlockObservation = {
      attackId: 'attack-2',
      attackerId: 'attacker',
      attackingTeam: 0,
      defendingTeam: 1,
      source: 'external-observation',
      status: 'unavailable',
    };
    const explicitEmpty = observed({ attemptingBlockerIds: [], contactGroups: [] });

    expect(validateBlockObservation(unavailable)).toEqual([]);
    expect(explicitEmpty.status).toBe('observed');
    expect(explicitEmpty.attemptingBlockerIds).toEqual([]);
  });

  it('rechaza participantes que no pertenecen al conjunto elegible declarado', () => {
    const issues = validateBlockObservation(observed({
      attemptingBlockerIds: ['middle', 'libero'],
    }));
    expect(issues.map(issue => issue.code)).toContain('attempting-player-not-eligible');
  });

  it('rechaza contactos de jugadores que no figuran como participantes del intento', () => {
    const issues = validateBlockObservation(observed({
      attemptingBlockerIds: ['middle'],
      contactGroups: [{
        relation: 'single',
        contacts: [{ playerId: 'opposite', team: 1 }],
      }],
    }));
    expect(issues.map(issue => issue.code)).toContain('contact-without-attempt');
  });

  it('rechaza contactos atribuidos al equipo atacante', () => {
    const issues = validateBlockObservation(observed({
      contactGroups: [{
        relation: 'single',
        contacts: [{ playerId: 'middle', team: 0 }],
      }],
    }));
    expect(issues.map(issue => issue.code)).toContain('contact-team-mismatch');
  });

  it('rechaza al atacante como participante de bloqueo', () => {
    const issues = validateBlockObservation(observed({
      eligibleBlockerIds: ['attacker', 'middle'],
      attemptingBlockerIds: ['attacker'],
    }));
    expect(issues.map(issue => issue.code)).toContain('attacker-listed-as-blocker');
  });

  it('rechaza IDs repetidos en las listas de elegibilidad e intento', () => {
    const issues = validateBlockObservation(observed({
      eligibleBlockerIds: ['middle', 'middle'],
      attemptingBlockerIds: ['middle', 'middle'],
    }));
    expect(issues.map(issue => issue.code)).toContain('duplicate-eligible-blocker');
    expect(issues.map(issue => issue.code)).toContain('duplicate-attempting-blocker');
  });

  it('distingue IDs vacíos de IDs duplicados en las listas', () => {
    const issues = validateBlockObservation(observed({
      eligibleBlockerIds: ['middle', ' '],
      attemptingBlockerIds: ['middle', ''],
    }));
    expect(issues.map(issue => issue.code)).toContain('invalid-eligible-blocker-id');
    expect(issues.map(issue => issue.code)).toContain('invalid-attempting-blocker-id');
    expect(issues.map(issue => issue.code)).not.toContain('duplicate-eligible-blocker');
    expect(issues.map(issue => issue.code)).not.toContain('duplicate-attempting-blocker');
  });

  it('requiere equipos distintos y un identificador de ataque', () => {
    const issues = validateBlockObservation(observed({
      attackId: ' ',
      defendingTeam: 0,
    }));
    expect(issues.map(issue => issue.code)).toContain('invalid-attack-id');
    expect(issues.map(issue => issue.code)).toContain('same-attacking-and-defending-team');
  });

  it('no muta la observación', () => {
    const input = Object.freeze(observed({
      eligibleBlockerIds: Object.freeze(['middle', 'opposite']),
      attemptingBlockerIds: Object.freeze(['middle']),
      contactGroups: Object.freeze([Object.freeze({
        relation: 'single' as const,
        contacts: Object.freeze([Object.freeze({ playerId: 'middle', team: 1 as const })]),
      })]),
    }));
    const before = structuredClone(input);

    validateBlockObservation(input);

    expect(input).toEqual(before);
  });

  it('es determinista', () => {
    const input = observed();
    expect(validateBlockObservation(input)).toEqual(validateBlockObservation(input));
  });
});
