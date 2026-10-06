# Review — 01-leer-solicitud

**Fecha:** 2026-10-05T01:05:00Z
**Verdict:** pass
**Iteración:** 1

## 1. Resumen ejecutivo
Herramienta `leer_solicitud` cumple el contrato §6.2 limpiamente. Los 10 criterios del spec están cubiertos con evidencia que redoerivé: typecheck en verde, `bun run demo` corre los 4 casos (CO/EC/HN/PA) con conteos que calzan con los fixtures, determinismo verificado por `diff` vacío, logs por caso con las 4 claves exactas, error path `bogus` con el string literal esperado y `verify-ambiguous` validando RN1 para EC. Cero `any`, cero rutas absolutas en `src/tools`+`src/lib`, cero `throw` filtrándose al llamante. Las reglas CA1/CA3 y RN2–RN5 son N/A en este slice (sin ciclo, sin negocio). 3 hallazgos menores informativos — ninguno justifica degradar a partial.

## 2. Cobertura de criterios

| Criterio (del spec) | Estado | Evidencia |
|---|---|---|
| AC-1 — contrato §6.2 (zod + string JSON + nunca lanza) | cubierto | `src/tools/proveedor.ts:244-289`: export `leer_solicitud: Tool<typeof args, LeerSolicitudData>` con `description` precisa (una frase), `args` con `.describe()` en `:150-154`, `execute` siempre `return JSON.stringify(...)` dentro de try/catch global (`:248-288`). `rg '\bthrow\b' src/tools src/lib` → cero matches. |
| AC-2 — nombre `proveedor_leer_solicitud` | cubierto | Archivo = `proveedor.ts`, export = `leer_solicitud` → nombre expuesto = `proveedor_leer_solicitud`. Comentario explícito en `src/tools/proveedor.ts:8`. |
| AC-3 — 4 casos ok con shape correcto | cubierto | `bun run demo` imprime (conteos verificados contra fixtures con `node -e …length`): CO xlsx 17c/4s, EC pdf 15c/5s, HN xlsx 11c/3s, PA portal 9c/2s. `total: 4 casos | ok: 4 | error: 0`. |
| AC-4 — caso inexistente devuelve `{ok:false,error}` sin lanzar | cubierto | `bun -e 'leer_solicitud.execute({caso:"bogus"}, …)'` → stdout `{"ok":false,"error":"caso no encontrado: bogus"}`, exit 0, sin throw. |
| AC-5 — ambigüedad + RN1 (nota por país) | cubierto | `bun run verify:ambiguous` → `ok: verify-ambiguous`, exit 0. Script en `src/scripts/verify-ambiguous.ts` afirma: 1 campo "Identificación tributaria" con `requiere_confirmacion:true` y `nota_pais` empieza con `"sugerido: RUC"` para `pais:"EC"`; campo "Razón social" sin marca. Mapa RN1 completo en `src/tools/proveedor.ts:48-54` (CO→NIT, EC/PE/PA→RUC, HN→RTN). |
| AC-6 — `demo.ts` sin env LLM | cubierto | `env -i HOME=$HOME PATH=~/.bun/bin:$PATH bash -lc "cd reto-01 && bun run demo"` → exit 0, 4 líneas + totales. |
| AC-7 — determinismo stdout | cubierto | 2 corridas con `clean-out` entre ellas → `diff /tmp/demo-a.txt /tmp/demo-b.txt` exit 0 (0 líneas). `demo.ts` no imprime `ts`; el `ts` solo vive en `log.jsonl`. |
| AC-8 — `out/<caso>/log.jsonl` por caso con 4 claves | cubierto | 4/4 archivos presentes tras demo. `node -e` sobre cada uno confirma `Object.keys = ["herramienta","ok","resumen","ts"]`, `herramienta: "proveedor_leer_solicitud"`, `ok: true`. 1 línea por archivo (`wc -l`). |
| AC-9 — typecheck + sin `any` | cubierto | `bun x tsc --noEmit` exit 0, 0 errores. `rg -n '\bany\b' src demo.ts` → 0 matches. |
| AC-10 — rutas desde `ctx.directory` | cubierto | `src/tools/proveedor.ts` usa `casoDir(ctx, nombre)` (`src/lib/paths.ts:4-5`) y nunca strings absolutos. `rg -n "['\"]/[^'\"]+['\"]" src/tools src/lib` → 0 matches. |

### Reglas del PRD — aplicabilidad en slice 01

- **§6.2 contrato de herramientas** — pass (ver AC-1, AC-2, AC-10).
- **§6.3 CA1 (tope iteraciones)** — N/A (slice 06).
- **§6.3 CA2 (prompt prohíbe inventar valores)** — N/A: `agent/prompt.md` aún placeholder (slice 06).
- **§6.3 CA3 (confirmación humana)** — N/A: ninguna acción externa en este slice.
- **§6.3 CA4 (tool calls en log)** — pass. Las herramientas ya emiten `out/<caso>/log.jsonl`; el consumidor (chat) llega en slice 06.
- **§6.3 CA5 (errores no matan sesión)** — pass. 7 errores clasificados (§5.4 del plan) + catch global; nunca lanza al llamante.
- **§7.1 estructura del caso** — pass. Zod schemas en `src/tools/proveedor.ts:69-99` validan `solicitud.json`, `plantilla-celdas.json`, `plantilla-campos.json`, `soportes-exigidos.json`.
- **§7.3 RN1 identificador tributario** — pass (ver AC-5).
- **§7.3 RN2 (bancarios opt-in)** — N/A: no se arma correo todavía (slice 05).
- **§7.3 RN3 (vencidos/ausentes)** — N/A: no hay paquete (slice 05).
- **§7.3 RN4 (confirmación)** — N/A: no hay envío (slice 08).
- **§7.3 RN5 (log por caso)** — pass (ver AC-8).
- **§8 TS sin `any`, determinismo, sin shell, deps justificadas** — pass. 0 deps nuevas (solo `zod`). Rama que ejecuta shell: ninguna.
- **§8 Seguridad (clave en env, no en código/log)** — pass. `rg` para patrones secret → 0 matches en `src/`; `.env` no existe en repo.

## 3. Hallazgos

### H-1 — Lista de ambiguas excede la del spec (menor, mejora)
- **Severidad:** menor
- **Regla violada:** ninguna (spec vs implementación: ampliación)
- **Ubicación:** `src/tools/proveedor.ts:56-64` vs `docs/sdd/01-leer-solicitud/spec.md:28`
- **Qué pasa:** El spec lista 4 etiquetas ambiguas en formato "canónico" con acentos. La implementación extiende a 7 entradas incluyendo variantes sin acento (`"identificacion tributaria"`, `"identificacion fiscal"`, `"numero tributario"`) además de la normalización `.trim().toLowerCase()`.
- **Qué debería pasar:** cuando spec e implementación divergen (aun para mejor), la discrepancia debe estar documentada. El plan §5.6 ya la introdujo; el spec quedó atrás.
- **Fix sugerido:** ninguno ahora. Para el próximo slice, actualizar el spec si el planner propone endurecer una regla, o aceptar la ampliación como "decisión del planner" en la sección de decisiones del spec.

### H-2 — Detección de "formato inválido" / "pais inválido" acoplada al texto del error de zod (menor)
- **Severidad:** menor
- **Regla violada:** ninguna hoy; riesgo futuro
- **Ubicación:** `src/tools/proveedor.ts:172-180`
- **Qué pasa:** Para distinguir `formato inválido en solicitud` vs `pais inválido en solicitud` vs `json inválido`, el código hace `msg.includes("formato")` / `msg.includes("pais")` sobre el string crudo producido por zod. Si zod cambia el formato del mensaje en una versión futura, estas ramas dejarán silenciosamente de disparar y caerán al mensaje genérico `json inválido en <ruta>: …`. El fallback sigue siendo seguro (el llamante no se rompe), pero la clasificación específica deja de aparecer.
- **Qué debería pasar:** inspeccionar `safeParse().error.issues[].path` en lugar del texto del mensaje. Ej: `issues.some(i => i.path.join(".") === "formato")`.
- **Fix sugerido (opcional, no bloquea cierre)**: refactor que use `.issues[].path` en vez de `.includes()`. Puede aplicarse en slice 02 cuando se toque `proveedor.ts` para añadir `mapear_campos`.

### H-3 — `demo.ts` imprime "obligatorios" adicional al formato del spec (menor, derivado del plan)
- **Severidad:** menor
- **Regla violada:** spec §2 vs demo stdout
- **Ubicación:** `demo.ts:27-29`
- **Qué pasa:** Spec §2 (línea 36) especifica: `caso: X | pais: Y | formato: Z | N campos (M ambiguos) | K soportes`. Implementación añade "obligatorios" dentro del paréntesis: `… N campos (M ambiguos, O obligatorios) | K soportes`. Esto viene del plan §5.8 (aprobado) — no es una desviación del plan, pero sí del spec.
- **Qué debería pasar:** cuando el plan amplía el formato de salida, el spec debería reflejarlo. Como el gate humano del plan lo aprobó, el formato implementado es el "nuevo acordado".
- **Fix sugerido:** ninguno ahora. Para la siguiente iteración de SDD, al cerrar el plan, considerar actualizar el spec para mantener coherencia documental (lección paralela a H-1 del slice 00).

## 4. Resultados de ejecución
- **typecheck**: pass — `bun x tsc --noEmit` exit 0, 0 errores.
- **demo.ts**: pass — 4 casos ok, totales `ok:4 | error:0`, exit 0. Conteos (17/15/11/9 campos, 4/5/3/2 soportes) coinciden con el `.length` de los fixtures.
- **demo.ts sin env LLM**: pass — `env -i HOME PATH bash -lc` corrida exit 0.
- **determinismo**: pass — `diff` vacío entre dos corridas idénticas tras `clean-out`.
- **error path (bogus)**: pass — stdout exacto `{"ok":false,"error":"caso no encontrado: bogus"}`, sin throw.
- **verify-ambiguous**: pass — `ok: verify-ambiguous` exit 0; `out/_test/` eliminado tras la aserción.
- **casos corridos**: 4 reales + 1 sintético (verify-ambiguous) + 1 inexistente (bogus) = 6 ejecuciones.
- **artefactos en `out/`**: `out/{co-industrias-delta,ec-corp-andina,hn-agroexport-sula,pa-logistica-istmo}/log.jsonl` — todos presentes, 1 línea, 4 claves exactas.
- **secret scan**: pass — ningún literal con pinta de credencial en `src/`.
- **rutas absolutas**: pass — 0 matches en `src/tools` + `src/lib`.
- **`any`**: pass — 0 matches en `src/` + `demo.ts`.

## 5. Veredicto
**pass**. Los 10 AC están cubiertos con evidencia que yo mismo rederivé (comandos de `bun`, `node -e`, `rg`, `diff`, `env -i`). El contrato §6.2 se respeta estrictamente, el logging RN5/CA4 arranca correctamente, y la detección RN1 funciona para el país fijado en el caso sintético. Los 3 hallazgos menores son observaciones sin impacto bloqueante: H-1 es una mejora, H-2 es un riesgo futuro de bajo impacto, H-3 es una divergencia spec↔demo heredada de la aprobación del plan.

## 6. Siguientes pasos recomendados
Ninguno para cerrar este slice. Recomendaciones para el coordinator al abrir slices siguientes:
1. **H-1/H-3 (proceso)**: cuando el planner introduce decisiones que amplían o alteran el spec (lista cerrada, formato de salida), reflejarlas en el spec antes del gate de plan — o anotarlas en una sección "Divergencias respecto al spec" dentro del plan para dejar traza.
2. **H-2 (deuda técnica)**: en slice 02 (`mapear_campos`) se tocará `src/tools/proveedor.ts`. Buena ventana para refactorizar la detección de rama de error a `issues[].path`.
3. **CA4 futuro**: el log por caso ya se emite. Cuando llegue slice 06, el ciclo del agente debe LEER `out/<caso>/log.jsonl` para mostrarlo en el chat, no reescribirlo. Dejar esta restricción explícita en el spec del slice 06.
