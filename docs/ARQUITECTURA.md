# Arquitectura

Aplicación web estática. JavaScript con módulos ES, sin framework y sin dependencias en ejecución. La única dependencia de desarrollo es esbuild, que se usa para generar la versión de un solo archivo; la aplicación funciona sin compilar.

## Dos capas

```
src/engine/   motor matemático. No toca el DOM. Se ejecuta igual en Node y en el navegador.
src/ui/       interfaz. Importa el motor; el motor no importa nada de la interfaz.
```

### Motor (`src/engine/`)

| Módulo | Responsabilidad |
|---|---|
| `rng.js` | Generador pseudoaleatorio con semilla (mulberry32), derivación de flujos por etiquetas (FNV-1a), normal estándar (Box–Muller). |
| `geometry.js` | Distancias e intersección de segmentos. |
| `propagation.js` | Modelo log-distancia, atenuación por paredes, piso de sensibilidad, inversión RSSI → distancia. |
| `trilateration.js` | Método A: multilateración por mínimos cuadrados no lineales. |
| `fingerprint.js` | Método B: base de huellas y k-NN. |
| `stats.js` | Media, mediana, RMSE, percentiles, histograma, resumen con tasa de fallos. |
| `dataset.js` | Generación de muestras sintéticas: grilla de calibración y posiciones de evaluación. |
| `csv.js` | Lectura, validación y escritura del esquema CSV. |
| `experiment.js` | Evaluación de una configuración, barridos de una variable, mapa de calor del error, análisis de conjuntos importados, huella de resultados. |
| `scenario.js` | Escenas y experimentos predefinidos (datos, no lógica). |

Todas las funciones son puras: reciben una configuración y devuelven resultados. No hay estado global ni `Math.random()`.

### Interfaz (`src/ui/`)

| Módulo | Responsabilidad |
|---|---|
| `state.js` | Estado único `S`, derivación de la medición y las estimaciones en vivo, calibración del mapa de huellas. |
| `plan.js` | Plano SVG: dibujo, arrastre con Pointer Events (ratón y táctil), zoom con rueda y pellizco, teclado. |
| `panels.js` | Posicionamiento, señales, valores intermedios, inspector de AP y paredes. |
| `charts.js` | Gráficos SVG dibujados al ancho real del contenedor. |
| `experiments.js` | Modo Experimento. |
| `data.js` | Importación, análisis y exportación CSV. |
| `learn.js` | Conceptos, fórmulas y ejercicios guiados. |
| `main.js` | Estructura de la página, pestañas y enlace de controles. |

Flujo: un control o un gesto modifica `S` → `update()` llama a `derive()` (usa el motor) → cada panel se vuelve a dibujar a partir de `S.live`.

Desde la consola del navegador, `FieldLab.S` expone el estado y `FieldLab.E` el motor, para auditar cualquier número que aparezca en pantalla.

## Decisiones

- **Sin React.** La especificación lo dejaba a criterio. La interfaz son unos pocos paneles que se regeneran desde el estado; React habría añadido una dependencia, un paso de compilación obligatorio y nada que este prototipo necesite.
- **SVG para el plano y los gráficos.** Pocos cientos de elementos; el mapa de calor más denso tiene unas 2300 celdas.
- **Selección por geometría, no por elemento.** El plano se redibuja completo en cada movimiento; el gesto se captura en el `<svg>` y el elemento tocado se calcula por distancia en metros, con un radio mayor para el dedo que para el ratón.
- **Reproducibilidad por flujos.** Cada número aleatorio sale de un flujo identificado por `(semilla, propósito, rol, muestra, AP)`. Cambiar el número de AP, σ o el tamaño del conjunto de evaluación no desplaza los sorteos de lo demás. Así, las condiciones de un experimento comparten posiciones y ruido, y la diferencia entre ellas se debe solo a la variable estudiada.
- **Separación calibración / evaluación en tres niveles.** Las muestras llevan un campo `role`; `buildFingerprintDb` lanza una excepción si recibe una que no sea de calibración; las posiciones de evaluación son aleatorias continuas y usan un flujo de ruido distinto del de la grilla; `evaluateConfig` comprueba además que ningún identificador de evaluación esté en la base.
- **Fallos explícitos.** Los estimadores devuelven `{ ok: false, status, reason, x: null, y: null }`. La interfaz no dibuja nada para una estimación fallida, y las estadísticas cuentan los fallos aparte.

## Integración futura con ESP32

El punto de entrada previsto es el CSV (ver [CSV.md](CSV.md)): un firmware que registre `sample_id, ap_id, rssi_dbm` y, cuando se conozca, la posición. `analyzeDataset` ya procesa esas muestras con los mismos algoritmos. Para una conexión directa (Web Serial) bastaría un módulo nuevo en `src/ui/` que convierta líneas en muestras con la misma forma; el motor no cambiaría. Esa conexión no está implementada.
