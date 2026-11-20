import type { Role } from '../engine/types';
import { gauss } from '../engine/match';

// ============== EDADES [DATO: VNL 2024 masculina, 303 jugadores] ==============
export const AGE: Record<Role, { mean: number; sd: number }> = {
  S: { mean: 29.1, sd: 5.2 }, L: { mean: 28.2, sd: 4.9 }, MB: { mean: 27.9, sd: 4.3 }, OP: { mean: 27.2, sd: 5.1 }, OH: { mean: 26.9, sd: 4.7 },
};
export const AGE_MIN = 18, AGE_MAX = 40;
export const rollAge = (rnd: () => number, role: Role): number => Math.max(AGE_MIN, Math.min(AGE_MAX, Math.round(AGE[role].mean + gauss(rnd) * AGE[role].sd)));
/** Jóvenes que entran a la liga: 18-22 años (en VNL el 43 % de los menores de 23 está entre 20 y 22; ajuste del equilibrio abajo). */
export const rollYouthAge = (rnd: () => number): number => AGE_MIN + Math.floor(rnd() * 5);

// ============== RETIRO [AJUSTE: pirámide de edades de VNL en estado estacionario] ==============
// Riesgo anual logístico ajustado (a0=38,5; s=2,75) para que, con entradas de 18-22 años, la edad media de equilibrio (27,6) y la
// proporción de mayores de 35 (10,7 %) reproduzcan las de VNL (27,7 y 10,6 %). Supone una liga estacionaria y que salir de la selección ≈ retirarse.
export const RETIRE = { a0: 38.5, s: 2.75 };
export const retireProb = (age: number): number => (age >= 41 ? 1 : 1 / (1 + Math.exp(-(age - RETIRE.a0) / RETIRE.s)));

