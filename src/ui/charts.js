// Gráficos SVG dibujados a la medida del contenedor (px reales, sin escalado de texto).
import { f } from './state.js';

const M = { l: 44, r: 16, t: 26, b: 34 };

function niceMax(v) {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * p) return m * p;
  return 10 * p;
}
function frame(width, height, yMax, yLabel, xLabel) {
  const W = width - M.l - M.r, H = height - M.t - M.b;
  let g = '';
  for (let i = 0; i <= 4; i++) {
    const y = M.t + H - (i / 4) * H, val = (yMax * i) / 4;
    g += `<line x1="${M.l}" y1="${y}" x2="${M.l + W}" y2="${y}" stroke="var(--grid)" stroke-width="1"/>`;
    g += `<text x="${M.l - 6}" y="${y + 4}" font-size="11" text-anchor="end" fill="var(--muted)">${+val.toFixed(2)}</text>`;
  }
  g += `<line x1="${M.l}" y1="${M.t + H}" x2="${M.l + W}" y2="${M.t + H}" stroke="var(--fg)" stroke-width="1"/>`;
  g += `<text x="${M.l + W}" y="${height - 4}" font-size="11" text-anchor="end" fill="var(--muted)">${xLabel}</text>`;
  g += `<text x="4" y="12" font-size="11" fill="var(--muted)">${yLabel}</text>`;
  return { g, W, H };
}
const svgWrap = (w, h, inner, label) => `<svg class="chart" role="img" aria-label="${label}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${inner}</svg>`;
const sq = (x, y, r, c) => `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" fill="${c}"/>`;
const dia = (x, y, r, c) => `<polygon points="${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}" fill="${c}"/>`;

/** Métrica frente a la variable estudiada. Eje x numérico a escala. */
export function sweepChart(conds, metric, metricLabel, xLabel, width) {
  const height = 240;
  const vals = conds.flatMap((c) => [c.result.summary.a[metric], c.result.summary.b[metric]]).filter((v) => v != null);
  const yMax = niceMax(Math.max(...vals, 0.01));
  const { g: g0, W, H } = frame(width, height, yMax, `${metricLabel} (m)`, xLabel);
  let g = g0;
  const xs = conds.map((c) => c.value);
  const lo = Math.min(...xs), hi = Math.max(...xs);
  const X = (v) => M.l + 14 + ((v - lo) / (hi - lo || 1)) * (W - 28);
  const Yp = (v) => M.t + H - (v / yMax) * H;
  for (const c of conds) g += `<text x="${X(c.value)}" y="${M.t + H + 14}" font-size="11" text-anchor="middle" fill="var(--fg)">${c.value}</text>`;
  for (const [k, color, mark] of [['a', 'var(--ma)', sq], ['b', 'var(--mb)', dia]]) {
    const pts = conds.map((c) => [X(c.value), c.result.summary[k][metric]]).filter((p) => p[1] != null);
    g += `<polyline points="${pts.map((p) => `${p[0]},${Yp(p[1])}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>`;
    for (const p of pts) g += `<g>${mark(p[0], Yp(p[1]), k === 'a' ? 4.5 : 5.5, color)}<title>Método ${k.toUpperCase()}: ${f(p[1], 3)} m</title></g>`;
  }
  return svgWrap(width, height, g, `${metricLabel} de cada método según ${xLabel}`);
}

/** Una sola condición: barras agrupadas por métrica. */
export function metricBars(summary, width) {
  const height = 240;
  const metrics = [['mean', 'Media'], ['median', 'Mediana'], ['rmse', 'RMSE'], ['p90', 'P90']];
  const yMax = niceMax(Math.max(...metrics.flatMap(([m]) => [summary.a[m] ?? 0, summary.b[m] ?? 0]), 0.01));
  const { g: g0, W, H } = frame(width, height, yMax, 'error (m)', '');
  let g = g0;
  const slot = W / metrics.length, bw = Math.min(34, slot / 3);
  metrics.forEach(([m, label], i) => {
    const cx = M.l + slot * (i + 0.5);
    [['a', 'var(--ma)', -bw - 1], ['b', 'var(--mb)', 1]].forEach(([k, color, off]) => {
      const v = summary[k][m];
      if (v == null) return;
      const h = (v / yMax) * H;
      g += `<rect x="${cx + off}" y="${M.t + H - h}" width="${bw}" height="${h}" fill="${color}"><title>${label} ${k.toUpperCase()}: ${f(v, 3)} m</title></rect>`;
      g += `<text x="${cx + off + bw / 2}" y="${M.t + H - h - 4}" font-size="10.5" text-anchor="middle" fill="var(--fg)">${f(v)}</text>`;
    });
    g += `<text x="${cx}" y="${M.t + H + 14}" font-size="11" text-anchor="middle" fill="var(--fg)">${label}</text>`;
  });
  return svgWrap(width, height, g, 'Métricas de error de ambos métodos');
}

/** Error de cada muestra de evaluación. Los fallos se marcan con una raya en el borde superior. */
export function perSampleChart(rows, width) {
  const height = 220;
  const errs = rows.flatMap((r) => [r.a.err, r.b.err]).filter((v) => v != null);
  const yMax = niceMax(Math.max(...errs, 0.01));
  const { g: g0, W, H } = frame(width, height, yMax, 'error (m)', `muestra de evaluación 1 … ${rows.length}`);
  let g = g0;
  const X = (i) => M.l + 4 + (i / Math.max(1, rows.length - 1)) * (W - 8);
  rows.forEach((r, i) => {
    for (const [k, color, mark, rad] of [['a', 'var(--ma)', sq, 2], ['b', 'var(--mb)', dia, 2.8]]) {
      if (r[k].ok) g += mark(X(i), M.t + H - (r[k].err / yMax) * H, rad, color);
      else g += `<line x1="${X(i)}" y1="${M.t}" x2="${X(i)}" y2="${M.t + 8}" stroke="${color}" stroke-width="2"/>`;
    }
  });
  return svgWrap(width, height, g, 'Error de posicionamiento por muestra');
}

/** Distribución del error: mismos intervalos para ambos métodos. */
export function histChart(rows, width) {
  const height = 220;
  const ea = rows.filter((r) => r.a.ok).map((r) => r.a.err), eb = rows.filter((r) => r.b.ok).map((r) => r.b.err);
  const xMax = niceMax(Math.max(...ea, ...eb, 0.01));
  const nb = 20;
  const bin = (xs) => { const c = new Array(nb).fill(0); for (const x of xs) c[Math.min(nb - 1, Math.floor((x / xMax) * nb))]++; return c; };
  const ha = bin(ea), hb = bin(eb);
  const yMax = Math.max(4, Math.ceil(Math.max(...ha, ...hb) / 4) * 4);
  const { g: g0, W, H } = frame(width, height, yMax, 'muestras por intervalo', 'error (m)');
  let g = g0;
  const bw = W / nb;
  for (let i = 0; i < nb; i++) {
    const x = M.l + i * bw;
    if (ha[i]) g += `<rect x="${x + 1}" y="${M.t + H - (ha[i] / yMax) * H}" width="${bw / 2 - 1}" height="${(ha[i] / yMax) * H}" fill="var(--ma)"><title>A: ${ha[i]} muestras entre ${f((i * xMax) / nb)} y ${f(((i + 1) * xMax) / nb)} m</title></rect>`;
    if (hb[i]) g += `<rect x="${x + bw / 2}" y="${M.t + H - (hb[i] / yMax) * H}" width="${bw / 2 - 1}" height="${(hb[i] / yMax) * H}" fill="var(--mb)"><title>B: ${hb[i]} muestras entre ${f((i * xMax) / nb)} y ${f(((i + 1) * xMax) / nb)} m</title></rect>`;
  }
  for (let i = 0; i <= 4; i++) g += `<text x="${M.l + (i / 4) * W}" y="${M.t + H + 14}" font-size="11" text-anchor="middle" fill="var(--fg)">${+((xMax * i) / 4).toFixed(2)}</text>`;
  return svgWrap(width, height, g, 'Distribución del error de posicionamiento');
}

export const LEGEND = '<div class="legend"><span><i class="k-a"></i>Método A · multilateración</span><span><i class="k-b"></i>Método B · k-NN</span></div>';
