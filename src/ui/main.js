import * as E from '../engine/index.js';
import { S, f, update, onUpdate, recalibrate, enforceRoom, loadScene, computeHeat, fitView } from './state.js';
import { initPlan, renderPlan, zoomBy, deleteSelected } from './plan.js';
import { renderPositioning, renderSignals, renderIntermediates, renderInspector } from './panels.js';
import { initExperiments, selectPreset, refreshExperimentScene, rerenderExperimentCharts } from './experiments.js';
import { initData } from './data.js';
import { initLearn } from './learn.js';

const TABS = [['lab', 'Laboratorio'], ['model', 'Modelo'], ['exp', 'Experimentos'], ['data', 'Datos'], ['learn', 'Aprender']];
const num = (label, path, step, unit, min, max, hint) => `<label class="field"><span>${label}</span><span class="inp"><input type="number" id="in-${path.replace(/\./g, '-')}" data-bind="${path}" step="${step}" min="${min}" max="${max}"><em>${unit}</em></span>${hint ? `<small>${hint}</small>` : ''}</label>`;
const chk = (label, path) => `<label class="check"><input type="checkbox" id="in-${path.replace(/\./g, '-')}" data-bind="${path}"> ${label}</label>`;

function shell() {
  return `
<header class="top"><div class="brand"><span class="eyebrow">JUMP LAB · instrumento 01</span><h1>FieldLab RF</h1></div>
  <div class="status"><span class="chip synth">datos sintéticos</span><span class="fine">Modelo log-distancia simplificado. No es una medición de campo.</span></div></header>
<main class="app" id="app" data-tab="lab">
  <section class="stage" aria-label="Plano del laboratorio">
    <div class="toolbar" role="toolbar" aria-label="Herramientas del plano">
      <div class="seg" id="tools"><button data-tool="select" title="Mover elementos y desplazar el plano">Mover</button><button data-tool="ap" title="Tocá el plano para colocar un punto de acceso">+ AP</button><button data-tool="wall" title="Arrastrá sobre el plano para dibujar una pared">+ Pared</button></div>
      <button class="btn small danger" id="btnDelete" title="Eliminar el elemento seleccionado">Eliminar</button>
      <div class="seg"><button id="zoomOut" aria-label="Alejar">−</button><button id="zoomFit" aria-label="Ajustar a la vista">Ajustar</button><button id="zoomIn" aria-label="Acercar">+</button></div>
    </div>
    <p class="toolhint" id="toolHint" role="status"></p>
    <div class="planwrap"><svg id="plan" tabindex="0" role="application" aria-label="Plano interactivo del recinto, en metros. Las flechas mueven el receptor o el AP seleccionado."></svg></div>
    <div class="planlegend">
      <span><span class="sym s-rx"></span>receptor (posición real)</span><span><span class="sym s-a"></span>estimación A</span><span><span class="sym s-b"></span>estimación B</span><span><span class="sym s-ap"></span>AP</span><span><span class="sym s-wall"></span>pared</span><span><span class="sym s-cal"></span>punto de calibración</span>
    </div>
    <div class="layerbar">
      <label class="field inline"><span>Capa</span><select id="overlay"><option value="none">Sin mapa de calor</option><option value="rssi">RSSI medio del AP seleccionado</option><option value="errA">Error medio del método A</option><option value="errB">Error medio del método B</option></select></label>
      <label class="check"><input type="checkbox" id="showCircles"> Círculos de distancia inferida</label>
      <label class="check"><input type="checkbox" id="showCal"> Puntos de calibración</label>
      <div id="planLegendScale" class="scalewrap"></div>
    </div>
    <div class="inspector" id="inspector"></div>
  </section>
  <section class="side">
    <nav class="tabs" role="tablist" aria-label="Secciones">${TABS.map(([k, t]) => `<button role="tab" id="tabbtn-${k}" data-tab="${k}" aria-controls="tab-${k}">${t}</button>`).join('')}</nav>
    <div class="tabpanel" id="tab-lab" role="tabpanel" aria-labelledby="tabbtn-lab">
      <div class="card"><h3>Posicionamiento</h3><div id="positioning"></div>
        <div class="row measure"><button class="btn primary" id="btnMeasure">Nueva medición</button><label class="check"><input type="checkbox" id="autoMeasure"> Medir en continuo (4 por segundo)</label>
        ${num('Lecturas por medición', 'reads', 1, '', 1, 30)}</div></div>
      <div class="card"><h3>Señales</h3><div id="signals"></div></div>
      <div class="card"><h3>Cómo se obtuvo cada estimación</h3><div id="intermediates"></div></div>
    </div>
    <div class="tabpanel" id="tab-model" role="tabpanel" aria-labelledby="tabbtn-model" hidden>
      <div class="card"><h3>Recinto</h3><div class="fields">${num('Ancho', 'cfg.env.room.w', 0.5, 'm', 2, 60)}${num('Alto', 'cfg.env.room.h', 0.5, 'm', 2, 60)}</div></div>
      <div class="card"><h3>Modelo verdadero <small>genera los datos sintéticos</small></h3><div class="fields">
        ${num('P₀ · RSSI de referencia', 'cfg.env.model.p0', 1, 'dBm', -80, 0)}${num('n · exponente de pérdida', 'cfg.env.model.n', 0.1, '', 1, 6)}${num('d₀ · distancia de referencia', 'cfg.env.model.d0', 0.1, 'm', 0.1, 5)}
        ${num('σ · ruido por lectura', 'cfg.env.model.sigma', 0.5, 'dB', 0, 15)}${num('Piso de sensibilidad', 'cfg.env.model.floor', 1, 'dBm', -120, -60, 'Por debajo, la lectura falta')}${num('Semilla', 'cfg.seed', 1, '', 0, 4294967295)}</div>
        <p class="fine">Con la misma semilla y los mismos parámetros, todos los números de la aplicación se repiten exactamente.</p></div>
      <div class="card"><h3>Estimador <small>lo que el método A supone</small></h3>
        ${chk('Calibración correcta: usar los mismos P₀ y n que el modelo verdadero', 'linked')}
        <div class="fields">${num('P₀ supuesto', 'cfg.assumed.p0', 1, 'dBm', -80, 0)}${num('n supuesto', 'cfg.assumed.n', 0.05, '', 1, 6)}</div>
        ${chk('Ponderar cada AP por 1/d̂² (las distancias largas pesan menos)', 'cfg.tri.weighted')}
        <p class="fine">El estimador conoce las posiciones de los AP. No conoce las paredes ni el ΔP de cada AP.</p></div>
      <div class="card"><h3>Fingerprinting <small>método B</small></h3><div class="fields">
        ${num('k vecinos', 'cfg.knn.k', 1, '', 1, 50)}${num('Paso de la grilla', 'cfg.cal.spacing', 0.25, 'm', 0.5, 10)}${num('Lecturas por punto', 'cfg.cal.reads', 1, '', 1, 50)}</div>
        ${chk('Ponderar vecinos por 1/(D + ε)', 'cfg.knn.weighted')}${chk('Recalibrar automáticamente cuando cambia la escena', 'autoCal')}
        <div class="row"><button class="btn" id="btnRecal">Recalibrar ahora</button><span class="fine" id="calStatus" role="status"></span></div></div>
      <div class="card"><h3>Escenas</h3><div class="row"><button class="btn" data-scene="live">4 AP y una pared (inicial)</button><button class="btn" data-scene="six">6 AP y dos paredes</button><button class="btn" data-scene="collinear">3 AP en línea (geometría degenerada)</button></div></div>
    </div>
    <div class="tabpanel" id="tab-exp" role="tabpanel" aria-labelledby="tabbtn-exp" hidden></div>
    <div class="tabpanel" id="tab-data" role="tabpanel" aria-labelledby="tabbtn-data" hidden></div>
    <div class="tabpanel" id="tab-learn" role="tabpanel" aria-labelledby="tabbtn-learn" hidden></div>
  </section>
</main>
<footer class="foot"><span>FieldLab RF · prototipo de estudio. No es un sistema de localización ni de seguimiento de personas.</span></footer>`;
}

const getPath = (path) => path.split('.').reduce((o, k) => o[k], S);
function setPath(path, v) { const ks = path.split('.'); const last = ks.pop(); ks.reduce((o, k) => o[k], S)[last] = v; }

function syncInputs() {
  document.querySelectorAll('[data-bind]').forEach((el) => {
    const v = getPath(el.dataset.bind);
    if (el.type === 'checkbox') el.checked = !!v;
    else if (document.activeElement !== el) el.value = Number.isInteger(v) ? v : +Number(v).toFixed(3);
  });
  for (const p of ['cfg.assumed.p0', 'cfg.assumed.n']) {
    const el = document.querySelector(`[data-bind="${p}"]`);
    el.disabled = S.linked;
    if (S.linked) el.value = p.endsWith('p0') ? S.cfg.env.model.p0 : S.cfg.env.model.n;
  }
}

function onBound(el, commit) {
  const path = el.dataset.bind;
  if (el.type === 'checkbox') {
    if (path === 'linked' && !el.checked) { S.cfg.assumed.p0 = S.cfg.env.model.p0; S.cfg.assumed.n = S.cfg.env.model.n; }
    setPath(path, el.checked);
  } else {
    let v = Number(el.value);
    if (el.value === '' || !Number.isFinite(v)) return;
    const lo = Number(el.min), hi = Number(el.max);
    if (v < lo || v > hi) { if (!commit) return; v = Math.min(hi, Math.max(lo, v)); }
    if (['cfg.knn.k', 'cfg.cal.reads', 'reads', 'cfg.seed'].includes(path)) v = Math.round(v);
    setPath(path, v);
    if (commit) el.value = v;
    if (path.startsWith('cfg.env.room')) enforceRoom();
  }
  update();
}

let heatTimer = null, autoTimer = null;
function go(tab, presetId) {
  S.tab = tab;
  if (presetId) selectPreset(presetId);
  renderChrome();
  if (tab === 'exp') rerenderExperimentCharts();
  if (tab === 'lab' || tab === 'model') renderPlan();
  document.querySelector('.side').scrollIntoView({ block: 'nearest' });
  if (tab === 'lab' && matchMedia('(max-width: 980px)').matches) window.scrollTo({ top: 0 });
}

function renderChrome() {
  document.getElementById('app').dataset.tab = S.tab;
  for (const [k] of TABS) {
    document.getElementById(`tab-${k}`).hidden = k !== S.tab;
    const b = document.getElementById(`tabbtn-${k}`);
    b.setAttribute('aria-selected', k === S.tab ? 'true' : 'false');
  }
  document.querySelectorAll('#tools button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.tool === S.tool ? 'true' : 'false'));
  document.getElementById('btnDelete').disabled = !S.selected;
  document.getElementById('toolHint').textContent = S.tool === 'ap' ? 'Tocá el plano donde querés colocar el punto de acceso.' : S.tool === 'wall' ? 'Arrastrá sobre el plano para dibujar la pared. Se crea con 6 dB; después podés editarla.' : '';
  document.getElementById('overlay').value = S.overlay;
  document.getElementById('showCircles').checked = S.showCircles;
  document.getElementById('showCal').checked = S.showCal;
}

function render() {
  renderChrome();
  syncInputs();
  renderPlan();
  renderPositioning(document.getElementById('positioning'));
  renderSignals(document.getElementById('signals'));
  renderIntermediates(document.getElementById('intermediates'));
  const insp = document.getElementById('inspector');
  if (!insp.contains(document.activeElement) || !S.selected) renderInspector(insp);
  const L = S.live;
  document.getElementById('calStatus').textContent = `${S.db.points.length} puntos · ${L.stale ? 'desactualizado respecto de la escena' : 'vigente'}`;
  refreshExperimentScene();
  if (S.overlay.startsWith('err') && !S.heat) {
    clearTimeout(heatTimer);
    heatTimer = setTimeout(() => { computeHeat(); renderPlan(); }, 250);
  }
}

function boot() {
  document.getElementById('root').innerHTML = shell();
  initPlan(document.querySelector('.stage'));
  initExperiments(document.getElementById('tab-exp'));
  initData(document.getElementById('tab-data'));
  initLearn(document.getElementById('tab-learn'), go);
  onUpdate(render);

  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));
  document.querySelectorAll('#tools button').forEach((b) => b.addEventListener('click', () => { S.tool = b.dataset.tool; renderChrome(); }));
  document.getElementById('btnDelete').addEventListener('click', deleteSelected);
  document.getElementById('zoomIn').addEventListener('click', () => zoomBy(1 / 1.3));
  document.getElementById('zoomOut').addEventListener('click', () => zoomBy(1.3));
  document.getElementById('zoomFit').addEventListener('click', () => { fitView(); renderPlan(); });
  document.getElementById('overlay').addEventListener('change', (e) => { S.overlay = e.target.value; update(); });
  document.getElementById('showCircles').addEventListener('change', (e) => { S.showCircles = e.target.checked; renderPlan(); });
  document.getElementById('showCal').addEventListener('change', (e) => { S.showCal = e.target.checked; renderPlan(); });
  document.getElementById('btnMeasure').addEventListener('click', () => { S.tick++; update(); });
  document.getElementById('autoMeasure').addEventListener('change', (e) => {
    clearInterval(autoTimer);
    if (e.target.checked) autoTimer = setInterval(() => { S.tick++; update(); }, 250);
  });
  document.getElementById('btnRecal').addEventListener('click', () => { recalibrate(); update(); });
  document.querySelectorAll('[data-bind]').forEach((el) => {
    el.addEventListener('input', () => onBound(el, el.type === 'checkbox'));
    if (el.type !== 'checkbox') el.addEventListener('change', () => onBound(el, true));
  });
  document.querySelectorAll('[data-scene]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.scene === 'live') loadScene(E.liveScene(), { rx: { x: 7.4, y: 3.2 } });
    else if (b.dataset.scene === 'six') { const c = E.baseConfig(); c.env.walls = E.clone(E.STANDARD_WALLS); loadScene(c, { rx: { x: 7.4, y: 3.2 } }); }
    else { const c = E.liveScene(); c.env.walls = []; c.env.aps = [2, 6, 10].map((x, i) => ({ id: `AP${i + 1}`, x, y: 4, offset: 0, enabled: true })); loadScene(c, { rx: { x: 7, y: 6 } }); }
    update();
  }));
  let rt = null;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (S.tab === 'exp') rerenderExperimentCharts(); }, 150); });
  fitView();
  update();
}

// Acceso desde la consola del navegador para auditar el estado y el motor: FieldLab.S, FieldLab.E
window.FieldLab = { S, E };
boot();
