import { describe, it, expect } from 'vitest';
import { createMatch, playMatch, stepPoint, makeSquads, makePlayer, legalSubs, substitute, MAX_SUBS, sideForTeam, sideForPlayers, firstServer } from './match';
import { mulberry32 } from './rng';
import { mergeBox, points, hitEff } from './stats';

describe('identificación de lado en partido', () => {
  it('resuelve ambos lados y no asigna por defecto un equipo ajeno al visitante', () => {
    const m = createMatch(17);
    expect(sideForTeam(m, m.teams[0].name)).toBe(0);
    expect(sideForTeam(m, m.teams[1].name)).toBe(1);
    expect(sideForTeam(m, 'Equipo que no participa')).toBeNull();
  });

  it('identifica al equipo por IDs de jugadores aunque ambos equipos tengan el mismo nombre', () => {
    const squads = makeSquads(18);
    const m = createMatch(18, 50, { squads, names: ['Andes', 'Andes'] });
    const visitorIds = new Set(squads[1].map(player => player.id));
    expect(sideForPlayers(m, visitorIds)).toBe(1);
  });

  it('no identifica un equipo si sus IDs no aparecen de forma inequívoca', () => {
    const m = createMatch(19);
    expect(sideForPlayers(m, new Set(['jugador-ajeno']))).toBeNull();
  });
});

describe('motor', () => {
  it('es determinista: misma semilla, mismo resultado', () => {
    const a = playMatch(createMatch(42)), b = playMatch(createMatch(42));
    expect(a.sets).toEqual(b.sets); expect(a.log).toEqual(b.log); expect(a.box).toEqual(b.box);
  });
  it('termina con un equipo en 3 sets', () => {
    const m = playMatch(createMatch(7));
    expect(m.over).toBe(true); expect(Math.max(...m.sets)).toBe(3); expect(Math.min(...m.sets)).toBeLessThan(3);
  });
  it('la secuencia aleatoria no depende de la longitud del registro visible', () => {
    for (let seed = 1; seed <= 100; seed++) {
      const initial = createMatch(seed);
      const normal = stepPoint(initial);
      const withDisplayNoise = stepPoint({ ...initial, log: ['mensaje de interfaz ajeno al partido'] });
      expect(withDisplayNoise.score).toEqual(normal.score);
      expect(withDisplayNoise.totals).toEqual(normal.totals);
      expect(withDisplayNoise.sets).toEqual(normal.sets);
      expect(withDisplayNoise.serving).toBe(normal.serving);
      expect(withDisplayNoise.stats).toEqual(normal.stats);
      expect(withDisplayNoise.box).toEqual(normal.box);
    }
  });
  it('rota únicamente al equipo receptor cuando recupera el saque', () => {
    let sawSideOut = false;
    let sawServeHold = false;
    for (let seed = 1; seed <= 200 && !(sawSideOut && sawServeHold); seed++) {
      const before = createMatch(seed);
      const after = stepPoint(before);
      const winner: 0 | 1 = after.score[0] > 0 ? 0 : 1;
      const receiver = (1 - before.serving) as 0 | 1;
      if (winner === before.serving) {
        expect(after.serving).toBe(before.serving);
        expect(after.teams[0].lineup).toEqual(before.teams[0].lineup);
        expect(after.teams[1].lineup).toEqual(before.teams[1].lineup);
        sawServeHold = true;
      } else {
        const oldLineup = before.teams[receiver].lineup;
        expect(after.serving).toBe(receiver);
        expect(after.teams[receiver].lineup).toEqual([oldLineup[5], ...oldLineup.slice(0, 5)]);
        expect(after.teams[before.serving].lineup).toEqual(before.teams[before.serving].lineup);
        sawSideOut = true;
      }
    }
    expect(sawSideOut).toBe(true);
    expect(sawServeHold).toBe(true);
  });

  it('al comenzar un set alterna el primer saque, salvo el sorteo independiente del quinto', () => {
    const fifthSetServers = new Set<number>();
    for (let seed = 0; seed < 100; seed++) {
      expect(firstServer(seed, 2)).toBe(1 - firstServer(seed, 1));
      expect(firstServer(seed, 3)).toBe(firstServer(seed, 1));
      expect(firstServer(seed, 4)).toBe(firstServer(seed, 2));
      const fifth = firstServer(seed, 5);
      expect(firstServer(seed, 5)).toBe(fifth);
      fifthSetServers.add(fifth);
    }
    expect(fifthSetServers).toEqual(new Set([0, 1]));
  });

  it('reinicia marcador, rotación y sustituciones al cambiar de set sin borrar el historial', () => {
    const [home, away] = makeSquads(711);
    const rnd = mulberry32(712);
    const bench = (offset: number) =>
      (['S', 'OH', 'OH', 'MB', 'MB', 'OP', 'L'] as const).map((role, index) =>
        makePlayer(rnd, role, index, `set-b${offset + index}`, `Suplente ${offset + index}`, 0),
      );
    let match = createMatch(713, 50, { squads: [home, away], benches: [bench(0), bench(20)] });
    const sub = legalSubs(match, 0).find(option => !option.isLibero)!;
    match = substitute(match, 0, sub.out.id, sub.inn.id);
    match.score = [24, 24];
    match.totals = [24, 24];

    let safety = 0;
    while (match.setNo === 1 && safety++ < 200) match = stepPoint(match);

    expect(match.setNo).toBe(2);
    expect(match.sets[0] + match.sets[1]).toBe(1);
    expect(match.score).toEqual([0, 0]);
    expect(match.serving).toBe(firstServer(match.seed, 2));
    for (const side of [0, 1] as const) {
      expect(match.teams[side].lineup).toEqual(match.base[side].slice(0, 6));
      expect(match.teams[side].libero).toEqual(match.base[side][6]);
      expect(match.subState[side]).toEqual({ count: 0, swaps: {}, replaced: [], usedIn: [] });
    }
    expect(match.subHistory).toHaveLength(1);
    expect(match.subHistory?.[0].setNo).toBe(1);
    expect(match.playedIds).toContain(sub.inn.id);
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
  it('cada rally adjudica exactamente un punto y las estadísticas concilian por equipo y jugador', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const m = playMatch(createMatch(seed));
      const rallies = m.totals[0] + m.totals[1];
      expect(m.setScores.reduce((sum, score) => sum + score[0] + score[1], 0)).toBe(rallies);

      for (const side of [0, 1] as const) {
        const ids = new Set(m.base[side].map(player => player.id));
        const players = Object.entries(m.box).filter(([id]) => ids.has(id)).map(([, stats]) => stats);
        const sum = (key: 'aces' | 'kills' | 'blocks' | 'serveErr' | 'atkErr' | 'otherErr') =>
          players.reduce((total, stats) => total + stats[key], 0);
        const team = m.stats[side];
        expect(sum('aces')).toBe(team.ace);
        expect(sum('kills')).toBe(team.kill);
        expect(sum('blocks')).toBe(team.blk);
        expect(sum('serveErr') + sum('atkErr') + sum('otherErr')).toBe(team.err);
        // err cuenta faltas cometidas por este equipo; esos puntos los recibe el rival.
        expect(team.ace + team.kill + team.blk + m.stats[1 - side].err).toBe(m.totals[side]);
        expect(players.reduce((total, stats) => total + points(stats), 0))
          .toBe(team.ace + team.kill + team.blk);
        expect(players.reduce((total, stats) => total + stats.serveErr + stats.atkErr + stats.otherErr, 0))
          .toBe(team.err);
      }
    }
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
