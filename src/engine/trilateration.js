// Método A — multilateración por mínimos cuadrados no lineales.
//
// 1) Cada RSSI se convierte en distancia d̂_i invirtiendo el modelo supuesto (invertRssi).
// 2) Se busca p = (x, y) que minimiza   J(p) = Σ w_i · (‖p − a_i‖ − d̂_i)²
//    con w_i = 1/d̂_i² (por defecto) o w_i = 1.
//    Motivo del peso: con ruido gaussiano en dB el error de d̂ es multiplicativo
//    (proporcional a la distancia), así que las distancias largas son menos fiables.
// 3) Procedimiento numérico: Levenberg–Marquardt en 2 incógnitas (ecuaciones normales 2×2
//    resueltas en forma cerrada), con varios puntos de partida (solución lineal por diferencia
//    de ecuaciones, centroide ponderado y centroide de los AP). Se conserva el mínimo de menor costo.
//
// Lecturas saturadas (RSSI ≥ P0): el modelo solo permite afirmar d ≤ d0, así que su residuo es
// unilateral, max(0, ‖p − a_i‖ − d0): no "empujan" la solución mientras quede dentro de ese radio.
//
// El algoritmo NO devuelve coordenadas cuando: hay menos de 3 AP con señal, los AP usados son
// (casi) colineales, o la iteración no converge / da valores no finitos.
import { invertRssi } from './propagation.js';

export const TRI_STATUS = {
  OK: 'ok',
  FEW_APS: 'ap_insuficientes',
  DEGENERATE: 'geometria_degenerada',
  NO_CONVERGENCE: 'sin_convergencia',
};

/** Dispersión de los AP: razón entre las desviaciones principales menor y mayor (0 = colineales). */
export function apSpreadRatio(points) {
  const n = points.length;
  if (n < 2) return 0;
  let mx = 0, my = 0;
  for (const p of points) { mx += p.x; my += p.y; }
  mx /= n; my /= n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const p of points) {
    const dx = p.x - mx, dy = p.y - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  const tr = sxx + syy;
  const disc = Math.sqrt(Math.max(0, (sxx - syy) * (sxx - syy) + 4 * sxy * sxy));
  const lMax = (tr + disc) / 2, lMin = Math.max(0, (tr - disc) / 2);
  if (lMax <= 1e-12) return 0;
  return Math.sqrt(lMin / lMax);
}

function cost(p, obs) {
  let c = 0;
  for (const o of obs) {
    let r = Math.hypot(p.x - o.x, p.y - o.y) - o.d;
    if (o.sat && r < 0) r = 0; // lectura saturada: solo afirma d ≤ d0 (residuo unilateral)
    c += o.w * r * r;
  }
  return c;
}

function linearInit(obs) {
  const ref = obs[obs.length - 1];
  let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
  for (let i = 0; i < obs.length - 1; i++) {
    const o = obs[i];
    const ax = 2 * (o.x - ref.x), ay = 2 * (o.y - ref.y);
    const b = ref.d * ref.d - o.d * o.d + o.x * o.x + o.y * o.y - ref.x * ref.x - ref.y * ref.y;
    a11 += ax * ax; a12 += ax * ay; a22 += ay * ay; b1 += ax * b; b2 += ay * b;
  }
  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-9) return null;
  return { x: (a22 * b1 - a12 * b2) / det, y: (a11 * b2 - a12 * b1) / det };
}

function levenbergMarquardt(start, obs, maxIter, tol) {
  let p = { ...start };
  let c = cost(p, obs);
  let lambda = 1e-3;
  let converged = false;
  let iter = 0;
  let lastStep = Infinity;
  for (; iter < maxIter; iter++) {
    let h11 = 0, h12 = 0, h22 = 0, g1 = 0, g2 = 0;
    for (const o of obs) {
      let dx = p.x - o.x, dy = p.y - o.y;
      let r = Math.hypot(dx, dy);
      if (r < 1e-9) { dx = 1e-9; dy = 0; r = 1e-9; }
      const jx = dx / r, jy = dy / r;
      const res = r - o.d;
      if (o.sat && res < 0) continue;
      h11 += o.w * jx * jx; h12 += o.w * jx * jy; h22 += o.w * jy * jy;
      g1 += o.w * jx * res; g2 += o.w * jy * res;
    }
    if (Math.hypot(g1, g2) < 1e-12) { converged = true; break; }
    let accepted = false;
    for (let tries = 0; tries < 30; tries++) {
      const a11 = h11 * (1 + lambda) + 1e-12, a22 = h22 * (1 + lambda) + 1e-12;
      const det = a11 * a22 - h12 * h12;
      if (Math.abs(det) < 1e-18) { lambda *= 4; continue; }
      const sx = -(a22 * g1 - h12 * g2) / det;
      const sy = -(a11 * g2 - h12 * g1) / det;
      const q = { x: p.x + sx, y: p.y + sy };
      const cq = cost(q, obs);
      if (Number.isFinite(cq) && cq <= c) {
        const step = Math.hypot(sx, sy);
        lastStep = step;
        if (c - cq <= 1e-12 * (1 + c)) converged = true; // la mejora ya está por debajo de la precisión numérica
        p = q; c = cq; lambda = Math.max(lambda / 3, 1e-9);
        accepted = true;
        if (step < tol) converged = true;
        break;
      }
      lambda *= 4;
    }
    if (!accepted) { converged = true; break; } // ningún paso mejora: mínimo local dentro de la precisión
    if (converged) { iter++; break; }
  }
  // Convergencia lenta (típica junto al borde de un residuo unilateral): se acepta si el último
  // paso ya era menor que 1 mm, muy por debajo de cualquier precisión con sentido físico.
  if (!converged && lastStep < 1e-3) converged = true;
  return { p, cost: c, iterations: iter, converged };
}

/**
 * @param {Array<{id,x,y}>} aps     AP conocidos por el estimador (posiciones).
 * @param {Object} rssi             { apId: dBm | null }
 * @param {{p0,n,d0}} assumed       Modelo supuesto (calibración del estimador).
 * @param {{weighted?:boolean, minSpread?:number, maxIter?:number}} opts
 */
export function trilaterate(aps, rssi, assumed, opts = {}) {
  const weighted = opts.weighted !== false;
  const minSpread = opts.minSpread ?? 0.05;
  const distances = [];
  const obs = [];
  for (const ap of aps) {
    const v = rssi[ap.id];
    const inv = invertRssi(v, assumed);
    const entry = { apId: ap.id, rssi: v ?? null, d: inv.d, saturated: inv.saturated, used: inv.d != null };
    distances.push(entry);
    if (inv.d != null) obs.push({ id: ap.id, x: ap.x, y: ap.y, d: inv.d, sat: inv.saturated, w: weighted ? 1 / (inv.d * inv.d) : 1 });
  }
  const base = { method: 'A', distances, nUsed: obs.length, weighted, x: null, y: null };
  if (obs.length < 3) {
    return { ...base, ok: false, status: TRI_STATUS.FEW_APS,
      reason: `Se necesitan al menos 3 AP con señal; hay ${obs.length}.` };
  }
  const spread = apSpreadRatio(obs);
  if (spread < minSpread) {
    return { ...base, ok: false, status: TRI_STATUS.DEGENERATE, spread,
      reason: `Los AP con señal son casi colineales (dispersión ${spread.toFixed(3)} < ${minSpread}): la solución es ambigua respecto de esa línea.` };
  }
  let sw = 0, cx = 0, cy = 0, mx = 0, my = 0;
  for (const o of obs) {
    const w = 1 / (o.d * o.d);
    sw += w; cx += w * o.x; cy += w * o.y; mx += o.x; my += o.y;
  }
  const starts = [
    { name: 'lineal', p: linearInit(obs) },
    { name: 'centroide ponderado', p: { x: cx / sw, y: cy / sw } },
    { name: 'centroide de AP', p: { x: mx / obs.length, y: my / obs.length } },
  ].filter((s) => s.p && Number.isFinite(s.p.x) && Number.isFinite(s.p.y));
  let best = null;
  for (const s of starts) {
    const r = levenbergMarquardt(s.p, obs, opts.maxIter ?? 3000, 1e-6);
    if (!Number.isFinite(r.p.x) || !Number.isFinite(r.p.y) || !r.converged) continue;
    if (!best || r.cost < best.cost - 1e-12) best = { ...r, start: s.name, startPoint: s.p };
  }
  if (!best) {
    return { ...base, ok: false, status: TRI_STATUS.NO_CONVERGENCE, spread,
      reason: 'La minimización no convergió desde ningún punto de partida.' };
  }
  let ss = 0;
  for (const e of distances) {
    if (!e.used) continue;
    const ap = aps.find((a) => a.id === e.apId);
    e.fitDistance = Math.hypot(best.p.x - ap.x, best.p.y - ap.y);
    e.residual = e.saturated ? Math.max(0, e.fitDistance - e.d) : e.fitDistance - e.d;
    ss += e.residual * e.residual;
  }
  return {
    ...base, ok: true, status: TRI_STATUS.OK, reason: null,
    x: best.p.x, y: best.p.y, cost: best.cost, iterations: best.iterations,
    start: best.start, startPoint: best.startPoint, spread,
    residualRms: Math.sqrt(ss / obs.length),
  };
}
