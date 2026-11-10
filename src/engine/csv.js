// Importación / exportación CSV en formato largo: una fila por (muestra, AP).
// Esquema documentado en docs/CSV.md. La validación es "todo o nada": si hay errores,
// el archivo se rechaza completo y se listan con número de línea.

export const CSV_COLUMNS = ['experiment_id', 'sample_id', 'ap_id', 'rssi_dbm', 'x_m', 'y_m', 'role', 'timestamp_iso', 'source'];
export const CSV_REQUIRED = ['experiment_id', 'sample_id', 'ap_id', 'rssi_dbm'];
export const RSSI_MIN = -120, RSSI_MAX = 0, RSSI_WARN_HIGH = -20, RSSI_WARN_LOW = -100, COORD_ABS_MAX = 1000;

const ROLE_ALIASES = {
  calibration: 'calibration', calibracion: 'calibration', 'calibración': 'calibration',
  evaluation: 'evaluation', evaluacion: 'evaluation', 'evaluación': 'evaluation',
  unlabeled: 'unlabeled', sin_etiqueta: 'unlabeled', '': null,
};

export function parseCsvText(text, delimiter) {
  const rows = [];
  let row = [], field = '', inQ = false, line = 1, rowLine = 1;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQ) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else { if (c === '\n') line++; field += c; }
    } else if (c === '"') inQ = true;
    else if (c === delimiter) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0].trim() !== '') rows.push({ line: rowLine, cells: row });
      row = []; line++; rowLine = line;
    } else field += c;
  }
  row.push(field);
  if (row.length > 1 || row[0].trim() !== '') rows.push({ line: rowLine, cells: row });
  return { rows, unterminatedQuote: inQ };
}

function detectDelimiter(text) {
  const first = text.replace(/^﻿/, '').split(/\r?\n/)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0 };
  for (const c of first) if (c in counts) counts[c]++;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parseNumber(raw) {
  const t = raw.trim();
  if (t === '') return { empty: true };
  if (/^-?\d+,\d+$/.test(t)) return { error: `"${t}" usa coma decimal; el esquema exige punto decimal (por ejemplo ${t.replace(',', '.')}).` };
  if (!/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(t)) return { error: `"${t}" no es un número.` };
  return { value: Number(t) };
}

/**
 * @param {string} text
 * @param {{room?:{w:number,h:number}}} opts  Si se pasa el recinto, las coordenadas fuera de él generan advertencia.
 * @returns {{ok:boolean, errors:Array, warnings:Array, samples:Array, meta:Object}}
 */
export function importCsv(text, opts = {}) {
  const errors = [], warnings = [];
  const err = (line, field, message) => { if (errors.length < 200) errors.push({ line, field, message }); };
  const warn = (line, field, message) => { if (warnings.length < 200) warnings.push({ line, field, message }); };
  const fail = () => ({ ok: false, errors, warnings, samples: [], meta: {} });

  if (typeof text !== 'string' || text.trim() === '') { err(0, null, 'El archivo está vacío.'); return fail(); }
  const delimiter = detectDelimiter(text);
  const { rows, unterminatedQuote } = parseCsvText(text, delimiter);
  if (unterminatedQuote) err(0, null, 'Hay una comilla doble sin cerrar.');
  if (!rows.length) { err(0, null, 'El archivo no tiene encabezado.'); return fail(); }

  const header = rows[0].cells.map((h) => h.trim().toLowerCase());
  const col = {};
  header.forEach((h, i) => {
    if (h in col) err(1, h, `Columna repetida: "${h}".`);
    col[h] = i;
  });
  for (const req of CSV_REQUIRED) {
    if (!(req in col)) {
      let hint = '';
      if (req === 'rssi_dbm' && header.some((h) => h.startsWith('rssi'))) hint = ' Hay una columna RSSI sin unidad en el nombre: debe llamarse rssi_dbm y estar en dBm.';
      err(1, req, `Falta la columna obligatoria "${req}".${hint}`);
    }
  }
  if (('x_m' in col) !== ('y_m' in col)) err(1, 'x_m/y_m', 'Las columnas x_m e y_m deben estar ambas o ninguna.');
  for (const h of header) {
    if (!CSV_COLUMNS.includes(h)) {
      if (h === 'x' || h === 'y') err(1, h, `La columna "${h}" no indica unidad: usá ${h}_m (metros).`);
      else warn(1, h, `Columna desconocida "${h}": se ignora.`);
    }
  }
  if (errors.length) return fail();

  const get = (r, name) => (name in col ? (r.cells[col[name]] ?? '').trim() : '');
  const samples = new Map();
  const seenPairs = new Set();
  let nRows = 0, nMissing = 0;

  for (const r of rows.slice(1)) {
    nRows++;
    if (r.cells.length !== header.length) { err(r.line, null, `La fila tiene ${r.cells.length} campos y el encabezado ${header.length}.`); continue; }
    const experimentId = get(r, 'experiment_id'), sampleId = get(r, 'sample_id'), apId = get(r, 'ap_id');
    if (!experimentId) err(r.line, 'experiment_id', 'experiment_id vacío.');
    if (!sampleId) err(r.line, 'sample_id', 'sample_id vacío.');
    if (!apId) err(r.line, 'ap_id', 'ap_id vacío.');

    let rssi = null;
    const rv = parseNumber(get(r, 'rssi_dbm'));
    if (rv.error) err(r.line, 'rssi_dbm', rv.error);
    else if (rv.empty) nMissing++;
    else if (rv.value > RSSI_MAX) err(r.line, 'rssi_dbm', `RSSI ${rv.value} dBm es positivo: ¿está en otra unidad (mW, %, valor absoluto)? Se esperan dBm entre ${RSSI_MIN} y ${RSSI_MAX}.`);
    else if (rv.value < RSSI_MIN) err(r.line, 'rssi_dbm', `RSSI ${rv.value} dBm está por debajo de ${RSSI_MIN} dBm: fuera del rango físico admitido.`);
    else {
      rssi = rv.value;
      if (rssi > RSSI_WARN_HIGH) warn(r.line, 'rssi_dbm', `RSSI ${rssi} dBm es inusualmente alto (> ${RSSI_WARN_HIGH} dBm).`);
      else if (rssi < RSSI_WARN_LOW) warn(r.line, 'rssi_dbm', `RSSI ${rssi} dBm es inusualmente bajo (< ${RSSI_WARN_LOW} dBm).`);
    }

    const xv = parseNumber(get(r, 'x_m')), yv = parseNumber(get(r, 'y_m'));
    let x = null, y = null;
    if (xv.error) err(r.line, 'x_m', xv.error);
    if (yv.error) err(r.line, 'y_m', yv.error);
    if (!xv.error && !yv.error) {
      if (!!xv.empty !== !!yv.empty) err(r.line, 'x_m/y_m', 'Coordenada incompleta: x_m e y_m deben estar ambas o ninguna.');
      else if (!xv.empty) {
        x = xv.value; y = yv.value;
        if (Math.abs(x) > COORD_ABS_MAX || Math.abs(y) > COORD_ABS_MAX) err(r.line, 'x_m/y_m', `Coordenada (${x}, ${y}) fuera de ±${COORD_ABS_MAX} m: ¿está en cm o mm?`);
        else if (opts.room && (x < 0 || y < 0 || x > opts.room.w || y > opts.room.h)) warn(r.line, 'x_m/y_m', `La posición (${x}, ${y}) m cae fuera del recinto actual (${opts.room.w} × ${opts.room.h} m).`);
      }
    }

    const roleRaw = get(r, 'role').toLowerCase();
    let role = ROLE_ALIASES[roleRaw];
    if (role === undefined) { err(r.line, 'role', `Rol "${roleRaw}" no reconocido: usá calibration, evaluation o unlabeled.`); role = null; }
    const hasPos = x != null;
    if (role == null) role = hasPos ? 'evaluation' : 'unlabeled'; // nunca se infiere "calibration"
    if ((role === 'calibration' || role === 'evaluation') && !hasPos) err(r.line, 'role', `El rol "${role}" exige posición conocida (x_m, y_m).`);
    if (role === 'unlabeled' && hasPos) err(r.line, 'role', 'Una muestra "unlabeled" no debe traer coordenadas; si la posición es conocida, declarala como calibration o evaluation.');

    const ts = get(r, 'timestamp_iso');
    if (ts && (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(ts) || Number.isNaN(Date.parse(ts.replace(' ', 'T'))))) {
      err(r.line, 'timestamp_iso', `"${ts}" no es una marca temporal ISO 8601 (ejemplo: 2026-11-10T14:30:00Z).`);
    }
    const sourceRaw = get(r, 'source').toLowerCase();
    if (sourceRaw && !['synthetic', 'measured'].includes(sourceRaw)) err(r.line, 'source', `source "${sourceRaw}" no reconocido: usá synthetic o measured.`);
    const source = sourceRaw || 'undeclared';

    if (!sampleId || !apId || !experimentId) continue;
    const key = `${experimentId}\u001f${sampleId}`;
    const pair = `${key}\u001f${apId}`;
    if (seenPairs.has(pair)) { err(r.line, 'ap_id', `Fila duplicada: la muestra "${sampleId}" ya tiene una lectura del AP "${apId}".`); continue; }
    seenPairs.add(pair);
    let smp = samples.get(key);
    if (!smp) {
      smp = { id: sampleId, experimentId, role, x, y, rssi: {}, source, timestamp: ts || null, line: r.line };
      samples.set(key, smp);
    } else {
      if (smp.role !== role) err(r.line, 'role', `La muestra "${sampleId}" tiene roles distintos en filas diferentes (${smp.role} en la línea ${smp.line}, ${role} aquí).`);
      if (smp.x !== x || smp.y !== y) err(r.line, 'x_m/y_m', `La muestra "${sampleId}" tiene coordenadas distintas en filas diferentes (línea ${smp.line}).`);
      if (smp.source !== source) err(r.line, 'source', `La muestra "${sampleId}" declara orígenes distintos en filas diferentes.`);
    }
    smp.rssi[apId] = rssi;
  }
  if (nRows === 0) err(0, null, 'El archivo solo tiene encabezado: no hay mediciones.');
  if (errors.length) return fail();

  const list = [...samples.values()];
  for (const s of list) {
    delete s.line;
    if (Object.values(s.rssi).every((v) => v == null)) warn(0, 'rssi_dbm', `La muestra "${s.id}" no tiene ninguna lectura válida.`);
  }
  const count = (role) => list.filter((s) => s.role === role).length;
  return {
    ok: true, errors, warnings, samples: list,
    meta: {
      delimiter, rows: nRows, missingReadings: nMissing,
      experiments: [...new Set(list.map((s) => s.experimentId))],
      apIds: [...new Set(list.flatMap((s) => Object.keys(s.rssi)))].sort(),
      sources: [...new Set(list.map((s) => s.source))],
      counts: { calibration: count('calibration'), evaluation: count('evaluation'), unlabeled: count('unlabeled') },
    },
  };
}

function q(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Exporta muestras al esquema documentado. Una lectura faltante se escribe como campo vacío. */
export function exportCsv(samples) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const s of samples) {
    for (const ap of Object.keys(s.rssi).sort()) {
      const v = s.rssi[ap];
      lines.push([
        q(s.experimentId), q(s.id), q(ap), v == null ? '' : v.toFixed(2),
        s.x == null ? '' : s.x.toFixed(3), s.y == null ? '' : s.y.toFixed(3),
        s.role, q(s.timestamp || ''), s.source === 'undeclared' ? '' : (s.source || ''),
      ].join(','));
    }
  }
  return lines.join('\n') + '\n';
}
