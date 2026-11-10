// Escenas y experimentos predefinidos. Son datos, no lógica.
import { DEFAULT_MODEL } from './propagation.js';
import { clone } from './experiment.js';
import { generateSamples, gridPositions, randomPositions } from './dataset.js';
import { exportCsv } from './csv.js';

export const STANDARD_APS = [
  { id: 'AP1', x: 1, y: 1 }, { id: 'AP2', x: 11, y: 1.5 }, { id: 'AP3', x: 6, y: 7 },
  { id: 'AP4', x: 1, y: 7 }, { id: 'AP5', x: 11, y: 7 }, { id: 'AP6', x: 6, y: 0.8 },
].map((a) => ({ ...a, offset: 0, enabled: true }));

export const STANDARD_WALLS = [
  { id: 'W1', x1: 4, y1: 0, x2: 4, y2: 5, att: 6 },
  { id: 'W2', x1: 7.5, y1: 4, x2: 12, y2: 4, att: 6 },
];

/** Configuración base de los experimentos predefinidos: recinto 12 × 8 m, 6 AP, sin paredes. */
export function baseConfig(overrides = {}) {
  return {
    env: { room: { w: 12, h: 8 }, aps: clone(STANDARD_APS), walls: [], model: { ...DEFAULT_MODEL } },
    assumed: { p0: DEFAULT_MODEL.p0, n: DEFAULT_MODEL.n, d0: DEFAULT_MODEL.d0 },
    tri: { weighted: true }, knn: { k: 3, weighted: true },
    cal: { spacing: 1, reads: 5 }, eval: { n: 200, reads: 1 }, seed: 20261110,
    ...overrides,
  };
}

/** Escena inicial del laboratorio en vivo: 4 AP y una pared. */
export function liveScene() {
  const c = baseConfig();
  c.env.aps = clone(STANDARD_APS).slice(0, 4);
  c.env.walls = [clone(STANDARD_WALLS[0])];
  return c;
}

export const PRESETS = [
  {
    id: 'exp1', title: '1 · Tres AP frente a seis',
    hypothesis: 'Con más puntos de acceso bien distribuidos el error medio de ambos métodos disminuye, porque cada estimación promedia más mediciones independientes.',
    variable: 'apCount', values: [3, 4, 6],
    controlled: 'Recinto, modelo (P₀, n, σ = 3 dB), sin paredes, calibración correcta, mismas posiciones de evaluación y mismos sorteos de ruido para los AP compartidos.',
    build: () => baseConfig(),
  },
  {
    id: 'exp2', title: '2 · Ruido RSSI creciente',
    hypothesis: 'El error espacial crece con σ. Con σ = 0 el método geométrico es exacto; el fingerprinting conserva un error residual por la discretización de la grilla.',
    variable: 'sigma', values: [0, 1, 2, 3, 4, 6, 8],
    controlled: '6 AP, sin paredes, calibración correcta. La base de huellas se mide en el mismo entorno, por lo que su ruido también cambia con σ (es parte del efecto estudiado).',
    build: () => baseConfig(),
  },
  {
    id: 'exp3', title: '3 · Paredes entre transmisor y receptor',
    hypothesis: 'El método geométrico ignora las paredes: cada pared atravesada se interpreta como distancia extra y sesga la posición. El fingerprinting, calibrado en el mismo entorno, absorbe ese efecto.',
    variable: 'wallAtt', values: [0, 3, 6, 10],
    controlled: '6 AP, dos paredes fijas (misma geometría en todas las condiciones), σ = 3 dB, modelo supuesto sin cambios.',
    build: () => { const c = baseConfig(); c.env.walls = clone(STANDARD_WALLS); return c; },
  },
  {
    id: 'exp4', title: '4 · Calibración correcta frente a desajustada',
    hypothesis: 'Si el estimador supone un exponente n distinto del real (2,5), las distancias inferidas quedan sistemáticamente cortas o largas y el error del método geométrico aumenta. k-NN no usa n, así que no debería cambiar.',
    variable: 'nAssumed', values: [1.5, 2, 2.5, 3, 3.5],
    controlled: '6 AP, sin paredes, σ = 3 dB. Solo cambia el n que usa el estimador; los datos generados son idénticos en todas las condiciones.',
    build: () => baseConfig(),
  },
  {
    id: 'exp5', title: '5 · Geométrico frente a fingerprinting',
    hypothesis: 'En un recinto con paredes que el modelo geométrico desconoce, k-NN tendrá menor error medio que la multilateración, a costa de requerir una campaña de calibración.',
    variable: 'none', values: [],
    controlled: 'Una única escena (6 AP, dos paredes de 6 dB, σ = 3 dB). La variable es el algoritmo: ambos reciben exactamente las mismas mediciones.',
    build: () => { const c = baseConfig(); c.env.walls = clone(STANDARD_WALLS); return c; },
  },
];

/** Conjunto de ejemplo para la importación CSV. Es SINTÉTICO (lo declara en la columna source). */
export function exampleDatasetCsv() {
  const c = liveScene();
  const seed = 7;
  const cal = generateSamples(c.env, gridPositions(c.env.room, 2), { seed, role: 'calibration', reads: 3, experimentId: 'ejemplo-sintetico' });
  const ev = generateSamples(c.env, randomPositions(c.env.room, 8, seed), { seed, role: 'evaluation', experimentId: 'ejemplo-sintetico' });
  const un = generateSamples(c.env, randomPositions(c.env.room, 4, seed + 1), { seed, role: 'unlabeled', prefix: 'sn', experimentId: 'ejemplo-sintetico' });
  ev[2].rssi.AP2 = null; // una lectura faltante, para ejercitar ese camino
  return exportCsv([...cal, ...ev, ...un]);
}
