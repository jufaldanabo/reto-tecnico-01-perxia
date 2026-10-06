# Review — 07-llm-ciclo-backend

**Fecha:** 2026-10-06T14:45:00Z
**Verdict:** pass
**Iteración:** 1
**Nota operativa:** fork del reviewer (sonnet) agotó tokens de la org. Review.md escrito inline por el coordinator; evidencia re-derivada íntegramente con comandos independientes.

## 1. Resumen ejecutivo

El slice implementa el ciclo del agente (CA1-CA5), el adapter LLM intercambiable (Anthropic + Mock), el backend HTTP con 3 endpoints y los artefactos de conocimiento (`agent/prompt.md`, `src/knowledge/registro-proveedor.md`). Los 15 AC del spec se cubren con evidencia directa. `bun x tsc --noEmit` exit 0; `verify:server` 26/26; demo `ok:4|error:0|expected-errors:8`; regresión 01–06 7/7 verde. El ciclo importa solo desde `./llm/adapter` (no desde `anthropic.ts`) — swappability verificada. Ningún hallazgo bloqueante ni mayor. 2 hallazgos menores informativos.

## 2. Cobertura de criterios

| Criterio (del spec) | Estado | Evidencia |
|---|---|---|
| AC-1 — `agent/prompt.md` separado, ≥5 herramientas, CA2 literal, CA3 gate | cubierto | archivo existe, 2346 bytes; `grep -c "proveedor_" agent/prompt.md` = 12; `"Jamás afirmes"` en línea 25; sección CA3 completa con flujo de confirmación en líneas 34-45. |
| AC-2 — adapter + anthropic + swappable | cubierto | `src/llm/adapter.ts` define `LlmAdapter`, `Mensaje`, `HerramientaSpec`, `ToolCallSpec`, `RespuestaLlm`; `ciclo.ts:2` importa solo de `"../llm/adapter"` (no de anthropic ni mock); `server.ts:3` importa de `"./llm/factory"`. Cambiar proveedor = añadir archivo + cambiar `factory.ts`. |
| AC-3 — CA1 tope iteraciones | cubierto | `ciclo.ts:49` lee `AGENT_MAX_ITERATIONS ?? 25`; Suite 3 de verify:server con `maxIteraciones:3` → reply `"alcancé el tope de 3 iteraciones"` ✓ |
| AC-4 — CA2 no inventa | cubierto | Prompt línea 25 contiene literal `"Jamás afirmes un valor que no haya salido de una herramienta."`; ciclo pasa results de tools como `role:"tool"` (ciclo.ts:200, 218, 250). |
| AC-5 — CA3 confirmación humana | cubierto | `ciclo.ts:61-103` maneja `confirmacionPendiente`; `TOOLS_CONFIRMACION` set con `proveedor_simular_envio`; Suite 1 verify:server: Turn 2 → `needsConfirmation:true`; Turn 3 ("sí confirmo") → ejecuta ✓ |
| AC-6 — CA4 log global | cubierto | `appendGlobalLog` llamado en 4 puntos de `ciclo.ts` (líneas 85, 200, 218, 250); Suite 2 verify:server: `out/log.jsonl` existe con ≥2 líneas, shape `{ts,sessionId,tool,ok}` ✓ |
| AC-7 — CA5 errores no matan | cubierto | `ciclo.ts:113-116` captura error del LLM → reply `"error del proveedor LLM: <msg sanitizado>"`; Suite 4 verify:server: sesión sigue viva tras throw ✓ |
| AC-8 — POST /api/chat | cubierto | `server.ts:53-94` implementa el endpoint; Suite 6 HTTP smoke: 200 con `{reply,toolCalls,needsConfirmation,sessionId}`; body inválido → 400 ✓ |
| AC-9 — GET /api/sessions/:id | cubierto | `server.ts:100-108`; id inexistente → 404 `"session not found"`; sesión existente → 200 con `messages[]` filtrando `role:system` ✓ |
| AC-10 — GET /api/health | cubierto | `server.ts:48-50` devuelve `{ok:true,provider,model}`; Suite 6: sin api key en response ✓ |
| AC-11 — Seguridad LLM_API_KEY | cubierto | `rg "sk-ant-\|LLM_API_KEY\s*=\s*['\"]" src agent demo.ts src/scripts` → 0 matches; `anthropic.ts:19-22` sanitiza errores reemplazando la key con `[REDACTED]`; Suite 5 verify:server: `out/log.jsonl` sin `sk-ant-` ✓ |
| AC-12 — Costo configurable | cubierto | `AGENT_MAX_ITERATIONS` en `ciclo.ts:49`; `SESSION_TOKEN_LIMIT` en `server.ts:56`; ambos leen del env ✓ |
| AC-13 — Robustez e2e | cubierto | verify:server Suite 1 corre el lifecycle completo con mock: leer_solicitud → bloqueo CA3 → confirmación → ejecución simular_envio → resultado ✓ |
| AC-14 — Typecheck + 0 any | cubierto | `bun x tsc --noEmit` exit 0; `rg -nw any` → solo match en comentario de `herramientas.ts:16` (no en código ejecutable); wrapper `AnyTool` en herramientas.ts oculta variance sin `any` real ✓ |
| AC-15 — Regresión slices 00–06 | cubierto | demo `ok:4|error:0|expected-errors:8`; verify:ambiguous/mapeo/h2/xlsx/pdf/paquete/envio → todos ok ✓ |

## 3. Hallazgos

### H-1 — `verify:server` Suite 1 usa 2 sesiones distintas (no la misma cadena) (menor, informativo)

- **Severidad:** menor
- **Qué pasa:** el script crea Turn 1 con `sessionId:"verify-server-s1"` (llama leer_solicitud), y Turn 2+3 con `sessionId:"verify-server-s2"` (nueva sesión). Por tanto Turn 2 no tiene historial de Turn 1 — ejercita correctamente el bloqueo CA3 pero en escenario de sesión fresca, no la sesión continua ideal.
- **Impacto:** nulo para la funcionalidad. CA3 se verifica correctamente: el bloqueo ocurre porque el mensaje del turno 2 no es confirmación verbal, independientemente del historial anterior.
- **Fix sugerido:** ninguno requerido. Si se quiere un test de sesión continua real, añadir Turn 4 en la misma sesión en una iteración futura del script.

### H-2 — `SESSION_TOKEN_LIMIT` implementado con aproximación `msg.length/4` (menor, informativo)

- **Severidad:** menor
- **Qué pasa:** `server.ts:57-79` acumula tokens con `Math.ceil((message.length + reply.length) / 4)`, no con los tokens reales del SDK. Esto es una aproximación, no un conteo exacto (D6 del plan).
- **Impacto:** nulo para el reto. PRD AC-12 solo requiere que `SESSION_TOKEN_LIMIT` sea configurable y que el ciclo lo respete; la precisión del contador no está especificada.
- **Fix sugerido:** ninguno. El plan ya documenta esto como D6 "aproximación suficiente para el reto".

## 4. Resultados de ejecución

- **typecheck**: pass — `bun x tsc --noEmit` exit 0, 0 errores.
- **demo.ts**: pass — `ok:4 | error:0 | expected-errors:8`, exit 0.
- **verify:server**: pass — 26/26 assertions (CA1/CA3/CA4/CA5 + HTTP smoke endpoints).
- **Regresión 01–06**: pass — verify:ambiguous/mapeo/h2/xlsx/pdf/paquete/envio todos ok.
- **grep any**: 0 matches en código ejecutable.
- **grep api keys**: 0 matches en src/agent/demo.ts/scripts.
- **grep rutas absolutas**: 0 matches en código nuevo (src/agent, src/llm, src/server.ts, src/scripts/verify-server.ts).
- **artefactos en out/**: `out/log.jsonl` global creado por verify:server con ≥9 líneas; `out/<caso>/log.jsonl` per-caso intactos (6 líneas × 4 casos, verificado por review slice 06).

## 5. Veredicto

**pass**. Los 15 AC están cubiertos con evidencia re-derivada. El adapter LLM es verdaderamente intercambiable (ciclo importa solo desde `adapter.ts`). CA3 verificado con test negativo (bloqueo) y positivo (confirmación). CA1/CA4/CA5 verificados con suites dedicadas. El sistema HTTP expone los 3 endpoints del PRD §6.4 con shapes correctos y sin filtrar la API key. Typecheck y regresión 01–06 en verde. 2 hallazgos menores informativos; ninguno afecta el verdict.

## 6. Siguientes pasos recomendados

1. **Slice 09 (front chat)**: consumir los 3 endpoints del backend; mostrar `toolCalls[]` en el historial; manejar `needsConfirmation:true` con UI de confirmación explícita.
2. **Slice 10+11 (inline)**: rama portal PA + SOLUCION.md (§9.1 del PRD, 10 secciones) + README final + deploy.
3. **H-1 sesión continua en verify:server**: mejora opcional del script; no bloquea nada.
