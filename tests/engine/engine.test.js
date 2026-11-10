// Pruebas deterministas del motor matemático (node --test). Los números entre paréntesis
// corresponden a los criterios de aceptación de la especificación.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../../src/engine/index.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} esperado ${b}, obtenido ${a}`);
const env0 = () => ({ room: { w: 12, h: 8 }, aps: [{ id: 'AP1', x: 0, y: 0, offset: 0 }], walls: [], model: { p0: -40, n: 2, d0: 1, sigma: 0, floor: -120 } });

test('RNG: misma semilla y etiquetas → misma secuencia; etiquetas distintas → secuencias distintas', () => {
  const a = E.makeRng(42, 'x'), b = E.makeRng(42, 'x'), c = E.makeRng(42, 'y');
  const sa = Array.from({ length: 50 }, () => a.next()), sb = Array.from({ length: 50 }, () => b.next()), sc = Array.from({ length: 50 }, () => c.next());
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  assert.ok(sa.every((v) => v >= 0 && v < 1));
});

test('RNG: la normal estándar tiene media ≈ 0 y desvío ≈ 1 (20 000 valores)', () => {
  const r = E.makeRng(1, 'g');
  const xs = Array.from({ length: 20000 }, () => r.gaussian());
  near(E.mean(xs), 0, 0.03, 'media');
  near(E.stdev(xs), 1, 0.03, 'desvío');
});

test('(1) Dos ejecuciones con iguales parámetros y semilla producen resultados idénticos', () => {
  const p = E.PRESETS[2];
  const r1 = E.runSweep({ base: p.build(), variable: p.variable, values: p.values });
  const r2 = E.runSweep({ base: p.build(), variable: p.variable, values: p.values });
  assert.equal(r1.digest, r2.digest);
  assert.deepEqual(r1, r2);
  const other = p.build(); other.seed += 1;
  const r3 = E.runSweep({ base: other, variable: p.variable, values: p.values });
  assert.notEqual(r1.digest, r3.digest, 'otra semilla debe dar otros datos');
});

test('(2) Sin ruido, el RSSI decrece estrictamente con la distancia para d > d0 y vale lo que dice la fórmula', () => {
  const env = env0();
  let prev = Infinity;
  for (const d of [1, 1.5, 2, 4, 8, 16]) {
    const r = E.meanRssi(env.aps[0], { x: d, y: 0 }, env).rssi;
    assert.ok(r < prev || d === 1);
    prev = r;
  }
  near(E.meanRssi(env.aps[0], { x: 10, y: 0 }, env).rssi, -60, 1e-12, 'P0 −40, n 2, d 10 m');   // −40 − 20·log10(10)
  near(E.meanRssi(env.aps[0], { x: 2, y: 0 }, env).rssi, -40 - 20 * Math.log10(2), 1e-12);
  near(E.meanRssi(env.aps[0], { x: 3, y: 4 }, env).d, 5, 1e-12, 'distancia 3-4-5');
});

test('Distancias menores que d0: el RSSI se satura en P0 y la inversión lo declara', () => {
  const env = env0();
  for (const d of [0, 0.01, 0.5, 1]) {
    const m = E.meanRssi(env.aps[0], { x: d, y: 0 }, env);
    near(m.rssi, -40, 1e-12);
    assert.ok(Number.isFinite(m.rssi));
  }
  assert.equal(E.meanRssi(env.aps[0], { x: 0.5, y: 0 }, env).clamped, true);
  assert.deepEqual(E.invertRssi(-35, env.model), { d: 1, saturated: true });
  assert.deepEqual(E.invertRssi(null, env.model), { d: null, saturated: false });
});

test('Inversión del modelo: d̂ recupera la distancia real sin ruido ni paredes', () => {
  const env = env0();
  for (const d of [1.2, 3, 7.5, 12]) {
    const r = E.meanRssi(env.aps[0], { x: d, y: 0 }, env).rssi;
    near(E.invertRssi(r, env.model).d, d, 1e-9);
  }
});

test('(3) Una pared atenuante reduce el RSSI exactamente en su atenuación, solo si corta la trayectoria', () => {
  const env = env0();
  const rx = { x: 6, y: 0.5 };
  const free = E.meanRssi(env.aps[0], rx, env).rssi;
  env.walls = [{ id: 'W1', x1: 3, y1: -1, x2: 3, y2: 2, att: 7 }];
  const one = E.meanRssi(env.aps[0], rx, env);
  near(one.rssi, free - 7, 1e-12);
  assert.deepEqual(one.crossed, ['W1']);
  env.walls.push({ id: 'W2', x1: 4, y1: -1, x2: 4, y2: 2, att: 3.5 });
  near(E.meanRssi(env.aps[0], rx, env).rssi, free - 10.5, 1e-12, 'las atenuaciones se suman');
  env.walls = [{ id: 'W3', x1: 3, y1: 5, x2: 3, y2: 7, att: 7 }];
  near(E.meanRssi(env.aps[0], rx, env).rssi, free, 1e-12, 'una pared que no corta no atenúa');
});

test('Intersección de segmentos: casos conocidos', () => {
  const P = (x, y) => ({ x, y });
  assert.equal(E.segmentsIntersect(P(0, 0), P(2, 2), P(0, 2), P(2, 0)), true);
  assert.equal(E.segmentsIntersect(P(0, 0), P(1, 1), P(2, 2), P(3, 3)), false);
  assert.equal(E.segmentsIntersect(P(0, 0), P(2, 0), P(0, 1), P(2, 1)), false);
  assert.equal(E.segmentsIntersect(P(0, 0), P(2, 0), P(1, 0), P(1, 5)), true, 'tocar cuenta como corte');
});

test('Una lectura por debajo del piso de sensibilidad es señal faltante (null), no un número', () => {
  const model = { p0: -40, n: 2, d0: 1, sigma: 2, floor: -90 };
  assert.equal(E.noisyReading(-89, model, -1), null);
  assert.equal(E.noisyReading(-89, model, 1), -87);
});

test('(4) Método A: sin ruido recupera posiciones conocidas con error < 1e-6 m (3, 4 y 6 AP)', () => {
  for (const n of [3, 4, 6]) {
    const c = E.baseConfig(); c.env.model.sigma = 0; c.env.aps = c.env.aps.slice(0, n); c.eval.n = 150;
    const r = E.evaluateConfig(c);
    assert.equal(r.summary.a.nFailed, 0);
    assert.ok(r.summary.a.max < 1e-6, `${n} AP: error máximo ${r.summary.a.max}`);
  }
});

test('(4) Método A: caso analítico — AP en (0,0), (10,0), (0,10) y receptor en (3,4)', () => {
  const aps = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0 }, { id: 'c', x: 0, y: 10 }];
  const model = { p0: -40, n: 2, d0: 1 };
  const rssi = {};
  for (const ap of aps) rssi[ap.id] = -40 - 20 * Math.log10(Math.hypot(3 - ap.x, 4 - ap.y));
  const r = E.trilaterate(aps, rssi, model);
  assert.equal(r.ok, true);
  near(r.x, 3, 1e-7); near(r.y, 4, 1e-7);
  near(r.distances[0].d, 5, 1e-9, 'distancia inferida al primer AP');
  near(r.residualRms, 0, 1e-6);
  assert.ok(r.iterations >= 0 && r.start);
});

test('(4) Método A con ruido moderado: precisión coherente (no exacta, pero acotada)', () => {
  const r = E.evaluateConfig(E.baseConfig());
  assert.ok(r.summary.a.mean > 0.2 && r.summary.a.mean < 2.5, `media ${r.summary.a.mean}`);
});

test('(7) Método A informa AP insuficientes y no devuelve coordenadas', () => {
  const aps = [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 0 }, { id: 'c', x: 0, y: 10 }];
  const r = E.trilaterate(aps, { a: -50, b: -60, c: null }, { p0: -40, n: 2, d0: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.status, E.TRI_STATUS.FEW_APS);
  assert.equal(r.x, null); assert.equal(r.y, null);
  assert.match(r.reason, /al menos 3/);
});

test('(7) Método A informa geometría degenerada (AP colineales) y no devuelve coordenadas', () => {
  const aps = [{ id: 'a', x: 0, y: 2 }, { id: 'b', x: 5, y: 2 }, { id: 'c', x: 10, y: 2 }, { id: 'd', x: 12, y: 2.01 }];
  const r = E.trilaterate(aps, { a: -55, b: -50, c: -58, d: -60 }, { p0: -40, n: 2, d0: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.status, E.TRI_STATUS.DEGENERATE);
  assert.equal(r.x, null);
  near(E.apSpreadRatio([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]), 0, 1e-9);
  assert.ok(E.apSpreadRatio([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]) > 0.5);
});

test('(5) k-NN: resultado conocido sobre una base controlada', () => {
  const cal = [
    { id: 'c1', role: 'calibration', x: 0, y: 0, rssi: { A: -40, B: -70 } },
    { id: 'c2', role: 'calibration', x: 10, y: 0, rssi: { A: -70, B: -40 } },
    { id: 'c3', role: 'calibration', x: 5, y: 8, rssi: { A: -60, B: -60 } },
  ];
  const db = E.buildFingerprintDb(cal);
  const exact = E.knnEstimate(db, { A: -40, B: -70 }, { k: 1 });
  assert.deepEqual([exact.x, exact.y], [0, 0]);
  near(exact.neighbors[0].dist, 0, 1e-12);
  // métrica: sqrt(((−50+40)² + (−70+70)²)/2) = sqrt(50)
  near(E.rssiDistance({ A: -50, B: -70 }, { A: -40, B: -70 }, ['A', 'B']), Math.sqrt(50), 1e-12);
  const u = E.knnEstimate(db, { A: -55, B: -55 }, { k: 3, weighted: false });
  near(u.x, 5, 1e-12); near(u.y, 8 / 3, 1e-12);
  const again = E.knnEstimate(db, { A: -55, B: -55 }, { k: 3, weighted: false });
  assert.deepEqual(u, again, 'determinista');
  const big = E.knnEstimate(db, { A: -55, B: -55 }, { k: 10 });
  assert.equal(big.kUsed, 3); assert.equal(big.kReduced, true);
});

test('k-NN: señales faltantes se sustituyen por el valor documentado; sin señal común → fallo explícito', () => {
  const cal = [
    { id: 'c1', role: 'calibration', x: 0, y: 0, rssi: { A: -40, B: null } },
    { id: 'c2', role: 'calibration', x: 10, y: 0, rssi: { A: -70, B: -45 } },
  ];
  const db = E.buildFingerprintDb(cal);
  near(E.rssiDistance({ A: -40 }, db.points[0].rssi, db.apIds), 0, 1e-12, 'faltante en ambos aporta 0');
  near(E.rssiDistance({ A: -40 }, db.points[1].rssi, db.apIds), Math.sqrt((900 + 55 * 55) / 2), 1e-9, 'faltante = −100 dBm');
  const r = E.knnEstimate(db, { A: -42, B: null, Z: -50 }, { k: 1 });
  assert.equal(r.ok, true);
  assert.deepEqual([r.x, r.y], [0, 0]);
  assert.deepEqual(r.missingInQuery, ['B']);
  assert.deepEqual(r.ignoredAps, ['Z']);
  const none = E.knnEstimate(db, { A: null, B: null }, { k: 1 });
  assert.equal(none.ok, false); assert.equal(none.x, null); assert.equal(none.status, 'sin_senal_comun');
  const empty = E.knnEstimate(null, { A: -40 }, { k: 1 });
  assert.equal(empty.ok, false); assert.equal(empty.status, 'sin_calibracion');
});

test('(6) Estadísticas: media, mediana, RMSE y percentiles con valores conocidos', () => {
  const e = [1, 2, 3, 4, 10];
  const s = E.summarize(e, 5);
  near(s.mean, 4, 1e-12);
  near(s.median, 3, 1e-12);
  near(s.rmse, Math.sqrt(130 / 5), 1e-12);      // sqrt((1+4+9+16+100)/5) = sqrt(26)
  near(s.p90, 7.6, 1e-12);                       // h = 4·0,9 = 3,6 → 4 + 0,6·(10 − 4)
  near(E.percentile([1, 2, 3, 4], 50), 2.5, 1e-12);
  near(E.percentile([5], 90), 5, 1e-12);
  assert.equal(s.nTotal, 10); assert.equal(s.nOk, 5); assert.equal(s.nFailed, 5);
  near(s.failRate, 0.5, 1e-12);
  assert.equal(E.summarize([], 3).mean, null, 'sin estimaciones exitosas no hay media');
  assert.equal(E.summarize([], 3).failRate, 1);
  assert.deepEqual(E.histogram([0.1, 0.9, 1.5, 2], 2, 2).map((b) => b.count), [2, 2]);
});

test('(6) Un experimento calcula sus métricas a partir de los errores por muestra', () => {
  const r = E.evaluateConfig(E.baseConfig());
  for (const k of ['a', 'b']) {
    const errs = r.rows.filter((x) => x[k].ok).map((x) => x[k].err);
    near(r.summary[k].mean, errs.reduce((p, c) => p + c, 0) / errs.length, 1e-12);
    near(r.summary[k].rmse, Math.sqrt(errs.reduce((p, c) => p + c * c, 0) / errs.length), 1e-12);
    assert.equal(r.summary[k].nTotal, 200);
    assert.ok(r.summary[k].median <= r.summary[k].p90 && r.summary[k].p90 <= r.summary[k].max);
  }
  // el error de cada fila es la distancia euclídea entre estimación y verdad
  const row = r.rows[0];
  near(row.a.err, Math.hypot(row.a.x - row.x, row.a.y - row.y), 1e-12);
});

test('(8) La base de huellas rechaza muestras que no sean de calibración', () => {
  const ev = { id: 'e1', role: 'evaluation', x: 1, y: 1, rssi: { A: -50 } };
  assert.throws(() => E.buildFingerprintDb([ev]), /solo se admiten muestras de calibración/);
  assert.throws(() => E.buildFingerprintDb([{ id: 'u', role: 'unlabeled', x: null, y: null, rssi: { A: -50 } }]));
  assert.throws(() => E.buildFingerprintDb([{ id: 'c', role: 'calibration', x: null, y: null, rssi: {} }]), /no tiene coordenadas/);
});

test('(8) En un experimento, evaluación y calibración son conjuntos disjuntos (ids, posiciones y ruido)', () => {
  const c = E.baseConfig();
  const cal = E.buildCalibration(c);
  const pos = E.randomPositions(c.env.room, c.eval.n, c.seed);
  const ev = E.generateSamples(c.env, pos, { seed: c.seed, role: 'evaluation' });
  assert.ok(ev.every((s) => !cal.db.sampleIds.has(s.id)));
  assert.ok(cal.samples.every((s) => s.role === 'calibration') && ev.every((s) => s.role === 'evaluation'));
  const calPos = new Set(cal.db.points.map((p) => `${p.x},${p.y}`));
  assert.ok(pos.every((p) => !calPos.has(`${p.x},${p.y}`)));
  // Cambiar el tamaño del conjunto de evaluación no altera la base de huellas.
  const c2 = E.baseConfig(); c2.eval.n = 17;
  assert.deepEqual(E.buildCalibration(c2).db.points, cal.db.points);
  // Mismo índice de muestra, distinto rol → ruido distinto (flujos independientes).
  const one = [{ x: 3, y: 3 }];
  const a = E.generateSamples(c.env, one, { seed: 5, role: 'calibration' })[0].rssi.AP1;
  const b = E.generateSamples(c.env, one, { seed: 5, role: 'evaluation' })[0].rssi.AP1;
  assert.notEqual(a, b);
});

test('Barrido controlado: cambiar solo la variable estudiada no altera posiciones ni sorteos compartidos', () => {
  const p = E.PRESETS[0];
  const r = E.runSweep({ base: p.build(), variable: p.variable, values: p.values });
  const [c3, c4, c6] = r.conditions.map((c) => c.result);
  assert.deepEqual(c3.rows.map((x) => [x.x, x.y]), c6.rows.map((x) => [x.x, x.y]));
  assert.deepEqual([c3.nAps, c4.nAps, c6.nAps], [3, 4, 6]);
  // Exp. 4: k-NN no usa el n supuesto → idéntico en todas las condiciones.
  const q = E.PRESETS[3];
  const r4 = E.runSweep({ base: q.build(), variable: q.variable, values: q.values });
  const bs = r4.conditions.map((c) => JSON.stringify(c.result.summary.b));
  assert.ok(bs.every((s) => s === bs[0]));
  const as = r4.conditions.map((c) => c.result.summary.a.mean);
  assert.ok(as[2] < as[0] && as[2] < as[4], 'el n correcto (2,5) da el menor error medio de A');
});

test('Ruido común entre condiciones: el RSSI de un AP no cambia al agregar otros AP', () => {
  const c = E.baseConfig();
  const pos = [{ x: 4, y: 4 }, { x: 9, y: 2 }];
  const six = E.generateSamples(c.env, pos, { seed: 9, role: 'evaluation' });
  c.env.aps = c.env.aps.slice(0, 3);
  const three = E.generateSamples(c.env, pos, { seed: 9, role: 'evaluation' });
  for (let i = 0; i < pos.length; i++) for (const ap of ['AP1', 'AP2', 'AP3']) assert.equal(three[i].rssi[ap], six[i].rssi[ap]);
});

test('(9) CSV: el conjunto de ejemplo se importa sin errores y sobrevive a exportar → importar', () => {
  const csv = E.exampleDatasetCsv();
  const r = E.importCsv(csv);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  assert.deepEqual(r.meta.counts, { calibration: 24, evaluation: 8, unlabeled: 4 });
  assert.deepEqual(r.meta.sources, ['synthetic']);
  assert.equal(r.meta.missingReadings, 1);
  assert.equal(E.exportCsv(r.samples), csv);
  assert.ok(r.samples.filter((s) => s.role === 'unlabeled').every((s) => s.x === null && s.y === null));
});

const H = 'experiment_id,sample_id,ap_id,rssi_dbm,x_m,y_m,role,timestamp_iso,source\n';
const rejects = (name, text, pattern) => test(`(9) CSV rechaza: ${name}`, () => {
  const r = E.importCsv(text);
  assert.equal(r.ok, false);
  assert.equal(r.samples.length, 0, 'no se importa nada si hay errores');
  assert.ok(r.errors.some((e) => pattern.test(e.message)), `mensajes: ${r.errors.map((e) => e.message).join(' | ')}`);
});
rejects('archivo vacío', '  \n', /vacío/);
rejects('columna obligatoria ausente', 'experiment_id,sample_id,ap_id\ne,s,a\n', /Falta la columna obligatoria "rssi_dbm"/);
rejects('RSSI sin unidad en el encabezado', 'experiment_id,sample_id,ap_id,rssi\ne,s,a,-50\n', /debe llamarse rssi_dbm/);
rejects('RSSI no numérico', H + 'e,s1,AP1,fuerte,1,1,evaluation,,\n', /no es un número/);
rejects('RSSI positivo (unidad equivocada)', H + 'e,s1,AP1,55,1,1,evaluation,,\n', /positivo/);
rejects('RSSI fuera de rango físico', H + 'e,s1,AP1,-140,1,1,evaluation,,\n', /por debajo de -120/);
rejects('coma decimal', 'experiment_id;sample_id;ap_id;rssi_dbm\ne;s1;AP1;-50,5\n', /coma decimal/);
rejects('coordenada incompleta', H + 'e,s1,AP1,-50,1,,evaluation,,\n', /incompleta/);
rejects('calibración sin posición', H + 'e,s1,AP1,-50,,,calibration,,\n', /exige posición conocida/);
rejects('unlabeled con posición', H + 'e,s1,AP1,-50,1,2,unlabeled,,\n', /no debe traer coordenadas/);
rejects('rol desconocido', H + 'e,s1,AP1,-50,1,2,train,,\n', /no reconocido/);
rejects('coordenadas en otra unidad', H + 'e,s1,AP1,-50,3500,1200,evaluation,,\n', /cm o mm/);
rejects('lectura duplicada', H + 'e,s1,AP1,-50,1,2,evaluation,,\ne,s1,AP1,-51,1,2,evaluation,,\n', /duplicada/);
rejects('muestra con coordenadas inconsistentes', H + 'e,s1,AP1,-50,1,2,evaluation,,\ne,s1,AP2,-51,1,3,evaluation,,\n', /coordenadas distintas/);
rejects('marca temporal inválida', H + 'e,s1,AP1,-50,1,2,evaluation,ayer,\n', /ISO 8601/);
rejects('identificador vacío', H + 'e,,AP1,-50,1,2,evaluation,,\n', /sample_id vacío/);
rejects('número de campos incorrecto', H + 'e,s1,AP1,-50\n', /campos/);
rejects('solo encabezado', H, /solo tiene encabezado/);

test('(9) CSV: los errores indican la línea; valores atípicos generan advertencia, no rechazo', () => {
  const bad = E.importCsv(H + 'e,s1,AP1,-50,1,2,evaluation,,\ne,s2,AP1,xx,1,2,evaluation,,\n');
  assert.equal(bad.errors[0].line, 3);
  assert.equal(bad.errors[0].field, 'rssi_dbm');
  const odd = E.importCsv(H + 'e,s1,AP1,-10,1,2,evaluation,2026-11-10T14:30:00Z,measured\ne,s2,AP1,-105,50,2,evaluation,,measured\n', { room: { w: 12, h: 8 } });
  assert.equal(odd.ok, true);
  assert.equal(odd.warnings.length, 3);
  assert.equal(odd.samples[0].source, 'measured');
});

test('CSV: sin columna role, nunca se infiere "calibration"; sin source queda "undeclared"', () => {
  const r = E.importCsv('experiment_id,sample_id,ap_id,rssi_dbm,x_m,y_m\ne,s1,AP1,-50,1,2\ne,s2,AP1,-60,,\n');
  assert.equal(r.ok, true);
  assert.deepEqual(r.samples.map((s) => s.role), ['evaluation', 'unlabeled']);
  assert.deepEqual(r.samples.map((s) => s.source), ['undeclared', 'undeclared']);
});

test('Sin ground truth no se calculan métricas de error de posicionamiento', () => {
  const c = E.liveScene();
  const all = E.importCsv(E.exampleDatasetCsv()).samples;
  const ctx = { aps: c.env.aps, assumed: c.assumed, tri: c.tri, knn: c.knn };
  const full = E.analyzeDataset(all, ctx);
  assert.ok(full.summary && full.summary.a.nTotal === 8 && full.summary.b.nTotal === 8);
  assert.ok(full.unlabeledRows.length === 4 && full.unlabeledRows.every((r) => r.a.err === null && r.b.err === null));
  assert.ok(full.unlabeledRows.some((r) => r.b.ok), 'las no etiquetadas sí reciben estimación');
  const onlyUnl = E.analyzeDataset(all.filter((s) => s.role === 'unlabeled'), ctx);
  assert.equal(onlyUnl.summary, null);
  assert.ok(onlyUnl.unlabeledRows.every((r) => r.b.ok === false && r.b.status === 'sin_calibracion'));
});

test('Mapa de calor del error: dimensiones correctas y valores finitos, reproducible', () => {
  const h1 = E.errorHeatmap(E.liveScene(), { cell: 1, trials: 3 });
  const h2 = E.errorHeatmap(E.liveScene(), { cell: 1, trials: 3 });
  assert.equal(h1.a.length, 12 * 8);
  assert.ok(h1.b.every((v) => Number.isFinite(v) && v >= 0));
  assert.deepEqual(h1, h2);
});

test('Los cinco experimentos predefinidos se ejecutan sin excepciones y con huella estable', () => {
  for (const p of E.PRESETS) {
    const r = E.runSweep({ base: p.build(), variable: p.variable, values: p.values });
    assert.ok(r.conditions.length >= 1);
    assert.match(r.digest, /^[0-9a-f]{8}$/);
    for (const c of r.conditions) assert.equal(c.result.rows.length, 200);
  }
});
