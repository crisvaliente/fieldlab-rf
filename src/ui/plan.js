// Plano interactivo (SVG). Coordenadas del mundo en metros, origen abajo a la izquierda.
import * as E from '../engine/index.js';
import { S, f, esc, update, nextId, clampToRoom, snap, fitView, computeHeat } from './state.js';

let svg, host;
const pointers = new Map();
let drag = null;
let pinch = null;

const VIRIDIS = ['#440154', '#46327e', '#365c8d', '#277f8e', '#1fa187', '#4ac16d', '#a0da39', '#fde725'];
function ramp(t) {
  const x = Math.min(1, Math.max(0, t)) * (VIRIDIS.length - 1);
  const i = Math.min(VIRIDIS.length - 2, Math.floor(x)), k = x - i;
  const h = (c, o) => parseInt(c.slice(o, o + 2), 16);
  const mix = (o) => Math.round(h(VIRIDIS[i], o) + (h(VIRIDIS[i + 1], o) - h(VIRIDIS[i], o)) * k);
  return `rgb(${mix(1)},${mix(3)},${mix(5)})`;
}

const Y = (y) => S.cfg.env.room.h - y; // mundo → SVG

function unit() {
  const m = svg.getScreenCTM();
  return m && m.a > 0 ? 1 / m.a : S.view.w / 640;
}
function toWorld(ev) {
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = new DOMPoint(ev.clientX, ev.clientY).matrixTransform(m.inverse());
  return { x: p.x, y: Y(p.y) };
}

export function overlayLegend() {
  const L = S.live;
  if (S.overlay === 'none') return '';
  let lo, hi, label;
  if (S.overlay === 'rssi') { ({ lo, hi } = rssiRange()); label = `RSSI medio de ${esc(overlayAp()?.id ?? '—')} (dBm, sin ruido)`; }
  else {
    if (!S.heat) return '<span class="muted">Calculando…</span>';
    hi = heatMax(); lo = 0; label = `Error medio del método ${S.overlay === 'errA' ? 'A' : 'B'} (m), ${S.heat.trials} mediciones por celda`;
  }
  const stops = VIRIDIS.map((c, i) => `${c} ${(i / (VIRIDIS.length - 1)) * 100}%`).join(',');
  return `<span class="legend-scale"><span>${f(lo, S.overlay === 'rssi' ? 0 : 1)}</span><span class="ramp" style="background:linear-gradient(90deg,${stops})"></span><span>${f(hi, S.overlay === 'rssi' ? 0 : 1)}</span></span><span class="muted">${label}</span>`;
}
function overlayAp() {
  const aps = S.cfg.env.aps;
  return (S.selected?.type === 'ap' && aps.find((a) => a.id === S.selected.id)) || aps[0];
}
function rssiRange() { const m = S.live.cfg.env.model; return { lo: Math.max(m.floor, m.p0 - 60), hi: m.p0 }; }
function heatMax() {
  const vals = [...S.heat.a, ...S.heat.b].filter((v) => v != null);
  return Math.max(0.5, Math.ceil(E.percentile(vals, 98) * 2) / 2);
}

function heatLayer() {
  const room = S.cfg.env.room;
  let out = '';
  if (S.overlay === 'rssi') {
    const ap = overlayAp();
    if (!ap) return '';
    const { lo, hi } = rssiRange();
    const cols = Math.min(48, Math.round(room.w / 0.25)), rows = Math.min(48, Math.round(room.h / 0.25));
    const cw = room.w / cols, ch = room.h / rows;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const v = E.meanRssi(ap, { x: (i + 0.5) * cw, y: (j + 0.5) * ch }, S.live.cfg.env).rssi;
      out += `<rect x="${(i * cw).toFixed(3)}" y="${Y((j + 1) * ch).toFixed(3)}" width="${(cw * 1.02).toFixed(3)}" height="${(ch * 1.02).toFixed(3)}" fill="${ramp((v - lo) / (hi - lo))}"/>`;
    }
  } else if (S.heat) {
    const h = S.heat, arr = S.overlay === 'errA' ? h.a : h.b, max = heatMax();
    for (let j = 0; j < h.rows; j++) for (let i = 0; i < h.cols; i++) {
      const v = arr[j * h.cols + i];
      out += `<rect x="${(i * h.cw).toFixed(3)}" y="${Y((j + 1) * h.ch).toFixed(3)}" width="${(h.cw * 1.02).toFixed(3)}" height="${(h.ch * 1.02).toFixed(3)}" fill="${v == null ? 'none' : ramp(v / max)}"><title>${v == null ? 'sin estimación' : f(v) + ' m'}</title></rect>`;
    }
  }
  return `<g opacity="0.82">${out}</g>`;
}

export function renderPlan() {
  if (!svg) return;
  const L = S.live, room = S.cfg.env.room, v = S.view, u = unit();
  svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
  svg.style.aspectRatio = `${v.w} / ${v.h}`;
  svg.style.maxWidth = `calc(74vh * ${(v.w / v.h).toFixed(4)})`;
  const fs = 11 * u, sw = u;
  let g = `<rect x="0" y="0" width="${room.w}" height="${room.h}" fill="var(--plan)"/>`;
  if (S.overlay !== 'none') g += heatLayer();
  // grilla métrica
  const step = room.w > 30 || room.h > 30 ? 5 : 1;
  const lab = Math.max(step, Math.ceil((60 * u) / step) * step);
  for (let x = 0; x <= room.w + 1e-9; x += step) g += `<line x1="${x}" y1="0" x2="${x}" y2="${room.h}" stroke="var(--grid)" stroke-width="${sw}"/>`;
  for (let y = 0; y <= room.h + 1e-9; y += step) g += `<line x1="0" y1="${Y(y)}" x2="${room.w}" y2="${Y(y)}" stroke="var(--grid)" stroke-width="${sw}"/>`;
  for (let x = 0; x <= room.w + 1e-9; x += lab) g += `<text x="${x}" y="${room.h + 14 * u}" font-size="${fs}" text-anchor="middle" fill="var(--muted)">${x}</text>`;
  for (let y = 0; y <= room.h + 1e-9; y += lab) g += `<text x="${-6 * u}" y="${Y(y) + 4 * u}" font-size="${fs}" text-anchor="end" fill="var(--muted)">${y}</text>`;
  g += `<text x="${room.w}" y="${room.h + 32 * u}" font-size="${fs}" text-anchor="end" fill="var(--muted)">x (m)</text>`;
  g += `<text x="${-14 * u}" y="${-8 * u}" font-size="${fs}" text-anchor="middle" fill="var(--muted)">y (m)</text>`;
  g += `<rect x="0" y="0" width="${room.w}" height="${room.h}" fill="none" stroke="var(--fg)" stroke-width="${2 * u}"/>`;
  // barra de escala
  const bar = [0.5, 1, 2, 5, 10].find((b) => b / u >= 50) || 10;
  g += `<g><line x1="0" y1="${room.h + 34 * u}" x2="${bar}" y2="${room.h + 34 * u}" stroke="var(--fg)" stroke-width="${2 * u}"/><text x="${bar + 5 * u}" y="${room.h + 38 * u}" font-size="${fs}" fill="var(--fg)">${bar} m</text></g>`;

  // puntos de calibración y vecinos
  if (S.showCal && S.db) {
    const r = Math.max(1.6 * u, 0.02);
    for (const p of S.db.points) g += `<circle cx="${p.x}" cy="${Y(p.y)}" r="${r}" fill="var(--muted)" opacity="0.55"/>`;
  }
  // círculos de distancia inferida
  if (S.showCircles) {
    for (const s of L.signals) {
      if (!s.enabled || s.dInf == null) continue;
      const ap = S.cfg.env.aps.find((a) => a.id === s.id);
      g += `<circle cx="${ap.x}" cy="${Y(ap.y)}" r="${s.dInf}" fill="none" stroke="var(--ap)" stroke-width="${sw}" stroke-dasharray="${4 * u} ${4 * u}" opacity="0.55"/>`;
    }
  }
  // paredes
  for (const w of S.cfg.env.walls) {
    const sel = S.selected?.type === 'wall' && S.selected.id === w.id;
    g += `<line x1="${w.x1}" y1="${Y(w.y1)}" x2="${w.x2}" y2="${Y(w.y2)}" stroke="var(--wall)" stroke-width="${(sel ? 7 : 5) * u}" stroke-linecap="square"/>`;
    const mx = (w.x1 + w.x2) / 2, my = (w.y1 + w.y2) / 2;
    g += `<text x="${mx + 7 * u}" y="${Y(my) - 6 * u}" font-size="${fs}" fill="var(--wall)" font-weight="600" paint-order="stroke" stroke="var(--plan)" stroke-width="${3 * u}">${f(w.att, 1)} dB</text>`;
    if (sel) for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) g += `<rect x="${x - 6 * u}" y="${Y(y) - 6 * u}" width="${12 * u}" height="${12 * u}" fill="var(--panel)" stroke="var(--wall)" stroke-width="${2 * u}"/>`;
  }
  if (drag?.kind === 'newwall') g += `<line x1="${drag.a.x}" y1="${Y(drag.a.y)}" x2="${drag.b.x}" y2="${Y(drag.b.y)}" stroke="var(--wall)" stroke-width="${5 * u}" opacity="0.6"/>`;

  // vecinos k-NN
  if (L.b.ok) {
    for (const nb of L.b.neighbors) {
      g += `<line x1="${nb.x}" y1="${Y(nb.y)}" x2="${L.b.x}" y2="${Y(L.b.y)}" stroke="var(--mb)" stroke-width="${sw}" opacity="0.6"/>`;
      g += `<circle cx="${nb.x}" cy="${Y(nb.y)}" r="${5 * u}" fill="none" stroke="var(--mb)" stroke-width="${1.6 * u}"/>`;
    }
  }
  // líneas de error
  const errLine = (e, err, color) => e.ok ? `<line x1="${S.rx.x}" y1="${Y(S.rx.y)}" x2="${e.x}" y2="${Y(e.y)}" stroke="${color}" stroke-width="${1.6 * u}" stroke-dasharray="${5 * u} ${3 * u}"/>` : '';
  g += errLine(L.a, L.errA, 'var(--ma)') + errLine(L.b, L.errB, 'var(--mb)');

  // AP: triángulo
  for (const ap of S.cfg.env.aps) {
    const sel = S.selected?.type === 'ap' && S.selected.id === ap.id;
    const r = 9 * u, cx = ap.x, cy = Y(ap.y);
    const on = ap.enabled !== false;
    if (sel) g += `<circle cx="${cx}" cy="${cy}" r="${16 * u}" fill="none" stroke="var(--ap)" stroke-width="${1.5 * u}"/>`;
    g += `<polygon points="${cx},${cy - r} ${cx + r * 0.9},${cy + r * 0.7} ${cx - r * 0.9},${cy + r * 0.7}" fill="${on ? 'var(--ap)' : 'var(--plan)'}" stroke="var(--ap)" stroke-width="${1.6 * u}"/>`;
    g += `<text x="${cx}" y="${cy + 21 * u}" font-size="${fs}" text-anchor="middle" fill="var(--ap)" font-weight="600" paint-order="stroke" stroke="var(--plan)" stroke-width="${3 * u}">${esc(ap.id)}</text>`;
  }
  // estimaciones: A cuadrado, B rombo
  const tag = (x, y, t, color) => `<text x="${x > v.x + v.w - 95 * u ? x - 10 * u : x + 10 * u}" text-anchor="${x > v.x + v.w - 95 * u ? 'end' : 'start'}" y="${Y(y) - 8 * u}" font-size="${fs}" fill="${color}" font-weight="600" paint-order="stroke" stroke="var(--plan)" stroke-width="${3 * u}">${t}</text>`;
  if (L.a.ok) {
    const r = 6.5 * u;
    g += `<rect x="${L.a.x - r}" y="${Y(L.a.y) - r}" width="${2 * r}" height="${2 * r}" fill="var(--plan)" fill-opacity="0.6" stroke="var(--ma)" stroke-width="${2.2 * u}"/>` + tag(L.a.x, L.a.y, `A · ${f(L.errA)} m`, 'var(--ma)');
  }
  if (L.b.ok) {
    const r = 8 * u, x = L.b.x, y = Y(L.b.y);
    g += `<polygon points="${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}" fill="var(--plan)" fill-opacity="0.6" stroke="var(--mb)" stroke-width="${2.2 * u}"/>` + tag(L.b.x, L.b.y + (L.a.ok && Math.abs(L.a.y - L.b.y) < 14 * u && Math.abs(L.a.x - L.b.x) < 60 * u ? -18 * u : 0), `B · ${f(L.errB)} m`, 'var(--mb)');
  }
  // receptor real: círculo con retícula
  {
    const x = S.rx.x, y = Y(S.rx.y), r = 8 * u;
    g += `<circle cx="${x}" cy="${y}" r="${r}" fill="var(--fg)" stroke="var(--plan)" stroke-width="${1.5 * u}"/><line x1="${x - 14 * u}" y1="${y}" x2="${x + 14 * u}" y2="${y}" stroke="var(--fg)" stroke-width="${1.4 * u}"/><line x1="${x}" y1="${y - 14 * u}" x2="${x}" y2="${y + 14 * u}" stroke="var(--fg)" stroke-width="${1.4 * u}"/><circle cx="${x}" cy="${y}" r="${2.2 * u}" fill="var(--plan)"/>`;
  }
  svg.innerHTML = g;
  host.querySelector('#planLegendScale').innerHTML = overlayLegend();
}

function hit(p, ev) {
  const u = unit(), rad = (ev.pointerType === 'touch' ? 24 : 14) * u;
  if (Math.hypot(p.x - S.rx.x, p.y - S.rx.y) <= rad) return { kind: 'rx' };
  let best = null;
  for (const ap of S.cfg.env.aps) {
    const d = Math.hypot(p.x - ap.x, p.y - ap.y);
    if (d <= rad && (!best || d < best.d)) best = { kind: 'ap', id: ap.id, d };
  }
  if (best) return best;
  if (S.selected?.type === 'wall') {
    const w = S.cfg.env.walls.find((x) => x.id === S.selected.id);
    if (w) {
      if (Math.hypot(p.x - w.x1, p.y - w.y1) <= rad) return { kind: 'wallEnd', id: w.id, end: 1 };
      if (Math.hypot(p.x - w.x2, p.y - w.y2) <= rad) return { kind: 'wallEnd', id: w.id, end: 2 };
    }
  }
  for (const w of S.cfg.env.walls) {
    if (E.pointSegmentDistance(p, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 }) <= rad * 0.7) return { kind: 'wall', id: w.id };
  }
  return null;
}

function zoomAt(world, factor) {
  const v = S.view, room = S.cfg.env.room;
  const baseW = room.w + 1.5;
  S.viewFit = false;
  const nw = Math.min(baseW * 1.6, Math.max(baseW / 12, v.w * factor));
  const k = nw / v.w;
  const sx = world.x, sy = Y(world.y);
  S.view = { x: sx - (sx - v.x) * k, y: sy - (sy - v.y) * k, w: nw, h: v.h * k };
}
export function zoomBy(factor) {
  const v = S.view;
  zoomAt({ x: v.x + v.w / 2, y: Y(v.y + v.h / 2) }, factor);
  renderPlan();
}

function onDown(ev) {
  if (ev.button > 0) return;
  svg.setPointerCapture(ev.pointerId);
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    drag = null;
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), view: { ...S.view }, ctm: svg.getScreenCTM().inverse(), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    return;
  }
  const p = toWorld(ev);
  if (S.tool === 'ap') {
    const q = clampToRoom(p);
    const ap = { id: nextId('AP', S.cfg.env.aps), x: snap(q.x, 0.1), y: snap(q.y, 0.1), offset: 0, enabled: true };
    S.cfg.env.aps.push(ap);
    S.selected = { type: 'ap', id: ap.id }; S.tool = 'select';
    update(); return;
  }
  if (S.tool === 'wall') {
    const q = clampToRoom(p);
    drag = { kind: 'newwall', a: { x: snap(q.x, 0.1), y: snap(q.y, 0.1) }, b: { x: snap(q.x, 0.1), y: snap(q.y, 0.1) } };
    return;
  }
  const h = hit(p, ev);
  if (!h) { drag = { kind: 'pan', start: { x: ev.clientX, y: ev.clientY }, view: { ...S.view }, u: unit(), moved: false }; return; }
  if (h.kind === 'rx') drag = { kind: 'rx' };
  else if (h.kind === 'ap') { S.selected = { type: 'ap', id: h.id }; drag = { kind: 'ap', id: h.id }; }
  else if (h.kind === 'wallEnd') drag = { kind: 'wallEnd', id: h.id, end: h.end };
  else if (h.kind === 'wall') {
    const w = S.cfg.env.walls.find((x) => x.id === h.id);
    S.selected = { type: 'wall', id: h.id };
    drag = { kind: 'wall', id: h.id, p0: p, w0: { ...w } };
  }
  update();
}

function onMove(ev) {
  if (!pointers.has(ev.pointerId)) return;
  pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
  if (pinch && pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
    const room = S.cfg.env.room, baseW = room.w + 1.5;
    const nw = Math.min(baseW * 1.6, Math.max(baseW / 12, pinch.view.w * (pinch.d / d)));
    const k = nw / pinch.view.w;
    const anchor = new DOMPoint(pinch.mid.x, pinch.mid.y).matrixTransform(pinch.ctm);
    const rect = svg.getBoundingClientRect();
    const mx = ((a.x + b.x) / 2 - rect.left) / rect.width, my = ((a.y + b.y) / 2 - rect.top) / rect.height;
    S.viewFit = false;
    S.view = { x: anchor.x - mx * nw, y: anchor.y - my * pinch.view.h * k, w: nw, h: pinch.view.h * k };
    renderPlan(); return;
  }
  if (!drag) return;
  const p = toWorld(ev);
  if (drag.kind === 'pan') {
    const dx = (ev.clientX - drag.start.x) * drag.u, dy = (ev.clientY - drag.start.y) * drag.u;
    if (Math.abs(dx) + Math.abs(dy) > 3 * drag.u) drag.moved = true;
    if (drag.moved) S.viewFit = false;
    S.view = { ...drag.view, x: drag.view.x - dx, y: drag.view.y - dy };
    renderPlan(); return;
  }
  const q = clampToRoom(p);
  if (drag.kind === 'rx') S.rx = { x: snap(q.x), y: snap(q.y) };
  else if (drag.kind === 'ap') { const ap = S.cfg.env.aps.find((a) => a.id === drag.id); ap.x = snap(q.x); ap.y = snap(q.y); }
  else if (drag.kind === 'wallEnd') { const w = S.cfg.env.walls.find((x) => x.id === drag.id); w[`x${drag.end}`] = snap(q.x); w[`y${drag.end}`] = snap(q.y); }
  else if (drag.kind === 'wall') {
    const w = S.cfg.env.walls.find((x) => x.id === drag.id), r = S.cfg.env.room, o = drag.w0;
    let dx = p.x - drag.p0.x, dy = p.y - drag.p0.y;
    dx = Math.min(r.w - Math.max(o.x1, o.x2), Math.max(-Math.min(o.x1, o.x2), dx));
    dy = Math.min(r.h - Math.max(o.y1, o.y2), Math.max(-Math.min(o.y1, o.y2), dy));
    w.x1 = snap(o.x1 + dx); w.x2 = snap(o.x2 + dx); w.y1 = snap(o.y1 + dy); w.y2 = snap(o.y2 + dy);
  } else if (drag.kind === 'newwall') { drag.b = { x: snap(q.x, 0.1), y: snap(q.y, 0.1) }; renderPlan(); return; }
  update();
}

function onUp(ev) {
  pointers.delete(ev.pointerId);
  if (pointers.size < 2) pinch = null;
  const d = drag; drag = null;
  if (!d) return;
  if (d.kind === 'newwall') {
    if (Math.hypot(d.a.x - d.b.x, d.a.y - d.b.y) >= 0.3) {
      const w = { id: nextId('W', S.cfg.env.walls), x1: d.a.x, y1: d.a.y, x2: d.b.x, y2: d.b.y, att: 6 };
      S.cfg.env.walls.push(w); S.selected = { type: 'wall', id: w.id };
    }
    S.tool = 'select'; update(); return;
  }
  if (d.kind === 'pan' && !d.moved && S.selected) { S.selected = null; update(); return; }
  if (S.overlay.startsWith('err') && !S.heat && d.kind !== 'pan') { computeHeat(); renderPlan(); }
}

function onKey(ev) {
  const stepKey = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[ev.key];
  if (stepKey) {
    ev.preventDefault();
    const s = ev.shiftKey ? 0.5 : 0.1;
    const target = S.selected?.type === 'ap' ? S.cfg.env.aps.find((a) => a.id === S.selected.id) : S.rx;
    const q = clampToRoom({ x: target.x + stepKey[0] * s, y: target.y + stepKey[1] * s });
    target.x = snap(q.x); target.y = snap(q.y);
    update();
    if (S.overlay.startsWith('err') && !S.heat) { computeHeat(); renderPlan(); }
  } else if ((ev.key === 'Delete' || ev.key === 'Backspace') && S.selected) { deleteSelected(); }
}

export function deleteSelected() {
  if (!S.selected) return;
  const key = S.selected.type === 'ap' ? 'aps' : 'walls';
  S.cfg.env[key] = S.cfg.env[key].filter((x) => x.id !== S.selected.id);
  S.selected = null;
  update();
}

export function initPlan(container) {
  host = container;
  svg = container.querySelector('#plan');
  if (!S.view) fitView();
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('pointermove', onMove);
  svg.addEventListener('pointerup', onUp);
  svg.addEventListener('pointercancel', onUp);
  svg.addEventListener('wheel', (ev) => { ev.preventDefault(); zoomAt(toWorld(ev), ev.deltaY > 0 ? 1.15 : 1 / 1.15); renderPlan(); }, { passive: false });
  svg.addEventListener('keydown', onKey);
  let lastW = 0;
  new ResizeObserver(() => { if (S.viewFit && svg.clientWidth !== lastW) { lastW = svg.clientWidth; fitView(); } renderPlan(); }).observe(svg);
}
