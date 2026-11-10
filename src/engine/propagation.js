// Modelo de pérdida de trayectoria log-distancia con atenuación por paredes.
//
//   RSSI(d) = P0 + ΔP_ap − 10·n·log10(max(d, d0)/d0) − Σ L_pared + ε,   ε ~ N(0, σ²)
//
// Tratamiento de d < d0: la distancia se satura en d0 (RSSI = P0 + ΔP_ap − L).
// Es una convención explícita: el modelo no es válido en campo cercano y sin ella
// log10(d/d0) crecería sin cota cuando d → 0.
//
// Una lectura por debajo de `floor` (sensibilidad del receptor) se informa como
// señal faltante (null), no como un número.
import { dist, segmentsIntersect } from './geometry.js';

export const DEFAULT_MODEL = Object.freeze({ p0: -40, n: 2.5, d0: 1, sigma: 3, floor: -95 });

export function validateModel(m) {
  const errs = [];
  if (!Number.isFinite(m.p0)) errs.push('P0 debe ser un número (dBm).');
  if (!(m.n > 0)) errs.push('El exponente n debe ser > 0.');
  if (!(m.d0 > 0)) errs.push('d0 debe ser > 0 m.');
  if (m.sigma != null && !(m.sigma >= 0)) errs.push('σ debe ser ≥ 0 dB.');
  return errs;
}

export function pathLossDb(d, model) {
  const dEff = Math.max(d, model.d0);
  return 10 * model.n * Math.log10(dEff / model.d0);
}

/** Atenuación acumulada: suma de las paredes cuyo segmento corta la línea recta AP–receptor. */
export function wallLossDb(a, b, walls) {
  let total = 0;
  const crossed = [];
  for (const w of walls || []) {
    if (segmentsIntersect(a, b, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 })) {
      total += w.att;
      crossed.push(w.id);
    }
  }
  return { total, crossed };
}

/** RSSI medio (sin ruido) y sus componentes. env = { aps, walls, model }. */
export function meanRssi(ap, rx, env) {
  const m = env.model;
  const d = dist(ap, rx);
  const pl = pathLossDb(d, m);
  const wl = wallLossDb(ap, rx, env.walls);
  return {
    d,
    clamped: d < m.d0,
    pathLoss: pl,
    wallLoss: wl.total,
    crossed: wl.crossed,
    rssi: m.p0 + (ap.offset || 0) - pl - wl.total,
  };
}

/** Una lectura con ruido. z es una normal estándar ya sorteada. Devuelve null si cae bajo el piso. */
export function noisyReading(mean, model, z) {
  const v = mean + (model.sigma || 0) * z;
  return v < model.floor ? null : v;
}

/**
 * Inversión del modelo (lo que hace el estimador, que NO conoce paredes ni ΔP):
 *   d̂ = d0 · 10^((P0 − RSSI)/(10·n))
 * Si RSSI ≥ P0 el modelo solo permite afirmar d ≤ d0: se devuelve d0 con saturated = true.
 */
export function invertRssi(rssi, assumed) {
  if (rssi == null || !Number.isFinite(rssi)) return { d: null, saturated: false };
  if (rssi >= assumed.p0) return { d: assumed.d0, saturated: true };
  return { d: assumed.d0 * Math.pow(10, (assumed.p0 - rssi) / (10 * assumed.n)), saturated: false };
}
