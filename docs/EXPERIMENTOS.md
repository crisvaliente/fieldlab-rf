# Experimentos de ejemplo

Resultados de los cinco experimentos predefinidos, tal como los produce el motor con su configuración por defecto. Se regeneran idénticos desde la pestaña Experimentos o con `runSweep` en Node; la huella permite comprobarlo.

**Son resultados de simulación.** Describen cómo se comportan los algoritmos sobre datos generados por el propio modelo log-distancia. No son mediciones y no predicen la precisión en un edificio real.

Escena base: recinto de 12 × 8 m, 6 AP, P₀ = −40 dBm, n = 2,5, d₀ = 1 m, σ = 3 dB. Mapa de huellas: grilla de 1 m (96 puntos), 5 lecturas por punto, k = 3 ponderado. Evaluación: 200 posiciones aleatorias, una lectura por AP.

### 1 · Tres AP frente a seis

**Hipótesis.** Con más puntos de acceso bien distribuidos el error medio de ambos métodos disminuye, porque cada estimación promedia más mediciones independientes.

**Controlado.** Recinto, modelo (P₀, n, σ = 3 dB), sin paredes, calibración correcta, mismas posiciones de evaluación y mismos sorteos de ruido para los AP compartidos.

Semilla 20261110 · 200 posiciones · huella `64aea41a`

| Condición | Método | Estimadas | Media (m) | Mediana (m) | RMSE (m) | P90 (m) |
|---|---|---|---|---|---|---|
| 3 AP | A | 200/200 | 1.85 | 1.49 | 2.43 | 3.35 |
| 3 AP | B | 200/200 | 1.67 | 1.36 | 2.06 | 2.93 |
| 4 AP | A | 200/200 | 1.55 | 1.19 | 2.09 | 2.90 |
| 4 AP | B | 200/200 | 1.36 | 1.13 | 1.69 | 2.38 |
| 6 AP | A | 200/200 | 1.02 | 0.91 | 1.15 | 1.75 |
| 6 AP | B | 200/200 | 0.96 | 0.88 | 1.10 | 1.69 |

Comparación pareada en la última condición: A mejor en 97, B mejor en 103 de 200; diferencia media A − B = 0.05 m.

### 2 · Ruido RSSI creciente

**Hipótesis.** El error espacial crece con σ. Con σ = 0 el método geométrico es exacto; el fingerprinting conserva un error residual por la discretización de la grilla.

**Controlado.** 6 AP, sin paredes, calibración correcta. La base de huellas se mide en el mismo entorno, por lo que su ruido también cambia con σ (es parte del efecto estudiado).

Semilla 20261110 · 200 posiciones · huella `36dffb8d`

| Condición | Método | Estimadas | Media (m) | Mediana (m) | RMSE (m) | P90 (m) |
|---|---|---|---|---|---|---|
| 0 dB | A | 200/200 | 0.00 | 0.00 | 0.00 | 0.00 |
| 0 dB | B | 200/200 | 0.21 | 0.18 | 0.25 | 0.37 |
| 1 dB | A | 200/200 | 0.36 | 0.32 | 0.43 | 0.67 |
| 1 dB | B | 200/200 | 0.40 | 0.39 | 0.44 | 0.67 |
| 2 dB | A | 200/200 | 0.72 | 0.64 | 0.83 | 1.27 |
| 2 dB | B | 200/200 | 0.65 | 0.61 | 0.73 | 1.10 |
| 3 dB | A | 200/200 | 1.02 | 0.91 | 1.15 | 1.75 |
| 3 dB | B | 200/200 | 0.96 | 0.88 | 1.10 | 1.69 |
| 4 dB | A | 200/200 | 1.30 | 1.19 | 1.47 | 2.32 |
| 4 dB | B | 200/200 | 1.22 | 1.11 | 1.44 | 2.11 |
| 6 dB | A | 200/200 | 1.87 | 1.70 | 2.16 | 3.26 |
| 6 dB | B | 200/200 | 1.81 | 1.69 | 2.13 | 3.15 |
| 8 dB | A | 200/200 | 2.38 | 2.07 | 2.80 | 4.19 |
| 8 dB | B | 200/200 | 2.35 | 2.02 | 2.80 | 4.25 |

Comparación pareada en la última condición: A mejor en 103, B mejor en 97 de 200; diferencia media A − B = 0.03 m.

### 3 · Paredes entre transmisor y receptor

**Hipótesis.** El método geométrico ignora las paredes: cada pared atravesada se interpreta como distancia extra y sesga la posición. El fingerprinting, calibrado en el mismo entorno, absorbe ese efecto.

**Controlado.** 6 AP, dos paredes fijas (misma geometría en todas las condiciones), σ = 3 dB, modelo supuesto sin cambios.

Semilla 20261110 · 200 posiciones · huella `05cfc858`

| Condición | Método | Estimadas | Media (m) | Mediana (m) | RMSE (m) | P90 (m) |
|---|---|---|---|---|---|---|
| 0 dB | A | 200/200 | 1.02 | 0.91 | 1.15 | 1.75 |
| 0 dB | B | 200/200 | 0.96 | 0.88 | 1.10 | 1.69 |
| 3 dB | A | 200/200 | 1.23 | 1.08 | 1.43 | 2.21 |
| 3 dB | B | 200/200 | 0.92 | 0.85 | 1.03 | 1.58 |
| 6 dB | A | 200/200 | 1.86 | 1.52 | 2.20 | 3.58 |
| 6 dB | B | 200/200 | 0.89 | 0.80 | 1.00 | 1.51 |
| 10 dB | A | 200/200 | 2.35 | 1.92 | 2.83 | 4.62 |
| 10 dB | B | 200/200 | 0.86 | 0.78 | 0.97 | 1.42 |

Comparación pareada en la última condición: A mejor en 33, B mejor en 167 de 200; diferencia media A − B = 1.49 m.

### 4 · Calibración correcta frente a desajustada

**Hipótesis.** Si el estimador supone un exponente n distinto del real (2,5), las distancias inferidas quedan sistemáticamente cortas o largas y el error del método geométrico aumenta. k-NN no usa n, así que no debería cambiar.

**Controlado.** 6 AP, sin paredes, σ = 3 dB. Solo cambia el n que usa el estimador; los datos generados son idénticos en todas las condiciones.

Semilla 20261110 · 200 posiciones · huella `f7b2b6af`

| Condición | Método | Estimadas | Media (m) | Mediana (m) | RMSE (m) | P90 (m) |
|---|---|---|---|---|---|---|
| 1.5 | A | 200/200 | 4.97 | 4.47 | 5.73 | 8.89 |
| 1.5 | B | 200/200 | 0.96 | 0.88 | 1.10 | 1.69 |
| 2 | A | 200/200 | 2.43 | 2.24 | 2.80 | 4.47 |
| 2 | B | 200/200 | 0.96 | 0.88 | 1.10 | 1.69 |
| 2.5 | A | 200/200 | 1.02 | 0.91 | 1.15 | 1.75 |
| 2.5 | B | 200/200 | 0.96 | 0.88 | 1.10 | 1.69 |
| 3 | A | 200/200 | 1.12 | 1.10 | 1.25 | 1.85 |
| 3 | B | 200/200 | 0.96 | 0.88 | 1.10 | 1.69 |
| 3.5 | A | 200/200 | 1.33 | 1.37 | 1.46 | 2.13 |
| 3.5 | B | 200/200 | 0.96 | 0.88 | 1.10 | 1.69 |

Comparación pareada en la última condición: A mejor en 56, B mejor en 144 de 200; diferencia media A − B = 0.37 m.

### 5 · Geométrico frente a fingerprinting

**Hipótesis.** En un recinto con paredes que el modelo geométrico desconoce, k-NN tendrá menor error medio que la multilateración, a costa de requerir una campaña de calibración.

**Controlado.** Una única escena (6 AP, dos paredes de 6 dB, σ = 3 dB). La variable es el algoritmo: ambos reciben exactamente las mismas mediciones.

Semilla 20261110 · 200 posiciones · huella `a52cb404`

| Condición | Método | Estimadas | Media (m) | Mediana (m) | RMSE (m) | P90 (m) |
|---|---|---|---|---|---|---|
| única | A | 200/200 | 1.86 | 1.52 | 2.20 | 3.58 |
| única | B | 200/200 | 0.89 | 0.80 | 1.00 | 1.51 |

Comparación pareada en la última condición: A mejor en 41, B mejor en 159 de 200; diferencia media A − B = 0.98 m.

## Lectura de los resultados

Lo que sigue se desprende de las tablas y vale para este modelo y estas configuraciones.

- **Experimento 1.** El error medio baja en ambos métodos al pasar de 3 a 6 AP (A: 1,85 → 1,02 m; B: 1,67 → 0,96 m). La hipótesis se sostiene.
- **Experimento 2.** El error crece de forma aproximadamente proporcional a σ. Con σ = 0 el método A es exacto y B conserva unos 0,2 m por la grilla de 1 m. La hipótesis se sostiene.
- **Experimento 3.** El error de A más que se duplica con paredes de 10 dB. El de B no empeora; de hecho baja ligeramente (0,96 → 0,86 m). Una explicación plausible, no comprobada aquí, es que las paredes vuelven más distintas las huellas de zonas vecinas.
- **Experimento 4.** El error de A es mínimo en el n correcto y la penalización es asimétrica: suponer n = 1,5 (4,97 m) es mucho peor que suponer n = 3,5 (1,33 m). B es idéntico en todas las condiciones, como se esperaba.
- **Experimento 5.** Con dos paredes de 6 dB, B tiene la mitad del error medio de A y gana en 159 de 200 muestras.

## Dos advertencias sobre la comparación A frente a B

1. El mapa de B promedia 5 lecturas por punto; A trabaja con una sola lectura por AP. Parte de la ventaja de B sin paredes viene de ahí. Se puede estudiar con la variable «Lecturas promediadas por posición».
2. B se calibra y se evalúa en la misma escena, sin cambios entre ambos momentos. En un entorno real el mapa envejece. El ejercicio 3 de la aplicación muestra ese efecto.

## Experimentos propios

En «Personalizado» se elige una variable (cantidad de AP, σ, atenuación de paredes, n supuesto, P₀ supuesto, k, paso de grilla, lecturas promediadas) y una lista de valores; el resto se toma de la escena actual del laboratorio. El registro JSON guarda la configuración completa, la semilla y la huella.
