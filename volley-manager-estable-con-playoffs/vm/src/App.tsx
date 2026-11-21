import { Component, useEffect, useMemo, useState, type ReactNode } from 'react';
import { legalSubs, MAX_SUBS, playMatch, sideForTeam, stepPoint, substitute } from './engine/match';
import { effective } from './engine/rally';
import { emptyP, hitEff, pct, points } from './engine/stats';
import type { MatchState, PStats, Player, Side } from './engine/types';
import { autoLineup, lineupToSquad, overall, validateLineup, ROSTER_ORDER, MAX_ROSTER, type Lineup } from './game/roster';
import { ECON, annualWage, marketValue, roundWages, sell, sign, wageBill } from './game/economy';
import { addBoxes } from './engine/stats';
import { matchSummary } from './game/summary';
import { chooseTeam, endSeason, finishRound, fixturesOfRound, isSeasonOver, leaders, matchFor, newGame, regularSeasonOver, seasonSummary, standings, totalRounds, userFixture, type GameState, type Series } from './game/season';
import { finishPlayoffDay, matchForSeries, simulateSeason, startPlayoffs, userSeries, winsOf } from './game/playoffs';
import { deserializeSession, indexedDbStore, memoryStore, metaOf, serializeSession, type SaveMeta } from './game/save';
import { createWriteQueue } from './game/writeQueue';
import { recoverAuto, writeAutoWithBackup } from './game/autosave';

type Tab = 'liga' | 'plantel' | 'partido' | 'mercado' | 'finanzas' | 'stats' | 'guardar' | 'acerca';
const TABS: [Tab, string][] = [['liga', 'Liga'], ['plantel', 'Plantel'], ['partido', 'Partido'], ['mercado', 'Mercado'], ['finanzas', 'Finanzas'], ['stats', 'Estadísticas'], ['guardar', 'Guardar'], ['acerca', 'Acerca de']];
const f1 = (x: number) => (100 * x).toFixed(0) + '%';
const money = (n: number) => (n < 0 ? '−' : '') + '$ ' + new Intl.NumberFormat('es-AR').format(Math.abs(Math.round(n)));
const SLOTS = ['1', '2', '3'];
const teamStrength = (g: GameState, i: number) => { const t = g.teams[i]; const sq = lineupToSquad(t.roster, t.lineup); return sq.reduce((s, p) => s + overall(p), 0) / sq.length; };

function Court({ m, side }: { m: MatchState; side: Side }) {
  const t = m.teams[side], eff = effective(t), cell = (ix: number) => { const srv = m.serving === side && ix === 0; const p = srv ? t.lineup[0] : eff[ix]; // quien saca es el jugador de la zona 1 (el líbero no saca)
    return <div className={'cell' + (srv ? ' srv' : '')} key={ix}><b>{p.name}</b><small>{p.role}{srv ? ' · saca' : ''}</small></div>; };
  return <div className="court"><div className="mu">{t.name}</div>
    <div className="grid">{[3, 4, 5].map(cell)}</div><div className="grid">{[2, 1, 0].map(cell)}</div></div>;
}

function Box({ title, players, box }: { title: string; players: Player[]; box: Record<string, PStats> }) {
  return (
    <div className="wrap">
      {title && <h3>{title}</h3>}
      <table>
        <thead><tr>{['Jugador', 'Saque', 'PJ', 'Sq', 'Ace', 'ErrS', 'Rec', 'Pos%', 'Perf%', 'Atq', 'K', 'ErrA', 'Efic', 'Blq', 'Def', 'Ast', 'ErrM', 'Pts'].map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{players.map(p => { const s = box[p.id] ?? emptyP(); return (
          <tr key={p.id}>
            <td>{p.name} <small>{p.role}</small></td><td>{p.serveType}</td><td>{s.gp || ''}</td><td>{s.serves}</td><td>{s.aces}</td><td>{s.serveErr}</td>
            <td>{s.recs}</td><td>{s.recs ? f1(pct(s.recPos, s.recs)) : '–'}</td><td>{s.recs ? f1(pct(s.recPerf, s.recs)) : '–'}</td><td>{s.atks}</td><td>{s.kills}</td><td>{s.atkErr + s.blocked}</td>
            <td>{s.atks ? hitEff(s).toFixed(2) : '–'}</td><td>{s.blocks}</td><td>{s.digs}</td><td>{s.assists}</td><td>{s.otherErr}</td><td><b>{points(s)}</b></td>
          </tr>); })}</tbody>
      </table>
    </div>
  );
}

function About() {
  const rows: [string, string][] = [['PJ / G / P', 'partidos jugados, ganados y perdidos'], ['Sq / Ace / ErrS', 'saques, aces y errores de saque'], ['Rec / Pos% / Perf%', 'recepciones, % positivas y % perfectas'], ['Atq / K / ErrA', 'ataques, ataques ganadores y errores o bloqueados'],
    ['Efic', 'eficacia de ataque = (ganadores − errores − bloqueados) / ataques'], ['Blq / Def / Ast', 'bloqueos con punto, defensas y asistencias'], ['ErrM', 'errores de manejo (toque de red, dobles, rotación)'], ['Pts', 'puntos propios = aces + ataques ganadores + bloqueos'],
    ['S / OH / MB / OP / L', 'colocador, receptor-atacante, central, opuesto y líbero'], ['JS / JFS / FS', 'saque potente en salto, flotado en salto y flotado de pie'], ['Gen', 'valoración global del jugador en su puesto']];
  return <section>
    <h2>Acerca de</h2>
    <p>Simulador de gestión de voleibol. El motor juega cada rally (saque, recepción, colocación, ataque, bloqueo y defensa) con probabilidades calibradas con estadísticas reales de voleibol masculino de élite.</p>
    <h3>Qué viene de datos y qué es diseño</h3>
    <div className="wrap"><table><thead><tr><th>Parte</th><th>Origen</th></tr></thead><tbody>
      <tr><td>Tasas de saque, ataque, bloqueo, recepción y cómo terminan los rallies</td><td>Datos: PlusLiga 2020–2023 (628 partidos) y VNL 2024</td></tr>
      <tr><td>Diferencias por posición, líbero, ataque del colocador, edades y retiros</td><td>Datos: VNL 2024 (294 jugadores con posición)</td></tr>
      <tr><td>Ventaja de local</td><td>Datos de PlusLiga (el equipo listado primero gana el 54,2 %); que sea el local es una inferencia</td></tr>
      <tr><td>Fases del rally, posesión y side-out</td><td>Preprint de González, González-Cabrera y Herrera (2024), sin revisión por pares</td></tr>
      <tr><td>Puntos de liga y sustituciones</td><td>Reglamento FIVB</td></tr>
      <tr><td>Playoffs: cuadro de 4, series al mejor de 3 y final al mejor de 5, localía alterna</td><td>Formato inspirado en la PlusLiga (Volleyball World); la adaptación a 8 equipos y sus premios son <b>diseño del juego</b></td></tr>
      <tr><td>Peso de cada habilidad, tipo de saque, táctica de riesgo, progresión de jugadores, fichajes de la computadora, precios, salarios y premios</td><td><b>Diseño del juego</b>, sin respaldo directo en datos</td></tr>
    </tbody></table></div>
    <h3>Fuentes y licencias</h3>
    <ul>
      <li>PlusLiga masculina 2008–2023 (Kaggle, kacpergregorowicz) — CC0. Solo se usaron las temporadas 2020-21 a 2022-23.</li>
      <li>VNL 2024 masculina (Kaggle, jonathanpmoyer) — CC0.</li>
      <li>González, González-Cabrera y Herrera (2024), «Rally-Based Performance Evaluation Model for Highly Competitive Volleyball», SportRχiv — CC BY 4.0. Se usaron cifras derivadas, sin modificar los datos originales.</li>
      <li>No se copió código de otros proyectos. Interfaz construida con React (licencia MIT).</li>
    </ul>
    <h3>Siglas de las tablas</h3>
    <div className="wrap"><table><tbody>{rows.map(([k, v]) => <tr key={k}><td><b>{k}</b></td><td style={{ textAlign: 'left' }}>{v}</td></tr>)}</tbody></table></div>
    <h3>Límites</h3>
    <ul><li>Solo voleibol masculino de élite.</li><li>No hay lesiones, tiempos muertos, fatiga ni contratos, y las computadoras solo fichan agentes libres.</li><li>Los datos abiertos que se usaron (CC0) fueron copiados de webs de ligas por terceros; para un uso comercial conviene validar los derechos de origen.</li></ul>
  </section>;
}

/** Evita la pantalla en blanco si algo falla al dibujar y no promete que los últimos cambios estén guardados. */
export class Boundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state: { err: Error | null } = { err: null };
  static getDerivedStateFromError(err: Error) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return <main><h1>Algo salió mal</h1><p className="err">{this.state.err.message}</p>
      <p>El autoguardado puede no incluir los últimos cambios. Recargá para intentar recuperar la última copia disponible; no se puede garantizar que la sesión completa se haya guardado.</p>
      <button onClick={() => location.reload()}>Recargar</button></main>;
  }
}

export default function App() {
  const [game, setGame] = useState<GameState>(() => newGame(Date.now() % 2 ** 31));
  const [tab, setTab] = useState<Tab>('liga');
  const [live, setLive] = useState<MatchState | null>(null);
  const [msg, setMsg] = useState('');
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [subPick, setSubPick] = useState('');
  const [text, setText] = useState('');
  const [cardId, setCardId] = useState<string | null>(null);
  const [viewTeam, setViewTeam] = useState<number | null>(null);
  const [mRole, setMRole] = useState<'ALL' | Player['role']>('ALL');
  const [mSort, setMSort] = useState<'gen' | 'precio' | 'edad'>('gen');
  const [mAff, setMAff] = useState(false);
  const [liveKind, setLiveKind] = useState<'liga' | 'playoff'>('liga');
  const [pending, setPending] = useState<SaveMeta | null>(null);
  const [autoOn, setAutoOn] = useState(false);
  const store = useMemo(() => { try { return typeof indexedDB !== 'undefined' ? indexedDbStore() : memoryStore(); } catch { return memoryStore(); } }, []);
  const writeQueue = useMemo(() => createWriteQueue(), []);
  const me = game.teams[game.userTeam], uf = userFixture(game), over = isSeasonOver(game);
  const refresh = () => store.list().then(items => setSaves(items.filter(item => item.slot !== 'auto-backup'))).catch(() => setMsg('No se pudo leer el almacenamiento del navegador'));
  useEffect(() => { refresh(); }, []);
  // Autoguardado: al abrir se ofrece continuar la última partida automática; mientras se decide no se sobrescribe.
  useEffect(() => { store.list().then(l => { const m = l.find(x => x.slot === 'auto') ?? l.find(x => x.slot === 'auto-backup'); if (m) setPending({ ...m, slot: 'auto' }); else setAutoOn(true); }).catch(() => { setMsg('No se pudo comprobar el autoguardado. No se sobrescribirá ningún dato; revisá el almacenamiento y recargá para reintentar.'); setAutoOn(false); }); }, []);
  useEffect(() => {
    if (!autoOn) return;
    const t = setTimeout(() => { try { writeQueue(() => writeAutoWithBackup(store, serializeSession(game, live, liveKind), metaOf('auto', game, new Date().toISOString()))).catch(e => setMsg(`No se pudo completar el autoguardado: ${(e as Error).message}`)); } catch (e) { setMsg(`No se pudo preparar el autoguardado: ${(e as Error).message}`); } }, 400);
    return () => clearTimeout(t);
  }, [game, live, liveKind, autoOn, writeQueue]);
  // Si la pestaña se oculta o se cierra antes del debounce, intentamos persistir el último estado.
  useEffect(() => {
    if (!autoOn) return;
    const flush = () => {
      try {
        writeQueue(() => writeAutoWithBackup(store, serializeSession(game, live, liveKind), metaOf('auto', game, new Date().toISOString())))
          .catch(e => setMsg(`No se pudo completar el autoguardado al salir: ${(e as Error).message}`));
      } catch (e) {
        setMsg(`No se pudo preparar el autoguardado al salir: ${(e as Error).message}`);
      }
    };
    const onVisibilityChange = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [game, live, liveKind, autoOn, store, writeQueue]);
  const continueAuto = async () => { try { const recovered = await recoverAuto(store); if (!recovered.session) throw new Error('No hay una copia válida disponible'); const restored = recovered.session; setGame(restored.game); setLive(restored.liveMatch); setLiveKind(restored.liveKind); setTab(restored.liveMatch ? 'partido' : 'liga'); setMsg(recovered.source === 'auto-backup' ? 'Partida recuperada desde la copia de seguridad anterior; se restauró el autoguardado principal.' : 'Continuás la partida automática'); setPending(null); setAutoOn(true); refresh(); } catch (e) { setMsg(`No se pudo recuperar la partida automática: ${(e as Error).message}. No se sobrescribirá; podés reintentar o empezar una partida nueva.`); } };

  const setLineup = (l: Lineup) => setGame(g => ({ ...g, teams: g.teams.map(t => (t.id === g.userTeam ? { ...t, lineup: l } : t)) }));
  const setRisk = (risk: number) => setGame(g => ({ ...g, teams: g.teams.map(t => (t.id === g.userTeam ? { ...t, risk } : t)) }));
  const lineupErrors = validateLineup(me.roster, me.lineup);
  const regOver = regularSeasonOver(game), us = userSeries(game);
  const play = () => {
    if (live) { setMsg('Ya hay un partido en curso. Cerralo antes de iniciar otro.'); setTab('partido'); return; }
    if (lineupErrors.length) return;
    if (regOver && game.playoffs && us) { setLive(matchForSeries(game, us)); setLiveKind('playoff'); }
    else if (uf && !regOver) { setLive(matchFor(game, uf)); setLiveKind('liga'); }
    else return;
    setMsg(''); setTab('partido');
  };
  const close = () => {
    if (!live) return;
    try {
      const next = liveKind === 'playoff' ? finishPlayoffDay(game, live) : finishRound(game, live);
      setGame(next);
      setLive(null);
      setTab('liga');
      setMsg('Partido registrado correctamente');
    } catch (e) {
      setMsg(`No se pudo registrar el partido: ${(e as Error).message}. El partido sigue abierto y no se modificó la jornada.`);
    }
  };
  const simulate = () => {
    if (live) { setMsg('Terminá y cerrá el partido en curso antes de simular la jornada.'); setTab('partido'); return; }
    if (lineupErrors.length) return;
    try {
      const next = regOver ? finishPlayoffDay(game) : finishRound(game);
      setGame(next);
      setLive(null);
      setMsg('Jornada simulada correctamente');
    } catch (e) {
      setMsg(`No se pudo simular la jornada: ${(e as Error).message}. La partida no se modificó.`);
    }
  };
  const name = (i: number) => game.teams[i].name;
  const attempt = (f: () => GameState, ok: string) => { try { setGame(f()); setMsg(ok); } catch (e) { setMsg((e as Error).message); } };

  const save = async (slot: string) => { try { await writeQueue(() => store.put(slot, serializeSession(game, live, liveKind), metaOf(slot, game, new Date().toISOString()))); setMsg(`Partida guardada en la ranura ${slot}`); refresh(); } catch (e) { setMsg(String(e)); } };
  const load = async (slot: string) => { try { const j = await store.get(slot); if (!j) return setMsg('Ranura vacía'); const restored = deserializeSession(j); setGame(restored.game); setLive(restored.liveMatch); setLiveKind(restored.liveKind); setTab(restored.liveMatch ? 'partido' : 'liga'); setMsg(`Partida cargada (ranura ${slot})`); } catch (e) { setMsg(String(e)); } };
  const remove = async (slot: string) => { try { await writeQueue(() => store.remove(slot)); setMsg(`Ranura ${slot} borrada`); refresh(); } catch (e) { setMsg(String(e)); } };
  const importText = () => { try { const restored = deserializeSession(text); setGame(restored.game); setLive(restored.liveMatch); setLiveKind(restored.liveKind); setTab(restored.liveMatch ? 'partido' : 'liga'); setMsg('Partida importada'); } catch (e) { setMsg((e as Error).message); } };
  const importFile = async (file: File | undefined) => { if (!file) return; try { const restored = deserializeSession(await file.text()); setGame(restored.game); setLive(restored.liveMatch); setLiveKind(restored.liveKind); setTab(restored.liveMatch ? 'partido' : 'liga'); setMsg('Partida importada'); } catch (e) { setMsg((e as Error).message); } };
  const exportFile = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([serializeSession(game, live, liveKind)], { type: 'application/json' })); a.download = `volley-manager-jornada${game.round}.json`; a.click(); URL.revokeObjectURL(a.href); };

  // Boxscore: la plantilla actual y los suplentes que tuvieron acciones.
  const squadsOf = (m: MatchState) => [0, 1].map(i => [...m.base[i], ...m.benches[i].filter(b => m.box[b.id])]);
  const mySide = live ? sideForTeam(live, me.name) : null;
  const subOpts = live && mySide !== null ? legalSubs(live, mySide) : [];
  const doSub = () => {
    if (!live || mySide === null) { setMsg('No se pudo identificar tu equipo en este partido; no se aplicó ningún cambio.'); return; }
    const [o, i] = subPick.split('|');
    try { setLive(substitute(live, mySide, o, i)); setSubPick(''); setMsg(''); }
    catch (e) { setMsg((e as Error).message); }
  };
  const allPlayers = [...game.teams.flatMap(t => t.roster), ...game.market];
  const card = cardId ? allPlayers.find(p => p.id === cardId) : undefined;
  const Name = ({ p }: { p: Player }) => <button className="lnk" onClick={() => setCardId(p.id)}>{p.name}</button>;
  const rosterSorted = (ps: Player[]) => ROSTER_ORDER.flatMap(r => ps.filter(p => p.role === r).sort((a, b) => overall(b) - overall(a)));
  const ratings = (p: Player) => <><td>{p.srv}</td><td>{p.rec}</td><td>{p.set}</td><td>{p.role === 'L' ? '–' : p.atk}</td><td>{p.role === 'L' ? '–' : p.blk}</td><td>{p.def}</td><td>{p.cons}</td></>;
  const RH = ['Jugador', 'Rol', 'Edad', 'Saque', 'Gen', 'Sq', 'Rec', 'Col', 'Atq', 'Blq', 'Def', 'Cons'];

  return (
    <main>
      <h1>Volley Manager <small>— {me.name} · temporada {game.season} · {regOver ? (over ? 'temporada terminada' : 'playoffs') : `jornada ${game.round + 1}/${totalRounds(game)}`} · {money(game.finance.budget)}</small></h1>
      <nav>{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</nav>
      {msg && <p role="status" className="mu"><i>{msg}</i></p>}
      {!store.persistent && <p role="alert" className="notice">El almacenamiento persistente no está disponible. Esta partida se conserva solo en memoria y se perderá al cerrar o recargar la pestaña. Exportá una copia desde Guardar para conservarla.</p>}
      {pending && <div className="notice" role="alert">Hay una partida automática guardada ({pending.team}, {pending.round} jornadas jugadas, {pending.savedAt ? new Date(pending.savedAt).toLocaleString() : ''}).{' '}
        <button onClick={continueAuto}>Continuar esa partida</button> <button onClick={() => { setPending(null); setAutoOn(true); }}>Empezar de cero</button></div>}
      {card && <div className="notice card">
        <b>{card.name}</b> <small>{card.role} · {card.age ?? '–'} años · saque {card.serveType} · valoración {overall(card).toFixed(0)}</small>{' '}
        <button onClick={() => setCardId(null)}>Cerrar</button>
        <div className="bars">{([['Saque', card.srv], ['Recepción', card.rec], ['Colocación', card.set], ['Ataque', card.atk], ['Bloqueo', card.blk], ['Defensa', card.def], ['Consistencia', card.cons]] as const).map(([l, v]) =>
          card.role === 'L' && (l === 'Ataque' || l === 'Bloqueo') ? null : <div key={l} className="bar"><span>{l}</span><i style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /><b>{v}</b></div>)}</div>
        <small className="mu">Valor de mercado {money(marketValue(card))} · salario anual {money(annualWage(card))} (valores de diseño)</small>
        {(() => { const s = addBoxes(game.allTime, game.career)[card.id]; return s ? <p><small>Histórico: {s.gp} partidos · {s.kills} ataques ganadores · {s.aces} aces · {s.blocks} bloqueos · {s.digs} defensas · {s.assists} asistencias</small></p> : null; })()}
      </div>}

      {tab === 'liga' && <section>
        <h2>Clasificación</h2>
        <div className="wrap"><table className="st">
          <thead><tr>{['#', 'Equipo', 'PJ', 'G', 'P', 'Sets', 'Puntos', 'Pts liga', 'Fuerza'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{standings(game).map((s, i) => <tr key={s.team} className={s.team === game.userTeam ? 'me' : ''}>
            <td>{i + 1}</td><td><button className="lnk" onClick={() => setViewTeam(viewTeam === s.team ? null : s.team)}>{s.name}</button></td><td>{s.played}</td><td>{s.won}</td><td>{s.lost}</td><td>{s.setsFor}-{s.setsAgainst}</td><td>{s.pointsFor}-{s.pointsAgainst}</td><td><b>{s.points}</b></td><td>{teamStrength(game, s.team).toFixed(1)}</td></tr>)}</tbody>
        </table></div>
        <p className="mu"><small>Fuerza = valoración media de los 7 titulares actuales. Tocá un equipo para ver su plantel.</small></p>
        {viewTeam !== null && (() => { const t = game.teams[viewTeam], starters = new Set(lineupToSquad(t.roster, t.lineup).map(p => p.id)); return <div className="notice">
          <b>{t.name}</b> <small>fuerza {teamStrength(game, t.id).toFixed(1)} · {t.roster.length} jugadores</small> <button onClick={() => setViewTeam(null)}>Cerrar</button>
          <div className="wrap"><table><thead><tr>{['Jugador', 'Rol', 'Edad', 'Saque', 'Gen', 'Titular'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{rosterSorted(t.roster).map(p => <tr key={p.id}><td><Name p={p} /></td><td>{p.role}</td><td>{p.age ?? '–'}</td><td>{p.serveType}</td><td><b>{overall(p).toFixed(0)}</b></td><td>{starters.has(p.id) ? '●' : ''}</td></tr>)}</tbody></table></div></div>; })()}
        {game.round === 0 && game.results.length === 0 && <p><label>Dirigís a: <select value={game.userTeam} onChange={(e: { target: { value: string } }) => attempt(() => chooseTeam(game, +e.target.value), `Ahora dirigís a ${name(+e.target.value)}`)}>
          {game.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label> <small className="mu">(solo antes de jugar la primera jornada)</small></p>}
        {over ? (() => { const r = seasonSummary(game); return <div>
          <p><b>Temporada {game.season} terminada.</b> Campeón: <b>{r.champion}</b>. Terminaste en el puesto <b>{r.userRank}</b>. Premio: <b>{money(r.prize)}</b> <small className="mu">(valor de diseño)</small>.</p>
          <p className="mu"><small>Antes de empezar la próxima temporada podés fichar en el Mercado: ficharás antes que las computadoras. Al comenzar, los jugadores evolucionan según su edad, los mayores se retiran y las computadoras ajustan sus planteles.</small></p>
          <p><button onClick={() => attempt(() => endSeason(game), `Empezó la temporada ${game.season + 1}: conservás plantel y presupuesto`)}>Cobrar el premio y empezar la temporada {game.season + 1}</button>{' '}
            <button onClick={() => { setGame(newGame(Date.now() % 2 ** 31)); setLive(null); setMsg('Empezaste una partida nueva'); }}>Partida nueva desde cero</button></p></div>; })() : null}
        {!over && regOver && !game.playoffs && <div className="notice">
          <p><b>Fase regular terminada.</b> Clasifican los 4 mejores: {standings(game).slice(0, 4).map(s => s.name).join(', ')}.</p>
          <p className="mu"><small>Semifinales 1°-4° y 2°-3° al mejor de 3; final al mejor de 5; el mejor clasificado es local en el primer partido y la localía alterna. Formato inspirado en la PlusLiga (adaptado a 8 equipos).</small></p>
          <button onClick={() => attempt(() => startPlayoffs(game), 'Empiezan los playoffs')} disabled={!!live}>Empezar playoffs</button>{' '}
          <button onClick={() => attempt(() => simulateSeason(game), 'Se simularon los playoffs')} disabled={!!live}>Simular los playoffs</button></div>}
        {game.playoffs && <div className="notice">
          <b>Playoffs</b>{' '}<small className="mu">{game.playoffs.stage === 'semi' ? 'semifinales' : game.playoffs.stage === 'final' ? 'final y partido por el bronce' : 'terminados'}</small>
          {game.playoffs.series.map((s: Series) => { const hi = name(s.high), lo = name(s.low), n = s.games.length + 1, nextHome = n % 2 === 1 ? s.high : s.low;
            return <div key={s.id} className="row"><b>{s.id === 'F' ? 'Final' : s.id === 'B' ? 'Bronce' : `Semifinal ${s.id.slice(2)}`}</b> <small className="mu">(al mejor de {s.bestOf})</small>:{' '}
              <span className={s.high === game.userTeam || s.low === game.userTeam ? 'me' : ''}>{hi} {winsOf(s, s.high)}–{winsOf(s, s.low)} {lo}</span>
              {s.games.length > 0 && <small className="mu"> · {s.games.map(x => `${name(x.home)} ${x.sets[0]}–${x.sets[1]} ${name(x.away)}`).join(' · ')}</small>}
              {s.winner === undefined ? <small className="mu"> · próximo: {name(nextHome)} (local) vs {name(nextHome === s.high ? s.low : s.high)}</small> : <small className="okc"> · pasa {name(s.winner)}</small>}</div>; })}
          {!over && <p>
            {lineupErrors.length > 0 && <span className="err">Alineación inválida: {lineupErrors[0]}. </span>}
            {us ? <button onClick={play} disabled={!!live || lineupErrors.length > 0}>Jugar mi partido de playoffs</button> : <small className="mu">Tu equipo no está en juego en esta etapa. </small>}{' '}
            <button onClick={simulate} disabled={!!live || lineupErrors.length > 0}>Simular día de playoffs</button>{' '}
            <button onClick={() => attempt(() => simulateSeason(game), 'Se simularon los playoffs')} disabled={!!live}>Simular los playoffs completos</button></p>}
        </div>}
        {!over && !regOver && <>
          <h3>Jornada {game.round + 1}</h3>
          <ul>{fixturesOfRound(game).map((f, i) => <li key={i}><b>{f === uf ? '▶ ' : ''}</b>{name(f.home)} vs {name(f.away)}</li>)}</ul>
          {lineupErrors.length > 0 && <p className="err">Alineación inválida: {lineupErrors[0]}</p>}
          <button onClick={play} disabled={!!live || lineupErrors.length > 0}>Jugar mi partido</button>{' '}
          <button onClick={simulate} disabled={!!live || lineupErrors.length > 0}>Simular jornada</button>
        </>}
        {game.news.length > 0 && <>
          <h3>Noticias del mercado</h3>
          <ul>{[...game.news].reverse().slice(0, 10).map((n, i) => <li key={i}>{n}</li>)}</ul></>}
        <h3>Resultados recientes</h3>
        <ul>{game.results.slice(-8).reverse().map((r, i) => <li key={i}>J{r.round + 1}: {name(r.home)} {r.sets[0]}–{r.sets[1]} {name(r.away)} <small>({r.setScores.map(x => x.join('-')).join(', ')})</small></li>)}</ul>
      </section>}

      {tab === 'plantel' && <section>
        <h2>Alineación</h2>
        <p className="mu"><small>Los cambios se aplican al próximo partido.</small></p>
        {([['S', 'Colocador', 0], ['OH', 'Receptor 1', 0], ['OH', 'Receptor 2', 1], ['MB', 'Central 1', 0], ['MB', 'Central 2', 1], ['OP', 'Opuesto', 0], ['L', 'Líbero', 0]] as const).map(([role, label, idx]) => {
          const cur = role === 'S' || role === 'OP' || role === 'L' ? (me.lineup[role] as string) : (me.lineup[role] as [string, string])[idx];
          const change = (id: string) => {
            const l: Lineup = { ...me.lineup, OH: [...me.lineup.OH], MB: [...me.lineup.MB] };
            if (role === 'S' || role === 'OP' || role === 'L') l[role] = id; else l[role][idx] = id;
            setLineup(l);
          };
          return <div className="row" key={label}><label>{label}: <select value={cur} onChange={(e: { target: { value: string } }) => change(e.target.value)}>
            {me.roster.filter(p => p.role === role).map(p => <option key={p.id} value={p.id}>{p.name} ({overall(p).toFixed(0)})</option>)}</select></label></div>;
        })}
        <p><button onClick={() => setLineup(autoLineup(me.roster))}>Alineación automática</button></p>
        {lineupErrors.length > 0 && <p className="err">{lineupErrors.join('. ')}</p>}
        <label>Riesgo al saque: {me.risk}% <input type="range" min={0} max={100} value={me.risk} onChange={(e: { target: { value: string } }) => setRisk(+e.target.value)} /></label>
        {game.progressLog.length > 0 && <>
          <h3>Evolución en la última intersemana</h3>
          <div className="wrap"><table>
            <thead><tr>{['Jugador', 'Rol', 'Edad', 'Antes', 'Ahora', 'Cambio'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{[...game.progressLog].sort((x, y) => (y.to - y.from) - (x.to - x.from)).map(e => <tr key={e.id}><td>{e.name}</td><td>{e.role}</td><td>{e.age}</td><td>{e.from}</td><td>{e.to}</td>
              <td className={e.to - e.from < 0 ? 'err' : e.to - e.from > 0 ? 'okc' : ''}>{e.to - e.from > 0 ? '+' : ''}{e.to - e.from}</td></tr>)}</tbody>
          </table></div></>}
        <h3>Plantel ({me.roster.length}/{MAX_ROSTER})</h3>
        <div className="wrap"><table>
          <thead><tr>{RH.map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{rosterSorted(me.roster).map(p => <tr key={p.id}><td><Name p={p} /></td><td>{p.role}</td><td>{p.age ?? '–'}</td><td>{p.serveType}</td><td><b>{overall(p).toFixed(0)}</b></td>{ratings(p)}</tr>)}</tbody>
        </table></div>
      </section>}

      {tab === 'partido' && <section>
        {!live ? <p>No hay un partido en curso. Empezá uno desde la pestaña Liga.</p> : <>
          <h2><span className="score">{live.teams[0].name} {live.score[0]} – {live.score[1]} {live.teams[1].name}</span> <small>(sets {live.sets[0]}–{live.sets[1]}{live.over ? ' · final' : ` · set ${live.setNo}`})</small></h2>
          {live.over && (() => { const s = matchSummary(live); return <div className="notice">
            <b>Resumen:</b> {s.teams[0].name} {s.teams[0].sets}–{s.teams[1].sets} {s.teams[1].name} <small>({s.setScores.map(x => x.join('-')).join(', ')})</small>
            <div className="wrap"><table><thead><tr><th>Equipo</th><th>Puntos</th><th>Ataques ganadores</th><th>Aces</th><th>Bloqueos</th><th>Errores propios</th></tr></thead>
              <tbody>{s.teams.map(t => <tr key={t.name}><td>{t.name}</td><td>{t.total}</td><td>{t.kills}</td><td>{t.aces}</td><td>{t.blocks}</td><td>{t.errors}</td></tr>)}</tbody></table></div>
            {s.mvp && <p>Mejor jugador del partido: <b>{s.mvp.player.name}</b> ({s.mvp.team}) — {s.mvp.line} <small className="mu">(valoración de juego propia, no oficial)</small></p>}</div>; })()}
          {live.setScores.length > 0 && <p className="mu">Parciales: <b>{live.setScores.map(x => x.join('-')).join(', ')}</b></p>}
          <div className="courts"><Court m={live} side={0} /><Court m={live} side={1} /></div>
          <p>
            <button onClick={() => setLive(m => (m ? stepPoint(m) : m))} disabled={live.over}>Punto</button>{' '}
            <button onClick={() => setLive(m => { if (!m) return m; let s = m; const c = s.setNo; while (!s.over && s.setNo === c) s = stepPoint(s); return s; })} disabled={live.over}>Set</button>{' '}
            <button onClick={() => setLive(m => (m ? playMatch(m) : m))} disabled={live.over}>Partido completo</button>{' '}
            {live.over && <button onClick={close}>{liveKind === 'playoff' ? 'Cerrar partido de playoffs' : 'Cerrar jornada'}</button>}
          </p>
          {!live.over && mySide !== null && <p>
            <label>Cambio ({live.subState[mySide].count}/{MAX_SUBS} en el set): <select value={subPick} onChange={(e: { target: { value: string } }) => setSubPick(e.target.value)}>
              <option value="">— elegir —</option>
              {subOpts.map(o => <option key={`${o.out.id}|${o.inn.id}`} value={`${o.out.id}|${o.inn.id}`}>{o.isLibero ? 'Líbero: ' : ''}sale {o.out.name} ({o.out.role}), entra {o.inn.name}</option>)}</select></label>{' '}
            <button onClick={doSub} disabled={!subPick}>Cambiar</button>
          </p>}
          {!live.over && mySide === null && <p role="alert">No se pudo identificar tu equipo en este partido. Los cambios están bloqueados para proteger al rival.</p>}
          <ol reversed style={{ maxHeight: 160, overflow: 'auto' }}>{live.log.slice(0, 40).map((l, i) => <li key={i}>{l}</li>)}</ol>
          <Box title={`Estadísticas del partido — ${live.teams[0].name}`} players={squadsOf(live)[0]} box={live.box} />
          <Box title={`Estadísticas del partido — ${live.teams[1].name}`} players={squadsOf(live)[1]} box={live.box} />
        </>}
      </section>}

      {tab === 'mercado' && <section>
        <h2>Mercado de fichajes</h2>
        <p>Presupuesto: <b>{money(game.finance.budget)}</b> · plantel {me.roster.length}/{MAX_ROSTER} <small className="mu">(precios y salarios son valores de diseño del juego, no datos reales)</small></p>
        {live && <p className="err">Hay un partido en curso: terminalo y cerrá la jornada para operar en el mercado.</p>}
        <h3>Agentes libres ({game.market.length})</h3>
        <p>
          <label>Posición: <select value={mRole} onChange={(e: { target: { value: string } }) => setMRole(e.target.value as typeof mRole)}>
            <option value="ALL">Todas</option>{ROSTER_ORDER.map(r => <option key={r} value={r}>{r}</option>)}</select></label>{' '}
          <label>Ordenar por: <select value={mSort} onChange={(e: { target: { value: string } }) => setMSort(e.target.value as typeof mSort)}>
            <option value="gen">Valoración</option><option value="precio">Precio</option><option value="edad">Edad (menor primero)</option></select></label>{' '}
          <label><input type="checkbox" checked={mAff} onChange={(e: { target: { checked: boolean } }) => setMAff(e.target.checked)} /> Solo los que puedo pagar</label>
        </p>
        <div className="wrap"><table>
          <thead><tr>{[...RH, 'Precio', ''].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{game.market.filter(p => (mRole === 'ALL' || p.role === mRole) && (!mAff || marketValue(p) <= game.finance.budget))
            .sort((x, y) => mSort === 'precio' ? marketValue(y) - marketValue(x) : mSort === 'edad' ? (x.age ?? 0) - (y.age ?? 0) : overall(y) - overall(x)).map(p => <tr key={p.id}><td><Name p={p} /></td><td>{p.role}</td><td>{p.age ?? '–'}</td><td>{p.serveType}</td><td><b>{overall(p).toFixed(0)}</b></td>{ratings(p)}
            <td>{money(marketValue(p))}</td><td><button onClick={() => attempt(() => sign(game, p.id), `Fichaste a ${p.name}`)} disabled={!!live || game.finance.budget < marketValue(p) || me.roster.length >= MAX_ROSTER}>Fichar</button></td></tr>)}</tbody>
        </table></div>
        <h3>Mi plantel</h3>
        <div className="wrap"><table>
          <thead><tr>{[...RH, 'Cobro', ''].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>{rosterSorted(me.roster).map(p => <tr key={p.id}><td><Name p={p} /></td><td>{p.role}</td><td>{p.age ?? '–'}</td><td>{p.serveType}</td><td><b>{overall(p).toFixed(0)}</b></td>{ratings(p)}
            <td>{money(Math.round(marketValue(p) * ECON.sellFactor))}</td><td><button onClick={() => attempt(() => sell(game, p.id), `Vendiste a ${p.name}`)} disabled={!!live}>Vender</button></td></tr>)}</tbody>
        </table></div>
      </section>}

      {tab === 'finanzas' && <section>
        <h2>Finanzas</h2>
        <p>Presupuesto: <b>{money(game.finance.budget)}</b></p>
        <p>Masa salarial anual: {money(wageBill(me.roster))} · por jornada: {money(roundWages(game))} · patrocinio por jornada: {money(ECON.sponsorPerRound)}</p>
        <div className="wrap"><table>
          <thead><tr><th>Temp./jornada</th><th>Concepto</th><th>Importe</th></tr></thead>
          <tbody>{[...game.finance.ledger].reverse().slice(0, 30).map((e, i) => <tr key={i}><td>T{e.season ?? game.season} · J{e.round + 1}</td><td>{e.concept}</td><td className={e.amount < 0 ? 'err' : 'okc'}>{money(e.amount)}</td></tr>)}</tbody>
        </table></div>
        <h3>Salarios del plantel</h3>
        <div className="wrap"><table><thead><tr><th>Jugador</th><th>Rol</th><th>Valor</th><th>Salario anual</th></tr></thead>
          <tbody>{rosterSorted(me.roster).map(p => <tr key={p.id}><td>{p.name}</td><td>{p.role}</td><td>{money(marketValue(p))}</td><td>{money(annualWage(p))}</td></tr>)}</tbody></table></div>
      </section>}

      {tab === 'stats' && <section>
        <h2>Líderes de la temporada</h2>
        {([['kills', 'Ataques ganadores'], ['aces', 'Aces'], ['blocks', 'Bloqueos'], ['digs', 'Defensas'], ['assists', 'Asistencias']] as const).map(([k, l]) => <div key={k}>
          <h3>{l}</h3>
          <ol>{leaders(game, k, 5).map(x => <li key={x.player.id}>{x.player.name} <small>({x.team}, {x.player.role})</small> — <b>{x.value}</b></li>)}</ol></div>)}
        <h3>Mi equipo — temporada {game.season}</h3>
        <Box title="" players={lineupToSquad(me.roster, me.lineup)} box={game.career} />
        <h3>Mi equipo — histórico (todas las temporadas)</h3>
        <Box title="" players={lineupToSquad(me.roster, me.lineup)} box={addBoxes(game.allTime, game.career)} />
        <h3>Historial de temporadas</h3>
        {game.history.length === 0 ? <p className="mu">Todavía no terminaste ninguna temporada.</p> : <div className="wrap"><table>
          <thead><tr><th>Temporada</th><th>Campeón</th><th>Mi puesto</th><th>Mis puntos</th><th>Premio</th></tr></thead>
          <tbody>{game.history.map(h => <tr key={h.season}><td>{h.season}</td><td>{h.champion}</td><td>{h.userRank}</td><td>{h.userPoints}</td><td>{money(h.prize)}</td></tr>)}</tbody></table></div>}
      </section>}

      {tab === 'acerca' && <About />}

      {tab === 'guardar' && <section>
        <h2>Guardar y cargar</h2>
        {(() => { const m = saves.find(x => x.slot === 'auto'); return <p className="mu"><small>Autoguardado: {m ? `${m.team}, ${m.round} jornadas jugadas (${new Date(m.savedAt).toLocaleString()})` : 'todavía no hay'}. Se actualiza solo después de cada cambio.</small></p>; })()}
        {SLOTS.map(s => { const m = saves.find(x => x.slot === s); return <div className="row" key={s}>
          <b>Ranura {s}:</b> {m ? `${m.team}, ${m.round} jornadas jugadas (${new Date(m.savedAt).toLocaleString()})` : 'vacía'}{' '}
          <button onClick={() => save(s)}>Guardar</button> <button onClick={() => load(s)} disabled={!m}>Cargar</button> <button onClick={() => remove(s)} disabled={!m}>Borrar</button></div>; })}
        <h3>Copia de seguridad en texto</h3>
        <p><button onClick={() => { try { setText(serializeSession(game, live, liveKind)); setMsg('Copiá el texto de abajo y guardalo donde quieras'); } catch (e) { setMsg((e as Error).message); } }}>Mostrar texto de la partida</button>{' '}
          <button onClick={importText} disabled={!text.trim()}>Importar este texto</button></p>
        <textarea aria-label="Texto de la partida" value={text} onChange={(e: { target: { value: string } }) => setText(e.target.value)} placeholder="Pegá aquí el texto de una partida guardada para importarla" />
        <h3>Archivo</h3>
        <button onClick={exportFile}>Exportar a archivo</button>{' '}
        <label>Importar: <input type="file" accept="application/json" onChange={(e: { target: { files: FileList | null } }) => importFile(e.target.files?.[0])} /></label>
        <p className="mu"><small>El guardado usa el almacenamiento del navegador (IndexedDB). Si se borran los datos del sitio, se pierde: guardá una copia en texto. La descarga de archivos puede no funcionar en algunos entornos.</small></p>
      </section>}
    </main>
  );
}
