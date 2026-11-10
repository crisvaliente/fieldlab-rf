// Estado de la interfaz y derivación de resultados en vivo. La matemática vive en ../engine.
import * as E from '../engine/index.js';

export const S = {
  cfg: E.liveScene(),
  linked: true,            // el estimador usa los mismos P0 y n que el modelo verdadero
  rx: { x: 7.4, y: 3.2 },
  tick: 0,
  reads: 1,
  autoCal: true,
  db: null, dbSig: null,
  selected: null,
  tool: 'select',
  view: null,
  overlay: 'none', showCircles: true, showCal: true,
  heat: null, heatSig: null,
  tab: 'lab',
  live: null,
};

const listeners = [];
export const onUpdate = (fn) => listeners.push(fn);

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const f = (v, d = 2) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(d));

/** Configuración efectiva: resuelve el modelo supuesto según el vínculo de calibración. */
export function effectiveCfg() {
  const c = E.clone(S.cfg);
  c.assumed.d0 = c.env.model.d0;
  if (S.linked) { c.assumed.p0 = c.env.model.p0; c.assumed.n = c.env.model.n; }
  return c;
}

function calSignature(c) { return JSON.stringify([c.env, c.cal, c.seed]); }

export function recalibrate() {
  const c = effectiveCfg();
  S.db = E.buildCalibration(c).db;
  S.dbSig = calSignature(c);
}

export function derive() {
  const c = effectiveCfg();
  const sig = calSignature(c);
  if (!S.db || (S.autoCal && sig !== S.dbSig)) recalibrate();
  const stale = sig !== S.dbSig;
  const aps = c.env.aps.filter((a) => a.enabled !== false);
  const sample = E.generateSamples(c.env, [S.rx], { seed: c.seed, role: 'live', reads: S.reads, detail: true, tick: S.tick })[0];
  const burst = E.generateSamples(c.env, [S.rx], { seed: c.seed, role: 'burst', reads: 30, detail: true })[0];
  const est = E.locate(sample.rssi, { aps, assumed: c.assumed, db: S.db, tri: c.tri, knn: c.knn });
  const err = (e) => (e.ok ? Math.hypot(e.x - S.rx.x, e.y - S.rx.y) : null);
  const signals = c.env.aps.map((ap) => {
    const on = ap.enabled !== false;
    const d = on ? sample.detail[ap.id] : E.meanRssi(ap, S.rx, c.env);
    const bvals = on ? burst.detail[ap.id].values.filter((v) => v != null) : [];
    const inv = on ? E.invertRssi(sample.rssi[ap.id], c.assumed) : { d: null };
    return {
      id: ap.id, enabled: on, rssi: on ? sample.rssi[ap.id] : null, mean: d.rssi, dTrue: d.d, clamped: d.clamped,
      wallLoss: d.wallLoss, crossed: d.crossed, dInf: inv.d, saturated: inv.saturated,
      burstStd: bvals.length > 1 ? E.stdev(bvals) : null, burstMin: bvals.length ? Math.min(...bvals) : null,
      burstMax: bvals.length ? Math.max(...bvals) : null, burstValid: bvals.length,
    };
  });
  S.live = { cfg: c, sample, signals, a: est.a, b: est.b, errA: err(est.a), errB: err(est.b), stale };
  if (S.heat && S.heatSig !== heatSignature(c)) S.heat = null;
}

function heatSignature(c) { return JSON.stringify([c.env, c.assumed, c.tri, c.knn, c.cal, c.seed]); }
export function computeHeat() {
  const c = effectiveCfg();
  const cell = Math.max(0.5, Math.max(c.env.room.w, c.env.room.h) / 30);
  S.heat = E.errorHeatmap(c, { cell, trials: 6 });
  S.heatSig = heatSignature(c);
}

export function update() {
  derive();
  for (const fn of listeners) fn();
}

export function nextId(prefix, items) {
  let i = 1;
  while (items.some((x) => x.id === `${prefix}${i}`)) i++;
  return `${prefix}${i}`;
}

export function clampToRoom(p) {
  const r = S.cfg.env.room;
  return { x: Math.min(r.w, Math.max(0, p.x)), y: Math.min(r.h, Math.max(0, p.y)) };
}
export const snap = (v, q = 0.05) => Math.round(v / q) * q;

export function fitView() {
  // Márgenes en píxeles (ejes, etiquetas, barra de escala) convertidos a metros según el ancho real.
  const r = S.cfg.env.room;
  const px = (typeof document !== 'undefined' && document.getElementById('plan')?.clientWidth) || 640;
  const u = r.w / Math.max(120, px - 52);
  S.view = { x: -38 * u, y: -20 * u, w: r.w + 52 * u, h: r.h + 58 * u };
  S.viewFit = true;
}

/** Tras cambiar el recinto: mantener todo dentro. */
export function enforceRoom() {
  const r = S.cfg.env.room;
  for (const a of S.cfg.env.aps) { a.x = Math.min(r.w, a.x); a.y = Math.min(r.h, a.y); }
  for (const w of S.cfg.env.walls) { w.x1 = Math.min(r.w, w.x1); w.x2 = Math.min(r.w, w.x2); w.y1 = Math.min(r.h, w.y1); w.y2 = Math.min(r.h, w.y2); }
  S.rx = clampToRoom(S.rx);
  fitView();
}

export function loadScene(cfg, extra = {}) {
  S.cfg = cfg;
  S.linked = true; S.tick = 0; S.reads = 1; S.autoCal = true; S.selected = null; S.tool = 'select';
  S.db = null; S.heat = null; S.overlay = 'none';
  Object.assign(S, extra);
  S.rx = clampToRoom(S.rx);
  fitView();
}
