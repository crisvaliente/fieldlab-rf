# Limitaciones

## Sobre la validez de los resultados

- **No hay ninguna medición real.** Todo lo que muestran el laboratorio y los experimentos es sintético. El prototipo no se probó con un ESP32 ni con ningún otro hardware.
- **Las cifras de error no son precisión de campo.** Los datos se generan con el mismo tipo de modelo que el estimador supone. Eso favorece a los algoritmos de una forma que un edificio real no hace.
- **El modelo es deliberadamente simple.** Dos dimensiones, antenas isotrópicas, un solo camino recto, paredes como pérdida fija, ruido gaussiano independiente. No hay multitrayecto, desvanecimiento correlacionado, difracción, interferencia, canales, orientación del dispositivo ni personas.
- **Los valores por defecto no están medidos.** P₀ = −40 dBm, n = 2,5, 6 dB por pared y σ = 3 dB son puntos de partida razonables para estudiar, no características de ningún entorno.
- **El RSSI no se cuantiza.** Un ESP32 informa enteros; aquí son reales.
- **Generador pseudoaleatorio modesto.** mulberry32 alcanza para simulación didáctica; no para estudios estadísticos exigentes.

## Sobre los algoritmos

- **Método A ignora paredes y ΔP.** Es intencional: muestra el sesgo. No hay una variante que conozca el plano.
- **Método A puede caer en un mínimo local.** Tres puntos de partida lo reducen, no lo eliminan. Con tres AP y mucho ruido, la solución espejo es posible.
- **Umbral de colinealidad fijo (0,05).** Una geometría mala pero por encima del umbral da estimaciones pobres sin aviso específico; el campo «dispersión» permite verla.
- **k-NN sustituye faltantes por −100 dBm.** Es una convención sencilla. Con muchas lecturas faltantes domina la métrica.
- **Comparación A/B no simétrica.** El mapa de huellas promedia 5 lecturas por punto y se evalúa en la misma escena en que se calibró. Ver [EXPERIMENTOS.md](EXPERIMENTOS.md).
- **Mapa de calor ruidoso.** Seis mediciones por celda: sirve para ver zonas, no para leer valores finos.
- **Estadísticas sin intervalos de confianza.** Con 200 muestras, diferencias de pocos centímetros entre métodos no son concluyentes. Cambiar la semilla y repetir da una idea de la variación.

## Sobre la aplicación

- **Pruebas de interfaz solo en Chrome sin cabeza**, con móvil emulado. Sin verificar en teléfonos reales, Safari ni Firefox.
- **La escena no se guarda.** Al recargar se vuelve a la escena inicial. El registro JSON de un experimento sí conserva su configuración, pero no hay importación de escenas.
- **Las muestras importadas no se dibujan en el plano.** Se analizan y se listan en tablas.
- **El método A sobre datos importados usa las posiciones de AP del plano.** Hay que reproducir a mano la disposición real y nombrar los AP igual que en el archivo.
- **Sin conexión a hardware.** No hay Web Serial, Bluetooth ni escaneo Wi-Fi. La vía de entrada es el CSV.
- **Descarga de archivos.** Dentro de un visor embebido las descargas pueden estar bloqueadas; por eso la exportación se muestra como texto con botón de copiar. El botón de descarga aparece solo cuando la página se abre de forma independiente.
- **Tipografías desde Google Fonts.** Sin red se usan las del sistema.
- **Accesibilidad parcial.** Hay foco visible, etiquetas y control del plano por teclado, pero dibujar paredes requiere puntero y no se probó con lectores de pantalla.
- **Rendimiento.** Pensado para recintos de hasta unos 60 m de lado, decenas de AP y experimentos de hasta 2000 posiciones por condición. Los experimentos se ejecutan en el hilo principal.

## Alcance reducido de forma explícita

- React: no se usó (ver [ARQUITECTURA.md](ARQUITECTURA.md)).
- Trazado de rayos, simulación de canal, filtros temporales (Kalman, partículas) y aprendizaje profundo: fuera del alcance de este prototipo.
- Publicación en GitHub: no se hizo; las instrucciones están en el README.
