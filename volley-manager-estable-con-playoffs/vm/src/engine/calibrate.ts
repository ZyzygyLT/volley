import { TEAM_SD, type Params } from './params';
import { makeSquads, makeLeague, createMatch, playMatch, roleOfId, boostPlayers } from './match';
import { mulberry32 } from './rng';
import { playRally } from './rally';
import { TARGETS, VALIDATION, PL, T_REC_SHARE, T_ATK_SHARE, T_BLK_SHARE, T_DIG_SHARE, VNL_SD, SCORES, type Target } from './targets';
import type { Player, Role } from './types';

const ROLES: Role[] = ['S', 'OH', 'MB', 'OP', 'L'];
const rec = <T,>(f: () => T) => Object.fromEntries(ROLES.map(r => [r, f()])) as Record<Role, T>;
const rot = <T,>(l: T[], k: number) => [...l.slice(k), ...l.slice(0, k)];
const rate = (a: number, b: number) => (b ? a / b : 0);

export interface Meas {
  R: number; oerr: number; so: number; cont: number; swap: number; capped: number; atkAll: number;
  sv: Record<Role, { n: number; ace: number; err: number }>; at: Record<Role, { n: number; kill: number; err: number; blk: number }>;
  rc: Record<Role, { n: number; err: number }>; q: { role: Role; q: number }[]; blk: Record<Role, number>; dig: Record<Role, number>;
  fk: { k1: { n: number; kill: number }; k2: { n: number; kill: number } };
}
let POOL: [Player[], Player[]][] | null = null;
const pool = () => (POOL ??= Array.from({ length: 200 }, (_, i) => makeSquads(1000 + i, 0, 0)));

/** Simula `N` rallies entre equipos de liga (valoración media, sin ventaja) con rotaciones aleatorias y mide tasas por posición. */
export function measure(p: Params, N: number, seed: number): Meas {
  const rnd = mulberry32(seed), pl = pool();
  const m: Meas = { R: 0, oerr: 0, so: 0, cont: 0, swap: 0, capped: 0, atkAll: 0, sv: rec(() => ({ n: 0, ace: 0, err: 0 })), at: rec(() => ({ n: 0, kill: 0, err: 0, blk: 0 })),
    rc: rec(() => ({ n: 0, err: 0 })), q: [], blk: rec(() => 0), dig: rec(() => 0), fk: { k1: { n: 0, kill: 0 }, k2: { n: 0, kill: 0 } } };
  for (let i = 0; i < N; i++) {
    const pr = pl[Math.floor(rnd() * pl.length)], sv = rnd() < 0.5 ? 0 : 1;
    const t: [any, any] = [{ name: 'A', lineup: rot(pr[0].slice(0, 6), Math.floor(rnd() * 6)), libero: pr[0][6], risk: 50 }, { name: 'B', lineup: rot(pr[1].slice(0, 6), Math.floor(rnd() * 6)), libero: pr[1][6], risk: 50 }];
    const r = playRally(t, sv as 0 | 1, rnd, p);
    m.R++; if (r.winner !== sv) m.so++; if (r.trace.capped) m.capped++;
    for (const a of r.trace.atks) { m.atkAll++; const f = m.fk[a.phase]; f.n++; if (a.out === 'kill') f.kill++; if (a.out === 'cont') { m.cont++; if (a.swap) m.swap++; } }
    for (const e of r.trace.ev) {
      const ro = roleOfId(e.p);
      if (e.k === 'serve') { m.sv[ro].n++; if (e.o === 'ace') m.sv[ro].ace++; if (e.o === 'err') m.sv[ro].err++; }
      else if (e.k === 'rec') { m.rc[ro].n++; if (e.err) m.rc[ro].err++; else m.q.push({ role: ro, q: e.q }); }
      else if (e.k === 'atk') { const a = m.at[ro]; a.n++; if (e.o === 'kill') a.kill++; if (e.o === 'err') a.err++; if (e.o === 'blk') a.blk++; }
      else if (e.k === 'blk') m.blk[ro]++;
      else if (e.k === 'dig') m.dig[ro]++;
      else if (e.k === 'oerr') m.oerr++;
    }
  }
  return m;
}

const sum = (rs: Role[], f: (r: Role) => number) => rs.reduce((s, r) => s + f(r), 0);
const AR: Role[] = ['OH', 'OP', 'MB', 'S'], SR: Role[] = ['S', 'MB', 'OH', 'OP'], BR: Role[] = ['MB', 'OH', 'OP', 'S'], DR: Role[] = ['L', 'OH', 'S', 'OP'], RR: Role[] = ['L', 'OH', 'OP'];

/** Todas las métricas comparables con los objetivos. */
export function metrics(m: Meas, p: Params): Record<string, number> {
  const o: Record<string, number> = {};
  const nS = sum(SR, r => m.sv[r].n), nA = sum(AR, r => m.at[r].n), nR = sum(ROLES, r => m.rc[r].n);
  o.ace = sum(SR, r => m.sv[r].ace) / nS; o.serr = sum(SR, r => m.sv[r].err) / nS;
  o.kill = sum(AR, r => m.at[r].kill) / nA; o.aerr = sum(AR, r => m.at[r].err) / nA; o.blkd = sum(AR, r => m.at[r].blk) / nA;
  const kAll = sum(AR, r => m.at[r].kill), eAll = sum(AR, r => m.at[r].err), bAll = sum(BR, r => m.blk[r]);
  o.oerr = m.oerr / m.R; o['share.kill'] = kAll / m.R; o['share.blk'] = bAll / m.R; o['share.aerr'] = eAll / m.R;
  o.c = rate(m.swap, m.cont); o.sideout = rate(m.so, m.R); o.apr = m.atkAll / m.R;
  for (const r of AR) { o[`kill.${r}`] = rate(m.at[r].kill, m.at[r].n); o[`eb.${r}`] = rate(m.at[r].err + m.at[r].blk, m.at[r].n); o[`ashare.${r}`] = m.at[r].n / nA; }
  for (const r of SR) { o[`ace.${r}`] = rate(m.sv[r].ace, m.sv[r].n); o[`serr.${r}`] = rate(m.sv[r].err, m.sv[r].n); }
  const nB = sum(BR, r => m.blk[r]), nD = sum(DR, r => m.dig[r]), nRR = sum(RR, r => m.rc[r].n);
  for (const r of BR) o[`bshare.${r}`] = m.blk[r] / nB;
  for (const r of DR) o[`dshare.${r}`] = m.dig[r] / nD;
  for (const r of ['L', 'OH'] as const) { o[`rshare.${r}`] = m.rc[r].n / nRR; o[`perf.${r}`] = m.q.filter(x => x.role === r && x.q >= p.perfQ).length / m.rc[r].n; }
  o.perf = m.q.filter(x => x.q >= p.perfQ).length / nR; o.pos = m.q.filter(x => x.q >= p.posQ).length / nR;
  return o;
}

const T = Object.fromEntries(TARGETS.map(t => [t.key, t.value]));
const reweight = (w: Record<Role, number>, rs: Role[], tgt: Partial<Record<Role, number>>, meas: Record<string, number>, key: string, d: number) => {
  for (const r of rs) { const ms = meas[`${key}.${r}`] ?? 0; if (ms > 0 && tgt[r]) w[r] *= Math.pow(tgt[r]! / ms, d); }
  const base = w.OH; for (const r of ROLES) w[r] /= base;
};

export function fit(p0: Params, N: number, iters: number): Params {
  const p: Params = structuredClone(p0), d = 0.6;
  for (let it = 0; it < iters; it++) {
    const raw = measure(p, N, 500 + it), m = metrics(raw, p);
    const nS = sum(SR, r => raw.sv[r].n), nA = sum(AR, r => raw.at[r].n);
    // saque: diferencias por posición (media ponderada cero) + nivel de liga
    const dA: Record<string, number> = {}, dE: Record<string, number> = {};
    for (const r of SR) { dA[r] = T[`ace.${r}`] - m[`ace.${r}`]; dE[r] = T[`serr.${r}`] - m[`serr.${r}`]; }
    const mA = sum(SR, r => (raw.sv[r].n / nS) * dA[r]), mE = sum(SR, r => (raw.sv[r].n / nS) * dE[r]);
    for (const r of SR) { p.roleAce[r] += d * (dA[r] - mA); p.roleServeErr[r] += d * (dE[r] - mE); }
    p.serveAceOff += d * (PL.ace - m.ace); p.serveErrOff += d * (PL.serr - m.serr);
    // ataque
    const dK: Record<string, number> = {}, dB: Record<string, number> = {};
    for (const r of AR) { dK[r] = T[`kill.${r}`] - m[`kill.${r}`]; dB[r] = T[`eb.${r}`] - m[`eb.${r}`]; }
    const mK = sum(AR, r => (raw.at[r].n / nA) * dK[r]), mB = sum(AR, r => (raw.at[r].n / nA) * dB[r]);
    for (const r of AR) { p.roleKill[r] += d * (dK[r] - mK); p.roleErr[r] += d * (dB[r] - mB); }
    const gk = d * (PL.kill - m.kill); p.killK1 += gk; p.killK2 += gk;
    const ge = d * (PL.aerr - m.aerr); p.errK1 += ge; p.errK2 += ge;
    const gb = d * (PL.blkd - m.blkd); p.blkK1 += gb; p.blkK2 += gb;
    // repartos
    reweight(p.atkWeight, AR, T_ATK_SHARE, m, 'ashare', d);
    reweight(p.blkWeight, BR, T_BLK_SHARE, m, 'bshare', d);
    reweight(p.digWeight, DR, T_DIG_SHARE, m, 'dshare', d);
    const tr = T_REC_SHARE; const nRR = sum(RR, r => raw.rc[r].n);
    for (const r of ['L', 'OP'] as const) { const ms = raw.rc[r].n / nRR; if (ms > 0 && tr[r]) p.recWeight[r] *= Math.pow(tr[r]! / ms, d); }
    // recepción: umbrales por cuantil y diferencia líbero - receptor
    const nR = sum(ROLES, r => raw.rc[r].n), qs = raw.q.map(x => x.q).sort((a, b) => b - a);
    p.perfQ = qs[Math.min(qs.length - 1, Math.floor(PL.perf * nR))]; p.posQ = qs[Math.min(qs.length - 1, Math.floor(PL.pos * nR))];
    const perfRole = (r: Role) => raw.q.filter(x => x.role === r && x.q >= p.perfQ).length / raw.rc[r].n;
    p.roleRec.L += d * 0.4 * ((T['perf.L'] - T['perf.OH']) - (perfRole('L') - perfRole('OH')));
    p.keepProb = Math.max(0, Math.min(0.5, p.keepProb + d * (m.c - 0.8)));
    p.otherErr = Math.max(0, p.otherErr + d * (PL.oerr - m.oerr) / Math.max(m.apr, 1));
  }
  return p;
}

function line(t: Target, g: number) { const ok = Math.abs(g - t.value) <= t.tol; return { ok, s: `${ok ? 'OK ' : 'XX '} ${t.key.padEnd(10)} objetivo ${t.value.toFixed(3)} ±${t.tol}  modelo ${g.toFixed(3)}` }; }

export function report(p: Params, N: number) {
  const raw = measure(p, N, 9001), g = metrics(raw, p), rps = (() => { // rallies por set: se mide con partidos completos
    let R = 0, sets = 0; for (let i = 1; i <= 120; i++) { const st = playMatch(createMatch(70 + i, 50, { sd: 8, boostA: 0, boostB: 0, params: p }), () => { R++; }); sets += st.sets[0] + st.sets[1]; } return R / sets; })();
  g.rps = rps;
  const out: string[] = []; let ok = 0, tot = 0;
  for (const [title, list] of [['AJUSTE (PlusLiga + VNL)', TARGETS], ['VALIDACIÓN INDEPENDIENTE', VALIDATION]] as const) {
    out.push(`\n== ${title} ==`);
    for (const t of list) { const l = line(t, g[t.key]); tot++; if (l.ok) ok++; out.push(l.s); }
  }
  out.push(`\nrallies cortados por el tope: ${(100 * rate(raw.capped, raw.R)).toFixed(3)} %   |  aprobados ${ok}/${tot}`);
  out.push(`ataque k1 kill ${rate(raw.fk.k1.kill, raw.fk.k1.n).toFixed(3)} · k2 kill ${rate(raw.fk.k2.kill, raw.fk.k2.n).toFixed(3)} (preprint: k1≈0.50, k2≈0.42-0.47)`);
  return { got: g, text: out.join('\n'), ok, tot };
}

/** Dispersión REAL entre jugadores del motor (método de momentos), comparada con VNL 2024. */
export function playerSpread(p: Params, pairs = 70, rallies = 5000) {
  const rnd = mulberry32(31337), acc: Record<string, { role: Role; atk: number; kill: number; sv: number; ace: number; rc: number; perf: number }> = {};
  for (let k = 0; k < pairs; k++) {
    const mine = makeSquads(5000 + k, 0, 0)[0], opps = pool();
    for (let i = 0; i < rallies; i++) {
      // Rival distinto en cada rally (como en VNL, donde cada jugador enfrenta ~12-15 equipos): evita sesgos de contexto.
      const opp = opps[Math.floor(rnd() * opps.length)][1], sv = rnd() < 0.5 ? 0 : 1;
      const t: [any, any] = [{ name: 'A', lineup: rot(mine.slice(0, 6), Math.floor(rnd() * 6)), libero: mine[6], risk: 50 }, { name: 'B', lineup: rot(opp.slice(0, 6), Math.floor(rnd() * 6)), libero: opp[6], risk: 50 }];
      for (const e of playRally(t, sv as 0 | 1, rnd, p).trace.ev) {
        if (+e.p.slice(1) >= 7) continue; // solo el equipo observado
        const a = (acc[`${k}:${e.p}`] ??= { role: roleOfId(e.p), atk: 0, kill: 0, sv: 0, ace: 0, rc: 0, perf: 0 });
        if (e.k === 'atk') { a.atk++; if (e.o === 'kill') a.kill++; } else if (e.k === 'serve') { a.sv++; if (e.o === 'ace') a.ace++; }
        else if (e.k === 'rec') { a.rc++; if (!e.err && e.q >= p.perfQ) a.perf++; }
      }
    }
  }
  const sd = (rs: Role, n: 'atk' | 'sv' | 'rc', s: 'kill' | 'ace' | 'perf', min: number) => {
    const xs = Object.values(acc).filter(a => a.role === rs && a[n] >= min).map(a => ({ r: a[s] / a[n], n: a[n] }));
    if (xs.length < 10) return NaN; const mu = xs.reduce((q, x) => q + x.r, 0) / xs.length;
    const vo = xs.reduce((q, x) => q + (x.r - mu) ** 2, 0) / (xs.length - 1), vn = xs.reduce((q, x) => q + x.r * (1 - x.r) / x.n, 0) / xs.length;
    return Math.sqrt(Math.max(vo - vn, 0));
  };
  const rows = [['kill OH', sd('OH', 'atk', 'kill', 60), VNL_SD.kill.OH], ['kill OP', sd('OP', 'atk', 'kill', 60), VNL_SD.kill.OP], ['kill MB', sd('MB', 'atk', 'kill', 60), VNL_SD.kill.MB],
    ['ace OP', sd('OP', 'sv', 'ace', 60), VNL_SD.ace.OP], ['ace MB', sd('MB', 'sv', 'ace', 60), VNL_SD.ace.MB], ['ace S', sd('S', 'sv', 'ace', 60), VNL_SD.ace.S],
    ['perfecta L', sd('L', 'rc', 'perf', 60), VNL_SD.perf.L], ['perfecta OH', sd('OH', 'rc', 'perf', 60), VNL_SD.perf.OH]] as const;
  return rows.map(([n, a, b]) => `${String(n).padEnd(12)} motor ${Number.isNaN(a) ? ' n/d ' : a.toFixed(3)}   VNL ${b.toFixed(3)}`).join('\n');
}

/** Distribución de marcadores en una liga de equipos de fuerza desigual, comparada con PlusLiga (2639 partidos). */
export function scoreDist(p: Params, matches = 600, teamSd = TEAM_SD) {
  const lg = makeLeague(16, 77, teamSd), rnd = mulberry32(5), c = [0, 0, 0]; let R = 0, sets = 0;
  for (let i = 0; i < matches; i++) {
    const a = Math.floor(rnd() * 16); let b = Math.floor(rnd() * 15); if (b >= a) b++;
    const st = playMatch(createMatch(900 + i, 50, { squads: [lg[a], lg[b]], riskB: 50, params: p }), () => { R++; }); c[Math.min(...st.sets)]++; sets += st.sets[0] + st.sets[1];
  }
  const f = c.map(x => x / matches);
  return `marcadores 3-0 / 3-1 / 3-2: ${f.map(x => (100 * x).toFixed(1)).join(' / ')} %  (PlusLiga: ${[SCORES['3-0'], SCORES['3-1'], SCORES['3-2']].map(x => (100 * x).toFixed(1)).join(' / ')})  | rallies por set ${(R / sets).toFixed(1)}  | TEAM_SD ${teamSd}`;
}

/** Ventaja de local en una liga de equipos de fuerza desigual: % de victorias y % de sets del local, comparables con PlusLiga (54,2 % y 53,4 %). */
export function homeAdvantage(p: Params, boost: number, matches = 1200): { win: number; sets: number } {
  const lg = makeLeague(16, 91), rnd = mulberry32(17); let w = 0, sh = 0, st = 0;
  for (let i = 0; i < matches; i++) {
    const a = Math.floor(rnd() * 16); let b = Math.floor(rnd() * 15); if (b >= a) b++;
    const m = playMatch(createMatch(700 + i, 50, { squads: [boostPlayers(lg[a], boost), lg[b]], riskB: 50, params: p }));
    if (m.sets[0] > m.sets[1]) w++; sh += m.sets[0]; st += m.sets[0] + m.sets[1];
  }
  return { win: w / matches, sets: sh / st };
}
