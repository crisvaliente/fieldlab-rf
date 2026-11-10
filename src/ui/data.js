// Importación y exportación CSV, y análisis de conjuntos importados.
import * as E from '../engine/index.js';
import { S, f, esc, effectiveCfg } from './state.js';
import { copyText, downloadText, inFrame } from './util.js';

const D = { text: '', imp: null, analysis: null, exportText: '' };
let root;

const SOURCE_LABEL = { synthetic: 'sintético (declarado en el archivo)', measured: 'medición real (declarado en el archivo)', undeclared: 'origen no declarado' };

function analyze() {
  const c = effectiveCfg();
  D.analysis = E.analyzeDataset(D.imp.samples, { aps: c.env.aps.filter((a) => a.enabled !== false), assumed: c.assumed, tri: c.tri, knn: c.knn });
  D.analysis.assumed = c.assumed; D.analysis.k = c.knn.k;
}

function doImport(text) {
  D.text = text; D.analysis = null;
  D.imp = E.importCsv(text, { room: S.cfg.env.room });
  if (D.imp.ok) analyze();
  render();
}

function estTable(rows, withTruth) {
  const head = `<tr><th>muestra</th>${withTruth ? '<th class="num">real<br><small>m</small></th>' : ''}<th class="num">A<br><small>m</small></th>${withTruth ? '<th class="num">error A<br><small>m</small></th>' : ''}<th class="num">B<br><small>m</small></th>${withTruth ? '<th class="num">error B<br><small>m</small></th>' : ''}</tr>`;
  const pos = (e) => (e.ok ? `(${f(e.x)}, ${f(e.y)})` : `<span class="chip bad" title="${esc(e.status)}">sin estimación</span>`);
  const body = rows.slice(0, 60).map((r) => `<tr><th scope="row">${esc(r.id)}</th>${withTruth ? `<td class="num">(${f(r.x)}, ${f(r.y)})</td>` : ''}<td class="num">${pos(r.a)}</td>${withTruth ? `<td class="num">${f(r.a.err)}</td>` : ''}<td class="num">${pos(r.b)}</td>${withTruth ? `<td class="num">${f(r.b.err)}</td>` : ''}</tr>`).join('');
  return `<div class="scroll-x"><table class="data"><thead>${head}</thead><tbody>${body}</tbody></table></div>${rows.length > 60 ? `<p class="fine">Se muestran 60 de ${rows.length} muestras.</p>` : ''}`;
}

function renderResult() {
  const imp = D.imp;
  if (!imp) return '<p class="fine">Todavía no se importó ningún archivo.</p>';
  if (!imp.ok) {
    return `<p class="note bad"><strong>Archivo rechazado:</strong> ${imp.errors.length} error(es). No se importó ninguna fila.</p>
      <div class="scroll-x"><table class="data"><thead><tr><th class="num">línea</th><th>campo</th><th>problema</th></tr></thead><tbody>${imp.errors.slice(0, 40).map((e) => `<tr><td class="num">${e.line || '—'}</td><td>${esc(e.field || '')}</td><td>${esc(e.message)}</td></tr>`).join('')}</tbody></table></div>
      ${imp.errors.length > 40 ? `<p class="fine">Se muestran los primeros 40.</p>` : ''}`;
  }
  const m = imp.meta, a = D.analysis;
  const src = m.sources.map((s) => SOURCE_LABEL[s]).join('; ');
  const sumRow = (k, name) => { const s = a.summary[k]; return `<tr><th scope="row"><span class="sym s-${k}"></span>${name}</th><td class="num">${s.nOk}/${s.nTotal}</td><td class="num">${f(s.failRate * 100, 1)} %</td><td class="num">${f(s.mean)}</td><td class="num">${f(s.median)}</td><td class="num">${f(s.rmse)}</td><td class="num">${f(s.p90)}</td></tr>`; };
  return `<p class="note ok"><strong>Archivo válido.</strong> ${m.rows} filas → ${imp.samples.length} muestras · experimento(s): ${m.experiments.map(esc).join(', ')}</p>
    <dl class="kv"><dt>Origen de los datos</dt><dd>${src}</dd>
      <dt>Calibración / evaluación / sin posición</dt><dd>${m.counts.calibration} / ${m.counts.evaluation} / ${m.counts.unlabeled}</dd>
      <dt>AP en el archivo</dt><dd>${m.apIds.map(esc).join(', ')}</dd>
      <dt>AP que coinciden con el plano</dt><dd>${a.matchedAps.map(esc).join(', ') || 'ninguno'}${a.unmatchedAps.length ? ` <span class="muted">(sin posición en el plano: ${a.unmatchedAps.map(esc).join(', ')})</span>` : ''}</dd>
      <dt>Lecturas faltantes</dt><dd>${m.missingReadings}</dd></dl>
    ${imp.warnings.length ? `<details><summary>${imp.warnings.length} advertencia(s)</summary><ul class="reading">${imp.warnings.slice(0, 30).map((w) => `<li>${w.line ? `Línea ${w.line}: ` : ''}${esc(w.message)}</li>`).join('')}</ul></details>` : ''}
    <h4>Análisis</h4>
    <p class="fine">El método A usa las posiciones de los AP del plano actual y el modelo supuesto (P₀ ${f(a.assumed.p0, 1)} dBm, n ${f(a.assumed.n, 2)}). El método B construye su mapa solo con las ${m.counts.calibration} muestras de calibración del archivo (${a.calPoints} posiciones distintas), k = ${a.k}. <button class="btn small" id="dataReanalyze">Volver a analizar con la escena actual</button></p>
    ${a.summary ? `<div class="scroll-x"><table class="data"><thead><tr><th>método</th><th class="num">estimadas</th><th class="num">fallos</th><th class="num">media</th><th class="num">mediana</th><th class="num">RMSE</th><th class="num">P90</th></tr></thead><tbody>${sumRow('a', 'A · multilateración')}${sumRow('b', 'B · k-NN')}</tbody></table></div>
      <p class="fine">Error espacial en metros, calculado sobre las ${m.counts.evaluation} muestras de evaluación.${m.counts.evaluation < 30 ? ' Con tan pocas muestras, percentiles y RMSE son muy inestables.' : ''}</p>
      <details><summary>Estimaciones por muestra de evaluación</summary>${estTable(a.evalRows, true)}</details>`
    : '<p class="note warn">El archivo no tiene muestras de evaluación con posición conocida: <strong>no se calcula ninguna métrica de error de posicionamiento</strong>.</p>'}
    ${a.unlabeledRows.length ? `<details open><summary>Muestras sin posición conocida (${a.unlabeledRows.length})</summary><p class="fine">Reciben una estimación, pero no existe posición real contra la cual compararla. No tienen error.</p>${estTable(a.unlabeledRows, false)}</details>` : ''}`;
}

function render() {
  root.querySelector('#dataText').value = D.text;
  root.querySelector('#dataResult').innerHTML = renderResult();
  root.querySelector('#dataReanalyze')?.addEventListener('click', () => { analyze(); render(); });
  const ex = root.querySelector('#dataExport');
  ex.hidden = !D.exportText;
  root.querySelector('#dataExportText').value = D.exportText;
}

function exportScene() {
  const c = effectiveCfg();
  const cal = E.generateSamples(c.env, E.gridPositions(c.env.room, c.cal.spacing), { seed: c.seed, role: 'calibration', reads: c.cal.reads, experimentId: `escena-s${c.seed}` });
  const ev = E.generateSamples(c.env, E.randomPositions(c.env.room, 50, c.seed), { seed: c.seed, role: 'evaluation', experimentId: `escena-s${c.seed}` });
  D.exportText = E.exportCsv([...cal, ...ev]);
  render();
}

export function initData(el) {
  root = el;
  const cols = [
    ['experiment_id', 'sí', 'texto', 'Identificador del experimento o campaña.'],
    ['sample_id', 'sí', 'texto', 'Identificador de la muestra: un instante y un lugar. Todas las filas de una muestra lo comparten.'],
    ['ap_id', 'sí', 'texto', 'Identificador del punto de acceso. Debe coincidir con el nombre del AP en el plano para usar el método A.'],
    ['rssi_dbm', 'sí', 'dBm, −120 … 0', 'Intensidad recibida. Vacío = el AP no se detectó en esa muestra.'],
    ['x_m, y_m', 'no', 'metros', 'Posición conocida del receptor. Ambas o ninguna. Origen en la esquina inferior izquierda del recinto.'],
    ['role', 'no', 'calibration · evaluation · unlabeled', 'Uso de la muestra. Si falta: con posición → evaluation; sin posición → unlabeled. Nunca se asume calibration.'],
    ['timestamp_iso', 'no', 'ISO 8601', 'Marca temporal, por ejemplo 2026-11-10T14:30:00Z.'],
    ['source', 'no', 'synthetic · measured', 'Origen declarado del dato. Si falta, la aplicación lo trata como no declarado.'],
  ];
  el.innerHTML = `<div class="card"><h3>Importar mediciones (CSV)</h3>
    <p class="fine">Formato largo: una fila por muestra y punto de acceso. Separador coma, punto decimal, codificación UTF-8. La importación es todo o nada: un solo error rechaza el archivo completo. La aplicación no se conecta a ningún hardware ni pide permisos; las mediciones de un ESP32 se cargan como archivo.</p>
    <details><summary>Esquema de columnas</summary><div class="scroll-x"><table class="data"><thead><tr><th>columna</th><th>obligatoria</th><th>unidad / valores</th><th>significado</th></tr></thead><tbody>${cols.map((c) => `<tr><th scope="row"><code>${c[0]}</code></th><td>${c[1]}</td><td>${c[2]}</td><td>${c[3]}</td></tr>`).join('')}</tbody></table></div></details>
    <div class="row"><button class="btn" id="dataExample">Cargar conjunto de ejemplo (sintético)</button><label class="btn filebtn">Elegir archivo CSV<input type="file" id="dataFile" accept=".csv,text/csv,text/plain"></label></div>
    <label class="field wide"><span>O pegá el contenido del CSV</span><textarea id="dataText" rows="6" spellcheck="false" placeholder="experiment_id,sample_id,ap_id,rssi_dbm,x_m,y_m,role,timestamp_iso,source"></textarea></label>
    <div class="row"><button class="btn primary" id="dataImport">Validar e importar</button></div>
    <div id="dataResult"></div></div>
  <div class="card"><h3>Exportar la escena actual</h3>
    <p class="fine">Genera, con el modelo y la semilla actuales, la grilla de calibración y 50 muestras de evaluación en el mismo esquema. Cada fila lleva <code>source = synthetic</code>.</p>
    <div class="row"><button class="btn" id="dataExportBtn">Generar CSV sintético</button></div>
    <div id="dataExport" hidden><textarea id="dataExportText" rows="8" readonly spellcheck="false"></textarea><div class="row"><button class="btn small" id="dataCopy">Copiar</button>${inFrame ? '' : '<button class="btn small" id="dataDownload">Descargar</button>'}<span class="fine" id="dataCopyStatus" role="status"></span></div></div></div>`;
  el.querySelector('#dataExample').addEventListener('click', () => doImport(E.exampleDatasetCsv()));
  el.querySelector('#dataImport').addEventListener('click', () => doImport(el.querySelector('#dataText').value));
  el.querySelector('#dataFile').addEventListener('change', (ev) => {
    const file = ev.target.files[0];
    if (!file) return;
    const fr = new FileReader();
    fr.onload = () => doImport(String(fr.result));
    fr.onerror = () => { D.imp = { ok: false, errors: [{ line: 0, field: null, message: 'No se pudo leer el archivo.' }], warnings: [] }; render(); };
    fr.readAsText(file);
    ev.target.value = '';
  });
  el.querySelector('#dataExportBtn').addEventListener('click', exportScene);
  el.querySelector('#dataCopy').addEventListener('click', () => copyText(D.exportText, el.querySelector('#dataExportText'), el.querySelector('#dataCopyStatus')));
  el.querySelector('#dataDownload')?.addEventListener('click', () => downloadText('fieldlab_escena.csv', D.exportText, 'text/csv'));
  render();
}
