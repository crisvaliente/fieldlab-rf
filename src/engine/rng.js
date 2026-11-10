// Generador pseudoaleatorio reproducible. Sin dependencias, sin estado global.
// - hashSeed: FNV-1a de 32 bits sobre las etiquetas, para derivar flujos independientes.
// - mulberry32: PRNG de 32 bits de estado (suficiente para simulación didáctica, NO criptográfico).
// - Normal estándar por Box-Muller (dos uniformes por cada valor; sin caché, para que el
//   consumo del flujo sea fácil de razonar).

export function hashSeed(...parts) {
  const s = parts.map((p) => String(p)).join('\u001f');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // mezcla final (avalancha) para que semillas vecinas no den flujos parecidos
  h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Crea un flujo identificado por (semilla, ...etiquetas). Mismas etiquetas → misma secuencia. */
export function makeRng(seed, ...labels) {
  const next = mulberry32(hashSeed(seed, ...labels));
  return {
    next,
    uniform(a = 0, b = 1) { return a + (b - a) * next(); },
    gaussian() {
      let u = next();
      if (u < 1e-12) u = 1e-12;
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };
}
