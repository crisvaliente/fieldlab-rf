// Aprendizaje integrado: conceptos, fórmulas, hipótesis del modelo y ejercicios guiados.
import * as E from '../engine/index.js';
import { S, loadScene, update } from './state.js';

const CONCEPTS = [
  ['Qué representa RSSI', `<p>RSSI (<em>Received Signal Strength Indicator</em>) es la potencia con la que el receptor capta una señal, expresada en dBm: decibelios respecto de 1 mW. Es una escala logarítmica: −40 dBm es una señal fuerte, −90 dBm está cerca del límite de detección, y cada −10 dB significa diez veces menos potencia.</p><p>En un ESP32 el valor llega como un entero y depende del chip, la antena y su orientación. Dos dispositivos en el mismo lugar pueden informar valores distintos.</p>`],
  ['Por qué RSSI no equivale a distancia', `<p>La potencia media sí disminuye con la distancia, pero cada lectura individual también depende de reflexiones, obstáculos, personas, orientación de antenas e interferencia. Como la relación es logarítmica, un error pequeño en dB se convierte en un error <em>multiplicativo</em> en metros: con n = 2,5, una lectura 3 dB más baja de lo esperado alarga la distancia inferida un 32 %, sea a 2 m o a 20 m.</p><p>Probalo en el laboratorio: pulsá «Nueva medición» varias veces sin mover el receptor y mirá cómo cambia la columna «d inferida».</p>`],
  ['El exponente de pérdida de trayectoria n', `<p>n indica con qué rapidez cae la potencia al alejarse. En espacio libre vale 2. En interiores suele citarse entre 1,6 (pasillos que guían la señal) y 4 o más (ambientes con muchos obstáculos); son valores orientativos de la bibliografía, no mediciones de esta aplicación.</p><p>n no es una constante universal: es un parámetro que se ajusta a cada entorno.</p>`],
  ['Qué efecto tienen las paredes', `<p>En este modelo, cada pared que corta la línea recta entre el AP y el receptor resta una cantidad fija de dB. El método geométrico no sabe que la pared existe: interpreta esa pérdida como distancia adicional y desplaza la estimación.</p><p>En la realidad la atenuación depende del material, el espesor, el ángulo y la frecuencia, y la señal también llega por caminos reflejados. Aquí nada de eso se simula.</p>`],
  ['Qué significa calibrar un modelo', `<p>Calibrar es elegir los parámetros del modelo (P₀ y n) para que reproduzca mediciones hechas en posiciones conocidas del entorno real. En esta aplicación hay dos juegos de parámetros: los del <strong>modelo verdadero</strong>, que genera los datos, y los del <strong>estimador</strong>, que los interpreta. Cuando coinciden, la calibración es correcta. Si los separás (pestaña Modelo), simulás un estimador mal calibrado.</p><p>El fingerprinting calibra de otra forma: no ajusta parámetros, guarda directamente las mediciones.</p>`],
  ['Cómo funciona k-NN', `<p>Primero se mide el vector de RSSI en una grilla de posiciones conocidas: el mapa de huellas. Para ubicar una medición nueva, se calcula su distancia (en dB) a cada huella, se eligen las k más parecidas y se promedian sus posiciones.</p><p>No supone ningún modelo de propagación, así que absorbe paredes y particularidades del lugar. A cambio exige una campaña de medición, su resolución está limitada por el paso de la grilla, y el mapa envejece: si se mueve un AP o un mueble grande, hay que recalibrar.</p>`],
  ['Qué significa RMSE', `<p>Es la raíz del error cuadrático medio: se eleva cada error al cuadrado, se promedia y se saca la raíz. Se expresa en metros, igual que la media, pero castiga más los errores grandes. Si RMSE es bastante mayor que el error medio, hay unas pocas estimaciones muy malas.</p><p>Aquí siempre se refiere al error <em>espacial</em> (distancia entre posición estimada y real), nunca al error de RSSI en dB.</p>`],
  ['Por qué funciona en datos sintéticos y falla en un entorno real', `<p>Los datos sintéticos salen del mismo modelo que el estimador supone. El algoritmo juega con ventaja: la forma de la ley de propagación es exactamente la correcta y el ruido es gaussiano, independiente y de varianza conocida.</p><p>En un edificio real hay multitrayecto, desvanecimiento correlacionado en el espacio y en el tiempo, antenas no isotrópicas, personas que se mueven, interferencia y diferencias entre dispositivos. Un resultado obtenido aquí indica cómo se comporta el algoritmo bajo hipótesis ideales; no predice su precisión en campo.</p>`],
];

const FORMULAS = `
<div class="formula"><div class="eq">RSSI(d) = P₀ + ΔP − 10·n·log₁₀( max(d, d₀) / d₀ ) − Σ L<sub>pared</sub> + ε</div>
<dl class="kv"><dt>P₀</dt><dd>RSSI de referencia a la distancia d₀ (dBm)</dd><dt>ΔP</dt><dd>diferencia propia de cada AP (dB); 0 por defecto</dd><dt>n</dt><dd>exponente de pérdida de trayectoria</dd><dt>d, d₀</dt><dd>distancia AP–receptor y distancia de referencia (m). Para d &lt; d₀ se usa d₀: el RSSI se satura en P₀</dd><dt>L<sub>pared</sub></dt><dd>atenuación de cada pared que corta la línea recta AP–receptor (dB)</dd><dt>ε</dt><dd>ruido gaussiano de media 0 y desvío σ (dB), independiente en cada lectura</dd></dl></div>
<div class="formula"><div class="eq">d̂ = d₀ · 10<sup>(P₀ − RSSI) / (10·n)</sup></div><p class="fine">Inversión del modelo que usa el método A, con los P₀ y n que supone el estimador. Si RSSI ≥ P₀ solo puede afirmarse d̂ ≤ d₀.</p></div>
<div class="formula"><div class="eq">p̂ = argmin<sub>p</sub> Σ<sub>i</sub> w<sub>i</sub> · ( ‖p − a<sub>i</sub>‖ − d̂<sub>i</sub> )²,   w<sub>i</sub> = 1 / d̂<sub>i</sub>²</div><p class="fine">Método A. a<sub>i</sub> es la posición del AP i. Se resuelve con Levenberg–Marquardt desde tres puntos de partida.</p></div>
<div class="formula"><div class="eq">D(q, f) = √( (1/M) · Σ<sub>i</sub> (q<sub>i</sub> − f<sub>i</sub>)² )</div><p class="fine">Método B. Distancia en dB entre el vector medido q y una huella f sobre los M AP del mapa. Un AP sin señal cuenta como −100 dBm.</p></div>
<div class="formula"><div class="eq">e<sub>j</sub> = ‖p̂<sub>j</sub> − p<sub>j</sub>‖   ·   media = (1/N) Σ e<sub>j</sub>   ·   RMSE = √( (1/N) Σ e<sub>j</sub>² )</div><p class="fine">Error espacial de la muestra j, en metros. La mediana y el percentil 90 son los valores por debajo de los cuales queda el 50 % y el 90 % de los errores (interpolación lineal). La tasa de fallos es la fracción de intentos sin estimación; esos intentos no entran en las demás métricas.</p></div>`;

const LIMITS = `<ul class="reading">
<li><strong>Principio físico:</strong> la potencia media decae con la distancia siguiendo aproximadamente una ley de potencia. Es lo único que el modelo toma de la física.</li>
<li><strong>Simplificaciones:</strong> dos dimensiones; antenas isotrópicas; un solo camino en línea recta; paredes como pérdida fija sin reflexión ni difracción; ruido gaussiano independiente entre lecturas, AP y posiciones; mismo n en todo el recinto; sin interferencia, sin canales, sin movimiento.</li>
<li><strong>Datos sintéticos:</strong> todo lo que muestran el laboratorio y los experimentos fue generado por este modelo con un generador pseudoaleatorio.</li>
<li><strong>Mediciones importadas:</strong> solo las que cargues en la pestaña Datos. La aplicación muestra el origen que declara el archivo y no lo verifica.</li>
<li><strong>Resultados calculados:</strong> estimaciones y métricas. Heredan las limitaciones de los datos con los que se calculan.</li>
<li><strong>Sin validar en campo:</strong> este prototipo no se probó con hardware real.</li></ul>`;

const EXERCISES = [
  {
    title: 'Ejercicio 1 · Una lectura no es una distancia',
    goal: 'Ver cuánto se mueve la distancia inferida cuando el receptor no se mueve.',
    load: () => { const c = E.liveScene(); c.env.walls = []; c.env.model.sigma = 4; loadScene(c, { rx: { x: 8, y: 4 } }); },
    steps: [
      'Cargá la escena: cuatro AP, sin paredes, ruido σ = 4 dB.',
      'En Laboratorio, pulsá «Nueva medición» diez veces sin mover el receptor. Anotá el menor y el mayor valor de «d inferida» para AP1 y comparalos con «d real».',
      'Subí «Lecturas por medición» a 10 y repetí. ¿Cuánto se estrecha el rango?',
      'Arrastrá el receptor hasta quedar a menos de 1 m de un AP. Mirá el asterisco en «d real» y el «≤» en «d inferida»: ahí el modelo se satura.',
    ],
    expect: 'Con una lectura, la distancia inferida a un AP lejano puede variar varios metros. Promediar 10 lecturas reduce el desvío del RSSI a cerca de σ/√10 ≈ 1,3 dB.',
  },
  {
    title: 'Ejercicio 2 · La pared que el modelo no conoce',
    goal: 'Aislar el sesgo que introduce una pared, sin ruido que lo tape.',
    load: () => {
      const c = E.liveScene(); c.env.model.sigma = 0;
      c.env.walls = [{ id: 'W1', x1: 5, y1: 0, x2: 5, y2: 8, att: 8 }];
      loadScene(c, { rx: { x: 9, y: 3 }, selected: { type: 'wall', id: 'W1' } });
    },
    steps: [
      'Cargá la escena: σ = 0 y una pared de 8 dB que divide el recinto. El receptor queda a la derecha.',
      'En la tabla Señales, compará «d real» y «d inferida» de AP1 y AP4, que están del otro lado. Anotá el error del método A y del método B.',
      'Con la pared seleccionada, bajá su atenuación a 0 dB. El error de A debería caer a 0,00 m. El de B no: su resolución está limitada por la grilla.',
      'Volvé a 8 dB y abrí Experimentos → «3 · Paredes» para ver el mismo efecto sobre 200 posiciones.',
    ],
    expect: 'Con 8 dB y n = 2,5, la distancia inferida a través de la pared es 10^(8/25) ≈ 2,1 veces la real. El método B casi no cambia, porque su mapa se midió con la pared puesta.',
    exp: 'exp3',
  },
  {
    title: 'Ejercicio 3 · Calibrar y descalibrar',
    goal: 'Encontrar el n correcto mirando el error, y comprobar que un mapa de huellas envejece.',
    load: () => {
      const c = E.baseConfig(); c.env.model.sigma = 2; c.assumed.n = 3.5;
      loadScene(c, { rx: { x: 4, y: 5 }, linked: false });
    },
    steps: [
      'Cargá la escena: seis AP, σ = 2 dB. El estimador supone n = 3,5 pero los datos se generan con n = 2,5.',
      'Mirá los círculos punteados (distancias inferidas): quedan cortos y no se cruzan en el receptor. Anotá el error de A.',
      'En Modelo → Estimador, cambiá «n supuesto» de a 0,25 hasta minimizar el error de A. ¿En qué valor ocurre? Movete a otras tres posiciones para confirmar que no fue casualidad.',
      'Ahora el mapa: en Modelo → Fingerprinting desactivá «Recalibrar automáticamente» y arrastrá AP3 dos metros. Aparece el aviso de mapa desactualizado y el error de B crece. Pulsá «Recalibrar».',
      'Abrí Experimentos → «4 · Calibración» para medir el efecto de n sobre 200 posiciones.',
    ],
    expect: 'El error de A es mínimo cerca de n = 2,5. Un n supuesto mayor que el real acorta todas las distancias; uno menor las alarga. B no depende de n, pero sí de que la escena no cambie después de calibrar.',
    exp: 'exp4',
  },
];

export function initLearn(el, go) {
  el.innerHTML = `
  <div class="card"><h3>Ejercicios guiados</h3>
    ${EXERCISES.map((x, i) => `<details class="exercise" ${i === 0 ? 'open' : ''}><summary>${x.title}</summary>
      <p><strong>Objetivo.</strong> ${x.goal}</p>
      <ol>${x.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
      <p class="fine"><strong>Qué deberías observar.</strong> ${x.expect}</p>
      <div class="row"><button class="btn primary" data-ex="${i}">Cargar la escena en el laboratorio</button>${x.exp ? `<button class="btn" data-exp="${x.exp}">Abrir el experimento relacionado</button>` : ''}</div></details>`).join('')}
  </div>
  <div class="card"><h3>Conceptos</h3>${CONCEPTS.map(([t, body], i) => `<details ${i === 0 ? 'open' : ''}><summary>${t}</summary><div class="prose">${body}</div></details>`).join('')}</div>
  <div class="card"><h3>Fórmulas</h3>${FORMULAS}</div>
  <div class="card"><h3>Qué es física, qué es suposición y qué es dato</h3>${LIMITS}</div>`;
  el.querySelectorAll('[data-ex]').forEach((b) => b.addEventListener('click', () => { EXERCISES[Number(b.dataset.ex)].load(); update(); go('lab'); }));
  el.querySelectorAll('[data-exp]').forEach((b) => b.addEventListener('click', () => go('exp', b.dataset.exp)));
}
