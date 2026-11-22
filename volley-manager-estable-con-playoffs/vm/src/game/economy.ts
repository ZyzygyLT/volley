import type { Player, Role } from '../engine/types';
import { overall, autoLineup, validateLineup, MAX_ROSTER, MIN_BY_ROLE } from './roster';
import type { GameState } from './season';

// ECONOMÍA DEL JUEGO: todos estos valores son [DISEÑO] (decisiones de juego), NO datos del voleibol real.
// Se concentran aquí para poder ajustarlos sin tocar el resto.
export const ECON = {
  startBudget: 1_000_000,
  valueBase: 50_000,      // valor de mercado de un jugador de valoración 60
  valueSlope: 0.12,       // crecimiento exponencial del valor por punto de valoración
  wageRate: 0.18,         // salario anual = 18 % del valor de mercado
  sellFactor: 0.7,        // al vender se cobra el 70 % del valor
  sponsorPerRound: 40_000,
  ticketHome: 25_000,     // entrada por partido en casa
  winBonus: 5_000,        // premio por victoria
  playoffTicketHome: 40_000, // entradas de un partido de playoffs en casa (los salarios ya se pagaron en la fase regular)
  freeAgents: 13,
  prizeByRank: [200_000, 120_000, 80_000, 50_000, 30_000, 20_000, 10_000, 0], // premio de fin de temporada según la posición final
  newAgentsPerSeason: 6,
  maxMarket: 24,
  aiTransferBudget: 60_000, // presupuesto de fichajes de cada equipo de la computadora (más el premio de la temporada)
};

export interface LedgerEntry { round: number; concept: string; amount: number; season?: number }
export interface Finance { budget: number; ledger: LedgerEntry[] }

export const marketValue = (p: Player): number => Math.round((ECON.valueBase * Math.exp(ECON.valueSlope * (overall(p) - 60))) / 1000) * 1000;
export const annualWage = (p: Player): number => Math.round((marketValue(p) * ECON.wageRate) / 100) * 100;
export const wageBill = (roster: Player[]): number => roster.reduce((s, p) => s + annualWage(p), 0);
export const roundWages = (g: GameState): number => Math.round(wageBill(g.teams[g.userTeam].roster) / Math.max(1, Math.max(...g.fixtures.map(f => f.round)) + 1));

const count = (roster: Player[], role: Role) => roster.filter(p => p.role === role).length;
const withLedger = (g: GameState, concept: string, amount: number): Finance => ({
  budget: g.finance.budget + amount, ledger: [...g.finance.ledger, { round: g.round, season: g.season, concept, amount }].slice(-60),
});
const setRoster = (g: GameState, roster: Player[]): GameState => {
  const t = g.teams[g.userTeam];
  const lineup = validateLineup(roster, t.lineup).length ? autoLineup(roster) : t.lineup;
  return { ...g, teams: g.teams.map(x => (x.id === g.userTeam ? { ...x, roster, lineup } : x)) };
};

/** Ficha a un agente libre pagando su valor de mercado. Lanza Error si no es posible. */
export function sign(g: GameState, playerId: string): GameState {
  const p = g.market.find(x => x.id === playerId), t = g.teams[g.userTeam];
  if (!p) throw new Error('Jugador no disponible');
  if (t.roster.length >= MAX_ROSTER) throw new Error(`El plantel está completo (${MAX_ROSTER} jugadores)`);
  const fee = marketValue(p);
  if (g.finance.budget < fee) throw new Error('Presupuesto insuficiente');
  const next = setRoster(g, [...t.roster, p]);
  return { ...next, market: g.market.filter(x => x.id !== playerId), finance: withLedger(g, `Fichaje de ${p.name}`, -fee) };
}

/** Vende a un jugador del plantel (cobra el 70 % del valor; pasa al mercado). Lanza Error si no es posible. */
export function sell(g: GameState, playerId: string): GameState {
  const t = g.teams[g.userTeam], p = t.roster.find(x => x.id === playerId);
  if (!p) throw new Error('Jugador inexistente');
  if (count(t.roster, p.role) <= MIN_BY_ROLE[p.role]) throw new Error(`Necesitás al menos ${MIN_BY_ROLE[p.role]} jugador(es) de esa posición`);
  if (g.market.length >= ECON.maxMarket) throw new Error(`El mercado está completo (${ECON.maxMarket} jugadores); no se puede vender hasta que haya una plaza libre`);
  const income = Math.round(marketValue(p) * ECON.sellFactor);
  const next = setRoster(g, t.roster.filter(x => x.id !== playerId));
  return { ...next, market: [...g.market, p], finance: withLedger(g, `Venta de ${p.name}`, income) };
}

/** Ingresos y gastos de una jornada del equipo del usuario (se llama al cerrarla). */
export function roundCashflow(g: GameState, playedHome: boolean, won: boolean): { concept: string; amount: number }[] {
  const out = [{ concept: 'Patrocinio', amount: ECON.sponsorPerRound }];
  if (playedHome) out.push({ concept: 'Entradas', amount: ECON.ticketHome });
  if (won) out.push({ concept: 'Premio por victoria', amount: ECON.winBonus });
  out.push({ concept: 'Salarios', amount: -roundWages(g) });
  return out;
}
