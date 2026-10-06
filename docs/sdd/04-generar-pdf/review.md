# Review — 04-generar-pdf

**Fecha:** 2026-10-06T05:00:00Z
**Verdict:** pass
**Iteración:** 1

## 1. Resumen ejecutivo
`generar_formulario` rama pdf cumple HU-3 P1 limpiamente. Los 13 AC están cubiertos con evidencia que yo mismo rederivé: typecheck en verde, `bun run demo` corre los 4 casos (CO/HN xlsx, EC pdf 13 escritos/2 vacíos, PA portal skipped), el pdf de EC contiene las 15 etiquetas en el orden exacto del fixture con valor o `___`, encabezado `Registro como proveedor — Corporación Andina de Servicios S.A.` + fecha `2026-10-06` (YYYY-MM-DD per D3), `data = {ruta, formato}` **estricto** (D2 verificado por `Object.keys(gen.data).sort().join(",") === "formato,ruta"`), booleanos serializados via `src/lib/serialize.ts` (D7), y los 4 scripts de regresión (`verify:ambiguous`, `verify:mapeo`, `verify:h2`, `verify:xlsx`) siguen todos verdes. Las 8 divergencias declaradas en plan §11 están implementadas; detecté 1 divergencia adicional no listada (edición de `verify-xlsx.ts`, que el implementer sí anotó en `notas` pero no en §11) — H-1 abajo, legítima y necesaria. 3 hallazgos menores informativos — ninguno justifica degradar.

## 2. Cobertura de criterios

| Criterio (del spec) | Estado | Evidencia |
|---|---|---|
| AC-1 — rama pdf produce ok + contrato §6.2 intacto | cubierto | `src/tools/proveedor.ts` rama `if (formato === "pdf")` ya no retorna error "no implementado"; devuelve `{ok:true, data:{ruta,formato:"pdf"}, n_escritos, n_vacios}`. `rg -n "throw" src/tools src/lib` → 0 matches. Export name `generar_formulario` sin cambios (→ `proveedor_generar_formulario`). |
| AC-2 — `out/ec-corp-andina/formulario.pdf` existe y >0 bytes | cubierto | `ls -la` tras `bun run demo` → `1955 bytes` para EC pdf; `test -f` pass. |
| AC-3 — fidelidad texto + orden | cubierto | Mi `bun -e` con `pdf-parse`: itera plantilla EC (15 ítems); para cada etiqueta hace `indexOf("<etiqueta>[ (obligatorio)]:")` sobre texto normalizado; afirma `indices crecientes` y `nextChunk.includes(esperado)`. Resultado: `orden ok: true, valores ok: true, plantilla items: 15`. 13 valores reales + 2 `___` (RUC por RN1 → requiere_confirmacion; "Número de contribuyente especial" por fuzzy <0.8 → faltante). |
| AC-4 — CA2 nunca inventa | cubierto | `src/lib/pdf.ts:48-55`: `escribirFormularioPdf` solo lee `valores.get(etiqueta)` del `Map` construido en `runGenerar` a partir de `mapeo.llenos`. `formatearLinea` escribe `___` si `tieneValor === false`; nunca lee del maestro ni fabrica string. Confirmado también por el orden+valores exactos del AC-3 (nada "inventado" apareció). |
| AC-5 — encabezado con cliente | cubierto | Extracto literal del pdf: `Registro como proveedor — Corporación Andina de Servicios S.A.` (fontSize 16), seguido de `2026-10-06` (fontSize 10, YYYY-MM-DD per D3), luego las filas. |
| AC-6 — portal diferido + xlsx intacto | cubierto | `bun -e` directo con `caso:"pa-logistica-istmo"` → `{ok:false, error:"formato portal no implementado en slice 03; disponible en slice posterior"}` (string byte-exact). `test ! -f out/pa-logistica-istmo/formulario.pdf` pass. CO y HN siguen generando xlsx (`out/{co,hn}/formulario.xlsx` presentes; `verify:xlsx` verde). |
| AC-7 — error path sin lanzar | cubierto | `bun -e` con `caso:"bogus"` → `{ok:false, error:"caso no encontrado: bogus"}`, exit 0, sin throw. `rg -n "throw" src/tools src/lib` → 0 matches (todo throw se captura en try/catch global o nunca ocurre). |
| AC-8 — log 3 líneas × 4 claves (3ª línea pdf) | cubierto | `wc -l out/ec-corp-andina/log.jsonl` = 3. Mi `bun -e` validó `Object.keys(o).sort().join(",") === "herramienta,ok,resumen,ts"` para las 3 líneas. 3ª línea EC: `herramienta=proveedor_generar_formulario, ok=true, resumen={formato:"pdf", ruta:"out/ec-corp-andina/formulario.pdf", n_escritos:13, n_vacios:2}`. 3ª línea PA: `ok=false, resumen.error` con string de portal. CO/HN siguen con `formato:xlsx`. |
| AC-9 — determinismo stdout + texto pdf | cubierto | **stdout**: `bun run demo:clean > a; bun run demo:clean > b; diff a b` → 0 líneas (idéntico). **pdf**: `verify:pdf` sub-aserción determinismo-writer → `escribirFormularioPdf` dos veces con mismas entradas → snapshot textual idéntico (D8 normalización por líneas). |
| AC-10 — typecheck + sin `any` | cubierto | `bun x tsc --noEmit` exit 0, 0 errores. `rg -nw any reto-01/src reto-01/demo.ts reto-01/src/scripts` → 0 matches. |
| AC-11 — rutas desde `ctx.directory` | cubierto | `data.ruta` = `"out/ec-corp-andina/formulario.pdf"` (relativa, D4 preservado). `src/lib/pdf.ts` recibe ruta vía parámetro (lo construye `runGenerar` con `path.join(outDir(ctx,...), ...)`); no hay strings con `/^"'/` en `src/tools`+`src/lib`. |
| AC-12 — dependencias nuevas justificadas | cubierto | `jq '.dependencies'` → `exceljs, pdfkit, zod` (3 prod). `jq '.devDependencies'` incluye `@types/pdfkit, pdf-parse, typescript, @types/bun`. `README.md` sección "Dependencias" menciona `pdfkit` y `pdf-parse` (2 matches con `grep -c`). Spec §6 decisiones 2+4 anotan justificación. |
| AC-13 — regresión slices 01+02+03 | cubierto | Mis corridas directas: `verify:ambiguous → ok`, `verify:mapeo → ok`, `verify:h2-regression → ok`, `verify:xlsx → ok`. El refactor de `serializarValor` (xlsx.ts → serialize.ts) no rompió nada. **Nota H-1**: `verify-xlsx.ts` sí fue editado para EC — ver hallazgos. |

### Reglas del PRD — aplicabilidad en slice 04

- **§6.2 contrato** — pass (AC-1, AC-11, D2 verificado por inspección directa).
- **§6.3 CA1 (tope iteraciones)** — N/A (slice 06).
- **§6.3 CA2 (no inventa)** — pass (AC-4; `escribirFormularioPdf` solo consume `valores`).
- **§6.3 CA3 (confirmación humana)** — N/A (sin acción externa).
- **§6.3 CA4 (log por tool call)** — pass (AC-8; 3ª línea por caso con el shape esperado).
- **§6.3 CA5 (errores no matan)** — pass. Ramas de error clasificadas; catch global; nunca lanza.
- **§7.1 "plantilla-campos.json"** — pass. 15 etiquetas en orden; `obligatorio` consumido para el sufijo (D2 slice 04).
- **§7.3 RN1–RN5** — RN5 pass (AC-8); RN1 heredado (RUC → `___` en pdf para EC); RN2/RN3/RN4 N/A (slices 05/08).
- **§8 TS sin `any`, determinismo, deps justificadas** — pass. 3 deps nuevas (pdfkit prod + pdf-parse/@types/pdfkit dev) todas documentadas. 0 shell. 0 `any`.
- **§8 Seguridad** — pass. `grep -En 'api[_-]?key|secret|token|password' src/` → 0 matches literales con pinta de credencial.
- **§6.5 estructura** — pass. Helpers nuevos (`src/lib/serialize.ts`, `src/lib/pdf.ts`) siguen patrón slices 02/03.

### Divergencias plan §11 — verificación

| # | Divergencia declarada | Verificada |
|---|---|---|
| D1 | `src/lib/serialize.ts` con `Serializable` + `serializarValor` | sí (archivo existe, 1-10 líneas; firma literal del §5.1) |
| D2 | `(obligatorio)` ANTES del `:` | sí: pdf extraído muestra `"RUC (obligatorio): ___"`, `"Página web: ___"` (sin obligatorio) |
| D3 | fecha = `YYYY-MM-DD` | sí: pdf muestra `2026-10-06` como línea 2 del encabezado |
| D4 | encabezado 2 líneas (16pt + 10pt) + moveDown | sí: `src/lib/pdf.ts:42-46` implementa el layout exacto |
| D5 | `PlantillaCamposSchema` reutilizado o creado | sí: el schema ya existía en `proveedor.ts` desde slice 01; `runGenerar` lo reutiliza |
| D6 | `demo.ts` NO se edita | sí: `git diff 75e1029 -- reto-01/demo.ts` → vacío (0 cambios) |
| D7 | strings de error paralelos a xlsx | sí: `"plantilla ausente para formato pdf (caso <nombre>)"` + `"fallo escribiendo pdf para caso <nombre>: <mensaje>"` presentes en el código y simétricos a los de xlsx |
| D8 | snapshot pdf normalizado por líneas | sí: `src/scripts/verify-pdf.ts` implementa `snapshotPdf` con trim + collapse + filter empty |

**Divergencia adicional detectada** (no en §11, documentada en `notas` del implementer pero no promovida al §11): **edición de `src/scripts/verify-xlsx.ts`** — ver H-1 abajo. El plan §4 explícitamente listaba este archivo como "No se toca". El cambio es legítimo y necesario (la aserción EC `"formato pdf no implementado"` quedó obsoleta cuando pdf se implementó), pero debería haber estado declarado en §11.

## 3. Hallazgos

### H-1 — Edición de `verify-xlsx.ts` no declarada en plan §11 (menor, proceso)
- **Severidad:** menor
- **Regla violada:** convención de divergencia (`project_sdd_divergence_rule`); plan §4 declaró el archivo como "No se toca"
- **Ubicación:** `reto-01/src/scripts/verify-xlsx.ts:162-181` (helper nuevo `verifyXlsxAbsent`) y `:228-230` (sustituye `verifyCaseNoXlsx` por `verifyXlsxAbsent` para EC)
- **Qué pasa:** El plan §4 listó `verify-xlsx.ts` entre los archivos "No se toca". El implementer necesariamente tuvo que editarlo porque la aserción original `verifyCaseNoXlsx("ec-corp-andina", "formato pdf no implementado")` quedó obsoleta (EC ahora devuelve `ok:true` tras implementar pdf). El implementer añadió un helper `verifyXlsxAbsent` que solo verifica la ausencia del `.xlsx` (preservando el espíritu "xlsx no se crea para formatos ≠ xlsx"). PA sigue usando el helper original. El cambio es correcto. El implementer anotó la divergencia en `notas` de su reporte, pero no la promovió al §11 del plan (como pide la convención del proyecto).
- **Qué debería pasar:** la divergencia debería haber estado en §11 antes del gate humano, para que el usuario la validara. Ahora ya está hecha; no requiere revertir.
- **Fix sugerido:** proceso. En slices futuros, cuando el implementer anticipe un ajuste a archivos listados como "no se toca", solicitar al coordinator que actualice §11 (o lo marque explícitamente en el reporte intermedio). Alternativa estructural: en el próximo spec, listar `verify-*.ts` como "editables si una aserción queda obsoleta por el nuevo slice".

### H-2 — `demo.ts` sigue contando portal `skipped` como `ok` (menor, heredado de slice 03)
- **Severidad:** menor (informativo)
- **Regla violada:** ninguna aplicable al slice 04; comportamiento aceptado en revisión slice 03 (H-1 de ese slice)
- **Ubicación:** `reto-01/demo.ts` lógica de `okCount`
- **Qué pasa:** PA (portal) sigue siendo `skipped` y cuenta como `ok` en el totales `ok: 4 | error: 0`. Esta anotación es paralela al H-1 del review slice 03.
- **Qué debería pasar:** no se arregla aquí (fuera de alcance). El plan §9 R11 lo declara explícitamente aceptado.
- **Fix sugerido:** fuera de alcance. Reconsiderar cuando se implemente la rama portal (slice posterior) — PA pasaría de `skipped` a `ok real`, lo que resuelve el problema por polimorfismo del contrato.

### H-3 — Vacíos del pdf EC (RUC + "Número de contribuyente especial") son intencionales (informativo)
- **Severidad:** menor (informativo)
- **Regla violada:** ninguna
- **Ubicación:** salida del pdf EC
- **Qué pasa:** `n_vacios=2` para EC. RUC cae en `requiere_confirmacion` por RN1 (país ≠ CO), por lo que no se escribe su valor y aparece `___`. "Número de contribuyente especial" cae en `faltantes` (fuzzy <0.8 contra el glosario). Ambos son comportamiento esperado; el analista los completa a mano antes de la firma (o se los indica el `checklist.md` del slice 05).
- **Qué debería pasar:** lo que pasa. Documentar en `SOLUCION.md` (cuando llegue) que algunos pdfs tienen celdas con `___` por diseño.
- **Fix sugerido:** ninguno. El `checklist.md` del slice 05 debe listar explícitamente estos huecos.

## 4. Resultados de ejecución
- **typecheck**: pass — `bun x tsc --noEmit` exit 0.
- **demo.ts**: pass — 4 casos, `ok:4 | error:0`, exit 0; CO xlsx (17/0), EC pdf (13/2), HN xlsx (9/2), PA skipped portal.
- **determinismo stdout**: pass — `diff` vacío entre 2 corridas con capturas idénticas.
- **verify:pdf**: pass — `ok: verify-pdf` (fidelidad texto + ausencia PA + determinismo-writer).
- **verify:ambiguous (slice 01)**: pass — sin regresión tras refactor serialize.
- **verify:mapeo (slice 02)**: pass — sin regresión.
- **verify:h2-regression (slice 02)**: pass — sin regresión.
- **verify:xlsx (slice 03)**: pass — sin regresión (tras edición declarada en H-1).
- **D2 contract adherence**: pass — `Object.keys(gen.data).sort().join(",")` = `"formato,ruta"` exacto; `n_escritos`/`n_vacios` top-level fuera de `data`.
- **D6 demo.ts untouched**: pass — `git diff 75e1029 -- reto-01/demo.ts` vacío.
- **D7 booleans**: pass — `serializarValor` en `src/lib/serialize.ts` emite `"Sí"/"No"` para booleans; `src/lib/pdf.ts` lo consume via `formatearLinea`.
- **portal error exacto**: pass — `"formato portal no implementado en slice 03; disponible en slice posterior"` byte-exact.
- **bogus**: pass — `{ok:false, "caso no encontrado: bogus"}`, sin throw.
- **AC-3 orden + valores**: pass — 15/15 etiquetas en orden creciente; valores (o `___`) donde se esperan.
- **AC-5 encabezado**: pass — `Registro como proveedor — Corporación Andina de Servicios S.A.\n2026-10-06`.
- **casos corridos**: 4 reales + 1 inexistente (bogus) + 1 portal explícito (PA) + 1 determinismo-writer (interno a verify:pdf) + 4 regresiones = 11 ejecuciones.
- **artefactos en `out/`**: CO/HN `formulario.xlsx` + EC `formulario.pdf` presentes; PA sin ningún formulario; 4/4 `log.jsonl` con 3 líneas y 4 claves exactas.
- **grep `any`**: 0 matches.
- **grep `throw` en `src/tools`+`src/lib`**: 0 matches.
- **grep rutas absolutas**: 0 matches en `src/tools`+`src/lib`.
- **secret scan**: 0 matches.

## 5. Veredicto
**pass**. Los 13 AC están cubiertos con evidencia que yo mismo rederivé (comandos `bun`, `pdf-parse` via `bun -e`, `grep`, `diff`, scripts verify). El contrato §6.2 se respeta estrictamente: `data = {ruta, formato}` **estricto** (D2 verificado por inspección directa del JSON retornado), tool nunca lanza, zod args con `.describe`. HU-3 P1 cumplido con fidelidad al template (15/15 etiquetas en orden, valores correctos o `___`). Portal sigue diferido con error exacto. Determinismo verificado en stdout y en contenido textual del pdf. Las 8 divergencias declaradas en plan §11 están implementadas; detecté 1 divergencia adicional no listada (edición de `verify-xlsx.ts`, H-1) — legítima pero debería haberse declarado antes del gate. Regresión chain completa (4 scripts verify) en verde. 3 hallazgos son todos menores informativos.

## 6. Siguientes pasos recomendados
Ninguno para cerrar este slice. Recomendaciones para el coordinator al abrir slices siguientes:
1. **H-1 (proceso)**: en el próximo plan, pedir al planner que incluya cualquier edición anticipada de `verify-*.ts` dentro de §11 cuando una aserción vaya a quedar obsoleta por el nuevo slice. Alternativa estructural: en el spec, listar los `verify-*.ts` como "editables cuando una aserción quede obsoleta por el nuevo slice", para evitar el falso positivo "no se toca" en plan §4.
2. **Slice posterior (portal)**: la rama `portal` ya es la única que devuelve `ok:false` en `runGenerar`; cuando se implemente, PA pasará a `ok real` y H-2 se resuelve automáticamente. El plan de portal debería incluir también la actualización de `verify-xlsx.ts` (si la aserción PA queda obsoleta) y de `verify-pdf.ts` (aserción PA no-existente ya no aplica).
3. **Slice 05 (`armar_paquete`)**: `checklist.md` debe listar explícitamente los campos con `___` del pdf (y celdas vacías del xlsx) para que el analista los complete antes de la firma (H-3).
