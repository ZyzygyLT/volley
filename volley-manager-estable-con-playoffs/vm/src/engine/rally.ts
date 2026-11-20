import type { Team, Side, RallyResult, Trace, AtkOut, Player, Ev } from './types';
import { P, type Params } from './params';
import { buildAttackContext } from './attackContext';
import { selectAttackTarget } from './distribution';

const cl = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const avg = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
function pick<T>(items: [T, number][], rnd: () => number): T {
  let r = rnd() * items.reduce((s, x) => s + x[1], 0);
  for (const [it, w] of items) { r -= w; if (r <= 0) return it; }
  return items[0][0];
}
/** Alineación efectiva: el líbero ocupa el lugar del central cuando éste está en la zaga. */
export const effective = (t: Team): Player[] => t.lineup.map((p, ix) => (p.role === 'MB' && ix <= 2 ? t.libero : p));

/** Juega un rally completo. No muta equipos ni estadísticas: devuelve resultado y traza (con eventos por jugador). */
export function playRally(teams: [Team, Team], serving: Side, rnd: () => number, p: Params = P): RallyResult {
  const s = serving, r = (1 - serving) as Side;
  const sv = teams[s].lineup[0], kr = teams[s].risk / 100 - 0.5;
  const ty = p.serveType[sv.serveType];
  const effR = effective(teams[r]);
  const pas = pick(effR.filter(x => p.recWeight[x.role] > 0).map(x => [x, p.recWeight[x.role]] as [Player, number]), rnd);
  const ev: Ev[] = [];
  const trace: Trace = { serve: 'in', serveType: sv.serveType, atks: [], ev, capped: false, setPlayObservations: [] };

  const pErr = cl(ty.err + p.serveErrOff + p.roleServeErr[sv.role] + p.errRisk * kr - (sv.srv - 70) * p.errSrvW - (sv.cons - 70) * p.errConsW, 0.005, 0.5);
  if (rnd() < pErr) {
    trace.serve = 'err'; ev.push({ k: 'serve', p: sv.id, t: sv.serveType, o: 'err' });
    return { winner: r, text: `${sv.name} falla el saque`, stat: { team: s, key: 'err' }, trace, termination: { kind: 'fault', responsibleTeam: s } };
  }
  const pAce = cl(ty.ace + p.serveAceOff + p.roleAce[sv.role] + p.aceRisk * kr + (sv.srv - 70) * p.aceSrvW - (pas.rec - 70) * p.aceRecW, 0, 0.4);
  if (rnd() < pAce) {
    trace.serve = 'ace'; ev.push({ k: 'serve', p: sv.id, t: sv.serveType, o: 'ace' }, { k: 'rec', p: pas.id, q: 0, err: true });
    return { winner: s, text: `Ace de ${sv.name}`, stat: { team: s, key: 'ace' }, trace, termination: { kind: 'winning-action', responsibleTeam: s } };
  }
  ev.push({ k: 'serve', p: sv.id, t: sv.serveType, o: 'in' });

  const useShare = ty.use + (sv.srv - 70) * p.useSrvW + p.useRisk * kr - p.useRef;
  let q = cl(p.recBase + p.roleRec[pas.role] + (pas.rec - 70) * p.recW - p.pressure * useShare + (rnd() * 2 - 1) * p.recNoise, 0.05, 1);
  ev.push({ k: 'rec', p: pas.id, q });
  let A: Side = r, D: Side = s;

  for (let i = 0; i < p.maxExchanges; i++) {
    const phase = i === 0 ? 'k1' : 'k2';
    const att = teams[A].lineup, def = teams[D].lineup, effD = effective(teams[D]);
    if (rnd() < p.otherErr) { // error de manejo antes de atacar (toque de red, doble, rotación…)
      const hs = att.find(x => x.role === 'S') ?? att[0];
      ev.push({ k: 'oerr', p: hs.id });
      return { winner: D, text: `Error de manejo de ${hs.name}`, stat: { team: A, key: 'err' }, trace, termination: { kind: 'fault', responsibleTeam: A } };
    }
    const attackContext = buildAttackContext(att, q, p);
    const at = selectAttackTarget(attackContext, rnd).attacker;
    const setter = attackContext.setter?.player;
    if (setter) {
      trace.setPlayObservations!.push({
        phase,
        setterId: setter.id,
        selectedAttackerId: at.id,
        selection: setter.id === at.id ? 'setter-second-touch' : 'teammate-target',
        source: 'legacy-weighted-target-selector',
        receptionQuality: attackContext.receptionQuality,
      });
    }
    const front = def.slice(3), bA = avg(front.map(x => x.blk)), dA = avg(effD.slice(0, 3).map(x => x.def));
    const qd = q - 0.55, sd = setter ? setter.set - 70 : 0;
    const baseK = phase === 'k1' ? p.killK1 : p.killK2, baseE = phase === 'k1' ? p.errK1 : p.errK2, baseB = phase === 'k1' ? p.blkK1 : p.blkK2;
    const pK = cl(baseK + p.roleKill[at.role] + (at.atk - 70) * p.atkW * p.atkSkillScale[at.role] + sd * p.setW - (dA - 65) * p.defW - (bA - 65) * p.blkKillW + qd * p.qKill, 0.05, 0.85);
    const pE = cl(baseE + p.roleErr[at.role] - (at.atk - 70) * p.errAtkW - (at.cons - 70) * p.errConsW - qd * p.errQ, 0.01, 0.35);
    const pB = cl(baseB + (bA - 65) * p.blkW, 0.01, 0.3);
    const u = rnd();
    let out: AtkOut = 'cont';
    if (u < pE) out = 'err'; else if (u < pE + pB) out = 'blk'; else if (u < pE + pB + pK) out = 'kill';
    const rec_ = { phase, out, q } as Trace['atks'][number];
    trace.atks.push(rec_);
    const ast = out === 'kill' && setter && setter.id !== at.id ? setter.id : undefined; // el ataque del propio colocador no suma asistencia
    ev.push({ k: 'atk', p: at.id, o: out, ast });
    if (out === 'err') return { winner: D, text: `Error de ataque de ${at.name}`, stat: { team: A, key: 'err' }, trace, termination: { kind: 'fault', responsibleTeam: A } };
    if (out === 'blk') {
      const bl = pick(front.filter(f => p.blkWeight[f.role] > 0).map(f => [f, p.blkWeight[f.role] * (f.blk / 70)] as [Player, number]), rnd);
      ev.push({ k: 'blk', p: bl.id });
      return { winner: D, text: `Bloqueo de ${bl.name}`, stat: { team: D, key: 'blk' }, trace, termination: { kind: 'winning-action', responsibleTeam: D } };
    }
    if (out === 'kill') return { winner: A, text: `Ataque ganador de ${at.name}`, stat: { team: A, key: 'kill' }, trace, termination: { kind: 'winning-action', responsibleTeam: A } };
    if (rnd() < p.keepProb) { // sigue en el mismo lado (cobertura, rebote del bloqueo, pelota reciclada)
      rec_.swap = false;
      q = cl(p.coverQ + (rnd() * 2 - 1) * p.digNoise, 0.05, 0.9);
    } else {
      rec_.swap = true;
      const dg = pick(effD.slice(0, 3).filter(d => p.digWeight[d.role] > 0).map(d => [d, p.digWeight[d.role] * (d.def / 70)] as [Player, number]), rnd);
      ev.push({ k: 'dig', p: dg.id });
      q = cl(p.digBase + (dg.def - 70) * p.digW + (rnd() * 2 - 1) * p.digNoise, 0.05, 0.9);
      [A, D] = [D, A];
    }
  }
  trace.capped = true;
  return { winner: rnd() < 0.5 ? s : r, text: 'Rally larga', trace };
}
