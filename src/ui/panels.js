// Paneles del laboratorio en vivo (instrumentos) y del modelo.
import { S, f, esc, update, recalibrate } from './state.js';

const chip = (ok, text) => `<span class="chip ${ok ? 'ok' : 'bad'}">${text}</span>`;

export function renderPositioning(el) {
  const L = S.live;
  const row = (name, cls, e, err) => `<tr>
    <th scope="row"><span class="sym ${cls}"></span>${name}</th>
    <td class="num">${e.ok ? `(${f(e.x)}, ${f(e.y)})` : '—'}</td>
    <td class="num strong">${e.ok ? f(err) + ' m' : '—'}</td>
    <td>${e.ok ? chip(true, 'disponible') : chip(false, 'sin estimación')}</td></tr>
    ${e.ok ? '' : `<tr class="reason"><td colspan="4">${esc(e.reason)}</td></tr>`}`;
  const outside = (e) => e.ok && (e.x < 0 || e.y < 0 || e.x > S.cfg.env.room.w || e.y > S.cfg.env.room.h);
  el.innerHTML = `
  <table class="readout">
    <thead><tr><th></th><th class="num">x, y (m)</th><th class="num">error espacial</th><th>estado</th></tr></thead>
    <tbody>
      <tr><th scope="row"><span class="sym s-rx"></span>Posición real</th><td class="num">(${f(S.rx.x)}, ${f(S.rx.y)})</td><td class="num muted">referencia</td><td></td></tr>
      ${row('A · multilateración', 's-a', L.a, L.errA)}
      ${row(`B · k-NN (k = ${L.cfg.knn.k})`, 's-b', L.b, L.errB)}
    </tbody>
  </table>
  ${outside(L.a) ? '<p class="note warn">La estimación A cae fuera del recinto. Se muestra tal cual: el algoritmo no la recorta.</p>' : ''}
  ${L.stale ? '<p class="note warn">El mapa de huellas está desactualizado: la escena cambió después de calibrar. El método B usa huellas que ya no describen este entorno. <button class="btn small" data-act="recal">Recalibrar</button></p>' : ''}
  ${L.b.ok && L.b.kReduced ? `<p class="note warn">k = ${L.b.k} supera los ${L.b.kUsed} puntos de calibración: se usan todos.</p>` : ''}`;
  el.querySelector('[data-act="recal"]')?.addEventListener('click', () => { recalibrate(); update(); });
}

export function renderSignals(el) {
  const L = S.live;
  const rows = L.signals.map((s) => `<tr class="${s.enabled ? '' : 'off'}">
    <th scope="row"><button class="link" data-ap="${esc(s.id)}">${esc(s.id)}</button></th>
    <td class="num strong">${!s.enabled ? 'apagado' : s.rssi == null ? '<span class="chip bad">sin señal</span>' : f(s.rssi, 1)}</td>
    <td class="num">${f(s.dTrue)}${s.clamped ? '<sup title="Menor que d₀: el modelo se satura">*</sup>' : ''}</td>
    <td class="num">${s.dInf == null ? '—' : (s.saturated ? '≤ ' : '') + f(s.dInf)}</td>
    <td class="num">${s.wallLoss ? f(s.wallLoss, 1) + ` <span class="muted">(${s.crossed.length})</span>` : '0'}</td>
    <td class="num">${s.burstStd == null ? '—' : f(s.burstStd, 2)}</td>
    <td class="num muted">${s.burstMin == null ? '—' : f(s.burstMin, 0) + ' … ' + f(s.burstMax, 0)}</td></tr>`).join('');
  el.innerHTML = `<div class="scroll-x"><table class="data">
    <thead><tr><th>AP</th><th class="num">RSSI<br><small>dBm</small></th><th class="num">d real<br><small>m</small></th><th class="num">d inferida<br><small>m</small></th><th class="num">paredes<br><small>dB (n.º)</small></th><th class="num">desvío medido<br><small>dB, 30 lect.</small></th><th class="num">rango<br><small>dBm</small></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="7" class="muted">No hay puntos de acceso. Agregá uno con «+ AP».</td></tr>'}</tbody></table></div>
  <p class="fine">RSSI: ${S.reads === 1 ? 'una lectura' : `promedio de ${S.reads} lecturas`} (medición n.º ${S.tick + 1}). «d inferida» invierte el modelo supuesto y no conoce las paredes. «desvío medido» y «rango» salen de una ráfaga aparte de 30 lecturas en esta misma posición.</p>`;
  el.querySelectorAll('[data-ap]').forEach((b) => b.addEventListener('click', () => { S.selected = { type: 'ap', id: b.dataset.ap }; update(); }));
}

export function renderIntermediates(el) {
  const L = S.live, a = L.a, b = L.b;
  const openA = el.querySelector('#detA')?.open, openB = el.querySelector('#detB')?.open;
  const aRows = a.distances.map((d) => `<tr><th scope="row">${esc(d.apId)}</th><td class="num">${f(d.rssi, 1)}</td><td class="num">${d.d == null ? '—' : (d.saturated ? '≤ ' : '') + f(d.d, 3)}</td><td class="num">${f(d.fitDistance, 3)}</td><td class="num">${f(d.residual, 3)}</td></tr>`).join('');
  const apIds = S.db ? S.db.apIds : [];
  const vec = (r) => apIds.map((id) => (r[id] == null ? '∅' : f(r[id], 1))).join(' · ');
  const bRows = b.neighbors.map((n, i) => `<tr><th scope="row">${i + 1}</th><td class="num">(${f(n.x)}, ${f(n.y)})</td><td class="num">${f(n.dist, 2)}</td><td class="num">${f(n.weight, 3)}</td><td class="num mono-s">${vec(n.rssi)}</td></tr>`).join('');
  el.innerHTML = `
  <details id="detA" ${openA ? 'open' : ''}><summary>Método A · valores intermedios</summary>
    <p class="fine">Modelo supuesto: P₀ = ${f(L.cfg.assumed.p0, 1)} dBm, n = ${f(L.cfg.assumed.n, 2)}, d₀ = ${f(L.cfg.assumed.d0, 2)} m · pesos ${L.cfg.tri.weighted ? '1/d̂²' : 'uniformes'}</p>
    <div class="scroll-x"><table class="data"><thead><tr><th>AP</th><th class="num">RSSI<br><small>dBm</small></th><th class="num">d̂ inferida<br><small>m</small></th><th class="num">‖p̂ − AP‖<br><small>m</small></th><th class="num">residuo<br><small>m</small></th></tr></thead><tbody>${aRows}</tbody></table></div>
    ${a.ok ? `<dl class="kv"><dt>AP usados</dt><dd>${a.nUsed}</dd><dt>Dispersión de los AP</dt><dd>${f(a.spread, 3)} <span class="muted">(0 = colineales)</span></dd><dt>Punto de partida elegido</dt><dd>${a.start} (${f(a.startPoint.x)}, ${f(a.startPoint.y)})</dd><dt>Iteraciones L–M</dt><dd>${a.iterations}</dd><dt>Costo J(p̂)</dt><dd>${a.cost.toExponential(3)}</dd><dt>Residuo RMS de distancia</dt><dd>${f(a.residualRms, 3)} m</dd></dl>` : `<p class="note bad">${esc(a.reason)}</p>`}
  </details>
  <details id="detB" ${openB ? 'open' : ''}><summary>Método B · vectores y vecinos</summary>
    <p class="fine">Mapa de huellas: ${S.db.points.length} puntos de calibración · AP en el mapa: ${apIds.map(esc).join(', ') || '—'} · orden de los vectores: ${apIds.map(esc).join(' · ')} · ∅ = sin señal (cuenta como ${S.db.missingValue} dBm)</p>
    <dl class="kv"><dt>Vector medido</dt><dd class="mono-s">${vec(L.sample.rssi)}</dd>${b.ok && b.ignoredAps.length ? `<dt>AP ignorados (no están en el mapa)</dt><dd>${b.ignoredAps.map(esc).join(', ')}</dd>` : ''}${b.ok && b.missingInQuery.length ? `<dt>Faltan en la medición</dt><dd>${b.missingInQuery.map(esc).join(', ')}</dd>` : ''}</dl>
    ${b.ok ? `<div class="scroll-x"><table class="data"><thead><tr><th>#</th><th class="num">posición<br><small>m</small></th><th class="num">D<br><small>dB</small></th><th class="num">peso</th><th class="num">huella<br><small>dBm</small></th></tr></thead><tbody>${bRows}</tbody></table></div>` : `<p class="note bad">${esc(b.reason)}</p>`}
  </details>`;
}

export function renderInspector(el) {
  const sel = S.selected;
  if (!sel) { el.innerHTML = '<p class="fine">Tocá un AP o una pared para ver y editar sus parámetros. Arrastrá el receptor (círculo con retícula) para moverlo. Con el plano enfocado, las flechas mueven el receptor o el AP seleccionado.</p>'; return; }
  const num = (label, key, val, step, unit, min, max) => `<label class="field"><span>${label}</span><span class="inp"><input type="number" id="insp-${key}" data-k="${key}" value="${val}" step="${step}" ${min != null ? `min="${min}"` : ''} ${max != null ? `max="${max}"` : ''}><em>${unit}</em></span></label>`;
  const room = S.cfg.env.room;
  if (sel.type === 'ap') {
    const ap = S.cfg.env.aps.find((a) => a.id === sel.id);
    if (!ap) { S.selected = null; el.innerHTML = ''; return; }
    const sig = S.live.signals.find((s) => s.id === ap.id);
    el.innerHTML = `<div class="insp-head"><strong><span class="sym s-ap"></span>${esc(ap.id)}</strong><span class="muted">RSSI medio en el receptor: ${f(sig?.mean, 1)} dBm · distancia ${f(sig?.dTrue)} m</span></div>
      <div class="fields">${num('x', 'x', +ap.x.toFixed(2), 0.1, 'm', 0, room.w)}${num('y', 'y', +ap.y.toFixed(2), 0.1, 'm', 0, room.h)}${num('ΔP del AP', 'offset', ap.offset || 0, 0.5, 'dB', -30, 30)}
      <label class="check"><input type="checkbox" id="insp-enabled" data-k="enabled" ${ap.enabled !== false ? 'checked' : ''}> Encendido</label>
      <button class="btn danger" data-act="del">Eliminar AP</button></div>
      <p class="fine">ΔP es una diferencia de potencia propia de este AP respecto de P₀. El estimador no la conoce: sirve para estudiar un transmisor mal calibrado.</p>`;
    bind(el, ap);
  } else {
    const w = S.cfg.env.walls.find((x) => x.id === sel.id);
    if (!w) { S.selected = null; el.innerHTML = ''; return; }
    el.innerHTML = `<div class="insp-head"><strong><span class="sym s-wall"></span>Pared ${esc(w.id)}</strong><span class="muted">longitud ${f(Math.hypot(w.x2 - w.x1, w.y2 - w.y1))} m</span></div>
      <div class="fields">${num('Atenuación', 'att', w.att, 0.5, 'dB', 0, 40)}${num('x₁', 'x1', +w.x1.toFixed(2), 0.1, 'm', 0, room.w)}${num('y₁', 'y1', +w.y1.toFixed(2), 0.1, 'm', 0, room.h)}${num('x₂', 'x2', +w.x2.toFixed(2), 0.1, 'm', 0, room.w)}${num('y₂', 'y2', +w.y2.toFixed(2), 0.1, 'm', 0, room.h)}
      <button class="btn danger" data-act="del">Eliminar pared</button></div>`;
    bind(el, w);
  }
}

function bind(el, obj) {
  el.querySelectorAll('input[data-k]').forEach((inp) => inp.addEventListener('change', () => {
    if (inp.type === 'checkbox') obj[inp.dataset.k] = inp.checked;
    else {
      let v = Number(inp.value);
      if (!Number.isFinite(v)) return;
      if (inp.min !== '') v = Math.max(Number(inp.min), v);
      if (inp.max !== '') v = Math.min(Number(inp.max), v);
      obj[inp.dataset.k] = v;
    }
    update();
  }));
  el.querySelector('[data-act="del"]').addEventListener('click', () => {
    const key = S.selected.type === 'ap' ? 'aps' : 'walls';
    S.cfg.env[key] = S.cfg.env[key].filter((x) => x.id !== S.selected.id);
    S.selected = null; update();
  });
}
