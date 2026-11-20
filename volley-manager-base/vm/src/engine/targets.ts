// OBJETIVOS DE CALIBRACIÓN (voleibol masculino de élite). Cada valor lleva su fuente.
//  [PL]  PlusLiga 2020-21 a 2022-23 (Kaggle, CC0): 628 partidos / 1256 equipos-partido. Se usaron SOLO las filas con formato
//        válido (las temporadas 2008-2018 tienen las columnas desplazadas). Verificado: Rec_Err = aces del rival (99,7 %),
//        Sum = kills+bloqueos+aces (100 %), Att_Eff = (K-E-B)/Att (100 %). La columna BP NO se usa (no es "puntos al saque").
//  [VNL] VNL 2024 masculina (Kaggle, CC0): 294 jugadores con posición. Verificado: Tot = Pt+Err+Att y p = Pt/Tot (100 %).
//        En ataque, Err incluye los bloqueados (err+blq VNL 14,9 % vs PlusLiga 15,1 %).
//  [A]   Preprint SportRχiv (CC BY 4.0, no revisado por pares): fases k1/k2, posesión c≈0.8, side-out 0.65-0.70, tipos de saque.
export interface Target { key: string; value: number; tol: number; src: string }
type Roles = 'S' | 'OH' | 'MB' | 'OP' | 'L';

// --- Nivel de liga [PL] ---
export const PL = { oerr: 0.024, ace: 0.0629, serr: 0.1816, kill: 0.4987, aerr: 0.0671, blkd: 0.0836, perf: 0.206, pos: 0.466, apr: 1.128, rps: 45.0 };
// --- Totales VNL (para desplazar las diferencias por posición al nivel de PlusLiga) ---
export const VNL_ALL = { ace: 0.0592, serr: 0.187, kill: 0.4912, ebAtk: 0.1485, perf: 0.2001 };
// --- Por posición [VNL] (OP = "O" en el archivo) ---
export const VNL_ATK: Partial<Record<Roles, { kill: number; eb: number; share: number }>> = {
  OH: { kill: 0.463, eb: 0.155, share: 0.50 }, OP: { kill: 0.493, eb: 0.163, share: 0.293 }, MB: { kill: 0.588, eb: 0.110, share: 0.184 },
  S: { kill: 0.407, eb: 0.117, share: 0.0168 } }; // colocadores: 351 ataques de 20.887 (1,7 %)
export const VNL_SERVE: Partial<Record<Roles, { ace: number; err: number }>> = {
  S: { ace: 0.042, err: 0.117 }, MB: { ace: 0.042, err: 0.152 }, OH: { ace: 0.069, err: 0.202 }, OP: { ace: 0.098, err: 0.260 } };
export const VNL_REC = { share: { L: 0.276, OH: 0.671, OP: 0.014 } as Partial<Record<Roles, number>>, perf: { L: 0.236, OH: 0.190 } as Partial<Record<Roles, number>> };
export const VNL_BLK_SHARE: Partial<Record<Roles, number>> = { MB: 0.480, OH: 0.268, OP: 0.149, S: 0.099 };
export const VNL_DIG_SHARE: Partial<Record<Roles, number>> = { L: 0.249, OH: 0.332, S: 0.169, OP: 0.139 };
// Dispersión real entre jugadores (desviación típica, tras restar el ruido de muestreo), VNL 2024
export const VNL_SD = { kill: { OH: 0.053, OP: 0.045, MB: 0.025 }, ace: { OP: 0.036, MB: 0.016, S: 0.019 }, perf: { L: 0.050, OH: 0.034 } };

const norm = (o: Partial<Record<Roles, number>>) => { const t = Object.values(o).reduce((s, x) => s + (x ?? 0), 0); return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, (v ?? 0) / t])) as Partial<Record<Roles, number>>; };
export const T_ATK_SHARE = norm({ OH: VNL_ATK.OH!.share, OP: VNL_ATK.OP!.share, MB: VNL_ATK.MB!.share, S: VNL_ATK.S!.share });
export const T_BLK_SHARE = norm(VNL_BLK_SHARE), T_DIG_SHARE = norm(VNL_DIG_SHARE), T_REC_SHARE = norm(VNL_REC.share);

export const TARGETS: Target[] = [
  { key: 'ace', value: PL.ace, tol: 0.006, src: 'PL 2020-23: aces/saques (VNL 0.059; preprint ≈0.06)' },
  { key: 'serr', value: PL.serr, tol: 0.008, src: 'PL: errores/saques (VNL 0.187; preprint ≈0.17)' },
  { key: 'kill', value: PL.kill, tol: 0.012, src: 'PL: kills/ataques (VNL 0.491)' },
  { key: 'aerr', value: PL.aerr, tol: 0.008, src: 'PL: errores de ataque/ataques' },
  { key: 'blkd', value: PL.blkd, tol: 0.008, src: 'PL: ataques bloqueados/ataques (VNL: bloqueos/ataques 0.080)' },
  { key: 'perf', value: PL.perf, tol: 0.015, src: 'PL: recepción perfecta (VNL 0.200)' },
  { key: 'pos', value: PL.pos, tol: 0.02, src: 'PL: recepción positiva' },
  { key: 'oerr', value: PL.oerr, tol: 0.008, src: 'PL: rallies que terminan en otros errores (toque de red, dobles, rotación): 100 % − (aces+errores de saque+kills+bloqueos+errores de ataque)' },
  { key: 'c', value: 0.80, tol: 0.05, src: 'A: c≈0.8 (cambio de posesión si el rally continúa)' },
  ...(['OH', 'OP', 'MB', 'S'] as const).flatMap(r => [
    { key: `kill.${r}`, value: VNL_ATK[r]!.kill + (PL.kill - VNL_ALL.kill), tol: 0.025, src: `VNL kill% de ${r}, desplazado al nivel PL` },
    { key: `eb.${r}`, value: VNL_ATK[r]!.eb + (PL.aerr + PL.blkd - VNL_ALL.ebAtk), tol: 0.02, src: `VNL error+bloqueado% de ${r}, desplazado al nivel PL` },
    { key: `ashare.${r}`, value: T_ATK_SHARE[r]!, tol: 0.04, src: `VNL reparto de ataques (${r})` }]),
  ...(['S', 'MB', 'OH', 'OP'] as const).flatMap(r => [
    { key: `ace.${r}`, value: VNL_SERVE[r]!.ace + (PL.ace - VNL_ALL.ace), tol: 0.015, src: `VNL ace% de ${r}, desplazado al nivel PL` },
    { key: `serr.${r}`, value: VNL_SERVE[r]!.err + (PL.serr - VNL_ALL.serr), tol: 0.03, src: `VNL error de saque de ${r}, desplazado al nivel PL` }]),
  ...(['MB', 'OH', 'OP', 'S'] as const).map(r => ({ key: `bshare.${r}`, value: T_BLK_SHARE[r]!, tol: 0.05, src: `VNL reparto de puntos de bloqueo (${r})` })),
  ...(['L', 'OH', 'S', 'OP'] as const).map(r => ({ key: `dshare.${r}`, value: T_DIG_SHARE[r]!, tol: 0.05, src: `VNL reparto de defensas (${r})` })),
  ...(['L', 'OH'] as const).flatMap(r => [
    { key: `rshare.${r}`, value: T_REC_SHARE[r]!, tol: 0.05, src: `VNL reparto de recepciones (${r})` },
    { key: `perf.${r}`, value: VNL_REC.perf[r]! + (PL.perf - VNL_ALL.perf), tol: 0.03, src: `VNL recepción perfecta de ${r}, desplazada al nivel PL` }]),
];
// Validaciones INDEPENDIENTES (no se usan para ajustar): salen solas del modelo.
export const VALIDATION: Target[] = [
  { key: 'sideout', value: 0.675, tol: 0.035, src: 'A: P_receptor 0.65-0.68 por tipo de saque (≈0.70 en texto). PlusLiga no permite medirlo' },
  { key: 'share.kill', value: 0.562, tol: 0.015, src: 'PL: kills / rallies (composición del final del rally, independiente de las tasas por acción)' },
  { key: 'share.blk', value: 0.094, tol: 0.01, src: 'PL: bloqueos / rallies' },
  { key: 'share.aerr', value: 0.076, tol: 0.01, src: 'PL: errores de ataque / rallies' },
  { key: 'apr', value: PL.apr, tol: 0.07, src: 'PL: ataques por rally (ambos equipos) = suma de ataques / suma de saques' },
  { key: 'rps', value: PL.rps, tol: 1.5, src: 'PL: rallies por set (saques de ambos equipos / sets jugados)' },
];
// Dispersión real entre jugadores (informativo; compara con VNL_SD)
export const PLAYER_SD_CHECK = VNL_SD;
// Distribución de marcadores PlusLiga 2008-2023 (2639 partidos; columnas de marcador válidas en todas las temporadas)
export const SCORES = { '3-0': 0.418, '3-1': 0.341, '3-2': 0.240 };
