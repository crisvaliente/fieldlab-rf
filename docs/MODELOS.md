# Modelos y algoritmos

## 1. Modelo de propagación (genera los datos sintéticos)

```
RSSI(d) = P0 + ΔP − 10·n·log10( max(d, d0) / d0 ) − Σ L_pared + ε,     ε ~ N(0, σ²)
```

| Símbolo | Significado | Valor inicial |
|---|---|---|
| P0 | RSSI de referencia a la distancia d0 (dBm) | −40 dBm |
| ΔP | diferencia propia de cada AP (dB) | 0 dB |
| n | exponente de pérdida de trayectoria | 2,5 |
| d0 | distancia de referencia (m) | 1 m |
| L_pared | atenuación de cada pared que corta el segmento AP–receptor (dB) | 6 dB por pared |
| σ | desvío del ruido por lectura (dB) | 3 dB |
| piso | sensibilidad: por debajo, la lectura falta | −95 dBm |

Los valores iniciales son elecciones convenientes para estudiar, no mediciones.

**Distancias menores que d0.** Se usa `max(d, d0)`: el RSSI se satura en `P0 + ΔP − L`. Evita que el logaritmo diverja cuando d → 0 y deja explícito que el modelo no describe el campo cercano.

**Paredes.** Una pared es un segmento. Atenúa si corta el segmento recto entre AP y receptor (tocar un extremo cuenta). Las atenuaciones se suman.

**Ruido.** Gaussiano en dB, independiente entre lecturas, AP y posiciones.

**Lecturas faltantes.** Si una lectura cae por debajo del piso se informa como ausente (`null`), nunca como número.

**Varias lecturas.** Cuando se promedian M lecturas, se promedian en dB las que no faltan. Descartar las que caen bajo el piso sesga el promedio hacia arriba cerca del límite de sensibilidad.

### Qué es física y qué es suposición

- Principio físico: la potencia media decae con la distancia aproximadamente como una ley de potencia.
- Suposiciones: dos dimensiones; antenas isotrópicas; un único camino recto; paredes sin reflexión ni difracción; ruido gaussiano sin correlación espacial ni temporal; n uniforme; sin interferencia ni canales.

No es una simulación electromagnética.

## 2. Método A: distancia desde RSSI y multilateración

**Inversión.** Con los parámetros que supone el estimador (pueden diferir de los verdaderos):

```
d̂ = d0 · 10^((P0 − RSSI) / (10·n))
```

Si `RSSI ≥ P0` solo puede afirmarse `d̂ ≤ d0`; la lectura se marca como saturada.

El estimador conoce las posiciones de los AP. No conoce las paredes ni ΔP.

**Función objetivo.**

```
J(p) = Σ_i  w_i · r_i(p)²
r_i(p) = ‖p − a_i‖ − d̂_i                      lectura normal
r_i(p) = max(0, ‖p − a_i‖ − d0)               lectura saturada (restricción unilateral)
w_i = 1 / d̂_i²      (opción por defecto)   o   w_i = 1
```

El peso `1/d̂²` responde a que el ruido gaussiano en dB produce un error multiplicativo en la distancia: `σ_d ≈ (ln 10 / (10 n)) · σ · d`. Minimizar los residuos relativos es, a primer orden, equivalente a ajustar en el dominio logarítmico.

**Procedimiento numérico.** Levenberg–Marquardt en dos incógnitas. En cada iteración se forman `H = JᵀWJ` y `g = JᵀWr`, se resuelve `(H + λ·diag(H))·s = −g` en forma cerrada (2×2), y se acepta el paso si el costo no aumenta (λ ← λ/3); si aumenta, λ ← 4λ y se reintenta. Termina cuando el paso es menor que 10⁻⁶ m, cuando la mejora del costo cae por debajo de la precisión numérica, o cuando ningún paso mejora. Tras 3000 iteraciones sin cumplir esos criterios, se acepta solo si el último paso fue menor que 1 mm.

Se parte de tres puntos y se conserva el mínimo de menor costo:

1. solución lineal por diferencia de ecuaciones (restando la del último AP);
2. centroide de los AP ponderado por `1/d̂²`;
3. centroide simple de los AP.

**Cuándo no hay estimación.**

| Estado | Condición |
|---|---|
| `ap_insuficientes` | menos de 3 AP con lectura |
| `geometria_degenerada` | los AP con lectura son casi colineales: razón entre las desviaciones principales menor y mayor de sus posiciones < 0,05 |
| `sin_convergencia` | ninguna de las tres partidas converge o el resultado no es finito |

En esos casos `x` e `y` valen `null`. Una estimación que cae fuera del recinto se devuelve sin recortar y la interfaz lo avisa.

**Valores intermedios que muestra la interfaz:** d̂ por AP, distancia ajustada, residuo, AP usados, dispersión, punto de partida elegido, iteraciones, costo y residuo RMS.

## 3. Método B: fingerprinting con k-NN

**Mapa de huellas.** Grilla regular centrada en celdas (paso configurable, 1 m por defecto). En cada punto se toman varias lecturas (5 por defecto) y se guarda el RSSI medio por AP.

**Métrica.**

```
D(q, f) = sqrt( (1/M) · Σ_i (q_i − f_i)² )        [dB]
```

sobre los M AP presentes en el mapa. Un AP sin lectura se sustituye por −100 dBm en cualquiera de los dos vectores; si falta en ambos, aporta 0. Los AP de la medición que no están en el mapa se ignoran y se informan.

**Estimación.** Se ordenan las huellas por D (empates por orden de inserción), se toman las k primeras y se promedian sus posiciones con pesos `1/(D + 0,001)` o uniformes. Si k supera el número de huellas se usan todas y se avisa.

**Cuándo no hay estimación.** `sin_calibracion` (mapa vacío) y `sin_senal_comun` (la medición no tiene ninguna lectura de los AP del mapa).

**Separación de datos.** La base solo acepta muestras con rol `calibration`. Ver [ARQUITECTURA.md](ARQUITECTURA.md).

## 4. Métricas

Error espacial de una muestra: `e = ‖p̂ − p‖` en metros. Nunca se mezcla con errores de RSSI en dB.

| Métrica | Definición |
|---|---|
| Error medio | `(1/N) Σ e` |
| Error mediano | percentil 50 |
| RMSE | `sqrt((1/N) Σ e²)` |
| Percentil 90 | valor bajo el cual queda el 90 % de los errores; interpolación lineal entre estadísticos de orden (método 7 de Hyndman–Fan, el de NumPy por defecto) |
| Muestras evaluadas | intentos totales y estimaciones obtenidas |
| Tasa de fallos | intentos sin estimación / intentos totales |

Las cuatro primeras se calculan solo sobre las estimaciones obtenidas. Hay que leerlas junto con la tasa de fallos: un método que se abstiene en los casos difíciles mejora su media.

## 5. Reproducibilidad

- PRNG mulberry32 (32 bits de estado), sembrado con un hash FNV-1a de `(semilla, etiquetas…)`.
- Posiciones de evaluación: flujo `(semilla, "eval-pos")`.
- Ruido: flujo `(semilla, "noise", rol, medición, índice de muestra, id de AP)`.
- La huella de un experimento es un hash de 32 bits de todos los errores por muestra (redondeados a 10⁻⁹ m) y estados. Dos corridas idénticas dan la misma huella.

Es adecuado para simulación didáctica. No es un generador criptográfico ni de calidad para estudios estadísticos exigentes.
