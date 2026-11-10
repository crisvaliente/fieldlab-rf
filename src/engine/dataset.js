// Generación de muestras SINTÉTICAS. Todo lo que sale de aquí lleva source = 'synthetic'.
import { makeRng } from './rng.js';
import { meanRssi, noisyReading } from './propagation.js';

/** Grilla regular centrada en celdas: x = paso/2, 3·paso/2, … (posiciones de calibración). */
export function gridPositions(room, spacing) {
  const pts = [];
  const nx = Math.max(1, Math.round(room.w / spacing));
  const ny = Math.max(1, Math.round(room.h / spacing));
  const sx = room.w / nx, sy = room.h / ny;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) pts.push({ x: (i + 0.5) * sx, y: (j + 0.5) * sy });
  return pts;
}

/** Posiciones uniformes en el recinto (posiciones de evaluación). Solo dependen de (semilla, recinto, n). */
export function randomPositions(room, n, seed, margin = 0.3) {
  const rng = makeRng(seed, 'eval-pos');
  const mx = Math.min(margin, room.w / 4), my = Math.min(margin, room.h / 4);
  const pts = [];
  for (let i = 0; i < n; i++) pts.push({ x: rng.uniform(mx, room.w - mx), y: rng.uniform(my, room.h - my) });
  return pts;
}

/**
 * Mide `reads` veces cada AP activo en cada posición y promedia (en dB) las lecturas válidas.
 * El ruido de cada (rol, muestra, AP) sale de un flujo propio: agregar o quitar un AP, o cambiar σ,
 * no altera los números aleatorios de los demás (números aleatorios comunes entre condiciones).
 */
export function generateSamples(env, positions, opts) {
  const { seed, role, reads = 1, prefix = role === 'calibration' ? 'cal' : 'ev', experimentId = 'sintetico', detail = false, tick = 0 } = opts;
  const aps = env.aps.filter((a) => a.enabled !== false);
  return positions.map((pos, s) => {
    const rssi = {};
    const info = {};
    for (const ap of aps) {
      const m = meanRssi(ap, pos, env);
      const rng = makeRng(seed, 'noise', role, tick, s, ap.id);
      let sum = 0, cnt = 0;
      const values = [];
      for (let r = 0; r < reads; r++) {
        const v = noisyReading(m.rssi, env.model, rng.gaussian());
        values.push(v);
        if (v != null) { sum += v; cnt++; }
      }
      rssi[ap.id] = cnt ? sum / cnt : null;
      if (detail) info[ap.id] = { ...m, values, nValid: cnt };
    }
    const sample = {
      id: `${prefix}-${String(s + 1).padStart(4, '0')}`, experimentId, role,
      x: role === 'unlabeled' ? null : pos.x, y: role === 'unlabeled' ? null : pos.y,
      rssi, source: 'synthetic', timestamp: null,
    };
    if (detail) sample.detail = info;
    return sample;
  });
}
