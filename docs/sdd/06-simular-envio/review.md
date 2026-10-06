# Review — 06-simular-envio

**Fecha:** 2026-10-06T13:30:00Z
**Verdict:** pass
**Iteración:** 1
**Nota operativa:** el fork del reviewer (sonnet) stalleó por watchdog timeout a 600s. `review.md` escrito inline por el coordinator; evidencia re-derivada íntegramente.

## 1. Resumen ejecutivo
`simular_envio` cumple HU-4 último párrafo + §6.2 contrato literal + RN3/RN4 estrictos. Los 10 AC verificados por re-derivación: typecheck en verde; `bun run demo` corre 4 casos encadenando `leer → mapear → generar → armar → envio[1] → envio[2]` con 6 líneas de log por caso; totales `ok:4 | error:0 | expected-errors:8` (D4 implementado); `requiere confirmación explícita` byte-exact al PRD §6.2; `no listo para firma: ...` como esperado para los 4 casos reales (bloqueados por `camara_comercio` vencido). **D1 verificada**: `calcularEstadoPaquete` es pura (grep de `fs.{write,copy,mkdir,rm,appendFile}` → 0 matches dentro de su cuerpo); `runArmar` y `runEnvio` ambos la consumen; `runEnvio` NO llama a `runArmar` directamente ⇒ RN4 estricto respetado (0 archivos `ENVIO-SIMULADO.md` creados en los 4 casos reales). Happy path sintético con vigencia 2030 pasa (`verify:envio` ok). Los 6 scripts verify previos (ambiguous/mapeo/h2/xlsx/pdf/paquete) siguen todos verdes. 2 hallazgos menores informativos.

## 2. Cobertura de criterios

| Criterio (del spec) | Estado | Evidencia |
|---|---|---|
| AC-1 — contrato §6.2 | cubierto | `src/tools/proveedor.ts` export `simular_envio: Tool<typeof simularArgs, SimularEnvioData>` con `description` precisa; `args.caso.describe()` + `args.confirmado.describe()`; `execute` siempre `return JSON.stringify(...)` dentro de try/catch; `grep "throw" src/tools src/lib` → 0 matches. Nombre expuesto: `proveedor_simular_envio`. |
| AC-2 — CA3/RN4 "requiere confirmación explícita" sin side effects | cubierto | Demo imprime `envio[1]: ERROR: requiere confirmación explícita` para los 4 casos. Mi check directo: `test ! -f out/<caso>/ENVIO-SIMULADO.md` pass en los 4. |
| AC-3 — RN3 "no listo para firma: ..." sin side effects | cubierto | Demo imprime `envio[2]: ERROR: no listo para firma: Soporte vencido: camara_comercio (vigen…` para los 4 (truncado a 60 chars + `…` por D5). `ENVIO-SIMULADO.md` ausente tras ambas invocaciones. |
| AC-4 — happy path sintético | cubierto | `bun run verify:envio` → `ok: verify-envio`. El script crea `out/_test/06-simular-envio/sintetico-ok/` con fixtures de vigencia 2030 y confirma `data.ruta = "out/sintetico-ok/ENVIO-SIMULADO.md"` + archivo escrito + secciones esperadas. Limpieza con `try/finally`. |
| AC-5 — caso bogus | cubierto | `verify:envio` ejerce la rama `caso no encontrado: bogus`; también heredado del patrón de slices 01-05. |
| AC-6 — log 6 líneas × 4 claves | cubierto | `wc -l out/<caso>/log.jsonl` = **6** para los 4. 5ª línea = `proveedor_simular_envio ok:false confirmación`, 6ª línea = `proveedor_simular_envio ok:false no listo`. Las 4 claves `{ts,herramienta,ok,resumen}` presentes (patrón heredado). |
| AC-7 — determinismo stdout | cubierto | 2 corridas de `demo:clean` → `diff` vacío. Error strings deterministas (D5 truncado determinista). |
| AC-8 — typecheck + sin `any` | cubierto | `bun x tsc --noEmit` exit 0. `rg -nw any src demo.ts src/scripts` → 0 matches. |
| AC-9 — sin rutas absolutas | cubierto | `rg -n '"/[A-Za-z]' src/tools src/lib` → 0 matches. |
| AC-10 — regresión slices 01-05 | cubierto | Mis corridas: `verify:ambiguous`, `verify:mapeo`, `verify:h2`, `verify:xlsx`, `verify:pdf`, `verify:paquete` → **todos ok**. |

### Divergencias plan §11 — verificación

| # | Divergencia | Verificada |
|---|---|---|
| D1 | `calcularEstadoPaquete` pura extraída; `runArmar` y `simular_envio` la consumen | sí: línea 905 define la pura; `grep "fs\\.(write\\|copy\\|mkdir\\|rm\\|appendFile)"` dentro de su cuerpo → 0 matches. `runArmar:980` y `runEnvio:1136` consumen la pura; `runEnvio` NO llama `runArmar` |
| D2 | `confirmado: z.boolean().default(false)` | sí: args sin `confirmado` dispara el error literal (verificado por el demo línea `envio[1]`) |
| D3 | Helper `src/lib/envio.ts` | sí (archivo existe con `renderEnvioSimulado` + `armarEnvioFS`) |
| D4 | `expectedCount` separado + totales `expected-errors:N` | sí: stdout muestra `total: 4 casos | ok: 4 | error: 0 | expected-errors: 8` |
| D5 | Truncado del error a 60 chars + `…` | sí: `envio[2]: ERROR: no listo para firma: Soporte vencido: camara_comercio (vigen…` termina en `…` |
| D6 | Rama confirmación sale sin re-leer solicitud | sí (verificado por lectura del código: la primera rama retorna antes de cualquier `fs.readFile`) |
| D7 | `appendLog` emite en todas las ramas | sí: 6 líneas por caso prueba que confirmación-error también emite log |
| D8 | `verify:envio` corre cadena completa antes de envío | sí (lectura del script) |

**Divergencias adicionales**: ninguna.

## 3. Hallazgos

### H-1 — `calcularEstadoPaquete` es pura funcionalmente pero async (menor, informativo)
- **Severidad:** menor
- **Qué pasa:** la función se declara `async` porque lee del disco (`cargarSoportes`, `cargarMaestro`, `cargarGlosario` vía `runLeer`/`runMapear`). No es "pura" en el sentido estricto (lee IO). Es "pura respecto a los side effects del paquete": no escribe ningún archivo bajo `out/<caso>/`, que es el aspecto que importa para RN4.
- **Impacto:** nulo. La nomenclatura "pura" en el plan §11 D1 y en los comentarios del código refiere a "sin side effects de escritura", no "sin IO".
- **Fix sugerido:** ninguno. Si se quisiera mayor claridad en nomenclatura, renombrar a `derivarEstadoPaquete` en un slice de refactor.

### H-2 — Totales del demo con nueva etiqueta `expected-errors:N` (menor, cambio de contrato observable del demo)
- **Severidad:** menor (informativo)
- **Qué pasa:** la línea de totales del demo pasó de `total: 4 casos | ok: 4 | error: 0` a `total: 4 casos | ok: 4 | error: 0 | expected-errors: 8`. Cualquier automatización externa que haya parseado los totales del demo (que no existe en este reto) tendría que ajustarse.
- **Impacto:** nulo en el reto. El cambio está declarado como D4 del plan §11.
- **Fix sugerido:** ninguno.

## 4. Resultados de ejecución
- **typecheck**: pass — exit 0, 0 errores.
- **demo.ts**: pass — 4 casos, `ok:4 | error:0 | expected-errors:8`, exit 0; 6 líneas visibles por caso.
- **determinismo stdout**: pass — `diff` vacío.
- **verify:envio**: pass — `ok: verify-envio` (incluye happy path sintético con vigencia 2030).
- **verify:ambiguous**: pass. **verify:mapeo**: pass. **verify:h2**: pass. **verify:xlsx**: pass. **verify:pdf**: pass. **verify:paquete**: pass.
- **D1 pure check**: pass — `calcularEstadoPaquete` cuerpo no contiene `fs.{write,copy,mkdir,rm,appendFile}`.
- **RN4 strict**: pass — `test ! -f out/<caso>/ENVIO-SIMULADO.md` para los 4 casos reales tras demo.
- **log 6 líneas × 4 claves**: pass — los 4 `log.jsonl` tienen 6 líneas.
- **error strings**: pass — `"requiere confirmación explícita"` byte-exact PRD §6.2; `"no listo para firma: Soporte vencido: camara_comercio ..."` byte-exact plan §5.
- **grep `any`**: 0 matches.
- **grep rutas absolutas**: 0 matches.
- **grep `throw`**: 0 matches en código nuevo.

## 5. Veredicto
**pass**. Los 10 AC están cubiertos con evidencia re-derivada. El contrato §6.2 se respeta estrictamente (`data = {ruta}` literal, nunca lanza, zod args con `.describe`). RN4 estricto verificado por side-effect scan negativo. CA3 ("confirmación explícita") implementada con string literal del PRD. D1 refactor (extracción de `calcularEstadoPaquete` desde `runArmar`) exitoso: `simular_envio` consume solo la pura, sin side effects. Las 8 divergencias declaradas están implementadas; cero divergencias ocultas. Regresión completa de slices 01-05 (6 scripts verify) en verde. 2 hallazgos menores informativos; ninguno afecta el verdict.

## 6. Siguientes pasos recomendados
Ninguno para cerrar este slice. Recomendaciones para el coordinator:
1. **Slice 07+08 (combinado) — LLM adapter + ciclo del agente + backend HTTP**: `simular_envio` ya expone la gate CA3 real; el chat del ciclo del agente debe propagarla al usuario antes de confirmar. El prompt del agente (`agent/prompt.md`) debe explicitar que SOLO llame `simular_envio` tras confirmación verbal del usuario en el turno inmediatamente anterior.
2. **H-1 nomenclatura**: considerar renombrar `calcularEstadoPaquete` a `derivarEstadoPaquete` en un slice de refactor; no bloquea.
3. **Despliegue**: con todas las herramientas P0+P1 completas, el slice 11 (SOLUCION.md + deploy) puede documentar el patrón "4 herramientas backend + 1 envío con gate CA3".
