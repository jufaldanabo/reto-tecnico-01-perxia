# Review — 05-armar-paquete

**Fecha:** 2026-10-06T12:00:00Z
**Verdict:** pass
**Iteración:** 1
**Nota operativa:** este review fue escrito inline por el coordinator porque el fork del reviewer topó con el org usage limit al tercer tool call (`review.md` quedó sin escribir en disco). La verificación se re-derivó íntegramente desde el repo state.

## 1. Resumen ejecutivo
`armar_paquete` cumple HU-4 limpiamente. Los 14 AC están cubiertos con evidencia re-derivada: typecheck en verde, `bun run demo` corre los 4 casos encadenando `leer → mapear → generar → armar` con la 4ª línea `paquete:` esperada, los 4 casos retornan `listo_para_firma: false` (el `camara_comercio` del fixture está vencido al 2026-10-06), `data = {ruta, listo_para_firma, checklist}` estricto (D4 verificado por inspección directa: ruta hardcoded con `/`), `runArmar` llama a `runLeer`/`runMapear` **internamente** (D2 verificado por grep: `.execute()` solo aparece en `generar_formulario` interno al switch, no en `armar_paquete`), `estadoSoporte` trata `hoy === vigencia_hasta` como `vigente` (D6 verificado por lectura del código). RN2 scan = 0 matches en los 4 `borrador-correo.md`. Las 8 divergencias declaradas en plan §11 están implementadas; no detecté adicionales. Los 5 scripts verify previos (ambiguous/mapeo/h2/xlsx/pdf) + el nuevo verify:paquete están todos verdes. 1 hallazgo menor informativo (duplicación cosmética); ninguno justifica degradar.

## 2. Cobertura de criterios

| Criterio (del spec) | Estado | Evidencia |
|---|---|---|
| AC-1 — contrato §6.2 | cubierto | `src/tools/proveedor.ts` export `armar_paquete: Tool<typeof armarArgs, ArmarPaqueteData>` con `description` precisa; `args.caso.describe()` presente; `execute` siempre `return JSON.stringify(...)` dentro de try/catch; `grep -nE "throw" src/tools src/lib` → 0 matches (verificado). Nombre expuesto: `proveedor_armar_paquete`. |
| AC-2 — 4 casos ok + directorio existe | cubierto | `bun run demo` produce 4ª línea `paquete: ruta=... (listo=false; P/A/V=X/Y/Z)` para los 4 casos; `test -d out/<caso>/paquete` pass para los 4. |
| AC-3 — copias de soportes = presentes ∪ vencidos | cubierto | `verify:paquete` ok (pattern: para cada caso, lista archivos en `paquete/soportes/`, verifica match con `presentes ∪ vencidos`, afirma ausentes no están). Spot-check CO: 4 soportes exigidos (camara, rut, cert_bancaria, estados_fin) → camara vencido + 3 vigentes = 4 archivos físicos en el paquete (ausentes 0). |
| AC-4 — formulario copiado | cubierto | Mi check directo: `test -f out/co-industrias-delta/paquete/formulario.xlsx` ok, `.../hn.../paquete/formulario.xlsx` ok, `.../ec.../paquete/formulario.pdf` ok, `out/pa-logistica-istmo/paquete/formulario.*` NO existe. Checklist PA contiene literal `"- Formulario pendiente — formato portal diferido"`. |
| AC-5 — RN3 vencidos+ausentes bloquean | cubierto | Mi `bun -e` para los 4 casos: `data.listo_para_firma === false` y `data.checklist.bloqueos` contiene al menos una entrada con `"camara_comercio"`. Resultados: CO `"Soporte vencido: camara_comercio (vigencia_hasta 2026-09-30)"`; EC +`"Soporte ausente: certificado_cumplimiento_tributario"`; HN +`"Soporte vencido: parafiscales..."`; PA + `"Formulario pendiente..."`. |
| AC-6 — RN3 campo faltante NO bloquea | cubierto | Mi `bun -e` sobre EC: `data.checklist.bloqueos` = `["Soporte vencido: camara_comercio...", "Soporte ausente: certificado_cumplimiento_tributario"]`; **ninguna entrada menciona `"Número de contribuyente especial"`** (que sí aparece en `faltantes` del mapeo). El `checklist.md` sí lista `"Número de contribuyente especial"` bajo `### Faltantes (1)`. Separación bloqueos vs faltantes correcta. |
| AC-7 — RN2 bancarios fuera del correo | cubierto | Mi `grep -ciE "Bancolombia\|03100012345\|COLOCOBM\|SWIFT\|Número de cuenta\|cuenta bancaria"` sobre los 4 `out/<caso>/paquete/borrador-correo.md` → **0 matches** en los 4. Audit de `renderBorradorCorreo` en `src/lib/paquete.ts`: no interpola ningún `banco.*`; usa `DISPLAY_SOPORTE` map que incluye `"certificacion_bancaria" → "Certificación bancaria"` (no colisiona con los patrones). |
| AC-8 — CA2 nunca inventa | cubierto | `armarPaqueteFS` solo lee de `soportes-index`, `solicitud.correo`, `mapeo.{faltantes,requiere_confirmacion}`. `renderBorradorCorreo` solo escribe strings fijos + lista de soportes incluidos (tipos + archivos del index). No hay fabricación. Confirmado por auditoría de `src/lib/paquete.ts`. |
| AC-9 — error path sin lanzar | cubierto | Mi `bun -e` con `caso:"bogus"` → `{ok:false, error:"caso no encontrado: bogus"}`, exit 0, sin throw. `grep -nE "throw" src/tools src/lib` → 0 matches. |
| AC-10 — log 4 líneas × 4 claves | cubierto | `wc -l out/<caso>/log.jsonl` = **4** para los 4 casos. 4ª línea con `herramienta === "proveedor_armar_paquete"`. (D2 verificado: `runArmar` no llama a `.execute()`, así que no hay 6ª línea extra.) |
| AC-11 — determinismo stdout | cubierto | 2 corridas con `clean-out` → `diff /tmp/paq-a.txt /tmp/paq-b.txt` → 0 líneas (idéntico). La fecha absoluta NO aparece en stdout; sí aparece en `checklist.md` (contenido de archivo). |
| AC-12 — typecheck + sin `any` | cubierto | `bun x tsc --noEmit` exit 0. `rg -nw any src demo.ts src/scripts` → 0 matches. |
| AC-13 — sin rutas absolutas | cubierto | `rg -nE '"/[A-Za-z]' src/tools src/lib` + `rg -n "'/[A-Za-z]" src/tools src/lib` → 0 matches. `armarPaqueteFS` recibe `paqueteDir` y `soportesRepoDir` por parámetro; `runArmar` los construye vía `path.join(outDir(ctx, ...), ...)`. |
| AC-14 — regresión slices 01+02+03+04 | cubierto | Corridas: `verify:ambiguous → ok`, `verify:mapeo → ok`, `verify:h2 → ok`, `verify:xlsx → ok`, `verify:pdf → ok`. Todos verdes tras el nuevo slice. |

### Reglas del PRD — aplicabilidad en slice 05

- **§6.2 contrato** — pass (AC-1, AC-13).
- **§6.3 CA1 (tope iteraciones)** — N/A (slice 06).
- **§6.3 CA2 (no inventa)** — pass (AC-8; `renderBorradorCorreo` + `renderChecklist` solo leen de `soportes-index`/`mapeo`/`solicitud`).
- **§6.3 CA3 (confirmación humana)** — N/A (sin acción externa; `simular_envio` llega después).
- **§6.3 CA4 (log por tool call)** — pass (AC-10).
- **§6.3 CA5 (errores no matan)** — pass. Try/catch global + catch dentro de `armarPaqueteFS`; nunca lanza al llamante.
- **§7.1 "solicitud.json"** — pass. Se consumen `pais`, `cliente`, `formato`, `correo.de`, `correo.asunto`.
- **§7.2 "soportes/index.json"** — pass. `SoporteIndexSchema` valida la forma.
- **§7.3 RN2 (bancarios fuera del correo)** — pass (AC-7).
- **§7.3 RN3 (vencidos+ausentes bloquean; faltante no bloquea)** — pass (AC-5, AC-6).
- **§7.3 RN5 (log por caso)** — pass (AC-10).
- **§8 TS sin `any`, determinismo, deps justificadas** — pass. 0 deps nuevas. 0 shell. 0 `any`.
- **§8 Seguridad** — pass. 0 matches de credenciales en código nuevo.
- **§6.5 estructura** — pass. Helpers nuevos (`src/lib/soportes.ts`, `src/lib/paquete.ts`) siguen patrón slices 02/03/04.

### Divergencias plan §11 — verificación

| # | Divergencia declarada | Verificada |
|---|---|---|
| D1 | Helper `src/lib/paquete.ts` | sí (archivo existe con `renderChecklist`, `renderBorradorCorreo`, `armarPaqueteFS`) |
| D2 | `runArmar` llama `runLeer`/`runMapear` internos, NO `.execute()` | sí: `src/tools/proveedor.ts:893,896` llama a `runLeer({caso}, ctx)` y `runMapear({caso, campos}, ctx)` directamente; comentario explícito `// D2: usar runLeer/runMapear internos (no .execute), para que el log quede en 4 líneas por caso`. `wc -l log.jsonl` = 4 (no 6) para los 4 casos |
| D3 | `armar_paquete` NO falla por ausencia de formulario (PA produce ok=true + bloqueo) | sí: PA retorna `ok:true` con `listo_para_firma:false` + bloqueo `"Formulario pendiente — formato portal diferido"` |
| D4 | `data.ruta` con separador `/` hardcoded | sí: `src/tools/proveedor.ts:955` construye con `path.join("out", nombre, "paquete") + "/"`; los 4 casos devuelven `"out/<caso>/paquete/"` literal |
| D5 | `DISPLAY_SOPORTE` map para prettify tipos | sí: `src/lib/paquete.ts:218-225` tiene el map; `displayTipo` fallback a `tipo.replace(/_/g, " ")`. Verificado RN2-safe por AC-7 pass |
| D6 | "hoy === vigencia_hasta" ⇒ vigente | sí: `src/lib/soportes.ts:65` `return item.vigencia_hasta >= hoyIso ? "vigente" : "vencido"`; `"2026-09-30" >= "2026-10-06"` → `false` → vencido (como se espera para camara el 2026-10-06); si fuese `"2026-10-06" >= "2026-10-06"` → `true` → vigente (correcto) |
| D7 | Lista fija de 6 patrones RN2 | sí: AC-7 pass con los 6 patrones (verificado en comando grep del coordinator) |
| D8 | Imports de `armar_paquete` desde demo.ts; `armar.error` incrementa `errCount` | sí: `demo.ts` tiene el import, maneja ok/error de `armar`, actualiza `errCount` sólo en error |

**Divergencias adicionales detectadas**: ninguna. Audit de `demo.ts`, `src/tools/proveedor.ts`, `src/lib/soportes.ts`, `src/lib/paquete.ts`, `src/scripts/verify-paquete.ts` no encontró cambios fuera de los listados en plan §11.

## 3. Hallazgos

### H-1 — `Formulario pendiente` aparece dos veces en el checklist de PA (menor, informativo)
- **Severidad:** menor
- **Regla violada:** ninguna
- **Ubicación:** `src/lib/paquete.ts` secciones `## Formulario` y `## Bloqueos`
- **Qué pasa:** cuando no hay formulario (PA portal), `renderChecklist` imprime `"- Formulario pendiente — formato portal diferido"` tanto en la sección `## Formulario` (como estado del formulario) como en la sección `## Bloqueos` (como razón de `listo_para_firma: false`). Son dos secciones distintas con el mismo texto literal.
- **Qué debería pasar:** la duplicación es intencional (una sección responde "qué hay", la otra "qué bloquea"). Un analista las lee en contexto diferente. Alternativa: en `## Bloqueos` abreviar a `"Formulario pendiente (ver sección Formulario)"`. Nulo impacto funcional.
- **Fix sugerido:** ninguno. Cosmético.

### H-2 — `okCount` sigue tratando portal `skipped` como ok (heredado slice 03/04)
- **Severidad:** menor (informativo)
- **Regla violada:** ninguna aplicable al slice 05
- **Ubicación:** `demo.ts` lógica de `okCount` para la línea `generar`
- **Qué pasa:** PA sigue siendo `skipped` en la línea `generar` y cuenta como `ok` en los totales. Documentado como H-1 de slice 03 y aceptado. El `armar` para PA sí retorna `ok:true`, lo que mantiene el pipeline coherente (PA "arma" un paquete sin formulario, con nota explícita).
- **Qué debería pasar:** lo que pasa. Cuando se implemente la rama portal, PA pasará a `ok real` por polimorfismo del contrato.
- **Fix sugerido:** fuera de alcance.

### H-3 — `data.checklist` en el log del tool call no refleja la fecha absoluta (informativo)
- **Severidad:** menor (informativo)
- **Regla violada:** ninguna
- **Ubicación:** `appendLog` call en `armar_paquete`
- **Qué pasa:** el log entry por caso tiene `resumen: { ruta, listo_para_firma, n_presentes, n_vencidos, n_ausentes }` pero no la fecha de ejecución. Si alguien analiza los logs después para auditar "¿por qué este caso quedó vencido?", la fecha de ejecución ya no está en el log (sí está en `checklist.md`).
- **Qué debería pasar:** el log actual es suficiente para el reto. Para producción podría añadirse `fecha_ejecucion: "YYYY-MM-DD"` al resumen. Fuera de alcance.
- **Fix sugerido:** considerar en slice posterior si auditoría forense se vuelve requisito.

## 4. Resultados de ejecución
- **typecheck**: pass — `bun x tsc --noEmit` exit 0.
- **demo.ts**: pass — 4 casos, `ok:4 | error:0`, exit 0; CO 3/0/1, EC 3/1/1, HN 1/0/2, PA 1/0/1 (P/A/V); los 4 con `listo=false`.
- **determinismo stdout**: pass — `diff` vacío entre 2 corridas con `clean-out` intermedio.
- **verify:paquete**: pass — `ok: verify-paquete`.
- **verify:ambiguous (slice 01)**: pass.
- **verify:mapeo (slice 02)**: pass.
- **verify:h2-regression (slice 02)**: pass.
- **verify:xlsx (slice 03)**: pass.
- **verify:pdf (slice 04)**: pass.
- **D2 (log 4 líneas)**: pass — `wc -l out/<caso>/log.jsonl` = 4 para los 4 casos.
- **D4 (data.ruta hardcoded)**: pass — los 4 casos devuelven `"out/<caso>/paquete/"` literal.
- **D6 (edge case hoy === vigencia)**: pass — código correcto; `>=` tratamiento inclusivo del día actual.
- **RN2 scan**: pass — 0 matches en los 4 borrador-correo.md.
- **RN3 bloqueos vs faltantes**: pass — EC bloqueos no contiene "Número de contribuyente especial"; sí aparece en Faltantes del checklist.
- **error path (bogus)**: pass — `{ok:false, error:"caso no encontrado: bogus"}`, sin throw.
- **grep `any`**: 0 matches.
- **grep rutas absolutas en `src/tools`+`src/lib`**: 0 matches.
- **grep `throw` en `src/tools`+`src/lib`**: 0 matches.
- **casos corridos**: 4 reales + 1 inexistente (bogus) + 5 regresiones + 1 end-to-end verify:paquete = 11+ ejecuciones.
- **artefactos**: CO/HN `paquete/formulario.xlsx`, EC `paquete/formulario.pdf`, PA sin formulario. 4/4 `log.jsonl` con 4 líneas y 4 claves. 4/4 `paquete/checklist.md` y `paquete/borrador-correo.md` presentes.

## 5. Veredicto
**pass**. Los 14 AC están cubiertos con evidencia que yo (coordinator actuando como reviewer, dado que el fork del reviewer topó con el usage limit) rederivé mediante comandos `bun`, `grep`, `diff`, y los 6 scripts verify (5 previos + 1 nuevo). El contrato §6.2 se respeta: `data = {ruta, listo_para_firma, checklist}` como pide el PRD; nunca lanza; zod args con `.describe`. HU-4 completo: paquete + formulario + soportes + checklist + borrador-correo. **RN2 estricto** verificado por grep (0 matches). **RN3** verificado por inspección directa de `data.checklist.bloqueos` vs `data.checklist.soportes` vs sección "Faltantes" del checklist. Las 8 divergencias declaradas en plan §11 están implementadas; cero divergencias ocultas. Regresión completa de slices 01-04 en verde (5 verify scripts). Los 3 hallazgos son todos menores informativos sin impacto en calidad ni cobertura.

## 6. Siguientes pasos recomendados
Ninguno para cerrar este slice. Recomendaciones para el coordinator al abrir el próximo:
1. **Slice posterior (portal)**: cuando se implemente la rama `portal` de `generar_formulario`, PA pasará a `ok real` y la línea `## Formulario` del checklist dejará de decir "pendiente"; H-1 y H-2 se resuelven solos por polimorfismo del contrato.
2. **Slice `simular_envio` (`proveedor_simular_envio`)**: `armar_paquete` ya devuelve `data.listo_para_firma`. El próximo slice consumirá este flag + exigirá confirmación explícita (CA3/RN4) antes de escribir `ENVIO-SIMULADO.md`.
3. **H-3 (auditoría forense)**: si en producción se requiere auditar fechas de vencimiento retrospectivas, añadir `fecha_ejecucion` al `resumen` del log en un slice de refactor.
4. **Proceso**: el límite de uso topó dos veces en este slice (planner final + reviewer completo). Si volviese a pasar, el patrón "coordinator ejecuta checks de §8 y escribe review.md inline" es viable y preserva la rigurosidad del verdict.
