# Review — 02-mapear-campos

**Fecha:** 2026-10-06T03:35:00Z
**Verdict:** pass
**Iteración:** 1

## 1. Resumen ejecutivo
`mapear_campos` cumple el contrato §6.2 limpiamente. Los 13 AC están cubiertos con evidencia rederivada por mí: typecheck en verde, `bun run demo` corre los 4 casos con partición exacta (sin duplicados), determinismo verificado por `diff` vacío, log por caso con 2 líneas y 4 claves cada una, RN1 real emitiendo la nota literal del PRD para EC/HN/PA, `verify:mapeo` cubriendo AC-3/5/6 con aserciones estrictas, `verify:h2` validando la regresión y `verify:ambiguous` del slice 01 sigue en verde (la deuda H-2 se pagó sin romper nada). Las 7 divergencias declaradas en plan §11 están implementadas como se declararon. 3 hallazgos menores informativos — ninguno justifica degradar.

## 2. Cobertura de criterios

| Criterio (del spec) | Estado | Evidencia |
|---|---|---|
| AC-1 — contrato §6.2 (zod + string JSON + nunca lanza) | cubierto | `src/tools/proveedor.ts:572-612`: export `mapear_campos: Tool<typeof mapearArgs, MapeoData>` con `description` precisa; `args.caso.describe()` y `args.campos.describe()` presentes (`:327-332`); `execute` siempre `return JSON.stringify(...)` dentro de try/catch global (`:576-611`). `grep "throw" src/tools src/lib` → 0 matches. Nombre expuesto: `proveedor_mapear_campos` por convención `<archivo>_<export>` (comentario `:12-15`). |
| AC-2 — partición exacta (|L|+|F|+|C| = n_campos) sin duplicados | cubierto | Mi `bun -e` por caso: CO 17=17+0+0, EC 15=13+1+1, HN 11=9+1+1, PA 9=8+0+1 — todos `partition_ok=true, dupes=0`. |
| AC-3 — CA2 nunca inventa | cubierto | `verify:mapeo` sub-AC3 (`src/scripts/verify-mapeo.ts:62-103`): maestro sintético sin `razon_social` → `faltantes.length === 1` + aserción adicional `JSON.stringify(data).includes("Periferia IT Group")` debe ser false. Ejecución: `ok: verify-mapeo`. |
| AC-4 — RN1 identificador extranjero | cubierto | Mi `bun -e` sobre los 4 casos: CO tiene NIT en `llenos` con `valor="900123456"`; EC/HN/PA tienen el ítem con `ruta_maestro=="nit"` en `requiere_confirmacion` con `valor="900123456"` y `nota_pais` empezando con `"identificador extranjero: Periferia solo tiene NIT colombiano; para <PAIS> se espera <RUC|RTN>"` literal. |
| AC-5 — normalización (RAZON SOCIAL ↔ Razón social) | cubierto | `verify:mapeo` sub-AC5 (`src/scripts/verify-mapeo.ts:105-137`): aserciones `data.llenos.length === 1`, `ruta_maestro === "razon_social"`, `valor === "Acme S.A."`, `confianza === 1.0`. Ejecución: `ok: verify-mapeo`. `normalizar` en `src/lib/normalize.ts:1-7` aplica NFD + strip Diacritic + lower + trim + collapse spaces. |
| AC-6 — fuzzy ∈ [0.8, 1.0) + <0.8 → faltante | cubierto | `verify:mapeo` sub-AC6 (`src/scripts/verify-mapeo.ts:139-192`) usa `"Correo electronicos"` (plural, difiere POST-normalize de `"Correo electrónico"`) → cae en `requiere_confirmacion` con `confianza ∈ [0.8, 1.0)` + motivo contiene `"Correo electrónico"`. También usa `"ZZZZZZZZZZZZZZZZZZZZ-totalmente-distinto"` → `faltante` con motivo que menciona `"confianza <0.8"`. Ejecución: `ok: verify-mapeo`. |
| AC-7 — preservación de `destino` | cubierto | Mi `bun -e`: `llenos[0].destino_present=true` para CO (xlsx) y HN (xlsx); `=false` para EC (pdf) y PA (portal). |
| AC-8 — error path (bogus) sin lanzar | cubierto | Mi `bun -e` con `caso:"bogus"` → `{"ok":false,"error":"caso no encontrado: bogus"}`, exit 0, sin throw. |
| AC-9 — log 2 líneas × 4 claves exactas | cubierto | `wc -l` por caso = 2 (4/4); cada línea tiene exactamente `ts`, `herramienta`, `ok`, `resumen`; `herramienta` es `proveedor_leer_solicitud` en la primera y `proveedor_mapear_campos` en la segunda. |
| AC-10 — determinismo stdout | cubierto | 2 corridas con `clean-out` intermedio → `diff /tmp/demo-a.txt /tmp/demo-b.txt` exit 0 (idéntico). `demo.ts` no imprime `ts` (viven solo en `log.jsonl`). |
| AC-11 — typecheck + sin `any` | cubierto | `bun x tsc --noEmit` exit 0. `grep -rn -w "any" src demo.ts src/scripts` → 0 matches. |
| AC-12 — rutas desde `ctx.directory` | cubierto | `grep -rnE "[\"']/[^\"']+[\"']" src/tools src/lib` → 0 matches. `maestroPath`/`glosarioPath`/`casoDir`/`outDir` todas se construyen con `path.join(ctx.directory, …)`. |
| AC-13 — deuda H-2 pagada | cubierto | `grep -rnE 'msg\.includes\("(formato\|pais)"\)' src/tools/proveedor.ts` → 0 matches. `src/tools/proveedor.ts:97-131` implementa `leerJson` que incluye `issues?: ZodIssue[]` en la rama de error; `:184-197` y `:417-429` clasifican vía `issues.some(i => i.path[0] === "formato"\|"pais")`. `bun run verify:h2` → `ok: verify-h2-regression`. `bun run verify:ambiguous` (slice 01) → `ok: verify-ambiguous` (sin regresión). |

### Reglas del PRD — aplicabilidad en slice 02

- **§6.2 contrato de herramientas** — pass (AC-1, AC-12).
- **§6.3 CA1 (tope iteraciones)** — N/A (slice 06).
- **§6.3 CA2 (no inventa valores)** — pass (AC-3; rama E del código verifica `=== undefined || === null` estricto, no truthiness).
- **§6.3 CA3 (confirmación humana)** — N/A (sin acción externa).
- **§6.3 CA4 (tool calls en log)** — pass. `appendLog` tras cada invocación (ok y error).
- **§6.3 CA5 (errores no matan)** — pass. 8 ramas de error clasificadas + catch global; nunca lanza.
- **§7.2 repositorio maestro** — pass. `MaestroSchema = z.record(z.string(), z.unknown())`; `GlosarioSchema = z.record(z.string(), z.string())`; walker nested seguro en `src/lib/maestro.ts:65-73` (no eval).
- **§7.3 RN1** — pass (AC-4). Mensajes literales del PRD.
- **§7.3 RN2/RN3/RN4/RN5** — RN5 pass (AC-9); RN2/RN3/RN4 N/A (slices 05/08).
- **§8 TS sin `any`, determinismo, sin shell, deps nuevas** — pass. 0 deps nuevas. Rama que ejecuta shell: ninguna.
- **§8 Seguridad** — pass. Secret scan `grep -En 'api[_-]?key|secret|token|password' src/` → sin matches literales con pinta de credencial.

### Divergencias plan §11 — verificación

| # | Divergencia declarada | Verificada |
|---|---|---|
| D1 | 4 helpers nuevos en `src/lib/` | sí: `normalize.ts`, `levenshtein.ts`, `pais.ts`, `maestro.ts` existen con la forma declarada. |
| D2 | `NOTA_POR_PAIS` migrado a `src/lib/pais.ts` | sí: `src/lib/pais.ts:12-18` lo define; `src/tools/proveedor.ts:7` lo importa; `verify:ambiguous` sigue pass → sin regresión. |
| D3 | 2 scripts de verificación (mapeo + h2) | sí: `verify-mapeo.ts` + `verify-h2-regression.ts` existen; `check` encadena ambos (`package.json`). |
| D4 | `campos.min(1)` | sí: `src/tools/proveedor.ts:330`. |
| D5 | Línea demo indentada 2 espacios con etiqueta `mapeo:` | sí: `demo.ts:52-54` imprime `  mapeo: L llenos, F faltantes, C requiere_confirmacion`. |
| D6 | `pais` por re-lectura directa (no re-llama `leer_solicitud`) | sí: `src/tools/proveedor.ts:413-430` lee `solicitud.json` + `SolicitudSchema` directamente. |
| D7 | Comparación `=== undefined \|\| === null` | sí: `src/tools/proveedor.ts:545`. |

**Ninguna divergencia adicional detectada** fuera de las 7 declaradas.

## 3. Hallazgos

### H-1 — Redundancia `motivo` ≡ `nota_pais` en la rama RN1 (menor)
- **Severidad:** menor
- **Regla violada:** ninguna (opcional, polish)
- **Ubicación:** `src/tools/proveedor.ts:531-541`
- **Qué pasa:** En la rama D (RN1 identificador extranjero) el ítem resultante tiene `motivo` y `nota_pais` apuntando al **mismo** string (`notaIdentExtranjero(pais)`). Mismo texto repetido en dos campos.
- **Qué debería pasar:** `motivo` podría ser un marcador conciso (`"RN1: identificador extranjero"`) y `nota_pais` el mensaje literal largo. Separa el "por qué cae aquí" del "cómo explicarlo al usuario".
- **Fix sugerido (opcional)**: en slice 03/04 cuando se consuma `requiere_confirmacion`, decidir si el chat muestra ambos. Si solo muestra uno, consolidar para evitar duplicación visual. No bloquea cierre.

### H-2 — `fail` como function declaration en los verify scripts (menor)
- **Severidad:** menor
- **Regla violada:** ninguna (desviación del plan §5)
- **Ubicación:** `src/scripts/verify-mapeo.ts:26-28`, `src/scripts/verify-h2-regression.ts:12-14`
- **Qué pasa:** Plan §5 presentó los helpers con arrow functions; el implementer usó `function fail(msg: string): never` para que TypeScript respete el narrowing `never`. Equivalente semántico.
- **Qué debería pasar:** cualquiera de las dos formas sirve. El implementer lo documentó en su reporte final; no es sorpresa.
- **Fix sugerido:** ninguno. Dejar nota.

### H-3 — Fuzzy semánticamente ruidoso (informativo)
- **Severidad:** menor (informativo)
- **Regla violada:** ninguna
- **Ubicación:** salida real del demo para `ec-corp-andina`
- **Qué pasa:** El `faltante` de `"Número de contribuyente especial"` en EC cita como mejor candidato glosario `"Número de cuenta"` (`motivo: "sin equivalente en glosario (confianza <0.8 contra 'Número de cuenta')"`). Levenshtein captura la coincidencia de prefijo `"Número de "` pero el mapeo es semánticamente irrelevante.
- **Qué debería pasar:** AC-6 pide reportar confianza y motivo, no exigir calidad semántica del match. El PRD §10 ya anticipa esto como "plantillas peores en producción".
- **Fix sugerido:** fuera de alcance del slice 02. Para producción, considerar fallback a embeddings o lista de bloqueo cuando confianza < umbral. Dejar nota para el slice del front: el chat puede mostrar `motivo` solo si ayuda al usuario, no obligatorio.

## 4. Resultados de ejecución
- **typecheck**: pass — `bun x tsc --noEmit` exit 0.
- **demo.ts**: pass — 4 casos ok, totales `ok:4 | error:0`, exit 0. Partición exacta en todos.
- **determinismo**: pass — `diff` vacío.
- **verify:mapeo**: pass — `ok: verify-mapeo` (AC-3, AC-5, AC-6 todos verdes).
- **verify:h2**: pass — `ok: verify-h2-regression`.
- **verify:ambiguous (slice 01)**: pass — sin regresión tras D2 (migración `NOTA_POR_PAIS`).
- **error path (bogus)**: pass — `{"ok":false,"error":"caso no encontrado: bogus"}`, sin throw.
- **casos corridos**: 4 reales + 3 sintéticos (verify-mapeo con 3 sub) + 2 sintéticos (verify-h2 con 2 sub) + 1 ambiguo heredado (verify-ambiguous) + 1 inexistente (bogus) = 11 ejecuciones.
- **artefactos en `out/`**: 4/4 `out/<caso>/log.jsonl`, cada uno con 2 líneas, 4 claves exactas; `out/_test/` ausente post-ejecución (limpieza correcta).
- **grep `any`**: 0 matches.
- **grep rutas absolutas en `src/tools`+`src/lib`**: 0 matches.
- **grep `msg.includes("formato"|"pais")`**: 0 matches (deuda H-2 eliminada).
- **grep `throw` en `src/tools`+`src/lib`**: 0 matches.

## 5. Veredicto
**pass**. Los 13 AC están cubiertos con evidencia que rederivé (comandos de `bun`, `grep`, `diff`, scripts verify). El contrato §6.2 se respeta estrictamente. RN1 funciona para los 4 países fijados. CA2 estricto (no inventa) verificado con aserción de contenido. La deuda H-2 se pagó sin regresión del slice 01. Las 7 divergencias declaradas en plan §11 están implementadas; no detecté divergencias adicionales ocultas. Los 3 hallazgos son observaciones menores: H-1 cosmética, H-2 nota de proceso, H-3 limitación conocida de Levenshtein ya anticipada por PRD §10.

## 6. Siguientes pasos recomendados
Ninguno para cerrar este slice. Recomendaciones para el coordinator al abrir el próximo:
1. **Slice 03 (`generar_formulario` xlsx)**: la salida de `mapear_campos` ya trae `destino` + `valor` en `llenos[]`. Confirmar en el spec del slice 03 que la herramienta de generación consume **solo** `llenos` (los `faltantes` + `requiere_confirmacion` quedan vacíos en el xlsx; se exponen al usuario vía `armar_paquete` en slice 05).
2. **H-1 cosmético**: cuando el front muestre `requiere_confirmacion` (slice 07), decidir si colapsar `motivo` + `nota_pais` para evitar duplicación visual. No tocar código hasta entonces.
3. **H-3 limitación de Levenshtein**: documentar en `SOLUCION.md` sección "Decisiones y trade-offs" que el matcher es puramente léxico; alternativa descartada = embeddings (costo + dependencia).
