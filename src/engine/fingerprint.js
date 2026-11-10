// Método B — fingerprinting RSSI con k vecinos más cercanos (k-NN).
//
// Base de huellas: para cada posición de calibración, el RSSI medio por AP.
// Métrica entre el vector medido q y una huella f, sobre los M AP de la base:
//
//     D(q, f) = sqrt( (1/M) · Σ_i (q_i − f_i)² )      [dB]
//
// Señales faltantes: un AP sin lectura se sustituye por `missingValue` (−100 dBm por defecto),
// es decir, "más débil que cualquier lectura posible". Si falta en ambos vectores aporta 0.
// Estimación: promedio de las posiciones de los k vecinos, uniforme o ponderado por 1/(D + ε).
//
// La base SOLO acepta muestras con role === 'calibration'. Pasarle otra cosa es un error
// de programación y lanza una excepción: así evaluación y calibración no se mezclan en silencio.

export const DEFAULT_MISSING = -100;

export function buildFingerprintDb(samples, opts = {}) {
  const groups = new Map();
  const apSet = new Set();
  const sampleIds = new Set();
  for (const s of samples) {
    if (s.role !== 'calibration') {
      throw new Error(`buildFingerprintDb: la muestra "${s.id}" tiene rol "${s.role}"; solo se admiten muestras de calibración.`);
    }
    if (!Number.isFinite(s.x) || !Number.isFinite(s.y)) {
      throw new Error(`buildFingerprintDb: la muestra de calibración "${s.id}" no tiene coordenadas.`);
    }
    sampleIds.add(s.id);
    const key = `${s.x.toFixed(6)},${s.y.toFixed(6)}`;
    let g = groups.get(key);
    if (!g) { g = { x: s.x, y: s.y, sum: {}, cnt: {}, count: 0, sampleIds: [] }; groups.set(key, g); }
    g.count++; g.sampleIds.push(s.id);
    for (const [ap, v] of Object.entries(s.rssi)) {
      apSet.add(ap);
      if (v == null) continue;
      g.sum[ap] = (g.sum[ap] || 0) + v;
      g.cnt[ap] = (g.cnt[ap] || 0) + 1;
    }
  }
  const apIds = [...apSet].sort();
  const points = [...groups.values()].map((g) => {
    const rssi = {};
    for (const ap of apIds) rssi[ap] = g.cnt[ap] ? g.sum[ap] / g.cnt[ap] : null;
    return { x: g.x, y: g.y, rssi, count: g.count, sampleIds: g.sampleIds };
  });
  return { apIds, points, sampleIds, missingValue: opts.missingValue ?? DEFAULT_MISSING };
}

export function rssiDistance(q, f, apIds, missingValue = DEFAULT_MISSING) {
  let s = 0;
  for (const ap of apIds) {
    const a = q[ap] == null ? missingValue : q[ap];
    const b = f[ap] == null ? missingValue : f[ap];
    s += (a - b) * (a - b);
  }
  return Math.sqrt(s / apIds.length);
}

export function knnEstimate(db, query, opts = {}) {
  const k = Math.max(1, Math.floor(opts.k ?? 3));
  const weighted = opts.weighted !== false;
  const base = { method: 'B', ok: false, x: null, y: null, neighbors: [], k };
  if (!db || !db.points.length) {
    return { ...base, status: 'sin_calibracion', reason: 'No hay mapa de huellas: hacen falta muestras de calibración.' };
  }
  const ignoredAps = Object.keys(query).filter((ap) => !db.apIds.includes(ap));
  const missingInQuery = db.apIds.filter((ap) => query[ap] == null);
  const usedAps = db.apIds.filter((ap) => query[ap] != null);
  if (!usedAps.length) {
    return { ...base, ignoredAps, missingInQuery, usedAps, status: 'sin_senal_comun',
      reason: 'La medición no contiene ninguna señal de los AP presentes en el mapa de huellas.' };
  }
  const ranked = db.points.map((pt, index) => ({
    index, x: pt.x, y: pt.y, rssi: pt.rssi,
    dist: rssiDistance(query, pt.rssi, db.apIds, db.missingValue),
  })).sort((a, b) => a.dist - b.dist || a.index - b.index);
  const kUsed = Math.min(k, ranked.length);
  const neighbors = ranked.slice(0, kUsed);
  let sw = 0, x = 0, y = 0;
  for (const nb of neighbors) {
    nb.weight = weighted ? 1 / (nb.dist + 1e-3) : 1;
    sw += nb.weight; x += nb.weight * nb.x; y += nb.weight * nb.y;
  }
  for (const nb of neighbors) nb.weight /= sw;
  return {
    ...base, ok: true, status: 'ok', reason: null, x: x / sw, y: y / sw,
    neighbors, kUsed, kReduced: kUsed < k, weighted, usedAps, ignoredAps, missingInQuery,
  };
}
