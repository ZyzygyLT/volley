import { describe, it, expect } from 'vitest';
import { createMatch, playMatch, stepPoint, makeSquads, makePlayer, legalSubs, substitute, MAX_SUBS } from './match';
import { mulberry32 } from './rng';
import { mergeBox, points, hitEff } from './stats';

describe('motor', () => {
  it('es determinista: misma semilla, mismo resultado', () => {
    const a = playMatch(createMatch(42)), b = playMatch(createMatch(42));
    expect(a.sets).toEqual(b.sets); expect(a.log).toEqual(b.log); expect(a.box).toEqual(b.box);
  });
  it('termina con un equipo en 3 sets', () => {
    const m = playMatch(createMatch(7));
    expect(m.over).toBe(true); expect(Math.max(...m.sets)).toBe(3); expect(Math.min(...m.sets)).toBeLessThan(3);
  });
  it('stepPoint no muta el estado anterior', () => {
    const m = createMatch(1); const snap = JSON.stringify(m); stepPoint(m);
    expect(JSON.stringify(m)).toBe(snap);
  });
  it('los sets cumplen 25 con diferencia de 2 (15 en el quinto)', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = createMatch(seed);
      while (!s.over) {
        const nx = stepPoint(s);
        if (nx.sets[0] + nx.sets[1] > s.sets[0] + s.sets[1]) {
          const f = [s.score[0] + (nx.sets[0] > s.sets[0] ? 1 : 0), s.score[1] + (nx.sets[1] > s.sets[1] ? 1 : 0)];
          expect(Math.max(...f)).toBeGreaterThanOrEqual(s.setNo === 5 ? 15 : 25); expect(Math.abs(f[0] - f[1])).toBeGreaterThanOrEqual(2);
        }
        s = nx;
      }
    }
  });
});

describe('estadísticas individuales', () => {
  it('las estadísticas de jugadores cuadran con las del equipo', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const m = playMatch(createMatch(seed));
      for (const t of [0, 1] as const) {
        const ids = Object.keys(m.box).filter(id => (+id.slice(1) < 7) === (t === 0));
        const sum = (k: 'aces' | 'kills' | 'blocks' | 'serveErr' | 'atkErr' | 'otherErr') => ids.reduce((s, id) => s + m.box[id][k], 0);
        expect(sum('aces')).toBe(m.stats[t].ace); expect(sum('kills')).toBe(m.stats[t].kill); expect(sum('blocks')).toBe(m.stats[t].blk);
        expect(sum('serveErr') + sum('atkErr') + sum('otherErr')).toBe(m.stats[t].err);
      }
    }
  });
  it('cada punto del partido se atribuye a un evento (sin rallies sin explicar)', () => {
    const m = playMatch(createMatch(3));
    const total = Object.values(m.box).reduce((s, p) => s + points(p) + p.serveErr + p.atkErr + p.otherErr, 0);
    const rallies = m.log.filter(l => !l.startsWith('—')).length;
    expect(total).toBeGreaterThanOrEqual(rallies - 5); expect(total).toBeLessThanOrEqual(rallies);
  });
  it('el líbero recibe y defiende, pero nunca saca ni ataca', () => {
    const m = playMatch(createMatch(9));
    for (const id of ['p6', 'p13']) { const s = m.box[id]; expect(s.serves).toBe(0); expect(s.atks).toBe(0); expect(s.recs + s.digs).toBeGreaterThan(0); }
  });
  it('mergeBox acumula entre partidos y suma partidos jugados', () => {
    const sq = makeSquads(5), ids = [...sq[0], ...sq[1]].map(p => p.id);
    const m1 = playMatch(createMatch(1, 50, { squads: sq })), m2 = playMatch(createMatch(2, 50, { squads: sq }));
    const c = mergeBox(mergeBox({}, m1.box, ids), m2.box, ids);
    for (const id of ids) {
      expect(c[id].gp).toBe(2);
      expect(c[id].kills).toBe((m1.box[id]?.kills ?? 0) + (m2.box[id]?.kills ?? 0));
    }
    expect(hitEff(c[ids[3]])).toBeLessThanOrEqual(1);
  });
});

describe('sustituciones (reglas FIVB)', () => {
  const setup = () => {
    const [a, b] = makeSquads(21), rnd = mulberry32(5);
    const bench = (off: number) => (['S', 'OH', 'OH', 'MB', 'MB', 'OP', 'L'] as const).map((r, i) => makePlayer(rnd, r, 0, `b${off + i}`, `Sup${off + i}`, 0));
    return createMatch(3, 50, { squads: [a, b], benches: [bench(0), bench(20)] });
  };
  it('solo ofrece cambios por jugadores de la misma posición', () => {
    for (const o of legalSubs(setup(), 0)) expect(o.out.role).toBe(o.inn.role);
  });
  it('un cambio mueve al titular al banco y al suplente a la cancha', () => {
    const m = setup(), o = legalSubs(m, 0).find(x => !x.isLibero)!, s = substitute(m, 0, o.out.id, o.inn.id);
    expect([...s.teams[0].lineup, s.teams[0].libero].some(p => p.id === o.inn.id)).toBe(true);
    expect(s.benches[0].some(p => p.id === o.out.id)).toBe(true); expect(s.subState[0].count).toBe(1);
    expect(m.subState[0].count).toBe(0); // no muta el estado anterior
  });
  it('rechaza cambios ilegales (otra posición, jugador inexistente)', () => {
    const m = setup(), out = m.teams[0].lineup.find(p => p.role === 'OH')!, bad = m.benches[0].find(p => p.role === 'MB')!;
    expect(() => substitute(m, 0, out.id, bad.id)).toThrow(); expect(() => substitute(m, 0, 'x', 'y')).toThrow();
  });
  it('un titular solo puede ser reemplazado una vez y el suplente solo se cambia por el titular', () => {
    let m = setup(); const o = legalSubs(m, 0).find(x => x.out.role === 'OH')!;
    m = substitute(m, 0, o.out.id, o.inn.id);
    const again = legalSubs(m, 0).filter(x => x.out.id === o.inn.id);
    expect(again.map(x => x.inn.id)).toEqual([o.out.id]); // solo vuelve el titular
    m = substitute(m, 0, o.inn.id, o.out.id);
    expect(legalSubs(m, 0).some(x => x.out.id === o.out.id || x.inn.id === o.inn.id)).toBe(false); // ni el titular vuelve a salir ni el suplente a entrar
  });
  it('máximo 6 cambios por set; el líbero no cuenta; el nuevo set reinicia el contador', () => {
    let m = setup(), n = 0;
    while (n < MAX_SUBS) { const o = legalSubs(m, 0).find(x => !x.isLibero); if (!o) break; m = substitute(m, 0, o.out.id, o.inn.id); n++; }
    expect(n).toBe(MAX_SUBS); expect(legalSubs(m, 0).filter(x => !x.isLibero)).toEqual([]);
    const lib = legalSubs(m, 0).find(x => x.isLibero)!; expect(lib).toBeTruthy(); m = substitute(m, 0, lib.out.id, lib.inn.id); expect(m.subState[0].count).toBe(MAX_SUBS);
    while (m.setNo === 1) m = stepPoint(m);
    expect(m.subState[0].count).toBe(0);
  });
  it('las acciones posteriores se acreditan al jugador que entró', () => {
    let m = setup(); const o = legalSubs(m, 0).find(x => x.out.role === 'OH')!; m = substitute(m, 0, o.out.id, o.inn.id); m = playMatch(m);
    const s = m.box[o.inn.id]; expect(s && s.recs + s.atks + s.serves + s.digs > 0).toBe(true);
  });
});
