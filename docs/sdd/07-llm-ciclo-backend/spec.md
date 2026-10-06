# Spec — 07-llm-ciclo-backend

**Slice:** LLM adapter + ciclo del agente + system prompt + backend HTTP (slices 07 y 08 del plan original, combinados por ahorro de presupuesto)
**Autoridad:** `reto-01/PRD.md` §6.1, §6.2, §6.3 CA1–CA5, §6.4, §6.5, §8 Seguridad/Costo
**Fecha:** 2026-10-06
**Depende de:** slices 00–06 cerrados (6 herramientas listas: leer_solicitud, mapear_campos, generar_formulario, armar_paquete, simular_envio).

## 1. Resumen en una frase
Implementar el ciclo del agente (prompt → modelo → tool calls → respuesta) con tope de iteraciones (CA1), gate de confirmación humana (CA3) para `simular_envio`, logging unificado (CA4), tolerancia a errores (CA5), un adaptador LLM intercambiable, el system prompt en `agent/prompt.md`, y el backend HTTP con los 3 endpoints del PRD §6.4.

## 2. Alcance

**En alcance**
- **`agent/prompt.md`** (reemplaza el placeholder): system prompt completo que:
  - Describe el proceso de registro como proveedor.
  - Enumera las 5 herramientas disponibles (`proveedor_leer_solicitud`, `proveedor_mapear_campos`, `proveedor_generar_formulario`, `proveedor_armar_paquete`, `proveedor_simular_envio`) con cuándo usarlas.
  - Prohíbe explícitamente afirmar valores que no vengan de una herramienta (CA2).
  - Describe el gate de confirmación para `simular_envio` (CA3): "Antes de llamar `proveedor_simular_envio` con `confirmado: true`, DEBES preguntar al usuario de forma explícita y recibir confirmación en el turno siguiente".
  - Es un archivo markdown aparte, no embebido en código (PRD §6.1 obligatorio).
- **`src/knowledge/registro-proveedor.md`** (reemplaza el placeholder): conocimiento del proceso (reglas de negocio RN1–RN5 en lenguaje natural; el prompt lo referencia).
- **`src/llm/adapter.ts`** (reemplaza el placeholder): interfaz propia + tipos:
  ```ts
  export interface LlmAdapter {
    enviar(mensajes: Mensaje[], herramientas: HerramientaSpec[]): Promise<RespuestaLlm>
    get provider(): string
    get model(): string
  }
  export type Mensaje = { role: "system" | "user" | "assistant" | "tool"; content: string; tool_call_id?: string; tool_calls?: ToolCallSpec[] }
  export type HerramientaSpec = { name: string; description: string; parameters: object }  // JSON schema de args
  export type ToolCallSpec = { id: string; name: string; arguments: Record<string, unknown> }
  export type RespuestaLlm = { role: "assistant"; content: string | null; tool_calls?: ToolCallSpec[] }
  ```
- **`src/llm/anthropic.ts`** (reemplaza `placeholder.ts`): implementación concreta con Anthropic SDK (ver duda 1).
  - Usa `@anthropic-ai/sdk`.
  - Lee `LLM_API_KEY`, `LLM_MODEL` (default `claude-sonnet-4-5`), `LLM_MAX_TOKENS` del env.
  - Traduce internamente entre el shape del adapter y el shape del SDK (`messages.create`).
  - Nunca loguea la API key.
- **`src/agent/ciclo.ts`** (nuevo): el ciclo del agente.
  - Inputs: `sessionId`, `message`, `session: Sesion`, `llm: LlmAdapter`, `tools: Record<string, Tool<any, any>>`, `ctx: Ctx`, `confirmaciónPendiente?: { toolName: string }`.
  - Loop:
    1. Si el user message es afirmación (sí/confirmo/ok/dale) y hay `confirmaciónPendiente` → ejecutar tool directamente.
    2. Enviar al LLM con mensajes acumulados + specs de herramientas.
    3. Si respuesta trae `tool_calls`:
       - Para cada call: si `name === "proveedor_simular_envio"` y `arguments.confirmado === true` y el turno anterior NO fue confirmación verbal → **rechazar** con `{ok:false, error:"requiere confirmación explícita del usuario"}` sin ejecutar la tool, Y devolver al usuario con `needsConfirmation: true` + resumen.
       - Si no, validar args con zod → ejecutar tool.execute → agregar resultado al historial como mensaje `tool`.
       - Loguear a `out/log.jsonl` global (CA4) con `{ts, sessionId, caso?, tool, ok, resumen}`.
    4. Si no hay tool_calls → respuesta final → return.
    5. Contador de iteraciones; al llegar a `AGENT_MAX_ITERATIONS` (env, default 25) → cortar con mensaje "alcancé el tope de iteraciones; aquí lo que tengo:" + último resumen.
  - Nunca lanza al llamante; captura todo.
- **`src/agent/sesiones.ts`** (nuevo): store in-memory `Map<sessionId, Sesion>`:
  - `Sesion = { id, messages: Mensaje[], createdAt: string, confirmacionPendiente?: {...} }`.
  - `getOrCreate(id)`, `get(id)`, `touch(id, message)`.
  - Sin persistencia (ver duda 3).
- **`src/server.ts`** (reemplaza placeholder): backend HTTP con `Bun.serve()` nativo.
  - `POST /api/chat`: `{ sessionId: string, message: string } → { reply: string, toolCalls: ToolCallSpec[], needsConfirmation: boolean, sessionId: string }`.
  - `GET /api/sessions/:id`: historial completo (sin claves, sin internos).
  - `GET /api/health`: `{ ok: true, provider: string, model: string }` sin claves.
  - CORS permisivo (reto §6.1 "El link puede ser público").
  - Rate limit básico: `SESSION_TOKEN_LIMIT` env (sugerido 100000 tokens) + `AGENT_MAX_ITERATIONS` por turno (CA1).
  - Puerto configurable vía `PORT` env (default 3000).
- **`demo.ts` no cambia** — sigue probando las herramientas sin LLM (PRD §6.6).
- **Dependencias nuevas (prod)**: `@anthropic-ai/sdk` (solo si duda 1 = Anthropic).
- **`.env.example` actualizado**: enumerar `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_MODEL`, `AGENT_MAX_ITERATIONS=25`, `SESSION_TOKEN_LIMIT=100000`, `PORT=3000`.
- **`README.md` actualizado**: cómo arrancar servidor (`bun run dev`), endpoints, variables, nota sobre LLM_API_KEY (nunca en repo).
- **Verificación**: `verify:server` script (sin red real) que:
  - Levanta el servidor con `LLM_PROVIDER=mock` (ver duda 2) en puerto efímero.
  - `GET /api/health` → `{ ok:true, provider:"mock", model:"..." }`, sin la clave.
  - `POST /api/chat` con mensaje "procesa el caso co-industrias-delta" → mock responde con tool_call `leer_solicitud` → ciclo ejecuta → respuesta con `toolCalls[]` visible, `needsConfirmation:false`.
  - `POST /api/chat` con mensaje "envía" (que debería disparar `simular_envio`) → mock responde con tool_call `simular_envio({confirmado:true})` → ciclo DEBE bloquearlo (confirmación verbal faltante) → respuesta con `needsConfirmation:true`.
  - `POST /api/chat` siguiente con "sí confirmo" → ciclo ejecuta `simular_envio` → respuesta ok o error de "no listo" según el caso.
- **`demo:ciclo` (opcional)**: script sin HTTP que ejercita el ciclo con mock, imprime la conversación. Útil para debugging.

**Fuera de alcance**
- Front chat (slice 09).
- Streaming SSE/WebSocket (PRD §6.1 "opcional"; podríamos añadirlo si queda tiempo).
- Autenticación (PRD §6.1 "No" obligatoria).
- Base de datos (PRD §3.2 no-objetivo).
- Rama portal de `generar_formulario` (slice 10).
- `SOLUCION.md` + deploy (slice 11).
- Rate limit distribuido (overkill para el reto).

## 3. Criterios de aceptación

| # | Criterio | Fuente PRD |
|---|---|---|
| AC-1 | `agent/prompt.md` existe como archivo markdown separado (no embebido en código), referenciado desde el ciclo. Contiene al menos: descripción del rol, lista de 5 herramientas con cuándo usarlas, prohibición CA2, gate CA3 para `simular_envio`. | §6.1 obligatorio |
| AC-2 | `src/llm/adapter.ts` define `LlmAdapter`, `Mensaje`, `HerramientaSpec`, `ToolCallSpec`, `RespuestaLlm`. `src/llm/anthropic.ts` implementa `LlmAdapter` para Anthropic SDK. Cambiar proveedor requiere solo nuevo archivo en `src/llm/` que implemente la interfaz — el ciclo no se toca. | §6.1 "Cambiar de proveedor no debe tocar el ciclo del agente" |
| AC-3 | **CA1 tope de iteraciones**: `AGENT_MAX_ITERATIONS` configurable (default 25); al alcanzarse, el ciclo devuelve respuesta parcial con mensaje claro, sin lanzar. Verificable con `verify:server` mock que force bucle. | §6.3 CA1 |
| AC-4 | **CA2 no inventa**: el system prompt prohíbe literalmente afirmar valores que no vengan de tool calls. El ciclo pasa resultados de tools al modelo como mensaje `tool`; el modelo NO tiene otra fuente. | §6.3 CA2 |
| AC-5 | **CA3 confirmación humana**: si el modelo intenta `simular_envio({confirmado:true})` sin que el turno anterior del usuario fuese afirmación verbal, el ciclo rechaza la call antes de ejecutarla, devuelve al usuario con `needsConfirmation:true`. Si el siguiente turno es afirmación → ejecuta. Si no → cancela. | §6.3 CA3, §7.3 RN4 |
| AC-6 | **CA4 logging global**: cada tool call ejecutada por el ciclo escribe una línea en `out/log.jsonl` global (adicional a `out/<caso>/log.jsonl` por caso que ya existe por diseño de las herramientas). Shape: `{ts, sessionId, caso?, tool, ok, resumen}`. | §6.3 CA4 "Toda llamada a herramienta queda en el historial visible del chat y en out/log.jsonl" |
| AC-7 | **CA5 errores no matan**: error del LLM (timeout, 5xx) → mensaje claro al usuario, sesión viva. Error de tool → ya devuelve `{ok:false,error}`, el ciclo lo pasa al modelo que decide reintentar o explicar al usuario. | §6.3 CA5 |
| AC-8 | **`POST /api/chat`**: acepta `{sessionId, message}`, devuelve `{reply, toolCalls, needsConfirmation, sessionId}`. HTTP 200 en operación normal; 400 si body inválido; 500 si falla el LLM (CA5 lo captura y devuelve texto, nunca stack). | §6.4 |
| AC-9 | **`GET /api/sessions/:id`**: devuelve historial completo (`messages`) de la sesión. 404 si no existe. | §6.4 |
| AC-10 | **`GET /api/health`**: devuelve `{ok:true, provider, model}` sin claves. | §6.4 |
| AC-11 | **Seguridad**: `LLM_API_KEY` solo en env del backend. **grep -nE "(LLM_API_KEY\|sk-\|sk-ant)"** en `src/` + `agent/` + `web/` + `demo.ts` → sin matches en strings literales (solo `process.env.LLM_API_KEY` como lookup está permitido). Response bodies nunca contienen la clave. | §8 Seguridad |
| AC-12 | **Costo**: `AGENT_MAX_ITERATIONS` y `SESSION_TOKEN_LIMIT` configurables desde env; el ciclo los respeta. | §8 Costo |
| AC-13 | **Robustez end-to-end**: el flujo completo "procesa el caso X" + "sí envía" funciona con mock LLM. `verify:server` lo ejercita y pasa. | §6.3 completo |
| AC-14 | **Typecheck + sin `any`**: `bun x tsc --noEmit` exit 0; `rg -nw any` sin matches en código nuevo. | §8 |
| AC-15 | **Regresión slices 00–06**: demo verde + los 7 verify scripts (ambiguous, mapeo, h2, xlsx, pdf, paquete, envio) siguen pass. | Regresión controlada |

## 4. Reglas del PRD que aplican

- **§6.1 arquitectura** — componentes (front, backend, herramientas, adapter LLM, system prompt, sesiones).
- **§6.2 contrato de herramientas** — herramientas sin cambios; el ciclo las invoca con sus argumentos validados por zod.
- **§6.3 CA1–CA5** — las 5 reglas del ciclo, cubiertas por AC-3 a AC-7.
- **§6.4 API** — 3 endpoints, cubiertos por AC-8 a AC-10.
- **§6.5 estructura** — archivos nuevos respetan la estructura obligatoria.
- **§8 Seguridad y Costo** — AC-11 y AC-12.

## 5. Dependencias con otros slices

- **Requiere**: slices 00–06 cerrados (6 herramientas invocables desde el ciclo).
- **Alimenta**:
  - slice 09 (front chat) consumirá los endpoints del backend.
  - slice 10 (rama portal) añade comportamiento a `generar_formulario` sin tocar el ciclo (AC-2 lo garantiza).
  - slice 11 (SOLUCION.md + deploy) documenta la elección de proveedor y despliega el servidor.

## 6. Decisiones (resueltas)

1. **Anthropic como proveedor**. Dep nueva de prod: `@anthropic-ai/sdk`. Modelo default `claude-sonnet-4-5`; configurable via `LLM_MODEL`. Tool use estable + API madura.
2. **Mock LLM en `src/llm/mock.ts`**: tercera impl que responde con tool_calls hardcoded siguiendo una lista secuencial inyectable. Permite correr `verify:server` sin red ni clave real.
3. **Sesiones in-memory** (`Map<sessionId, Sesion>` global). PRD §6.1 lo permite. Si el servidor se reinicia, las sesiones se pierden — comportamiento aceptable para el reto.
4. **`Bun.serve()` nativo** para HTTP. Cero deps nuevas de framework.
5. **No streaming**. Response-response normal. PRD §6.1 lo marca "opcional".
6. **Logging dual**: `out/log.jsonl` global (escrito por el ciclo, incluye `sessionId` y `caso`) **más** `out/<caso>/log.jsonl` per-caso (ya existente, lo siguen escribiendo las herramientas). Cumple la cita literal del PRD §6.3 CA4 sin romper lo que hicimos en slices 01-06.
7. **Detección de confirmación verbal (CA3)**: lista cerrada case-insensitive y acento-insensitive. Palabras: `sí`, `si`, `confirmo`, `confirmar`, `ok`, `dale`, `envía`, `envia`, `yes`, `confirmed`. Match por `.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu,"")` (reutiliza `src/lib/normalize.ts`). Documentado en el prompt. Si el user message contiene alguna como palabra separada → confirmación.
