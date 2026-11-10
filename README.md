# FieldLab RF

Laboratorio interactivo para estudiar posicionamiento en interiores con intensidad de señal Wi-Fi (RSSI). Primer instrumento experimental de JUMP LAB.

Es una herramienta de estudio. Todos los datos que genera son **sintéticos** y salen de un modelo de propagación simplificado. No está validada con hardware real y no es un sistema de localización ni de seguimiento de personas.

## Qué hace

- Plano 2D en metros: agregar, mover y eliminar puntos de acceso; dibujar paredes con atenuación en dB; arrastrar el receptor; zoom con rueda, botones o pellizco.
- Modelo log-distancia con paredes y ruido gaussiano reproducible por semilla.
- Dos métodos independientes: **A** multilateración por mínimos cuadrados (Levenberg–Marquardt) y **B** fingerprinting con k-NN.
- Instrumentos: RSSI, distancia real e inferida, atenuación por paredes, variabilidad, coordenadas, error espacial, valores intermedios de cada método.
- Modo Experimento: cinco experimentos predefinidos y uno personalizado, con hipótesis, una sola variable, métricas (media, mediana, RMSE, P90, tasa de fallos), gráficos y huella de repetibilidad.
- Importación y exportación CSV con validación. Sin posición conocida no se calcula error.
- Conceptos, fórmulas y tres ejercicios guiados dentro de la aplicación.

## Ejecutar

Opción 1, sin instalar nada: abrir `dist/index.html` con doble clic. Es un único archivo con todo incluido.

Opción 2, desde el código fuente (módulos ES, necesita un servidor estático):

```bash
python3 -m http.server 8080     # o: npm run serve
# abrir http://localhost:8080
```

No hay backend, cuentas, credenciales ni permisos de Wi-Fi, Bluetooth o USB. La única petición externa es la hoja de fuentes tipográficas de Google Fonts; sin red se usan fuentes del sistema.

## Probar

```bash
npm install            # solo instala esbuild (empaquetador, licencia MIT)
npm test               # 46 pruebas del motor matemático, con node:test
npm run build          # genera dist/index.html
node tests/ui/ui.test.mjs   # 26 pruebas de interfaz; requiere Playwright y Chrome
```

Las pruebas del motor no necesitan `npm install`: usan solo Node ≥ 20. Para las de interfaz hace falta `npm i -D playwright` y un Chrome; la ruta se puede indicar con la variable `CHROME`.

Resultados de la última ejecución: [docs/PRUEBAS.md](docs/PRUEBAS.md).

## Publicar gratis en GitHub Pages

La raíz del repositorio ya es un sitio estático válido; no hace falta compilar.

1. Crear un repositorio y subir el contenido de esta carpeta (sin `node_modules`).
2. En GitHub: *Settings → Pages → Build and deployment → Deploy from a branch*, rama `main`, carpeta `/ (root)`.
3. A los pocos minutos queda disponible en `https://<usuario>.github.io/<repositorio>/`.

Las rutas son relativas, así que funciona en un subdirectorio. Alternativa: publicar solo `dist/index.html`.

## Estructura

```
index.html, styles.css     página y estilos
src/engine/                motor matemático, sin DOM (rng, propagación, algoritmos, estadística, CSV, experimentos)
src/ui/                    interfaz (plano SVG, paneles, gráficos, experimentos, datos, aprendizaje)
tests/engine/              pruebas unitarias deterministas
tests/ui/                  pruebas de interfaz con navegador
data/                      CSV de ejemplo (sintético) y un CSV inválido para probar la validación
docs/                      arquitectura, modelos, esquema CSV, experimentos, pruebas, limitaciones
dist/                      versión empaquetada en un archivo
```

## Documentación

- [Arquitectura](docs/ARQUITECTURA.md)
- [Modelos y algoritmos](docs/MODELOS.md)
- [Esquema CSV](docs/CSV.md)
- [Experimentos de ejemplo y sus resultados](docs/EXPERIMENTOS.md)
- [Pruebas realizadas](docs/PRUEBAS.md)
- [Limitaciones](docs/LIMITACIONES.md)

Licencia MIT.
