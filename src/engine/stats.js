// Estadística descriptiva del ERROR ESPACIAL (metros). No mezclar con error de RSSI (dB).

export function mean(xs) {
  if (!xs.length) return null;
  let s = 0; for (const x of xs) s += x;
  return s / xs.length;
}

/** Desviación estándar muestral (n−1). */
export function stdev(xs) {
  if (xs.length < 2) return null;
  const m = mean(xs);
  let s = 0; for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

/** Percentil p ∈ [0,100] con interpolación lineal entre estadísticos de orden (método 7 de Hyndman–Fan, el de NumPy/Excel PERCENTILE.INC). */
export function percentile(xs, p) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const h = (s.length - 1) * (p / 100);
  const lo = Math.floor(h), hi = Math.ceil(h);
  return s[lo] + (s[hi] - s[lo]) * (h - lo);
}

export function median(xs) { return percentile(xs, 50); }

/** RMSE = sqrt(media(e²)). Penaliza más los errores grandes que la media. */
export function rmse(xs) {
  if (!xs.length) return null;
  let s = 0; for (const x of xs) s += x * x;
  return Math.sqrt(s / xs.length);
}

/**
 * Resumen de un conjunto de intentos de posicionamiento.
 * errors: errores en metros de las estimaciones EXITOSAS. nFailed: intentos sin estimación.
 * Las métricas de error se calculan solo sobre las exitosas; la tasa de fallos se informa aparte
 * (hay que leer ambas juntas: descartar los casos difíciles mejora artificialmente la media).
 */
export function summarize(errors, nFailed = 0) {
  const nOk = errors.length;
  const nTotal = nOk + nFailed;
  return {
    nTotal, nOk, nFailed,
    failRate: nTotal ? nFailed / nTotal : null,
    mean: mean(errors),
    median: median(errors),
    rmse: rmse(errors),
    p90: percentile(errors, 90),
    max: nOk ? Math.max(...errors) : null,
  };
}

export function histogram(xs, nBins, max) {
  const top = max ?? (xs.length ? Math.max(...xs) : 1);
  const width = top > 0 ? top / nBins : 1;
  const bins = Array.from({ length: nBins }, (_, i) => ({ x0: i * width, x1: (i + 1) * width, count: 0 }));
  for (const x of xs) {
    const i = Math.min(nBins - 1, Math.max(0, Math.floor(x / width)));
    bins[i].count++;
  }
  return bins;
}
