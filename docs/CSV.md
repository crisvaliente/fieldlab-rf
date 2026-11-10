# Esquema CSV

Formato largo: **una fila por muestra y punto de acceso**. Una *muestra* es un instante y un lugar; sus lecturas de distintos AP comparten `sample_id`.

- Separador: coma (se detectan también punto y coma y tabulador).
- Decimales: punto. La coma decimal se rechaza con un mensaje que indica la corrección.
- Codificación: UTF-8, con o sin BOM. Fin de línea LF o CRLF.
- Primera fila: encabezado. El orden de las columnas es libre.

| Columna | Obligatoria | Tipo y unidad | Significado |
|---|---|---|---|
| `experiment_id` | sí | texto | Experimento o campaña de medición. |
| `sample_id` | sí | texto | Identificador de la muestra, único dentro del experimento. |
| `ap_id` | sí | texto | Punto de acceso. Para el método A debe coincidir con el nombre del AP en el plano. |
| `rssi_dbm` | sí | número, dBm, de −120 a 0 | Intensidad recibida. **Vacío = AP no detectado** en esa muestra. |
| `x_m`, `y_m` | no | número, metros | Posición conocida del receptor. Ambas o ninguna. Origen en la esquina inferior izquierda. |
| `role` | no | `calibration`, `evaluation`, `unlabeled` | Uso de la muestra. |
| `timestamp_iso` | no | ISO 8601 | Por ejemplo `2026-11-10T14:30:00Z`. |
| `source` | no | `synthetic`, `measured` | Origen declarado del dato. |

## Roles

| Rol | Posición | Uso |
|---|---|---|
| `calibration` | obligatoria | Construye el mapa de huellas. Nunca se usa para medir error. |
| `evaluation` | obligatoria | Se estima su posición y se compara con la real. Nunca entra al mapa. |
| `unlabeled` | no debe tener | Se estima su posición. **No se calcula error.** |

Si falta la columna `role` o el campo está vacío: con posición → `evaluation`; sin posición → `unlabeled`. Nunca se asume `calibration`, para que una muestra no termine entrenando el mapa sin que alguien lo haya decidido.

Si falta `source`, la aplicación muestra «origen no declarado». No infiere ni verifica el origen.

## Validación

La importación es todo o nada. Con un solo error no se importa ninguna fila, y se listan los errores con número de línea y campo.

**Errores (rechazan el archivo):** archivo vacío o solo encabezado; columna obligatoria ausente; columna RSSI sin unidad en el nombre (`rssi` en lugar de `rssi_dbm`); `x`/`y` sin `_m`; columna repetida; fila con distinto número de campos; identificador vacío; RSSI no numérico, positivo o menor que −120 dBm; coma decimal; coordenada incompleta; coordenada fuera de ±1000 m; rol desconocido; `calibration` o `evaluation` sin posición; `unlabeled` con posición; marca temporal que no es ISO 8601; `source` desconocido; lectura duplicada (misma muestra y AP); una misma muestra con rol, posición u origen distintos en filas diferentes; comilla sin cerrar.

**Advertencias (no rechazan):** RSSI mayor que −20 dBm o menor que −100 dBm; posición fuera del recinto actual; columna desconocida; muestra sin ninguna lectura válida.

## Ejemplo

```csv
experiment_id,sample_id,ap_id,rssi_dbm,x_m,y_m,role,timestamp_iso,source
campo-01,cal-0001,AP1,-48.50,1.000,1.000,calibration,2026-11-10T14:30:00Z,measured
campo-01,cal-0001,AP2,-71.00,1.000,1.000,calibration,2026-11-10T14:30:00Z,measured
campo-01,ev-0001,AP1,-60.25,4.200,3.100,evaluation,2026-11-10T15:02:11Z,measured
campo-01,ev-0001,AP2,,4.200,3.100,evaluation,2026-11-10T15:02:11Z,measured
campo-01,sn-0001,AP1,-66.00,,,unlabeled,2026-11-10T15:10:00Z,measured
```

Las filas de arriba ilustran el formato; no son mediciones.

## Archivos incluidos

- `data/ejemplo_mediciones.csv`: 24 muestras de calibración, 8 de evaluación (una con una lectura faltante) y 4 sin posición; 4 AP; 144 filas. Es **sintético**, generado con la escena inicial y semilla 7, y lo declara en `source`. Es el mismo que carga el botón «Cargar conjunto de ejemplo».
- `data/ejemplo_invalido.csv`: tres filas con errores (RSSI positivo, calibración sin posición, coma decimal) para ver los mensajes de rechazo.

## Exportación

«Generar CSV sintético» escribe la grilla de calibración y 50 muestras de evaluación de la escena actual con este mismo esquema y `source = synthetic`. RSSI con 2 decimales, coordenadas con 3. Las muestras sintéticas no llevan marca temporal.
