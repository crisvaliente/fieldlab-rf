// Orquestación de experimentos reproducibles. Sin DOM: se ejecuta igual en Node y en el navegador.
import { hashSeed, makeRng } from './rng.js';
import { gridPositions, randomPositions, generateSamples } from './dataset.js';
import { buildFingerprintDb, knnEstimate } from './fingerprint.js';
import { trilaterate } from './trilateration.js';
import { summarize, mean } from './stats.js';
import { meanRssi, noisyReading } from './propagation.js';

export const clone = (o) => JSON.parse(JSON.stringify(o));

/** Ejecuta ambos métodos sobre un vector RSSI. Ninguno recibe la posición verdadera. */
export function locate(rssi, ctx) {
  return {
    a: trilaterate(ctx.aps, rssi, ctx.assumed, ctx.tri),
    b: knnEstimate(ctx.db, rssi, ctx.knn),
  };
}

export function buildCalibration(cfg) {
  const positions = gridPositions(cfg.env.room, cfg.cal.spacing);
  const samples = generateSamples(cfg.env, positions, { seed: cfg.seed, role: 'calibration', reads: cfg.cal.reads });
  return { samples, db: buildFingerprintDb(samples) };
}

function attachError(est, truth) {
  const out = { ok: est.ok, status: est.status, x: est.x, y: est.y, err: null };
  if (est.ok && truth) out.err = Math.hypot(est.x - truth.x, est.y - truth.y);
  return out;
}

function summarizeMethod(rows, key) {
  const errs = [], fails = {};
  let nFailed = 0;
  for (const r of rows) {
    if (r[key].ok) errs.push(r[key].err);
    else { nFailed++; fails[r[key].status] = (fails[r[key].status] || 0) + 1; }
  }
  return { ...summarize(errs, nFailed), failReasons: fails };
}

/**
 * cfg = { env:{room,aps,walls,model}, assumed:{p0,n,d0}, tri:{weighted}, knn:{k,weighted},
 *         cal:{spacing,reads}, eval:{n,reads}, seed }
 */
export function evaluateConfig(cfg) {
  const aps = cfg.env.aps.filter((a) => a.enabled !== false);
  const cal = buildCalibration(cfg);
  const positions = randomPositions(cfg.env.room, cfg.eval.n, cfg.seed);
  const evalSamples = generateSamples(cfg.env, positions, { seed: cfg.seed, role: 'evaluation', reads: cfg.eval.reads });
  // Comprobación explícita de separación calibración / evaluación.
  const leaked = evalSamples.filter((s) => cal.db.sampleIds.has(s.id)).length;
  if (leaked) throw new Error(`Fuga de datos: ${leaked} muestras de evaluación están en la base de huellas.`);
  const ctx = { aps, assumed: cfg.assumed, db: cal.db, tri: cfg.tri, knn: cfg.knn };
  const rows = evalSamples.map((s) => {
    const est = locate(s.rssi, ctx);
    return { id: s.id, x: s.x, y: s.y, a: attachError(est.a, s), b: attachError(est.b, s) };
  });
  const both = rows.filter((r) => r.a.ok && r.b.ok);
  return {
    nAps: aps.length,
    cal: { nPoints: cal.db.points.length, nSamples: cal.samples.length },
    rows,
    summary: { a: summarizeMethod(rows, 'a'), b: summarizeMethod(rows, 'b') },
    paired: {
      n: both.length,
      meanDiffAminusB: both.length ? mean(both.map((r) => r.a.err - r.b.err)) : null,
      aBetter: both.filter((r) => r.a.err < r.b.err).length,
      bBetter: both.filter((r) => r.b.err < r.a.err).length,
    },
  };
}

/** Variables independientes disponibles. Cada una modifica UN aspecto de la configuración. */
export const VARIABLES = {
  none: { label: 'Ninguna (una sola condición)', unit: '', apply: () => {} },
  apCount: { label: 'Cantidad de AP (los primeros N de la lista)', unit: 'AP',
    apply: (c, v) => { const on = c.env.aps.filter((a) => a.enabled !== false); c.env.aps = on.slice(0, v); } },
  sigma: { label: 'Ruido RSSI σ', unit: 'dB', apply: (c, v) => { c.env.model.sigma = v; } },
  wallAtt: { label: 'Atenuación de todas las paredes', unit: 'dB', apply: (c, v) => { for (const w of c.env.walls) w.att = v; } },
  nAssumed: { label: 'Exponente n supuesto por el estimador', unit: '', apply: (c, v) => { c.assumed.n = v; } },
  p0Assumed: { label: 'P₀ supuesto por el estimador', unit: 'dBm', apply: (c, v) => { c.assumed.p0 = v; } },
  k: { label: 'k de k-NN', unit: '', apply: (c, v) => { c.knn.k = v; } },
  gridSpacing: { label: 'Paso de la grilla de calibración', unit: 'm', apply: (c, v) => { c.cal.spacing = v; } },
  reads: { label: 'Lecturas promediadas por posición', unit: '', apply: (c, v) => { c.eval.reads = v; } },
};

function round(v) { return v == null ? null : Math.round(v * 1e9) / 1e9; }

/** Huella de 32 bits de los resultados numéricos: dos corridas idénticas dan la misma huella. */
export function resultDigest(conditions) {
  const parts = [];
  for (const c of conditions) {
    parts.push(c.value);
    for (const r of c.result.rows) parts.push(round(r.a.err), round(r.b.err), r.a.status, r.b.status);
  }
  return hashSeed(...parts).toString(16).padStart(8, '0');
}

/** Barrido de una variable: misma semilla en todas las condiciones (mismas posiciones y mismos sorteos). */
export function runSweep({ base, variable, values }) {
  const v = VARIABLES[variable];
  if (!v) throw new Error(`Variable desconocida: ${variable}`);
  const vals = variable === 'none' ? [null] : values;
  const conditions = vals.map((value) => {
    const cfg = clone(base);
    v.apply(cfg, value);
    return { value, label: value == null ? 'única' : `${value}${v.unit ? ' ' + v.unit : ''}`, result: evaluateConfig(cfg) };
  });
  return { variable, seed: base.seed, conditions, digest: resultDigest(conditions) };
}

/** Mapa espacial del error medio (m) de cada método, celda por celda. */
export function errorHeatmap(cfg, { cell = 0.5, trials = 6 } = {}) {
  const aps = cfg.env.aps.filter((a) => a.enabled !== false);
  const { db } = buildCalibration(cfg);
  const cols = Math.max(1, Math.round(cfg.env.room.w / cell)), rows = Math.max(1, Math.round(cfg.env.room.h / cell));
  const cw = cfg.env.room.w / cols, ch = cfg.env.room.h / rows;
  const ctx = { aps, assumed: cfg.assumed, db, tri: cfg.tri, knn: cfg.knn };
  const a = [], b = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const pos = { x: (i + 0.5) * cw, y: (j + 0.5) * ch };
    const means = aps.map((ap) => meanRssi(ap, pos, cfg.env).rssi);
    const ea = [], eb = [];
    for (let t = 0; t < trials; t++) {
      const rssi = {};
      aps.forEach((ap, q) => {
        const rng = makeRng(cfg.seed, 'heat', j, i, t, ap.id);
        rssi[ap.id] = noisyReading(means[q], cfg.env.model, rng.gaussian());
      });
      const est = locate(rssi, ctx);
      if (est.a.ok) ea.push(Math.hypot(est.a.x - pos.x, est.a.y - pos.y));
      if (est.b.ok) eb.push(Math.hypot(est.b.x - pos.x, est.b.y - pos.y));
    }
    a.push(mean(ea)); b.push(mean(eb));
  }
  return { cols, rows, cw, ch, a, b, trials };
}

/**
 * Análisis de un conjunto importado. Las métricas de error se calculan SOLO con muestras de
 * evaluación (posición conocida). Las muestras sin etiqueta reciben estimación pero nunca error.
 */
export function analyzeDataset(samples, ctx) {
  const cal = samples.filter((s) => s.role === 'calibration');
  const ev = samples.filter((s) => s.role === 'evaluation');
  const un = samples.filter((s) => s.role === 'unlabeled');
  const db = cal.length ? buildFingerprintDb(cal) : null;
  const dataAps = [...new Set(samples.flatMap((s) => Object.keys(s.rssi)))].sort();
  const matched = ctx.aps.filter((a) => dataAps.includes(a.id));
  const run = (s, truth) => {
    const est = locate(s.rssi, { ...ctx, aps: matched, db });
    return { id: s.id, x: s.x, y: s.y, a: attachError(est.a, truth), b: attachError(est.b, truth), reasonA: est.a.reason, reasonB: est.b.reason };
  };
  const evalRows = ev.map((s) => run(s, s));
  const unlabeledRows = un.map((s) => run(s, null));
  return {
    counts: { calibration: cal.length, evaluation: ev.length, unlabeled: un.length },
    calPoints: db ? db.points.length : 0,
    dataAps, matchedAps: matched.map((a) => a.id), unmatchedAps: dataAps.filter((id) => !matched.some((a) => a.id === id)),
    evalRows, unlabeledRows,
    summary: ev.length ? { a: summarizeMethod(evalRows, 'a'), b: summarizeMethod(evalRows, 'b') } : null,
  };
}
