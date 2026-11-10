# Pruebas realizadas

Ejecutadas el 10 de noviembre de 2026 sobre la versión que se entrega.

| Batería | Herramienta | Resultado |
|---|---|---|
| Motor matemático | Node v22.23.4, `node --test` | 46 de 46 correctas |
| Interfaz | Playwright 1.63 con Google Chrome for Testing 153.0.8010.12, sin cabeza | 26 de 26 correctas |

Entorno de las pruebas de interfaz: escritorio 1400 × 900 con ratón y teclado; móvil emulado 390 × 844, táctil, tema oscuro. Se cargó `dist/index.html` desde disco.

**Lo que no se probó:** teléfonos reales, Safari, Firefox, lectores de pantalla, la versión sin compilar servida por HTTP en un navegador, y la descarga de archivos. Ningún dato de hardware.

## Criterios de aceptación

| # | Criterio | Dónde se comprueba | Estado |
|---|---|---|---|
| 1 | Misma semilla y parámetros → resultados idénticos | motor: «(1) Dos ejecuciones…»; interfaz: Experimento 1 repetido da la misma huella | pasa |
| 2 | Sin ruido, el RSSI decrece con la distancia | motor: «(2) …» (incluye −60 dBm exactos a 10 m con n = 2) | pasa |
| 3 | Una pared reduce el RSSI según el modelo | motor: «(3) …»; interfaz: pared dibujada de 6 dB y editada a 10 dB | pasa |
| 4 | El método geométrico recupera posiciones conocidas en casos ideales | motor: error máximo < 10⁻⁶ m en 150 posiciones con 3, 4 y 6 AP; caso analítico (3, 4) | pasa |
| 5 | k-NN reproducible sobre calibración controlada | motor: «(5) …» con valores calculados a mano | pasa |
| 6 | Error medio, RMSE y percentiles correctos | motor: «(6) Estadísticas…» y «(6) Un experimento…» | pasa |
| 7 | Detección de geometría degenerada y datos insuficientes | motor: dos pruebas «(7) …»; interfaz: escena de 3 AP en línea y escena con 2 AP | pasa |
| 8 | El fingerprinting no usa muestras de evaluación | motor: dos pruebas «(8) …» | pasa |
| 9 | El CSV inválido se rechaza con mensajes comprensibles | motor: 18 casos de rechazo y uno de número de línea; interfaz: CSV inválido pegado | pasa |
| 10 | Mover transmisores y receptor actualiza mediciones y resultados | interfaz: arrastre de receptor y AP, alta y baja de AP, ΔP | pasa |
| 11 | Funciona en escritorio y móvil | interfaz: batería móvil (arrastre táctil, toque, pellizco, pestañas, sin desbordamiento horizontal) | pasa en emulación; sin probar en dispositivos reales |
| 12 | Sin excepciones de JavaScript | interfaz: última prueba, sobre todos los escenarios | pasa |

## Defectos encontrados por las pruebas y corregidos

- La multilateración no convergía en un 2–4 % de los casos con ruido. Causa: criterio de parada demasiado estricto para problemas mal condicionados. Se añadió un criterio por mejora relativa del costo y se amplió el máximo de iteraciones.
- Sin ruido, el método A tenía hasta 0,9 m de error cerca de los AP. Causa: una lectura saturada (d < d₀) se trataba como «d = d₀». Ahora es una restricción unilateral «d ≤ d₀».
- Cargar un ejercicio lanzaba una excepción al dibujar el plano con resultados de la escena anterior. Se corrigió el orden de actualización.
- Todas las pestañas se mostraban a la vez en la versión independiente (faltaba la regla CSS de `hidden`). La prueba móvil ahora verifica que solo haya una visible.
- En móvil, las etiquetas de los ejes del plano y de los gráficos se recortaban o se superponían.

## Salida de las pruebas del motor

```
ok 1 - RNG: misma semilla y etiquetas → misma secuencia; etiquetas distintas → secuencias distintas
ok 2 - RNG: la normal estándar tiene media ≈ 0 y desvío ≈ 1 (20 000 valores)
ok 3 - (1) Dos ejecuciones con iguales parámetros y semilla producen resultados idénticos
ok 4 - (2) Sin ruido, el RSSI decrece estrictamente con la distancia para d > d0 y vale lo que dice la fórmula
ok 5 - Distancias menores que d0: el RSSI se satura en P0 y la inversión lo declara
ok 6 - Inversión del modelo: d̂ recupera la distancia real sin ruido ni paredes
ok 7 - (3) Una pared atenuante reduce el RSSI exactamente en su atenuación, solo si corta la trayectoria
ok 8 - Intersección de segmentos: casos conocidos
ok 9 - Una lectura por debajo del piso de sensibilidad es señal faltante (null), no un número
ok 10 - (4) Método A: sin ruido recupera posiciones conocidas con error < 1e-6 m (3, 4 y 6 AP)
ok 11 - (4) Método A: caso analítico — AP en (0,0), (10,0), (0,10) y receptor en (3,4)
ok 12 - (4) Método A con ruido moderado: precisión coherente (no exacta, pero acotada)
ok 13 - (7) Método A informa AP insuficientes y no devuelve coordenadas
ok 14 - (7) Método A informa geometría degenerada (AP colineales) y no devuelve coordenadas
ok 15 - (5) k-NN: resultado conocido sobre una base controlada
ok 16 - k-NN: señales faltantes se sustituyen por el valor documentado; sin señal común → fallo explícito
ok 17 - (6) Estadísticas: media, mediana, RMSE y percentiles con valores conocidos
ok 18 - (6) Un experimento calcula sus métricas a partir de los errores por muestra
ok 19 - (8) La base de huellas rechaza muestras que no sean de calibración
ok 20 - (8) En un experimento, evaluación y calibración son conjuntos disjuntos (ids, posiciones y ruido)
ok 21 - Barrido controlado: cambiar solo la variable estudiada no altera posiciones ni sorteos compartidos
ok 22 - Ruido común entre condiciones: el RSSI de un AP no cambia al agregar otros AP
ok 23 - (9) CSV: el conjunto de ejemplo se importa sin errores y sobrevive a exportar → importar
ok 24 - (9) CSV rechaza: archivo vacío
ok 25 - (9) CSV rechaza: columna obligatoria ausente
ok 26 - (9) CSV rechaza: RSSI sin unidad en el encabezado
ok 27 - (9) CSV rechaza: RSSI no numérico
ok 28 - (9) CSV rechaza: RSSI positivo (unidad equivocada)
ok 29 - (9) CSV rechaza: RSSI fuera de rango físico
ok 30 - (9) CSV rechaza: coma decimal
ok 31 - (9) CSV rechaza: coordenada incompleta
ok 32 - (9) CSV rechaza: calibración sin posición
ok 33 - (9) CSV rechaza: unlabeled con posición
ok 34 - (9) CSV rechaza: rol desconocido
ok 35 - (9) CSV rechaza: coordenadas en otra unidad
ok 36 - (9) CSV rechaza: lectura duplicada
ok 37 - (9) CSV rechaza: muestra con coordenadas inconsistentes
ok 38 - (9) CSV rechaza: marca temporal inválida
ok 39 - (9) CSV rechaza: identificador vacío
ok 40 - (9) CSV rechaza: número de campos incorrecto
ok 41 - (9) CSV rechaza: solo encabezado
ok 42 - (9) CSV: los errores indican la línea; valores atípicos generan advertencia, no rechazo
ok 43 - CSV: sin columna role, nunca se infiere "calibration"; sin source queda "undeclared"
ok 44 - Sin ground truth no se calculan métricas de error de posicionamiento
ok 45 - Mapa de calor del error: dimensiones correctas y valores finitos, reproducible
ok 46 - Los cinco experimentos predefinidos se ejecutan sin excepciones y con huella estable
# tests 46
# pass 46
# fail 0
```

## Salida de las pruebas de interfaz

```
ok   - escritorio: la aplicación carga con una escena en funcionamiento
ok   - escritorio: arrastrar el receptor actualiza posición, RSSI y estimaciones
ok   - escritorio: arrastrar un AP lo mueve y lo selecciona
ok   - escritorio: agregar un AP, editar su ΔP y eliminarlo
ok   - escritorio: dibujar una pared reduce el RSSI del AP que queda detrás; su atenuación es editable
ok   - escritorio: «Nueva medición» cambia las lecturas con ruido y no mueve el receptor
ok   - escritorio: zoom con rueda y botones; «Ajustar» restablece la vista
ok   - escritorio: el teclado mueve el receptor
ok   - escritorio: geometría degenerada → el método A informa el fallo y no dibuja coordenadas
ok   - escritorio: menos de 3 AP → fallo explícito por AP insuficientes
ok   - escritorio: desvincular la calibración cambia la estimación A y no la B
ok   - escritorio: sin recalibración automática, mover un AP marca el mapa como desactualizado
ok   - escritorio: mapas de calor (RSSI y error) se dibujan
ok   - escritorio: Experimento 1 se ejecuta, muestra métricas y gráficos, y se repite con la misma huella
ok   - escritorio: los cinco experimentos predefinidos y uno personalizado corren desde la interfaz
ok   - escritorio: CSV de ejemplo se importa y analiza; las muestras sin posición no tienen error
ok   - escritorio: CSV inválido se rechaza con mensajes; sin ground truth no hay métricas
ok   - escritorio: los ejercicios cargan su escena en el laboratorio
ok   - móvil: carga sin desbordamiento horizontal
ok   - móvil: arrastrar el receptor con el dedo actualiza las mediciones
ok   - móvil: arrastrar un AP con el dedo y agregar otro con un toque
ok   - móvil: pellizco para acercar
ok   - móvil: todas las pestañas funcionan y ninguna desborda
ok   - móvil: un experimento se ejecuta y sus gráficos caben en pantalla
ok   - móvil: importar el ejemplo y abrir un ejercicio
ok   - ningún escenario produjo excepciones de JavaScript ni errores de consola

# pruebas de interfaz: 26 · correctas: 26 · fallidas: 0
```
