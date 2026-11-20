import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../engine/rng';
import { SaveError, deserialize, serialize } from './save';
import { endSeason, finishRound, isSeasonOver, leaders, newGame, setInjuryScale, standings, type GameState } from './season';
import { advance, simulateSeason, startPlayoffs, finishPlayoffDay } from './playoffs';

/**
 * Importar una partida corrompida o manipulada nunca debe romper el juego:
 * o se rechaza con SaveError, o es una partida válida con la que se puede seguir jugando.
 */
type Json = Record<string, unknown> | unknown[];
function paths(o: unknown, pre: string[] = [], out: string[][] = []): string[][] {
  if (o && typeof o === 'object') for (const k of Object.keys(o)) { out.push([...pre, k]); paths((o as Json as Record<string, unknown>)[k], [...pre, k], out); }
  return out;
}
const get = (o: unknown, p: string[]) => p.reduce((x, k) => (x as Record<string, unknown>)[k], o);

describe('importación de partidas corrompidas', () => {
  it('rechaza o acepta de forma segura miles de mutaciones al azar', () => {
    const rnd = mulberry32(4242), pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
    const mutate = (o: unknown) => {
      const p = pick(paths(o)), parent = get(o, p.slice(0, -1)) as Record<string, unknown>, k = p[p.length - 1], m = Math.floor(rnd() * 9);
      const vals: unknown[] = [null, 'texto', -1, 0, 1e9, 1e308, 'NaN', [], {}, true, Number.MAX_SAFE_INTEGER, -1e9, 0.5];
      if (m < 6) parent[k] = pick(vals); else if (m === 6 && Array.isArray(parent)) parent.splice(Math.floor(rnd() * parent.length), 1);
      else if (m === 7 && Array.isArray(parent)) parent.push(pick(vals)); else delete parent[k];
    };
    const mid = (() => { let g = newGame(5); for (let i = 0; i < 4; i++) g = finishRound(g); return JSON.parse(serialize(g)); })();
    const later = (() => { let g = simulateSeason(newGame(6)); g = endSeason(g); for (let i = 0; i < 2; i++) g = finishRound(g); return JSON.parse(serialize(g)); })();
    const hurt = (() => { let g = setInjuryScale(newGame(8), 3); for (let i = 0; i < 8; i++) g = finishRound(g); return JSON.parse(serialize(g)); })();
    const playoffs = (() => { let g = newGame(7); for (let i = 0; i < 14; i++) g = finishRound(g); g = startPlayoffs(g); g = finishPlayoffDay(g); return JSON.parse(serialize(g)); })();
    const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env; const N = Number(env?.CHAOS_N ?? 800); let rejected = 0, accepted = 0; const crashes: string[] = [];
    for (const base of [mid, later, playoffs, hurt]) for (let i = 0; i < N / 4; i++) {
      const o = JSON.parse(JSON.stringify(base)); for (let k = 0; k < 1 + Math.floor(rnd() * 3); k++) mutate(o);
      let g: GameState;
      try { g = deserialize(JSON.stringify(o)); } catch (e) { if (e instanceof SaveError) { rejected++; continue; } crashes.push(`importar: ${(e as Error).message}`); continue; }
      accepted++;
      try { let h = g; for (let r = 0; r < 3 && !isSeasonOver(h); r++) h = advance(h); standings(h); serialize(h); if (isSeasonOver(h)) h = endSeason(h); leaders(h, 'kills', 5); }
      catch (e) { crashes.push(`jugar: ${(e as Error).message}`); }
    }
    expect(crashes.slice(0, 3), 'fallos').toEqual([]); expect(rejected).toBeGreaterThan(N * 0.5); expect(accepted).toBeGreaterThan(0);
  }, 240000);
  it('rechaza textos enormes, vacíos o que no son JSON', () => {
    expect(() => deserialize('')).toThrow(SaveError); expect(() => deserialize('[]')).toThrow(SaveError); expect(() => deserialize('null')).toThrow(SaveError);
    expect(() => deserialize('x'.repeat(3_100_000))).toThrow(SaveError);
  });
});
