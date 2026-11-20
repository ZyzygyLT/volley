import { describe, expect, it } from 'vitest';
import { createMatch, makeSquads, substitute } from './match';
import { getEligibleBlockers } from './blockEligibility';
import {
  validateBlockObservation,
  type BlockObservation,
  type ObservedBlockAttempt,
  validateBlockObservationContext,
  validateBlockObservationForMatch,
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

  it('valida atacante y elegibles contra las alineaciones actuales', () => {
    const [home, away] = makeSquads(4101);
    const match = createMatch(4101, 50, { squads: [home, away] });
    const eligible = getEligibleBlockers(match.teams[1]).map(player => player.id);
    const observation = observed({
      attackerId: match.teams[0].lineup[3].id,
      eligibleBlockerIds: eligible,
      attemptingBlockerIds: [eligible[0]],
    });

    expect(validateBlockObservationContext(observation, match.teams)).toEqual([]);
  });

  it('rechaza un atacante que no pertenece a la alineación atacante actual', () => {
    const [home, away] = makeSquads(4102);
    const match = createMatch(4102, 50, { squads: [home, away] });
    const observation = observed({
      attackerId: 'unknown-attacker',
      eligibleBlockerIds: getEligibleBlockers(match.teams[1]).map(player => player.id),
    });

    expect(validateBlockObservationContext(observation, match.teams).map(issue => issue.code))
      .toContain('attacker-not-in-attacking-team');
  });

  it('rechaza elegibles de una rotación anterior', () => {
    const [home, away] = makeSquads(4103);
    const match = createMatch(4103, 50, { squads: [home, away] });
    const staleEligible = getEligibleBlockers(match.teams[1]).map(player => player.id);
    match.teams[1].lineup = [match.teams[1].lineup[5], ...match.teams[1].lineup.slice(0, 5)];
    const observation = observed({
      attackerId: match.teams[0].lineup[3].id,
      eligibleBlockerIds: staleEligible,
      attemptingBlockerIds: [staleEligible[0]],
    });

    expect(validateBlockObservationContext(observation, match.teams).map(issue => issue.code))
      .toContain('eligible-blockers-do-not-match-lineup');
  });

  it('actualiza los elegibles de contexto después de una sustitución delantera', () => {
    const [home, away] = makeSquads(4104);
    const bench = { ...home[4], id: 'context-bench-oh', name: 'Context Bench OH' };
    const match = createMatch(4104, 50, { squads: [home, away], benches: [[bench], []] });
    const replaced = match.teams[0].lineup[4];
    const changed = substitute(match, 0, replaced.id, bench.id);
    const eligible = getEligibleBlockers(changed.teams[1]).map(player => player.id);
    const observation = observed({
      attackerId: changed.teams[0].lineup[3].id,
      eligibleBlockerIds: eligible,
    });

    expect(validateBlockObservationContext(observation, changed.teams)).toEqual([]);
    expect(changed.teams[0].lineup[4].id).toBe(bench.id);
  });

  it('rechaza una alineación defensora inválida sin lanzar una excepción', () => {
    const [home, away] = makeSquads(4106);
    const match = createMatch(4106, 50, { squads: [home, away] });
    const lineup = [...match.teams[1].lineup];
    lineup[5] = lineup[4];
    match.teams[1].lineup = lineup;
    const observation = observed({
      attackerId: match.teams[0].lineup[3].id,
      eligibleBlockerIds: ['middle', 'opposite', 'outside'],
    });

    expect(validateBlockObservationContext(observation, match.teams).map(issue => issue.code))
      .toContain('invalid-defending-lineup');
  });

  it('valida la identidad del atacante aunque la observación no esté disponible', () => {
    const [home, away] = makeSquads(4105);
    const match = createMatch(4105, 50, { squads: [home, away] });
    const unavailable: BlockObservation = {
      attackId: 'attack-context',
      attackerId: 'missing',
      attackingTeam: 0,
      defendingTeam: 1,
      source: 'external-observation',
      status: 'unavailable',
    };

    expect(validateBlockObservationContext(unavailable, match.teams).map(issue => issue.code))
      .toContain('attacker-not-in-attacking-team');
  });


  it('combina validación local y contextual en una sola llamada', () => {
    const [home, away] = makeSquads(4107);
    const match = createMatch(4107, 50, { squads: [home, away] });
    const observation = observed({
      attackId: ' ',
      attackerId: 'unknown-attacker',
      eligibleBlockerIds: getEligibleBlockers(match.teams[1]).map(player => player.id),
    });

    const codes = validateBlockObservationForMatch(observation, match.teams)
      .map(issue => issue.code);

    expect(codes).toContain('invalid-attack-id');
    expect(codes).toContain('attacker-not-in-attacking-team');
  });

  it('acepta una observación coherente en ambas capas', () => {
    const [home, away] = makeSquads(4108);
    const match = createMatch(4108, 50, { squads: [home, away] });
    const eligible = getEligibleBlockers(match.teams[1]).map(player => player.id);
    const observation = observed({
      attackerId: match.teams[0].lineup[3].id,
      eligibleBlockerIds: eligible,
      attemptingBlockerIds: [eligible[0]],
    });

    expect(validateBlockObservationForMatch(observation, match.teams)).toEqual([]);
  });

});
