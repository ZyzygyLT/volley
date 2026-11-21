import type { Params } from './params';
import type { MatchState, Player, PStats, Role, Side, Stats, SubState } from './types';

const ROLES: Role[] = ['S', 'OH', 'MB', 'OP', 'L'];
const BASE_ROLES: Role[] = ['S', 'OH', 'MB', 'OP', 'OH', 'MB', 'L'];
const STAT_KEYS: (keyof Stats)[] = ['ace', 'kill', 'blk', 'err'];
const PLAYER_STAT_KEYS: (keyof PStats)[] = [
  'gp', 'serves', 'aces', 'serveErr', 'recs', 'recPos', 'recPerf', 'recErr',
  'recQSum', 'atks', 'kills', 'atkErr', 'blocked', 'blocks', 'digs', 'assists', 'otherErr',
];
const ROLE_PARAM_KEYS = [
  'roleAce', 'roleServeErr', 'roleRec', 'recWeight', 'roleKill', 'roleErr',
  'atkWeight', 'blkWeight', 'digWeight', 'atkSkillScale',
] as const;
const PROBABILITY_KEYS = ['useRef', 'recBase', 'perfQ', 'posQ', 'coverQ', 'keepProb', 'otherErr'] as const;
const NON_NEGATIVE_KEYS = ['recNoise', 'digNoise'] as const;
const PARAM_SCALARS = [
  'serveAceOff', 'serveErrOff', 'aceRisk', 'errRisk', 'useRisk', 'aceSrvW', 'errSrvW',
  'errConsW', 'aceRecW', 'useSrvW', 'useRef', 'pressure', 'recBase', 'recW', 'recNoise',
  'perfQ', 'posQ', 'killK1', 'errK1', 'blkK1', 'killK2', 'errK2', 'blkK2', 'atkW',
  'setW', 'defW', 'blkKillW', 'qKill', 'errAtkW', 'errQ', 'blkW', 'digBase', 'digW',
  'digNoise', 'coverQ', 'keepProb', 'otherErr',
] as const;

type UnknownRecord = Record<string, unknown>;
const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);
const isInteger = (value: unknown): value is number => isFiniteNumber(value) && Number.isInteger(value);
const isId = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isSide = (value: unknown): value is Side => value === 0 || value === 1;
const isRole = (value: unknown): value is Role => typeof value === 'string' && ROLES.includes(value as Role);
const isServeType = (value: unknown): boolean => value === 'JS' || value === 'JFS' || value === 'FS';

function validatePlayer(value: unknown, path: string, errors: string[]): value is Player {
  if (!isRecord(value)) { errors.push(`${path}: debe ser un jugador`); return false; }
  let valid = true;
  const fail = (message: string) => { errors.push(`${path}.${message}`); valid = false; };
  if (!isId(value.id)) fail('id: identificador vacío o inválido');
  if (typeof value.name !== 'string' || !value.name.trim()) fail('name: nombre vacío o inválido');
  if (!isRole(value.role)) fail('role: posición inválida');
  if (!isServeType(value.serveType)) fail('serveType: tipo de saque inválido');
  for (const key of ['srv', 'rec', 'set', 'atk', 'blk', 'def', 'cons'] as const) {
    const n = value[key];
    const max = value.role === 'L' && (key === 'atk' || key === 'blk') ? 120 : 100;
    if (!isFiniteNumber(n) || n < 0 || n > max) fail(`${key}: valoración fuera de rango`);
  }
  if (value.age !== undefined && (!isInteger(value.age) || value.age < 0 || value.age > 100)) fail('age: edad inválida');
  return valid;
}

function validateParams(value: unknown, errors: string[]): value is Params {
  if (!isRecord(value)) { errors.push('params: estructura inválida'); return false; }
  let valid = true;
  const fail = (path: string) => { errors.push(`params.${path}: valor inválido`); valid = false; };
  for (const key of PARAM_SCALARS) if (!isFiniteNumber(value[key])) fail(key);
  for (const key of PROBABILITY_KEYS) {
    const n = value[key];
    if (!isFiniteNumber(n) || n < 0 || n > 1) fail(key);
  }
  for (const key of NON_NEGATIVE_KEYS) {
    const n = value[key];
    if (!isFiniteNumber(n) || n < 0) fail(key);
  }
  for (const key of ROLE_PARAM_KEYS) {
    const record = value[key];
    if (!isRecord(record)) { fail(key); continue; }
    for (const role of ROLES) {
      const n = record[role];
      if (!isFiniteNumber(n) || (['recWeight', 'atkWeight', 'blkWeight', 'digWeight', 'atkSkillScale'].includes(key) && n < 0)) fail(`${key}.${role}`);
    }
    if (['recWeight', 'atkWeight', 'blkWeight', 'digWeight'].includes(key)
      && ROLES.every(role => !isFiniteNumber(record[role]) || record[role] <= 0)) fail(`${key}.total`);
  }
  const serveType = value.serveType;
  if (!isRecord(serveType)) fail('serveType');
  else {
    for (const type of ['JS', 'JFS', 'FS'] as const) {
      const profile = serveType[type];
      if (!isRecord(profile)) { fail(`serveType.${type}`); continue; }
      for (const key of ['ace', 'err', 'use'] as const) {
        const n = profile[key];
        if (!isFiniteNumber(n) || n < 0 || n > 1) fail(`serveType.${type}.${key}`);
      }
    }
  }
  const perfQ = value.perfQ, posQ = value.posQ;
  if (isFiniteNumber(perfQ) && isFiniteNumber(posQ) && posQ > perfQ) fail('posQ');
  if (isFiniteNumber(value.pressure) && value.pressure < 0) fail('pressure');
  return valid;
}

function validateSubState(value: unknown, side: Side, roster: Map<string, Player>, lineup: Set<string>, bench: Set<string>, errors: string[]): value is SubState {
  const path = `subState[${side}]`;
  if (!isRecord(value)) { errors.push(`${path}: estructura inválida`); return false; }
  let valid = true;
  const fail = (message: string) => { errors.push(`${path}.${message}`); valid = false; };
  const { count, swaps, replaced, usedIn } = value;
  if (!isInteger(count) || count < 0 || count > 6) fail('count: debe ser un entero entre 0 y 6');
  if (!Array.isArray(replaced) || replaced.some(id => !isId(id)) || new Set(replaced).size !== replaced.length) fail('replaced: historial inválido');
  if (!Array.isArray(usedIn) || usedIn.some(id => !isId(id)) || new Set(usedIn).size !== usedIn.length) fail('usedIn: historial inválido');
  if (!isRecord(swaps)) { fail('swaps: estructura inválida'); return false; }
  if (Array.isArray(replaced) && Array.isArray(usedIn) && replaced.length !== usedIn.length) fail('historiales: longitudes diferentes');
  if (isInteger(count) && Array.isArray(replaced) && isRecord(swaps)
    && count !== 2 * replaced.length - Object.keys(swaps).length) fail('count: no concuerda con el historial');
  if (Array.isArray(replaced)) for (const id of replaced) if (typeof id === 'string' && !roster.has(id)) fail(`replaced: jugador desconocido (${id})`);
  if (Array.isArray(usedIn)) for (const id of usedIn) if (typeof id === 'string' && !roster.has(id)) fail(`usedIn: jugador desconocido (${id})`);
  const incomingIds = new Set<string>(), outgoingIds = new Set<string>();
  for (const [incoming, outgoing] of Object.entries(swaps)) {
    if (!isId(incoming) || !isId(outgoing)) { fail('swaps: identificador inválido'); continue; }
    if (incomingIds.has(incoming) || outgoingIds.has(outgoing)) fail('swaps: relaciones duplicadas');
    incomingIds.add(incoming); outgoingIds.add(outgoing);
    const inPlayer = roster.get(incoming), outPlayer = roster.get(outgoing);
    if (!inPlayer || !outPlayer) { fail('swaps: jugador ajeno al plantel'); continue; }
    if (inPlayer.role !== outPlayer.role) fail('swaps: posiciones diferentes');
    if (!lineup.has(incoming) || !bench.has(outgoing)) fail('swaps: jugadores fuera de sus ubicaciones esperadas');
    if (Array.isArray(usedIn) && !usedIn.includes(incoming)) fail('swaps: entrante ausente de usedIn');
    if (Array.isArray(replaced) && !replaced.includes(outgoing)) fail('swaps: saliente ausente de replaced');
  }
  return valid;
}

/**
 * Comprueba la integridad interna de un MatchState sin modificarlo.
 * Devuelve [] cuando el partido es válido y errores con rutas cuando no lo es.
 * No comprueba si el partido pertenece a un fixture o serie: eso corresponde a game/.
 */
export function validateMatch(input: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(input)) return ['match: debe ser un objeto'];
  const m = input;

  if (!isInteger(m.seed) || m.seed < 0 || m.seed > 0xffff_ffff) errors.push('seed: debe ser un entero uint32');
  if (m.params !== undefined) validateParams(m.params, errors);
  if (!Array.isArray(m.teams) || m.teams.length !== 2) errors.push('teams: deben existir dos equipos');
  if (!Array.isArray(m.base) || m.base.length !== 2) errors.push('base: deben existir dos planteles base');
  if (!Array.isArray(m.benches) || m.benches.length !== 2) errors.push('benches: deben existir dos bancos');
  if (!Array.isArray(m.subState) || m.subState.length !== 2) errors.push('subState: deben existir dos estados');
  if (!Array.isArray(m.stats) || m.stats.length !== 2) errors.push('stats: deben existir dos estadísticas de equipo');
  if (!Array.isArray(m.score) || m.score.length !== 2 || m.score.some(x => !isInteger(x) || x < 0)) errors.push('score: marcador actual inválido');
  if (!Array.isArray(m.totals) || m.totals.length !== 2 || m.totals.some(x => !isInteger(x) || x < 0)) errors.push('totals: acumulado inválido');
  if (!Array.isArray(m.sets) || m.sets.length !== 2 || m.sets.some(x => !isInteger(x) || x < 0 || x > 3)) errors.push('sets: resultado de sets inválido');
  if (!Array.isArray(m.setScores) || m.setScores.length > 5) errors.push('setScores: historial inválido');
  if (!isInteger(m.setNo) || m.setNo < 1 || m.setNo > 5) errors.push('setNo: número de set inválido');
  if (!isSide(m.serving)) errors.push('serving: lado de saque inválido');
  if (typeof m.over !== 'boolean') errors.push('over: debe ser booleano');
  if (!Array.isArray(m.log) || m.log.some(x => typeof x !== 'string')) errors.push('log: registro inválido');
  if (!isRecord(m.box)) errors.push('box: estadísticas individuales inválidas');

  const structurallyComplete = Array.isArray(m.teams) && m.teams.length === 2
    && Array.isArray(m.base) && m.base.length === 2
    && Array.isArray(m.benches) && m.benches.length === 2
    && Array.isArray(m.subState) && m.subState.length === 2
    && Array.isArray(m.stats) && m.stats.length === 2;
  if (!structurallyComplete) return errors;

  const rosterBySide: [Map<string, Player>, Map<string, Player>] = [new Map(), new Map()];
  const allIds = new Set<string>();
  const lineupIds: [Set<string>, Set<string>] = [new Set(), new Set()];
  const benchIds: [Set<string>, Set<string>] = [new Set(), new Set()];

  for (const side of [0, 1] as const) {
    const team = m.teams[side], base = m.base[side], bench = m.benches[side], stats = m.stats[side];
    if (!isRecord(team)) { errors.push(`teams[${side}]: equipo inválido`); continue; }
    if (typeof team.name !== 'string' || !team.name.trim()) errors.push(`teams[${side}].name: nombre inválido`);
    if (!isFiniteNumber(team.risk) || team.risk < 0 || team.risk > 100) errors.push(`teams[${side}].risk: riesgo fuera de rango`);
    if (!Array.isArray(base) || base.length !== 7) { errors.push(`base[${side}]: debe contener siete jugadores`); continue; }
    if (!Array.isArray(bench)) { errors.push(`benches[${side}]: debe ser una lista`); continue; }
    const local = rosterBySide[side];
    for (let i = 0; i < base.length; i++) {
      const player = base[i];
      if (validatePlayer(player, `base[${side}][${i}]`, errors)) {
        if (player.role !== BASE_ROLES[i]) errors.push(`base[${side}][${i}].role: posición base incorrecta`);
        if (local.has(player.id) || allIds.has(player.id)) errors.push(`base[${side}][${i}].id: identificador duplicado (${player.id})`);
        local.set(player.id, player); allIds.add(player.id);
      }
    }
    for (let i = 0; i < bench.length; i++) {
      const player = bench[i];
      if (validatePlayer(player, `benches[${side}][${i}]`, errors)) {
        if (local.has(player.id) || allIds.has(player.id)) errors.push(`benches[${side}][${i}].id: identificador duplicado (${player.id})`);
        local.set(player.id, player); allIds.add(player.id); benchIds[side].add(player.id);
      }
    }
    if (!Array.isArray(team.lineup) || team.lineup.length !== 6) errors.push(`teams[${side}].lineup: debe contener seis titulares`);
    else {
      const counts: Record<string, number> = {};
      for (let i = 0; i < team.lineup.length; i++) {
        const player = team.lineup[i];
        if (!validatePlayer(player, `teams[${side}].lineup[${i}]`, errors)) continue;
        counts[player.role] = (counts[player.role] ?? 0) + 1;
        if (player.role === 'L') errors.push(`teams[${side}].lineup[${i}]: el líbero no puede ocupar una plaza de titular`);
        const basePlayer = local.get(player.id);
        if (!basePlayer) errors.push(`teams[${side}].lineup[${i}]: jugador ausente del plantel base`);
        else if (JSON.stringify(basePlayer) !== JSON.stringify(player)) errors.push(`teams[${side}].lineup[${i}]: datos diferentes de base`);
        if (lineupIds[side].has(player.id)) errors.push(`teams[${side}].lineup: jugador duplicado (${player.id})`);
        lineupIds[side].add(player.id);
      }
      if (counts.S !== 1 || counts.OH !== 2 || counts.MB !== 2 || counts.OP !== 1 || counts.L) errors.push(`teams[${side}].lineup: distribución de posiciones inválida`);
      const expectedStarters = base.slice(0, 6).filter(isRecord).map(p => p.id).filter(isId).sort();
      if (expectedStarters.length === 6 && [...lineupIds[side]].sort().join('|') !== expectedStarters.join('|')) errors.push(`teams[${side}].lineup: no coincide con los seis jugadores de base`);
    }
    if (!validatePlayer(team.libero, `teams[${side}].libero`, errors) || team.libero.role !== 'L') errors.push(`teams[${side}].libero: líbero inválido`);
    else {
      const baseLibero = base[6];
      if (!isRecord(baseLibero) || baseLibero.id !== team.libero.id || JSON.stringify(baseLibero) !== JSON.stringify(team.libero)) errors.push(`teams[${side}].libero: no coincide con el líbero de base`);
    }
    if (isRecord(stats)) {
      for (const key of STAT_KEYS) if (!isInteger(stats[key]) || (stats[key] as number) < 0) errors.push(`stats[${side}].${key}: valor inválido`);
    } else errors.push(`stats[${side}]: estructura inválida`);
  }

  for (const side of [0, 1] as const) {
    const raw = m.subState[side];
    if (isRecord(raw)) validateSubState(raw, side, rosterBySide[side], lineupIds[side], benchIds[side], errors);
    else errors.push(`subState[${side}]: estructura inválida`);
  }

  if (isRecord(m.box)) {
    for (const [id, value] of Object.entries(m.box)) {
      if (!allIds.has(id)) errors.push(`box[${id}]: jugador ajeno al partido`);
      if (!isRecord(value)) { errors.push(`box[${id}]: estadísticas inválidas`); continue; }
      for (const key of PLAYER_STAT_KEYS) {
        const n = value[key];
        if (!isFiniteNumber(n) || n < 0 || (key !== 'recQSum' && !Number.isInteger(n))) errors.push(`box[${id}].${key}: valor inválido`);
      }
      if (isInteger(value.recs) && isFiniteNumber(value.recQSum) && value.recQSum > value.recs) errors.push(`box[${id}].recQSum: supera el número de recepciones`);
      if (isInteger(value.aces) && isInteger(value.serves) && value.aces > value.serves) errors.push(`box[${id}].aces: supera los saques`);
      if (isInteger(value.serveErr) && isInteger(value.serves) && value.serveErr > value.serves) errors.push(`box[${id}].serveErr: supera los saques`);
      if (isInteger(value.recPerf) && isInteger(value.recPos) && value.recPerf > value.recPos) errors.push(`box[${id}].recPerf: supera las recepciones positivas`);
      if (isInteger(value.recPos) && isInteger(value.recs) && value.recPos > value.recs) errors.push(`box[${id}].recPos: supera las recepciones`);
      if (isInteger(value.recErr) && isInteger(value.recs) && value.recErr > value.recs) errors.push(`box[${id}].recErr: supera las recepciones`);
      if (isInteger(value.kills) && isInteger(value.atks) && value.kills > value.atks) errors.push(`box[${id}].kills: supera los ataques`);
      if (isInteger(value.atkErr) && isInteger(value.atks) && value.atkErr > value.atks) errors.push(`box[${id}].atkErr: supera los ataques`);
      if (isInteger(value.blocked) && isInteger(value.atks) && value.blocked > value.atks) errors.push(`box[${id}].blocked: supera los ataques`);
    }
  }

  validateProgress(m, errors);
  return errors;
}

function validateProgress(m: UnknownRecord, errors: string[]): void {
  if (!Array.isArray(m.setScores) || !Array.isArray(m.sets) || !Array.isArray(m.score) || !Array.isArray(m.totals)
    || typeof m.over !== 'boolean' || !isInteger(m.setNo)) return;
  const completed = m.setScores.length;
  const wins: [number, number] = [0, 0];
  const sums: [number, number] = [0, 0];
  for (let i = 0; i < completed; i++) {
    const pair = m.setScores[i];
    if (!Array.isArray(pair) || pair.length !== 2 || pair.some(x => !isInteger(x) || x < 0)) {
      errors.push(`setScores[${i}]: marcador de set inválido`); continue;
    }
    const target = i === 4 ? 15 : 25;
    if (Math.max(pair[0] as number, pair[1] as number) < target || Math.abs((pair[0] as number) - (pair[1] as number)) < 2) errors.push(`setScores[${i}]: set no cerrado reglamentariamente`);
    const winner: Side = (pair[0] as number) > (pair[1] as number) ? 0 : 1;
    wins[winner]++;
    sums[0] += pair[0] as number; sums[1] += pair[1] as number;
  }
  if (m.sets[0] !== wins[0] || m.sets[1] !== wins[1]) errors.push('sets: no coincide con el historial de sets');
  if (completed !== (m.sets[0] as number) + (m.sets[1] as number)) errors.push('setScores: cantidad no coincide con sets ganados');
  if (m.over) {
    if (completed < 3 || completed > 5 || Math.max(wins[0], wins[1]) !== 3 || Math.min(wins[0], wins[1]) >= 3) errors.push('over: partido finalizado sin tres sets ganados válidos');
    if (m.setNo !== completed) errors.push('setNo: no coincide con el último set finalizado');
    const last = m.setScores[completed - 1];
    if (Array.isArray(last) && (m.score[0] !== last[0] || m.score[1] !== last[1])) errors.push('score: no coincide con el último set finalizado');
    if (m.totals[0] !== sums[0] || m.totals[1] !== sums[1]) errors.push('totals: no coincide con los sets finalizados');
  } else {
    if (completed > 4 || Math.max(wins[0], wins[1]) >= 3) errors.push('over: partido debería estar finalizado');
    if (m.setNo !== completed + 1) errors.push('setNo: no coincide con el siguiente set');
    const target = m.setNo === 5 ? 15 : 25;
    if (Math.max(m.score[0] as number, m.score[1] as number) >= target
      && Math.abs((m.score[0] as number) - (m.score[1] as number)) >= 2) errors.push('score: el set actual ya debería estar cerrado');
    if (m.totals[0] !== sums[0] + (m.score[0] as number) || m.totals[1] !== sums[1] + (m.score[1] as number)) errors.push('totals: no concilia con sets finalizados y marcador actual');
  }
}
