# Spec — 03-generar-xlsx

**Slice:** herramienta `proveedor_generar_formulario` — rama **xlsx (P0)** (HU-3)
**Autoridad:** `reto-01/PRD.md` HU-3, §6.2, §7.1 "plantilla-celdas.json", §6.3 CA2/CA4/CA5
**Fecha:** 2026-10-05
**Depende de:** slice 00 + 01 + 02 (todos cerrados)

## 1. Resumen en una frase
Implementar `generar_formulario` (rama xlsx) que, dado un caso + el mapeo producido por `mapear_campos`, escriba `out/<caso>/formulario.xlsx` colocando cada etiqueta y su valor exactamente en la hoja y celda que indica `plantilla-celdas.json`.

## 2. Alcance

**En alcance**
- Nuevo export `generar_formulario` en `src/tools/proveedor.ts` cumpliendo contrato §6.2.
- `args` zod: `{ caso: z.string().min(1), mapeo: MapeoInputSchema }` donde `MapeoInputSchema` acepta el shape producido por `mapear_campos` (`.passthrough()` en los sub-items, mismo patrón que slice 02).
- `data` ok: `{ ruta: string, formato: "xlsx" }` (contrato §6.2 literal).
- Comportamiento por formato (resuelto leyendo `solicitud.json` del caso):
  - **xlsx**: escribir el libro; devolver `data`.
  - **pdf**: `{ ok: false, error: "formato pdf no implementado en slice 03; disponible en slice 04" }`.
  - **portal**: `{ ok: false, error: "formato portal no implementado en slice 03; disponible en slice posterior" }`.
- Reglas de escritura xlsx (ver duda 1):
  - Para **cada ítem** de `plantilla-celdas.json` (orden del fixture): escribir `etiqueta` en la celda `celda_etiqueta` de la hoja `hoja`.
  - Si el campo mapea a un ítem en `mapeo.llenos[]` → escribir `valor` en `celda_valor` (misma hoja).
  - Si está en `mapeo.faltantes[]` o `mapeo.requiere_confirmacion[]` → `celda_valor` queda **vacía** (ver duda 2 para la alternativa visual).
  - Cada hoja distinta en la plantilla se crea una vez; si existe se reutiliza.
  - Encoding del valor: strings tal cual; números como number; booleanos como `"Sí"`/`"No"`; objetos/arrays → `JSON.stringify` compacto (fallback defensivo; en el maestro actual no debería ocurrir salvo `ingresos_ultimo_ano.valor` que es number).
- Dependencia nueva: librería xlsx (ver duda 3). Propuesta: `exceljs`. Justificación en README/SOLUCION (`zod` + `exceljs` es el set mínimo para cumplir HU-3 xlsx).
- Logging RN5/CA4: appendear a `out/<caso>/log.jsonl` con `{ ts, herramienta: "proveedor_generar_formulario", ok, resumen: { formato, ruta?, n_escritos, n_vacios } }`.
- `demo.ts` se extiende: para los 2 casos xlsx (CO, HN), tras `mapear_campos`, llamar `generar_formulario` y añadir una línea `generar: ruta=out/<caso>/formulario.xlsx (N escritos, M vacíos)`. Para EC/PA, imprimir `generar: skipped (formato <pdf|portal>; slice posterior)`.
- Verificación automatizada (ver duda 4): nuevo script `verify:xlsx` que, para CO y HN, re-lee el xlsx producido con la misma librería y verifica que las celdas calzan con la expectativa derivada de `mapeo.llenos` (etiqueta en `celda_etiqueta`, valor en `celda_valor`).

**Fuera de alcance**
- `generar_formulario` pdf (slice 04) y portal (slice posterior).
- `armar_paquete`, `simular_envio`, ciclo del agente, front, adaptador LLM.
- Validación semántica de valores (ej. que el NIT tenga formato).
- Formato/estilo del xlsx (fuentes, colores, bordes). Solo escribimos texto.
- Fórmulas, validaciones de celda, imágenes.

## 3. Criterios de aceptación

| # | Criterio | Fuente PRD |
|---|---|---|
| AC-1 | Export `generar_formulario` cumple contrato §6.2 (zod args con `.describe`, `execute` devuelve **string**, nunca lanza). Nombre expuesto = `proveedor_generar_formulario`. | §6.2 |
| AC-2 | Para los 2 casos xlsx (CO, HN), la herramienta devuelve `{ ok: true, data: { ruta, formato: "xlsx" } }` y `out/<caso>/formulario.xlsx` existe en disco. | HU-3 P0 |
| AC-3 | **Fidelidad al template**: al re-leer el xlsx producido, para **cada ítem de `plantilla-celdas.json`**, la celda `celda_etiqueta` contiene exactamente la `etiqueta` del fixture; la celda `celda_valor` contiene el valor del maestro **solo** cuando el campo está en `mapeo.llenos[]`, y queda vacía (`null`/`""`) si está en `faltantes` o `requiere_confirmacion`. | HU-3 "cada etiqueta y su valor exactamente en la hoja y celda" |
| AC-4 | **CA2 — nunca inventa**: ninguna celda contiene un valor que no provenga del maestro. Verificable con el verify-script y por auditoría del log. | §6.3 CA2 |
| AC-5 | **Multi-hoja**: para CO (plantilla con 2 hojas: "Datos Proveedor" y "Datos Bancarios"), ambas hojas existen en el xlsx producido con sus celdas correctas. | HU-3 "en la hoja indicada" |
| AC-6 | **Formato no soportado**: para EC (pdf) y PA (portal), la herramienta devuelve `{ ok: false, error }` con mensaje claro **sin crear** `out/<caso>/formulario.xlsx`. | PRD §6.2 priorización, HU-3 P1/P2 (diferidas) |
| AC-7 | **Error path**: caso inexistente, `mapeo` con shape inválido, o fallo escribiendo el archivo devuelven `{ ok: false, error }` sin lanzar. | CA5 |
| AC-8 | **CA4/RN5 logging**: tras `demo:clean && demo`, `out/<caso>/log.jsonl` para CO/HN contiene 3 líneas (`leer_solicitud`, `mapear_campos`, `generar_formulario`); para EC/PA contiene 3 líneas (la última con `ok:false` + motivo). Todas con las 4 claves `{ts, herramienta, ok, resumen}`. | CA4, RN5 |
| AC-9 | **Determinismo**: `bun run demo:clean` produce stdout idéntico en 2 corridas consecutivas, y el **contenido** del xlsx producido es idéntico (misma celda, mismo valor; metadatos de archivo como fecha de creación quedan excluidos de la comparación). | §8 |
| AC-10 | **Typecheck + sin `any`**: `bun x tsc --noEmit` exit 0; `rg "\\bany\\b"` sin matches en código nuevo. | §8 |
| AC-11 | **Rutas desde `ctx.directory`**: no hay rutas absolutas en el código nuevo. | §6.2 |
| AC-12 | **Dependencia justificada**: la nueva lib xlsx (si se añade) está listada en `package.json` y justificada en `README.md` + anotación en `docs/sdd/03-generar-xlsx/spec.md`. | §8, §9.1 "decisiones" |

## 4. Reglas del PRD que aplican

- **§6.2 contrato de herramientas** — forma del export, zod, string JSON, nunca lanza.
- **§7.1 "plantilla-celdas.json"** — lista de `{ hoja, celda_etiqueta, etiqueta, celda_valor }`.
- **HU-3 P0** — xlsx producido escribiendo etiqueta + valor en la celda correcta de la hoja correcta.
- **§6.3 CA2** — no inventar valores; usar solo los de `mapeo.llenos[].valor`.
- **§6.3 CA4** — tool call registrada en `out/<caso>/log.jsonl`.
- **§6.3 CA5** — errores no matan; mensaje claro.
- **§8** — sin `any`, determinismo, deps justificadas.

## 5. Dependencias con otros slices

- **Requiere**: slice 02 cerrado (`mapear_campos` produce `llenos[]` con `destino` + `valor`).
- **Alimenta**:
  - slice 04 (`generar_formulario` pdf) reutilizará la misma herramienta (segunda rama).
  - slice 05 (`armar_paquete`) necesita que `out/<caso>/formulario.xlsx` exista para incluirlo en el paquete.

## 6. Decisiones (resueltas)

1. **Celdas de valor vacías para `faltantes` + `requiere_confirmacion`.** La etiqueta siempre se escribe en `celda_etiqueta` (es parte del formato de la plantilla); `celda_valor` queda vacía (`null`). Nada de estilos visuales, colores ni comentarios de celda. Motivo: minimalista, respeta HU-3 literal ("etiqueta y su valor"), delega el reporte de huecos al `checklist.md` del slice 05.
2. **Iteración por plantilla, lookup por etiqueta en `mapeo.llenos`.** Se recorre `plantilla-celdas.json` (orden del fixture) y para cada ítem se busca el campo correspondiente en `mapeo.llenos[]` por `etiqueta` exacta (string match sin normalizar — las etiquetas vienen de la misma plantilla, no hay drift). Si está en `llenos`, se escribe su `valor` en `celda_valor`; si no, celda vacía. Motivo: produce un xlsx completo con todas las etiquetas del template, cubre AC-3 literal.
3. **Dependencia nueva: `exceljs`.** API cell-level (`ws.getCell("B3").value = "..."`), pure JS, ~1 MB, mantenida. Justificación irá en `reto-01/README.md` + `reto-01/SOLUCION.md` sección "Decisiones y trade-offs" (cuando llegue): única alternativa realista era implementar OOXML a mano (fuera de alcance temporal del reto). PRD §8 "Dependencias — las que necesites, justificadas".
4. **Solo xlsx en este slice.** `pdf` y `portal` devuelven `{ ok: false, error: "formato <X> no implementado en slice 03; …" }`. Sin stubs adicionales. Motivo: mantiene el slice acotado, la rama pdf se implementa en slice 04 y portal en slice posterior; cada una amplía la switch de formato dentro de `execute`.
