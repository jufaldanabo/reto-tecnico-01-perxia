# Review — 03-generar-xlsx

**Fecha:** 2026-10-06T04:00:00Z
**Verdict:** pass
**Iteración:** 1

## 1. Resumen ejecutivo
`generar_formulario` (rama xlsx) cumple el contrato §6.2 limpiamente. Los 12 AC están cubiertos con evidencia que rederivé: typecheck en verde, `bun run demo` corre los 4 casos con partición esperada, CO/HN generan xlsx (17/0 y 9/2 escritos/vacíos), EC/PA devuelven el error exacto diferido sin crear archivo, log por caso con 3 líneas y 4 claves cada una, snapshot canónico del xlsx idéntico entre 2 escrituras, `data` del contrato permanece **exactamente** `{ruta, formato}` (D2 respetado), booleanos serializados a `"Sí"/"No"` (D7), y las 3 regresiones (`verify:ambiguous`, `verify:mapeo`, `verify:h2`) siguen verdes. Las 7 divergencias declaradas en plan §11 están implementadas. 3 hallazgos menores informativos — ninguno justifica degradar.

## 2. Cobertura de criterios

| Criterio (del spec) | Estado | Evidencia |
|---|---|---|
| AC-1 — contrato §6.2 | cubierto | `src/tools/proveedor.ts:748-799`: export `generar_formulario: Tool<typeof generarArgs, GenerarData>` con `description` precisa; `args.caso.describe()` + `args.mapeo.describe()` presentes (`:640-645`); `execute` siempre `return JSON.stringify(...)` dentro de try/catch global; `grep "throw" src/tools src/lib` → 0 matches. Nombre expuesto: `proveedor_generar_formulario` por `<archivo>_<export>` (comentario `:17-20`). |
| AC-2 — xlsx CO + HN | cubierto | `bun run demo` deja `out/co-industrias-delta/formulario.xlsx` y `out/hn-agroexport-sula/formulario.xlsx` en disco; `data = {ruta, formato: "xlsx"}` en ambos (verificado por mi `bun -e` que inspeccionó `Object.keys(gen.data).sort().join(",")` = `"formato,ruta"`). |
| AC-3 — fidelidad celda-a-celda | cubierto | Mi `bun -e` abre cada xlsx con exceljs e itera `plantilla-celdas.json`: para CO (17 ítems) y HN (11 ítems), `ws.getCell(celda_etiqueta).value === etiqueta` y `ws.getCell(celda_valor).value === esperado` (lleno→valor serializado, else `null`). **0 mismatches** en ambos casos. Spot-check: CO/DP B3="Razón social", C3="Periferia IT Group S.A.S."; CO/DB "Banco"→"Bancolombia S.A.", "Número de cuenta"→"03100012345". |
| AC-4 — CA2 nunca inventa | cubierto | `escribirFormulario` (`src/lib/xlsx.ts:36-42`) solo consume `valores.get(etiqueta)` del `Map` construido en `runGenerar` (`:707-710`) a partir de `mapeo.llenos`. No lee del maestro ni fabrica strings. Los 0 mismatches de AC-3 lo confirman también. |
| AC-5 — multi-hoja CO | cubierto | `wb.worksheets.map(w=>w.name).sort().join("|")` = `"Datos Bancarios|Datos Proveedor"` (2 hojas exactamente). Celdas de ambas hojas spot-checked en AC-3. |
| AC-6 — pdf/portal sin archivo | cubierto | Mi `bun -e` invocó `generar_formulario` con `caso:"ec-corp-andina"` → `error === "formato pdf no implementado en slice 03; disponible en slice 04"` (byte-exact); con `caso:"pa-logistica-istmo"` → `error === "formato portal no implementado en slice 03; disponible en slice posterior"`. `test ! -f out/{ec,pa}/formulario.xlsx` → ambos ausentes tras `demo:clean && demo`. |
| AC-7 — error path sin lanzar | cubierto | `caso:"bogus"` → `{ok:false, error:"caso no encontrado: bogus"}`, exit 0, sin throw. `mapeo` con shape inválido es capturado por el try/catch global y mapeado a error claro. |
| AC-8 — log 3 líneas × 4 claves | cubierto | Para los 4 casos: `wc -l out/<caso>/log.jsonl` = 3. Mi `bun -e` validó `Object.keys(o).sort().join(",") === "herramienta,ok,resumen,ts"` para las 12 líneas totales; `herramienta` sigue el orden `leer→mapear→generar` por caso. 3ª línea de CO: `ok:true` con `resumen={formato,ruta,n_escritos,n_vacios}`. 3ª línea de EC: `ok:false` con `resumen={caso,formato:"pdf",error}`. |
| AC-9 — determinismo | cubierto | **stdout**: `diff /tmp/demo-a.txt /tmp/demo-b.txt` entre 2 corridas de `demo:clean` → 0 líneas. **contenido xlsx**: mi `bun -e` llamó `escribirFormulario` dos veces con mismas entradas → `JSON.stringify(snapshotA) === JSON.stringify(snapshotB)`. Snapshot canónico (sort por hoja+address) idéntico. Metadatos OOXML (createdAt) correctamente excluidos. |
| AC-10 — typecheck + sin `any` | cubierto | `bun x tsc --noEmit` exit 0. `rg -nw any src demo.ts src/scripts` → 0 matches. |
| AC-11 — rutas desde `ctx.directory` | cubierto | `rg "/[^\"']+"` en `src/tools`+`src/lib` → 0 string literal con path absoluto. Todas las rutas vía `casoDir(ctx,...)`, `outDir(ctx,...)`, `path.join(dir,...)`. `data.ruta` es relativa: `"out/<caso>/formulario.xlsx"` (D4 respetado). |
| AC-12 — dep justificada | cubierto | `package.json:17-20`: `dependencies.exceljs: "^4.4.0"`. `README.md` sección "Dependencias" (1 match a "exceljs") con justificación completa + alternativa descartada (OOXML a mano). Spec §6 decisión 3 también lo anota. |

### Reglas del PRD — aplicabilidad en slice 03

- **§6.2 contrato** — pass (AC-1, AC-11, D2 verificado: `data = {ruta, formato}` exactamente).
- **§6.3 CA1 (tope iteraciones)** — N/A (slice 06).
- **§6.3 CA2 (no inventa)** — pass (AC-4).
- **§6.3 CA3 (confirmación humana)** — N/A (sin acción externa).
- **§6.3 CA4 (log por tool call)** — pass (AC-8).
- **§6.3 CA5 (errores no matan)** — pass. 8 ramas de error clasificadas + catch global; nunca lanza.
- **§7.1 "plantilla-celdas.json"** — pass. `PlantillaCeldasSchema` valida la forma; iteración por plantilla cubre todos los ítems.
- **§7.3 RN1–RN5** — RN5 pass (AC-8); RN1 heredado de slice 02; RN2/RN3/RN4 N/A (slices 05/08).
- **§8 TS sin `any`, determinismo, deps justificadas** — pass. 1 dep nueva (`exceljs`) justificada. 0 shell. 0 `any`.
- **§8 Seguridad** — pass. `grep -En 'api[_-]?key|secret|token|password' src/` → sin matches.
- **§6.5 estructura** — pass. Helper en `src/lib/xlsx.ts` siguiendo patrón de slices 01/02.

### Divergencias plan §11 — verificación

| # | Divergencia declarada | Verificada |
|---|---|---|
| D1 | Helper `src/lib/xlsx.ts` | sí (`:1-46`) |
| D2 | `n_escritos`/`n_vacios` top-level, FUERA de `data` | sí: mi inspección confirmó `Object.keys(gen).sort().join(",")` = `"data,n_escritos,n_vacios,ok"` y `Object.keys(gen.data).sort().join(",")` = `"formato,ruta"`. Contrato §6.2 respetado |
| D3 | "escritos/vacíos" referido a plantilla | sí: `escribirFormulario` cuenta sobre `plantilla.length`, no sobre `valores.size`. HN muestra `9 escritos, 2 vacíos` para plantilla de 11 ítems |
| D4 | `data.ruta` relativa | sí (`:739`): `path.join("out", nombre, "formulario.xlsx")` |
| D5 | `verify:xlsx` auto-contenido | sí: `bun run verify:xlsx` corre independiente de `demo:clean` previo |
| D6 | Determinismo verificado via `escribirFormulario` 2× | sí: implementado en `verify-xlsx.ts` + re-verificado manualmente |
| D7 | Booleans → `"Sí"/"No"` | sí: `serializarValor(true)` = `"Sí"`, `serializarValor(false)` = `"No"`, `serializarValor({a:1})` = `"{\"a\":1}"` (defensivo) |

**Divergencias adicionales detectadas (no en §11)** — menor:
- El implementer añadió index signatures `[k: string]: unknown` en los tipos `LlenoRaw`/`EtiquetaRaw` de `demo.ts` (`:25-26`) para que TypeScript respete el `.passthrough()` de zod en consumption-side. Es solo tipado en el demo (no afecta runtime ni contrato), documentado por el implementer en `notas`. H-2 abajo.

## 3. Hallazgos

### H-1 — `demo.ts` cuenta formato skipped como `ok` (menor, informativo)
- **Severidad:** menor
- **Regla violada:** ninguna
- **Ubicación:** `demo.ts:79-85`
- **Qué pasa:** cuando `generar_formulario` devuelve el error exacto "formato pdf/portal no implementado…", el demo imprime `generar: skipped (formato <X>)` **e incrementa `okCount`**. Técnicamente el pipeline fracasó para ese caso (no se generó formulario), pero se contabiliza como OK porque es un fallo "esperado". Totales `ok: 4 | error: 0` para los 4 casos.
- **Qué debería pasar:** depende de la semántica. Spec dice "stdout determinista + exit 0 cuando todos los casos retornan `ok:true` en `leer_solicitud`" (heredado del slice 01). HU-3 P1/P2 están diferidas, no "fallidas". El conteo actual refleja intención.
- **Fix sugerido:** ninguno. Alternativa (si quisieras hacerlo explícito): contador separado `nSkipped` + totales `ok | error | skipped`. Fuera de alcance del slice.

### H-2 — Index signatures en `demo.ts` no listadas en §11 (menor, informativo)
- **Severidad:** menor
- **Regla violada:** divergence rule (memoria de proyecto)
- **Ubicación:** `demo.ts:25-26`
- **Qué pasa:** `type LlenoRaw = { etiqueta: string; valor: unknown; [k: string]: unknown }` y `type EtiquetaRaw = { etiqueta: string; [k: string]: unknown }` reflejan el `.passthrough()` de zod en el shape consumido por el demo. Esta divergencia está mencionada en `notas` del reporte del implementer pero no en plan §11.
- **Qué debería pasar:** convención del proyecto: toda divergencia planeada por el implementer que afecta tipos públicos debería estar en §11. Como es un detalle del demo (no del contrato de herramienta), el impacto es nulo.
- **Fix sugerido:** ninguno. Para el próximo slice: si el implementer prevé introducir tipos auxiliares en `demo.ts` que difieran de la literal del plan, debería anotarlo breve en §11 o pedir al coordinator que lo marque.

### H-3 — HN xlsx queda con RTN y 1 campo adicional vacíos (informativo, intencional)
- **Severidad:** menor (informativo)
- **Regla violada:** ninguna
- **Ubicación:** salida real del demo para `hn-agroexport-sula`
- **Qué pasa:** la plantilla HN tiene 11 ítems; el mapeo cae `9 llenos + 1 faltante + 1 requiere_confirmacion`. El xlsx producido tiene 2 celdas de valor vacías. Para el analista que abra el archivo, 2 campos quedan en blanco. Es el comportamiento intencional de la decisión spec §6.1 (celda vacía, el checklist del slice 05 reporta).
- **Qué debería pasar:** lo que pasa. El `requiere_confirmacion` de HN es el RTN con `nota_pais` por RN1 (identificador extranjero); el `faltante` es alguna etiqueta no mapeada en el glosario (típicamente observado como fuzzy <0.8).
- **Fix sugerido:** ninguno. Documentar en spec del slice 05 que el `checklist.md` debe listar explícitamente estos huecos; también documentar en `SOLUCION.md` cuando llegue.

## 4. Resultados de ejecución
- **typecheck**: pass — `bun x tsc --noEmit` exit 0.
- **demo.ts**: pass — 4 casos, `ok:4 | error:0`, exit 0; CO/HN generan xlsx, EC/PA skipped.
- **determinismo stdout**: pass — `diff` vacío entre 2 corridas.
- **determinismo xlsx (contenido)**: pass — snapshot canónico idéntico entre 2 `escribirFormulario`.
- **verify:xlsx**: pass — `ok: verify-xlsx`.
- **verify:ambiguous (regresión slice 01)**: pass — `ok: verify-ambiguous`.
- **verify:mapeo (regresión slice 02)**: pass — `ok: verify-mapeo`.
- **verify:h2 (regresión slice 02)**: pass — `ok: verify-h2-regression`.
- **error path (bogus)**: pass — `{ok:false, "caso no encontrado: bogus"}`, sin throw.
- **error path (pdf/portal exacto)**: pass — strings byte-exact de plan §5.3.
- **D2 contract adherence**: pass — `data = {ruta, formato}` estricto; `n_escritos`/`n_vacios` top-level fuera de `data`.
- **D7 booleans**: pass — `true`→`"Sí"`, `false`→`"No"`.
- **casos corridos**: 4 reales + 1 inexistente (bogus) + 2 formato diferido (EC pdf, PA portal) + 1 determinismo-writer (sintético) = 8 ejecuciones.
- **artefactos en `out/`**: CO/HN `formulario.xlsx` presentes; EC/PA ausentes; 4/4 `log.jsonl` con 3 líneas y 4 claves exactas; `out/_test/` ausente post-ejecución.
- **grep `any`**: 0 matches.
- **grep rutas absolutas en `src/tools`+`src/lib`**: 0 matches.
- **grep `throw` en `src/tools`+`src/lib`**: 0 matches.
- **secret scan**: 0 matches.

## 5. Veredicto
**pass**. Los 12 AC están cubiertos con evidencia que yo mismo rederivé (comandos de `bun`, `grep`, `diff`, scripts verify, inspección de xlsx con exceljs). El contrato §6.2 se respeta estrictamente: `data = {ruta, formato}` exactamente (D2 verificado por inspección directa del JSON retornado), tool nunca lanza, zod args con `.describe`. HU-3 P0 cumplido con fidelidad celda-a-celda (0 mismatches). Formatos diferidos pdf/portal devuelven error exacto sin side effects. Determinismo verificado tanto en stdout como en contenido del xlsx. Las 7 divergencias declaradas en plan §11 están implementadas; detecté 1 divergencia menor no listada (H-2) pero sin impacto en el contrato ni en los AC. Regresión de slices 01+02 verde. Los 3 hallazgos son menores informativos.

## 6. Siguientes pasos recomendados
Ninguno para cerrar este slice. Recomendaciones para el coordinator al abrir slices siguientes:
1. **Slice 04 (`generar_formulario` pdf)**: la switch en `runGenerar` ya tiene la rama pdf aislada (`:683-689`); el nuevo slice solo debe reemplazar su body. Confirmar en el spec que la rama xlsx no se toca (regresión controlada vía `verify:xlsx` existente).
2. **H-2 (proceso)**: en el próximo plan, pedir al planner que incluya cualquier cambio de tipos en `demo.ts` dentro de §11 si va más allá del shape literal del contrato.
3. **H-3 (slice 05)**: el `checklist.md` que armará `armar_paquete` debe listar explícitamente las celdas vacías del xlsx para que el analista las complete antes de la firma.
