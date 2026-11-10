// Modo Experimento: hipótesis → parámetros → muestras → algoritmos → métricas → comparación.
import * as E from '../engine/index.js';
import { S, f, esc, effectiveCfg } from './state.js';
import { sweepChart, metricBars, perSampleChart, histChart, LEGEND } from './charts.js';
import { copyText, downloadText, inFrame } from './util.js';

const X = { preset: 'exp1', hypothesis: '', variable: 'apCount', values: '', n: 200, seed: 20261110, useLab: false, run: null, cond: 0, metric: 'mean', runs: new Map(), repeat: null, error: null, exportText: '' };
let root;
const METRICS = { mean: 'Error medio', median: 'Error mediano', rmse: 'RMSE', p90: 'Percentil 90' };

function preset() { return E.PRESETS.find((p) => p.id === X.preset) || null; }

export function selectPreset(id) {
  X.preset = id;
  const p = preset();
  if (p) { X.hypothesis = p.hypothesis; X.variable = p.variable; X.values = p.values.join(', '); X.useLab = false; }
  else { X.hypothesis = ''; X.useLab = true; if (X.variable === 'none') X.variable = 'sigma'; if (!X.values) X.values = '0, 2, 4, 6'; }
  X.run = null; X.error = null; X.repeat = null;
  renderForm();
  renderResults();
}

function parseValues() {
  if (X.variable === 'none') return { values: [] };
  const parts = X.values.split(/[\s;,]+/).filter(Boolean).map((t) => Number(t.replace(',', '.')));
  if (!parts.length) return { error: 'Indicá al menos un valor para la variable.' };
  if (parts.some((v) => !Number.isFinite(v))) return { error: 'Los valores deben ser números separados por comas.' };
  if (parts.length > 12) return { error: 'Como máximo 12 condiciones por experimento.' };
  if (new Set(parts).size !== parts.length) return { error: 'Hay valores repetidos.' };
  const base = baseCfg();
  const nAps = base.env.aps.filter((a) => a.enabled !== false).length;
  const int = (v) => Number.isInteger(v);
  const rules = {
    apCount: (v) => (int(v) && v >= 1 && v <= nAps) || `La cantidad de AP debe ser un entero entre 1 y ${nAps} (los AP encendidos de la escena).`,
    sigma: (v) => (v >= 0 && v <= 20) || 'σ debe estar entre 0 y 20 dB.',
    wallAtt: (v) => (v >= 0 && v <= 40) || 'La atenuación debe estar entre 0 y 40 dB.',
    nAssumed: (v) => (v >= 1 && v <= 6) || 'n debe estar entre 1 y 6.',
    p0Assumed: (v) => (v >= -90 && v <= 0) || 'P₀ debe estar entre −90 y 0 dBm.',
    k: (v) => (int(v) && v >= 1 && v <= 50) || 'k debe ser un entero entre 1 y 50.',
    gridSpacing: (v) => (v >= 0.25 && v <= 10) || 'El paso de grilla debe estar entre 0,25 y 10 m.',
    reads: (v) => (int(v) && v >= 1 && v <= 50) || 'Las lecturas deben ser un entero entre 1 y 50.',
  };
  for (const v of parts) { const r = rules[X.variable](v); if (r !== true) return { error: r }; }
  if (X.variable === 'wallAtt' && !base.env.walls.length) return { error: 'La escena no tiene paredes: esta variable no tendría ningún efecto. Dibujá una pared o elegí otra escena.' };
  return { values: parts.sort((a, b) => a - b) };
}

function baseCfg() {
  const p = preset();
  const c = X.useLab || !p ? effectiveCfg() : p.build();
  c.eval.n = X.n; c.seed = X.seed;
  return c;
}

function describe(c) {
  const m = c.env.model, on = c.env.aps.filter((a) => a.enabled !== false).length;
  return `Recinto ${f(c.env.room.w, 1)} × ${f(c.env.room.h, 1)} m · ${on} AP · ${c.env.walls.length} paredes · P₀ ${f(m.p0, 1)} dBm, n ${f(m.n, 2)}, d₀ ${f(m.d0, 2)} m, σ ${f(m.sigma, 1)} dB, piso ${f(m.floor, 0)} dBm · estimador: P₀ ${f(c.assumed.p0, 1)}, n ${f(c.assumed.n, 2)} · k-NN: k ${c.knn.k}, grilla ${f(c.cal.spacing, 2)} m, ${c.cal.reads} lecturas por punto · evaluación: ${c.eval.n} posiciones, ${c.eval.reads} lectura(s) por posición`;
}

function run() {
  X.error = null; X.repeat = null;
  if (!(Number.isInteger(X.n) && X.n >= 10 && X.n <= 2000)) { X.error = 'El número de posiciones debe ser un entero entre 10 y 2000.'; return renderResults(); }
  if (!Number.isInteger(X.seed)) { X.error = 'La semilla debe ser un número entero.'; return renderResults(); }
  const pv = parseValues();
  if (pv.error) { X.error = pv.error; return renderResults(); }
  const base = baseCfg();
  const errs = E.validateModel(base.env.model);
  if (errs.length) { X.error = errs.join(' '); return renderResults(); }
  const key = JSON.stringify([base, X.variable, pv.values]);
  const t0 = performance.now();
  let result;
  try { result = E.runSweep({ base, variable: X.variable, values: pv.values }); }
  catch (e) { X.error = `El experimento no pudo ejecutarse: ${e.message}`; return renderResults(); }
  const prev = X.runs.get(key);
  if (prev) X.repeat = { same: prev === result.digest, prev };
  X.runs.set(key, result.digest);
  X.run = { ...result, base, ms: performance.now() - t0, hypothesis: X.hypothesis, description: describe(base) };
  X.cond = Math.min(X.cond, result.conditions.length - 1);
  X.exportText = '';
  renderResults();
}

function renderForm() {
  const p = preset();
  const form = root.querySelector('#expForm');
  const varOpts = Object.entries(E.VARIABLES).map(([k, v]) => `<option value="${k}" ${k === X.variable ? 'selected' : ''}>${v.label}</option>`).join('');
  form.innerHTML = `
    <label class="field wide"><span>Experimento</span><select id="expPreset">${E.PRESETS.map((q) => `<option value="${q.id}" ${q.id === X.preset ? 'selected' : ''}>${q.title}</option>`).join('')}<option value="custom" ${!p ? 'selected' : ''}>Personalizado (escena actual del laboratorio)</option></select></label>
    <label class="field wide"><span>1 · Hipótesis <small>(escribila antes de ejecutar)</small></span><textarea id="expHyp" rows="3" placeholder="¿Qué esperás que ocurra y por qué?">${esc(X.hypothesis)}</textarea></label>
    <div class="fields">
      <label class="field"><span>2 · Variable estudiada</span><select id="expVar" ${p ? 'disabled' : ''}>${varOpts}</select></label>
      <label class="field"><span>Valores</span><input type="text" id="expValues" value="${esc(X.values)}" ${X.variable === 'none' ? 'disabled' : ''} inputmode="decimal"></label>
      <label class="field"><span>Posiciones de evaluación</span><input type="number" id="expN" value="${X.n}" min="10" max="2000" step="10"></label>
      <label class="field"><span>Semilla</span><input type="number" id="expSeed" value="${X.seed}" step="1"></label>
    </div>
    ${p ? `<label class="check"><input type="checkbox" id="expUseLab" ${X.useLab ? 'checked' : ''}> Usar la escena actual del laboratorio en lugar de la escena estándar del experimento</label>` : ''}
    <p class="fine"><strong>Parámetros controlados.</strong> ${p && !X.useLab ? esc(p.controlled) : 'Todo lo que no sea la variable estudiada queda fijo en los valores de la escena actual del laboratorio.'} Todas las condiciones comparten semilla: mismas posiciones de evaluación y mismos sorteos de ruido.</p>
    <p class="fine mono-s" id="expDesc">${esc(describe(baseCfg()))}</p>
    <div class="row"><button class="btn primary" id="expRun">Ejecutar experimento</button><span class="fine">Volver a ejecutar sin cambiar nada repite el experimento exactamente; la huella lo comprueba.</span></div>`;
  form.querySelector('#expPreset').addEventListener('change', (e) => selectPreset(e.target.value));
  form.querySelector('#expHyp').addEventListener('input', (e) => { X.hypothesis = e.target.value; });
  form.querySelector('#expVar').addEventListener('change', (e) => { X.variable = e.target.value; renderForm(); });
  form.querySelector('#expValues').addEventListener('input', (e) => { X.values = e.target.value; });
  form.querySelector('#expN').addEventListener('input', (e) => { X.n = Number(e.target.value); form.querySelector('#expDesc').textContent = describe(baseCfg()); });
  form.querySelector('#expSeed').addEventListener('input', (e) => { X.seed = Number(e.target.value); });
  form.querySelector('#expUseLab')?.addEventListener('change', (e) => { X.useLab = e.target.checked; renderForm(); });
  form.querySelector('#expRun').addEventListener('click', run);
}

function resultsCsv() {
  const lines = ['condition,sample_id,x_true_m,y_true_m,a_status,a_x_m,a_y_m,a_error_m,b_status,b_x_m,b_y_m,b_error_m'];
  const n = (v) => (v == null ? '' : v.toFixed(4));
  for (const c of X.run.conditions) for (const r of c.result.rows) {
    lines.push([c.value ?? 'unica', r.id, n(r.x), n(r.y), r.a.status, n(r.a.x), n(r.a.y), n(r.a.err), r.b.status, n(r.b.x), n(r.b.y), n(r.b.err)].join(','));
  }
  return lines.join('\n') + '\n';
}
function resultsJson() {
  const r = X.run;
  return JSON.stringify({
    app: 'FieldLab RF', data_origin: 'synthetic', note: 'Resultados de simulación con el modelo log-distancia. No son mediciones de campo.',
    hypothesis: r.hypothesis, variable: r.variable, seed: r.seed, digest: r.digest, base_config: r.base,
    conditions: r.conditions.map((c) => ({ value: c.value, n_aps: c.result.nAps, calibration: c.result.cal, summary: c.result.summary, paired: c.result.paired })),
  }, null, 2);
}

function reading() {
  const cs = X.run.conditions, out = [];
  const unit = E.VARIABLES[X.run.variable].unit;
  if (cs.length > 1) {
    for (const [k, name] of [['a', 'A'], ['b', 'B']]) {
      const ms = cs.map((c) => c.result.summary[k].mean);
      if (ms.some((m) => m == null)) continue;
      const iMin = ms.indexOf(Math.min(...ms));
      out.push(`Método ${name}: el error medio va de ${f(ms[0])} m (${cs[0].label}) a ${f(ms[ms.length - 1])} m (${cs[cs.length - 1].label}); el mínimo, ${f(ms[iMin])} m, se da en ${cs[iMin].label}.`);
    }
  }
  const c = cs[X.cond], p = c.result.paired;
  if (p.n) out.push(`En la condición ${c.label}, sobre ${p.n} muestras con ambas estimaciones: A fue mejor en ${p.aBetter}, B en ${p.bBetter}. Diferencia media (A − B): ${f(p.meanDiffAminusB)} m.`);
  for (const [k, name] of [['a', 'A'], ['b', 'B']]) {
    const s = c.result.summary[k];
    if (s.nFailed) out.push(`Método ${name}: ${s.nFailed} de ${s.nTotal} intentos sin estimación (${Object.entries(s.failReasons).map(([r, n]) => `${r}: ${n}`).join(', ')}). Las métricas de error excluyen esos casos.`);
  }
  return out;
}

export function renderResults() {
  const el = root.querySelector('#expResults');
  if (X.error) { el.innerHTML = `<p class="note bad">${esc(X.error)}</p>`; return; }
  if (!X.run) { el.innerHTML = '<p class="fine">Todavía no hay resultados. Revisá la hipótesis y los parámetros, y ejecutá el experimento.</p>'; return; }
  const r = X.run, cs = r.conditions, c = cs[X.cond];
  const cell = (s, m) => `<td class="num">${f(s[m])}</td>`;
  const rows = cs.map((cd, i) => ['a', 'b'].map((k, j) => {
    const s = cd.result.summary[k];
    return `<tr class="${i === X.cond ? 'sel' : ''}">${j === 0 ? `<th scope="row" rowspan="2">${esc(cd.label)}</th>` : ''}<td><span class="sym s-${k}"></span>${k.toUpperCase()}</td><td class="num">${s.nOk}/${s.nTotal}</td><td class="num">${f(s.failRate * 100, 1)} %</td>${cell(s, 'mean')}${cell(s, 'median')}${cell(s, 'rmse')}${cell(s, 'p90')}</tr>`;
  }).join('')).join('');
  const w = Math.max(280, Math.floor(el.clientWidth || 600));
  const numeric = cs.length > 1;
  el.innerHTML = `
    <div class="runbar"><span class="chip synth">datos sintéticos</span><span>Huella <code>${r.digest}</code></span><span class="muted">semilla ${r.seed} · ${cs.length} condición(es) × ${r.base.eval.n} posiciones · ${f(r.ms, 0)} ms</span>
      ${X.repeat ? (X.repeat.same ? '<span class="chip ok">repetición idéntica a la corrida anterior</span>' : `<span class="chip bad">la huella cambió (antes ${X.repeat.prev})</span>`) : ''}</div>
    ${r.hypothesis ? `<p class="hyp"><strong>Hipótesis.</strong> ${esc(r.hypothesis)}</p>` : '<p class="note warn">Este experimento se ejecutó sin hipótesis escrita.</p>'}
    <h4>5 · Métricas de error espacial (m)</h4>
    ${numeric ? `<p class="fine">Variable: ${esc(E.VARIABLES[r.variable].label)}.</p>` : ''}
    <div class="scroll-x"><table class="data">
      <thead><tr><th>condición</th><th>método</th><th class="num">estimadas</th><th class="num">fallos</th><th class="num">media</th><th class="num">mediana</th><th class="num">RMSE</th><th class="num">P90</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    <h4>6 · Comparación</h4>
    ${LEGEND}
    ${numeric ? `<label class="field inline"><span>Métrica</span><select id="expMetric">${Object.entries(METRICS).map(([k, v]) => `<option value="${k}" ${k === X.metric ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
      <div class="chartbox">${sweepChart(cs, X.metric, METRICS[X.metric], E.VARIABLES[r.variable].label + (E.VARIABLES[r.variable].unit ? ` (${E.VARIABLES[r.variable].unit})` : ''), w)}</div>` : `<div class="chartbox">${metricBars(c.result.summary, w)}</div>`}
    <ul class="reading">${reading().map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
    <h4>Detalle por condición</h4>
    ${numeric ? `<label class="field inline"><span>Condición</span><select id="expCond">${cs.map((cd, i) => `<option value="${i}" ${i === X.cond ? 'selected' : ''}>${esc(cd.label)}</option>`).join('')}</select></label>` : ''}
    <p class="fine">Base de huellas: ${c.result.cal.nPoints} puntos (${c.result.cal.nSamples} muestras de calibración). Evaluación: ${c.result.rows.length} posiciones aleatorias que no pertenecen a la grilla de calibración y usan un flujo de ruido distinto.</p>
    <div class="chartbox"><div class="charttitle">Error por muestra <span class="muted">(raya en el borde superior = sin estimación)</span></div>${perSampleChart(c.result.rows, w)}</div>
    <div class="chartbox"><div class="charttitle">Distribución del error</div>${histChart(c.result.rows, w)}</div>
    <h4>7 · Registro</h4>
    <p class="fine">${esc(r.description)}</p>
    <div class="row"><button class="btn" data-exp="csv">Ver resultados por muestra (CSV)</button><button class="btn" data-exp="json">Ver registro del experimento (JSON)</button>${inFrame ? '' : '<button class="btn" data-exp="dl">Descargar CSV</button>'}</div>
    <div id="expExport" ${X.exportText ? '' : 'hidden'}><textarea id="expExportText" rows="8" readonly spellcheck="false">${esc(X.exportText)}</textarea><div class="row"><button class="btn small" id="expCopy">Copiar</button><span class="fine" id="expCopyStatus" role="status"></span></div></div>
    <p class="fine">Estas cifras describen el comportamiento de los algoritmos sobre datos generados por el propio modelo. No son una medida de precisión en un entorno real.</p>`;
  el.querySelector('#expMetric')?.addEventListener('change', (e) => { X.metric = e.target.value; renderResults(); });
  el.querySelector('#expCond')?.addEventListener('change', (e) => { X.cond = Number(e.target.value); renderResults(); });
  el.querySelectorAll('[data-exp]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.exp === 'dl') return downloadText(`fieldlab_${r.variable}_${r.digest}.csv`, resultsCsv(), 'text/csv');
    X.exportText = b.dataset.exp === 'csv' ? resultsCsv() : resultsJson();
    renderResults();
    root.querySelector('#expExportText').scrollIntoView({ block: 'nearest' });
  }));
  el.querySelector('#expCopy')?.addEventListener('click', () => copyText(X.exportText, el.querySelector('#expExportText'), el.querySelector('#expCopyStatus')));
}

export function refreshExperimentScene() { if (root && (X.useLab || !preset())) { const d = root.querySelector('#expDesc'); if (d) d.textContent = describe(baseCfg()); } }
export function rerenderExperimentCharts() { if (root && X.run && !X.error) renderResults(); }

export function initExperiments(el) {
  root = el;
  el.innerHTML = `<div class="card"><h3>Modo Experimento</h3>
    <p class="fine">Cada experimento cambia una sola variable y deja el resto fijo. Los pasos van numerados: hipótesis, parámetros, muestras, algoritmos, métricas, comparación y registro.</p>
    <div id="expForm"></div></div>
    <div class="card"><h3>Resultados</h3><div id="expResults"></div></div>`;
  selectPreset('exp1');
}
