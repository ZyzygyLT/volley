// Parámetros del motor.
//  [DATO]   viene de las fuentes (ver targets.ts / CALIBRACION.md)
//  [AJUSTE] se fija con calibrate-cli.ts para cumplir los objetivos medidos en datos reales
//  [DISEÑO] supuesto de diseño de juego, SIN respaldo directo en datos
import type { Role, ServeType } from './types';
export type ByRole = Record<Role, number>;
export interface TypeProfile { ace: number; err: number; use: number }
export interface Params {
  serveType: Record<ServeType, TypeProfile>;       // [DATO] tabla 1 de la fuente A (preprint), calculado de los conteos
  serveAceOff: number; serveErrOff: number;        // [AJUSTE] nivel de liga (PlusLiga 2020-23)
  roleAce: ByRole; roleServeErr: ByRole;           // [AJUSTE] diferencias por posición (VNL 2024)
  aceRisk: number; errRisk: number; useRisk: number; // [DISEÑO] efecto de la táctica de riesgo (±0.5)
  aceSrvW: number; errSrvW: number; errConsW: number; aceRecW: number; useSrvW: number; // [DISEÑO] puntos de valoración -> probabilidad
  useRef: number; pressure: number;                // [DATO]/[DISEÑO]
  recBase: number; recW: number; recNoise: number; roleRec: ByRole; // [DISEÑO]/[AJUSTE]
  recWeight: ByRole;                               // [AJUSTE] reparto de recepciones por posición (VNL)
  perfQ: number; posQ: number;                     // [AJUSTE] umbrales de calidad para recepción perfecta/positiva (PlusLiga)
  killK1: number; errK1: number; blkK1: number; killK2: number; errK2: number; blkK2: number; // [AJUSTE] PlusLiga
  roleKill: ByRole; roleErr: ByRole;               // [AJUSTE] diferencias por posición (VNL)
  atkWeight: ByRole; blkWeight: ByRole; digWeight: ByRole; // [AJUSTE] reparto de ataques, bloqueos y defensas (VNL)
  atkSkillScale: ByRole;                            // [AJUSTE] escala de la pendiente de ataque por posición (dispersión real VNL)
  atkW: number; setW: number; defW: number; blkKillW: number; qKill: number;  // [DISEÑO]
  errAtkW: number; errQ: number; blkW: number;      // [DISEÑO]
  digBase: number; digW: number; digNoise: number; coverQ: number; // [DISEÑO]
  keepProb: number;                                 // [AJUSTE] 1-c (preprint)
  otherErr: number;                                 // [AJUSTE] errores de manejo por intercambio (PlusLiga: 2,4 % de los rallies)
  maxExchanges: number;
}
const R = (S: number, OH: number, MB: number, OP: number, L: number): ByRole => ({ S, OH, MB, OP, L });
export const P: Params = {
  serveType: { JS: { ace: 0.0726, err: 0.217, use: 0.0795 }, JFS: { ace: 0.0204, err: 0.0654, use: 0.045 }, FS: { ace: 0, err: 0.0135, use: 0.027 } },
  serveAceOff: 0.0327,
  serveErrOff: 0.0028,
  roleAce: R(-0.0019, -0.0049, -0.0094, 0.0304, 0),
  roleServeErr: R(-0.0242, -0.0111, 0.0015, 0.0446, 0),
  aceRisk: 0.05,
  errRisk: 0.15,
  useRisk: 0.045,
  aceSrvW: 0.003,
  errSrvW: 0.002,
  errConsW: 0.0008,
  aceRecW: 0.002,
  useSrvW: 0.0005,
  useRef: 0.0686,
  pressure: 4,
  recBase: 0.55,
  recW: 0.0025,
  recNoise: 0.2,
  roleRec: R(0, 0, 0, 0, 0.0043),
  recWeight: R(0, 1, 0, 0.043, 0.8189),
  perfQ: 0.6779,
  posQ: 0.5635,
  killK1: 0.5426,
  errK1: 0.0608,
  blkK1: 0.0678,
  killK2: 0.4826,
  errK2: 0.0628,
  blkK2: 0.0698,
  roleKill: R(0.0102, -0.032, 0.0738, 0.0021, 0),
  roleErr: R(-0.0543, 0.0066, -0.0293, 0.0136, 0),
  atkWeight: R(0.1244, 1, 0.8281, 1.223, 0),
  blkWeight: R(0.6469, 1, 1.5685, 1.0869, 0),
  digWeight: R(1.0173, 1, 0, 0.977, 0.6902),
  atkSkillScale: R(1, 1, 0.5, 1, 1),
  atkW: 0.0045,
  setW: 0.002,
  defW: 0.004,
  blkKillW: 0.0015,
  qKill: 0.3,
  errAtkW: 0.001,
  errQ: 0.12,
  blkW: 0.0033,
  digBase: 0.4,
  digW: 0.007,
  digNoise: 0.2,
  coverQ: 0.45,
  keepProb: 0.2002,
  otherErr: 0.0205,
  maxExchanges: 14,
};
/** Desviación típica de la fuerza (puntos de valoración) entre equipos de una liga. [AJUSTE] a la distribución de marcadores de PlusLiga */
export const TEAM_SD = 3.6;
/** Desviación típica de las valoraciones individuales dentro de un rol. [AJUSTE] a la dispersión real entre jugadores (VNL 2024) */
export const RATING_SD = 9;
/**
 * Ventaja de local: puntos de valoración que suma el equipo local en TODAS sus habilidades en la liga.
 * [AJUSTE] a PlusLiga 2008-2023: el equipo listado primero (por inferencia, el local: el 98,3 % de los pares aparece en ambos órdenes)
 * gana el 54,2 % de los partidos (± 1,0) y el 53,4 % de los sets.
 */
export const HOME_BOOST = 0.8;
