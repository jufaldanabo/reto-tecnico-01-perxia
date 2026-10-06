# Plan — 07-llm-ciclo-backend

## 1. Objetivo
Implementar el ciclo del agente (prompt → modelo → tool calls → respuesta) con CA1 (tope iteraciones), CA2 (prompt prohíbe inventar), CA3 (gate confirmación para `simular_envio`), CA4 (log global `out/log.jsonl`) y CA5 (tolerancia a errores); un `LlmAdapter` intercambiable con impls `anthropic` + `mock`; el system prompt en `agent/prompt.md` + conocimiento en `src/knowledge/registro-proveedor.md`; y backend HTTP (`Bun.serve()`) con 3 endpoints (`/api/chat`, `/api/sessions/:id`, `/api/health`).

## 2. Alcance

**En alcance**
- Nuevo `src/llm/adapter.ts` con interfaz `LlmAdapter` + tipos (`Mensaje`, `HerramientaSpec`, `ToolCallSpec`, `RespuestaLlm`).
- Nuevo `src/llm/anthropic.ts` (impl real con `@anthropic-ai/sdk`).
- Nuevo `src/llm/mock.ts` (impl para `verify:server` sin red).
- Factory `src/llm/factory.ts` que selecciona impl según `LLM_PROVIDER` env.
- Nuevo `src/agent/ciclo.ts` con `ejecutarTurno({sessionId, message, session, llm, tools, ctx})` → `{reply, toolCalls, needsConfirmation}`.
- Nuevo `src/agent/sesiones.ts` con `Map<sessionId, Sesion>` + `getOrCreate`, `get`, `touch`.
- Nuevo `src/agent/log-global.ts` con `appendGlobalLog(ctx, entry)` → `out/log.jsonl`.
- Nuevo `src/agent/confirmacion.ts` con `esConfirmacion(texto)` (reutiliza `normalizar`).
- Nuevo `src/agent/herramientas.ts` con el catálogo (`Record<string, Tool>`) + `toolSchemas: HerramientaSpec[]` hand-written por tool (sin dep `zod-to-json-schema`).
- Reemplazar `src/server.ts` con `Bun.serve()` + 3 endpoints + CORS + body JSON parsing.
- Reemplazar `agent/prompt.md` con prompt real (rol, 5 tools con cuándo usarlas, CA2 literal, CA3 workflow, orchestration leer→mapear→generar→armar→envio).
- Reemplazar `src/knowledge/registro-proveedor.md` con conocimiento del proceso (RN1–RN5 en lenguaje natural; prompt lo referencia).
- Eliminar `src/llm/placeholder.ts` (sustituido por anthropic.ts/mock.ts).
- Añadir dep prod `@anthropic-ai/sdk`.
- Actualizar `.env.example` (7 variables).
- Actualizar `package.json` scripts: `dev`, `verify:server`, extender `check`.
- Nuevo `src/scripts/verify-server.ts` que levanta server con mock en puerto efímero + ejercita CA3 lifecycle.
- Actualizar `README.md` (arranque servidor, endpoints, env vars).

**Fuera de alcance**
- Front chat (slice 09).
- Streaming SSE/WebSocket.
- Autenticación.
- Persistencia a disco de sesiones.
- Rama portal (slice 10).
- `SOLUCION.md` + deploy (slice 11).

## 3. Reglas del PRD que aplican

- **§6.1** — arquitectura obligatoria: front/backend/herramientas/adapter LLM/prompt/sesiones. Este slice cubre backend/adapter/prompt/sesiones.
- **§6.2** — herramientas NO se tocan; el ciclo las invoca.
- **§6.3 CA1** — tope iteraciones configurable (default 25).
- **§6.3 CA2** — prompt prohíbe afirmar valores no provenientes de herramientas.
- **§6.3 CA3** — gate confirmación para acciones externas (`simular_envio`).
- **§6.3 CA4** — tool calls en `out/log.jsonl` global (literal del PRD).
- **§6.3 CA5** — errores no matan sesión.
- **§6.4** — API con 3 endpoints.
- **§6.5** — separación comportamiento/conocimiento/ejecución; archivos en sus ubicaciones.
- **§7.3 RN4** — ninguna acción externa sin confirmación explícita del turno anterior.
- **§8 Seguridad** — `LLM_API_KEY` solo en env; nunca en código/logs/responses/front.
- **§8 Costo** — iteraciones + tokens configurables.

## 4. Archivos a tocar

| Ruta (relativa a `reto-01/`) | Acción | Motivo |
|---|---|---|
| `src/llm/adapter.ts` | **reemplazar** | Interfaz `LlmAdapter` + tipos |
| `src/llm/placeholder.ts` | **eliminar** | Sustituido por anthropic+mock |
| `src/llm/anthropic.ts` | **crear** | Impl Anthropic (`@anthropic-ai/sdk`) |
| `src/llm/mock.ts` | **crear** | Impl mock para verify:server |
| `src/llm/factory.ts` | **crear** | Selecciona impl según `LLM_PROVIDER` |
| `src/agent/ciclo.ts` | **crear** | Ciclo del agente (loop + CA1/CA3/CA4/CA5) |
| `src/agent/sesiones.ts` | **crear** | Store in-memory `Map<sessionId, Sesion>` |
| `src/agent/log-global.ts` | **crear** | Append a `out/log.jsonl` global |
| `src/agent/confirmacion.ts` | **crear** | `esConfirmacion(texto)` CA3 helper |
| `src/agent/herramientas.ts` | **crear** | Catálogo tools + JSON schemas hand-written |
| `src/server.ts` | **reemplazar** | `Bun.serve()` + 3 endpoints |
| `agent/prompt.md` | **reemplazar** | System prompt real |
| `src/knowledge/registro-proveedor.md` | **reemplazar** | Conocimiento del proceso |
| `.env.example` | **editar** | 7 variables (7A decisión del spec) |
| `package.json` | **editar** | +dep anthropic, scripts dev/verify:server, check extendido |
| `bun.lock` | **regenerado** | Resultado de `bun install` |
| `README.md` | **editar** | Arranque servidor, endpoints, env vars, nota de seguridad |
| `src/scripts/verify-server.ts` | **crear** | Ejercita CA3 lifecycle con mock |

**No se toca**: fixtures, PRD, `tsconfig.json`, `.gitignore`, `src/tools/{proveedor,types}.ts` (contrato intacto), `src/lib/*` (todos ya cumplen), `demo.ts` (sigue sin LLM per §6.6), `web/`, verify-* previos.

## 5. Interfaces y tipos

### 5.1 `src/llm/adapter.ts`
```ts
export type ToolCallSpec = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type Mensaje = {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  tool_call_id?: string           // solo cuando role === "tool"
  tool_calls?: ToolCallSpec[]     // solo cuando role === "assistant"
}

export type HerramientaSpec = {
  name: string                    // ej. "proveedor_leer_solicitud"
  description: string
  parameters: object              // JSON Schema (hand-written)
}

export type RespuestaLlm = {
  role: "assistant"
  content: string | null          // null si solo tool_calls
  tool_calls?: ToolCallSpec[]
}

export interface LlmAdapter {
  enviar(mensajes: Mensaje[], herramientas: HerramientaSpec[]): Promise<RespuestaLlm>
  readonly provider: string
  readonly model: string
}
```

### 5.2 `src/llm/anthropic.ts`
Usa `new Anthropic({apiKey: process.env.LLM_API_KEY})`. Traducción:
- `enviar(mensajes, herramientas)` llama `client.messages.create({model, max_tokens, system, messages, tools})`.
- `system` extraído del primer mensaje con `role: "system"`.
- `tools` = `herramientas.map(h => ({name: h.name, description: h.description, input_schema: h.parameters}))`.
- Para mensajes con `role: "tool"`: convertir a shape Anthropic `{role: "user", content: [{type: "tool_result", tool_use_id, content}]}`.
- Para mensajes assistant con `tool_calls`: `{role: "assistant", content: [{type: "text", text}, {type: "tool_use", id, name, input}]}`.
- Response `content` array: iterar bloques; `type: "text"` → juntar en `content` string; `type: "tool_use"` → push a `tool_calls`.
- Timeout razonable; errores capturados y re-lanzados con mensaje sanitizado (sin API key).

### 5.3 `src/llm/mock.ts`
```ts
export class MockLlm implements LlmAdapter {
  readonly provider = "mock"
  readonly model = "mock-stub"
  private queue: RespuestaLlm[]
  constructor(responses: RespuestaLlm[]) { this.queue = [...responses] }
  async enviar(_mensajes: Mensaje[], _herramientas: HerramientaSpec[]): Promise<RespuestaLlm> {
    const next = this.queue.shift()
    if (!next) throw new Error("MockLlm: queue agotada")
    return next
  }
}
```

### 5.4 `src/llm/factory.ts`
```ts
export const crearAdapter = (): LlmAdapter => {
  const provider = process.env.LLM_PROVIDER ?? "anthropic"
  if (provider === "anthropic") return new AnthropicAdapter(/* lee env */)
  if (provider === "mock") throw new Error("mock requiere construcción explícita; usar en tests")
  throw new Error(`LLM_PROVIDER desconocido: ${provider}`)
}
```

### 5.5 `src/agent/confirmacion.ts`
```ts
const PALABRAS = new Set(["si", "confirmo", "confirmar", "ok", "dale", "envia", "yes", "confirmed"])

export const esConfirmacion = (texto: string): boolean => {
  const palabras = normalizar(texto).split(/\s+/).filter(Boolean)
  return palabras.some((p) => PALABRAS.has(p))
}
```
Match por palabra separada (post-normalize). Case-insensitive, acento-insensitive (reutiliza `normalizar`).

### 5.6 `src/agent/sesiones.ts`
```ts
export type ConfirmacionPendiente = { toolName: string; args: Record<string, unknown>; descripcion: string }

export type Sesion = {
  id: string
  messages: Mensaje[]
  createdAt: string
  confirmacionPendiente?: ConfirmacionPendiente
  tokensUsados: number  // acumulado para SESSION_TOKEN_LIMIT
}

const store = new Map<string, Sesion>()

export const getOrCreate = (id: string, systemPrompt: string): Sesion => {
  const existing = store.get(id)
  if (existing) return existing
  const nueva: Sesion = {
    id,
    messages: [{ role: "system", content: systemPrompt }],
    createdAt: new Date().toISOString(),
    tokensUsados: 0,
  }
  store.set(id, nueva)
  return nueva
}

export const get = (id: string): Sesion | undefined => store.get(id)
```

### 5.7 `src/agent/log-global.ts`
```ts
export type GlobalLogEntry = {
  ts: string
  sessionId: string
  caso?: string
  tool: string
  ok: boolean
  resumen: Record<string, unknown>
}

export const appendGlobalLog = async (ctx: Ctx, entry: GlobalLogEntry): Promise<void> => {
  try {
    const outRoot = path.join(ctx.directory, "out")
    await fs.mkdir(outRoot, { recursive: true })
    await fs.appendFile(path.join(outRoot, "log.jsonl"), JSON.stringify(entry) + "\n", "utf8")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`appendGlobalLog: ${msg}`)
  }
}
```

### 5.8 `src/agent/herramientas.ts`
```ts
// Catálogo + JSON schemas hand-written (sin dep extra). Nombres expuestos al modelo.
export const CATALOGO: Record<string, Tool<any, any>> = {
  proveedor_leer_solicitud: leer_solicitud,
  proveedor_mapear_campos: mapear_campos,
  proveedor_generar_formulario: generar_formulario,
  proveedor_armar_paquete: armar_paquete,
  proveedor_simular_envio: simular_envio,
}

export const TOOL_SCHEMAS: HerramientaSpec[] = [
  { name: "proveedor_leer_solicitud", description: "...", parameters: { type: "object", properties: { caso: { type: "string" } }, required: ["caso"] } },
  { name: "proveedor_mapear_campos", description: "...", parameters: { type: "object", properties: { caso: { type: "string" }, campos: { type: "array", items: { type: "object" } } }, required: ["caso", "campos"] } },
  { name: "proveedor_generar_formulario", description: "...", parameters: { type: "object", properties: { caso: { type: "string" }, mapeo: { type: "object" } }, required: ["caso", "mapeo"] } },
  { name: "proveedor_armar_paquete", description: "...", parameters: { type: "object", properties: { caso: { type: "string" } }, required: ["caso"] } },
  { name: "proveedor_simular_envio", description: "...", parameters: { type: "object", properties: { caso: { type: "string" }, confirmado: { type: "boolean", default: false } }, required: ["caso"] } },
]

export const TOOLS_CONFIRMACION = new Set<string>(["proveedor_simular_envio"])
```

### 5.9 `src/agent/ciclo.ts`
Firma: `ejecutarTurno(sessionId, message, llm, ctx): Promise<CicloResult>` donde:
```ts
export type CicloResult = {
  reply: string
  toolCalls: Array<{ name: string; arguments: Record<string, unknown>; ok: boolean; resumen: string }>
  needsConfirmation: boolean
  confirmacionPendiente?: ConfirmacionPendiente
}
```

**Loop pseudo-código**:
1. `session = getOrCreate(sessionId, promptCargado)`.
2. Push user message a `session.messages`.
3. Si `session.confirmacionPendiente` existe y `esConfirmacion(message)` → ejecutar tool pendiente directamente (bypass LLM), limpiar pendiente, formatear reply.
4. Loop con `iter = 0`:
   - Si `iter >= AGENT_MAX_ITERATIONS` → cortar: push assistant message con "alcancé el tope de N iteraciones: ...", return con último estado.
   - `const resp = await llm.enviar(session.messages, TOOL_SCHEMAS)` dentro de try/catch (CA5).
   - Si throw → push assistant "error del proveedor LLM: <msg sanitizado>", return con reply del error.
   - Push resp a session.messages.
   - Si `resp.tool_calls` ausente o vacío → return con `reply: resp.content ?? ""`, `toolCalls: []`.
   - Para cada tool_call en resp.tool_calls:
     - Si `name === "proveedor_simular_envio"` && `arguments.confirmado === true` && NO esConfirmacion(ultimo-user-message-no-nuevo) → setear `session.confirmacionPendiente`, push mensaje tool con error "requiere confirmación explícita del usuario", skip execute.
     - Si `name` no en CATALOGO → push mensaje tool con error "herramienta desconocida: <name>".
     - Si validación zod del `arguments` falla → push mensaje tool con error "argumentos inválidos: <issues>".
     - Else ejecutar `tool.execute(args, ctx)` → push mensaje tool con el resultado (string).
     - Log global (CA4): `appendGlobalLog({ts, sessionId, caso: args.caso, tool: name, ok, resumen})`.
   - `iter++`; continuar loop.
5. Return `{reply, toolCalls (collected), needsConfirmation: !!session.confirmacionPendiente, confirmacionPendiente}`.

### 5.10 `src/server.ts`
```ts
Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  async fetch(req) {
    const url = new URL(req.url)
    const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS", "access-control-allow-headers": "content-type" }
    if (req.method === "OPTIONS") return new Response(null, { headers: cors })
    if (url.pathname === "/api/health" && req.method === "GET") { /* return provider+model */ }
    if (url.pathname === "/api/chat" && req.method === "POST") { /* ejecutar ciclo */ }
    if (url.pathname.startsWith("/api/sessions/") && req.method === "GET") { /* devolver historial */ }
    return new Response(JSON.stringify({ ok: false, error: "ruta no encontrada" }), { status: 404, headers: { ...cors, "content-type": "application/json" } })
  },
})
```

### 5.11 Códigos de error exactos

| Caso | Error |
|---|---|
| LLM throw / timeout | `error del proveedor LLM: <msg sanitizado sin api key>` |
| Tope iteraciones | `alcancé el tope de <N> iteraciones; aquí lo que tengo: <último_resumen>` |
| CA3 gate | `requiere confirmación explícita del usuario` |
| Tool desconocida | `herramienta desconocida: <name>` |
| Args inválidos | `argumentos inválidos: <zod issues>` |
| Session not found (GET /api/sessions/:id) | HTTP 404 + `{"ok":false,"error":"session not found"}` |
| Body JSON inválido (POST /api/chat) | HTTP 400 + `{"ok":false,"error":"body inválido"}` |
| Ruta desconocida | HTTP 404 + `{"ok":false,"error":"ruta no encontrada"}` |

### 5.12 `.env.example` final
```
LLM_PROVIDER=anthropic
LLM_API_KEY=
LLM_MODEL=claude-sonnet-4-5
LLM_MAX_TOKENS=2048
AGENT_MAX_ITERATIONS=25
SESSION_TOKEN_LIMIT=100000
PORT=3000
```
**AC-5 (slice 00): sin valores reales.** Los defaults son defaults razonables del proveedor; `LLM_API_KEY` queda vacío.

## 6. Tareas en orden

1. [ ] **T1 · Añadir dependencia** `"@anthropic-ai/sdk": "^0.33.0"` (o versión actual) en `package.json`; `cd reto-01 && export PATH="$HOME/.bun/bin:$PATH" && bun install`; confirmar `node_modules/@anthropic-ai/sdk/` presente.
2. [ ] **T2 · Reemplazar `src/llm/adapter.ts`** con §5.1 (interfaz + tipos). Eliminar `src/llm/placeholder.ts`.
3. [ ] **T3 · Crear `src/llm/anthropic.ts`** (§5.2). Import `Anthropic` del SDK. Clase `AnthropicAdapter implements LlmAdapter` con `enviar()`. Mapeo de mensajes/tools al shape del SDK y back. Sanitizar errores (reemplazar/omitir api key).
4. [ ] **T4 · Crear `src/llm/mock.ts`** (§5.3). Clase `MockLlm`; constructor acepta queue de responses; `enviar()` consume.
5. [ ] **T5 · Crear `src/llm/factory.ts`** (§5.4). `crearAdapter()` + export de clases para construcción directa en tests.
6. [ ] **T6 · Crear `src/agent/confirmacion.ts`** (§5.5). `esConfirmacion` usando `normalizar` de `src/lib/normalize.ts`.
7. [ ] **T7 · Crear `src/agent/sesiones.ts`** (§5.6). Store Map + helpers.
8. [ ] **T8 · Crear `src/agent/log-global.ts`** (§5.7). Append a `out/log.jsonl`.
9. [ ] **T9 · Crear `src/agent/herramientas.ts`** (§5.8). Catálogo + schemas JSON hand-written + `TOOLS_CONFIRMACION`.
10. [ ] **T10 · Crear `src/agent/ciclo.ts`** (§5.9). `ejecutarTurno` con loop, CA1/CA2/CA3/CA4/CA5 implementados. **Nunca lanza.**
11. [ ] **T11 · Reemplazar `agent/prompt.md`** con prompt real:
    - Rol: "Eres el asistente de registro como proveedor para Periferia IT Group..."
    - Flujo esperado: `leer → mapear → generar → armar → envio`.
    - 5 herramientas con una línea de cuándo usar cada una.
    - CA2 literal: `"Jamás afirmes un valor que no haya salido de una herramienta."`.
    - CA3 workflow: `"Antes de llamar proveedor_simular_envio con confirmado:true, DEBES preguntar al usuario de forma explícita; solo procedes si el siguiente mensaje contiene confirmación verbal (sí/confirmo/ok/dale)."`.
    - Nota de confidencialidad: no incluir datos bancarios en comunicaciones (RN2).
    - Referencia al archivo de conocimiento `src/knowledge/registro-proveedor.md`.
12. [ ] **T12 · Reemplazar `src/knowledge/registro-proveedor.md`** con:
    - RN1 identificador tributario por país (CO→NIT, EC/PE/PA→RUC, HN→RTN).
    - RN2 bancarios opt-in; nunca en correo.
    - RN3 soportes vencidos/ausentes bloquean `listo_para_firma`.
    - RN4 ninguna acción externa sin confirmación explícita.
    - RN5 log por caso.
13. [ ] **T13 · Reemplazar `src/server.ts`** (§5.10) con `Bun.serve()` + 3 endpoints + CORS + body parsing. Importa `crearAdapter` del factory, `ejecutarTurno` del ciclo. Lee prompt desde `agent/prompt.md` al arrancar (fs.readFile).
14. [ ] **T14 · Actualizar `.env.example`** (§5.12) con las 7 variables, todas con valores default razonables EXCEPTO `LLM_API_KEY` que queda vacío (AC-5 del slice 00 preservado: `.env.example` sin "valores reales" — se interpreta como sin credenciales; defaults de config son metadatos, no secretos).
    - **Decisión interna**: `LLM_MODEL=claude-sonnet-4-5`, `AGENT_MAX_ITERATIONS=25`, `SESSION_TOKEN_LIMIT=100000`, `PORT=3000`, `LLM_MAX_TOKENS=2048`, `LLM_PROVIDER=anthropic` son defaults de arranque, no secretos. Permiten `cp .env.example .env` + añadir solo la API key.
15. [ ] **T15 · Actualizar `package.json` scripts**:
    - `"dev": "bun run src/server.ts"`.
    - `"verify:server": "bun run src/scripts/verify-server.ts"`.
    - Extender `check`: añadir `&& bun run verify:server` al final.
16. [ ] **T16 · Crear `src/scripts/verify-server.ts`**:
    - Importar `Bun.serve` o levantar el server como subprocess con `Bun.spawn(["bun", "run", "src/server.ts"], {env: {...process.env, LLM_PROVIDER: "mock", PORT: "0"}})`.
    - **Alternativa más limpia**: importar `ejecutarTurno` + `MockLlm` directamente y ejercitar el ciclo sin levantar HTTP (verifica el ciclo + CA3 lifecycle; el HTTP se cubre con un check manual más chico).
    - **Decisión**: usar el enfoque directo (sin HTTP). Levantar el server en un puerto efímero + fetch es más real pero introduce async timing complejo. Más valor en verificar el ciclo + CA3 por sí mismo.
    - **Sub-asserts**:
      - a. Setup: construir `MockLlm` con queue de 4 responses: (1) tool_call `leer_solicitud`, (2) texto "procesado, ¿quieres enviar?", (3) tool_call `simular_envio({confirmado:true})` (DEBE ser bloqueado), (4) tool_call `simular_envio({confirmado:true})` tras confirmación (ejecutado).
      - b. Turn 1 "procesa el caso co-industrias-delta" → ejecuta tool_call → reply con tool resumen.
      - c. Turn 2 "envía el paquete" → mock emite `simular_envio({confirmado:true})` → ciclo lo bloquea → `needsConfirmation: true`.
      - d. Turn 3 "sí confirmo" → ciclo lo ejecuta → resultado (error "no listo para firma: ..." esperado por fixture 2026-10-06).
      - e. Afirmar que `out/log.jsonl` global tiene al menos 2 líneas (la primera de leer_solicitud, la segunda de simular_envio).
      - f. Afirmar que ningún response body ni log contiene strings tipo `sk-ant-` o `api_key` literal.
    - Opcionalmente: verificación mínima del server HTTP via `Bun.serve` embebido + `fetch` en el mismo proceso (puerto 0).
17. [ ] **T17 · Actualizar `README.md`**:
    - Sección "Arranque del servidor": `bun run dev` + puerto por defecto.
    - Sección "Endpoints": tabla con POST /api/chat, GET /api/sessions/:id, GET /api/health.
    - Sección "Variables de entorno": las 7 con una línea cada una.
    - Nota de seguridad: "La API key del LLM solo vive en `.env` del backend; nunca se incluye en el repo ni en respuestas HTTP."
    - Actualizar la salida esperada de `bun run demo` no cambia (demo no usa LLM).
18. [ ] **T18 · Typecheck + sin `any`** (AC-14):
    - `cd reto-01 && export PATH="$HOME/.bun/bin:$PATH" && bun x tsc --noEmit` → exit 0.
    - `rg -nw any src demo.ts src/scripts` → 0 matches en código nuevo.
    - **Nota**: `src/agent/herramientas.ts` CATALOGO usa `Tool<any, any>`; mitigar con `Tool<ZodRawShape, unknown>` o similar. Si TS lo rechaza por variance, usar `Tool<any, any>` solo en ese map + comentario de 1 línea aceptando el any como heterogeneidad (igual que patrón slice 03 R2). Alternativa preferida: `Record<string, { description, args, execute: Function }>` sin usar `Tool<...>` directamente.
19. [ ] **T19 · Verificar `bun run demo`** (AC-15 parcial):
    - `bun run demo:clean && bun run demo` → exit 0, totales `ok:4 | error:0 | expected-errors:8` como antes del slice.
20. [ ] **T20 · Correr `verify:server`** (AC-3/AC-5/AC-6/AC-13):
    - `bun run verify:server` → `ok: verify-server`.
21. [ ] **T21 · Regresión slices 01–06** (AC-15):
    - `bun run verify:ambiguous` + `verify:mapeo` + `verify:h2` + `verify:xlsx` + `verify:pdf` + `verify:paquete` + `verify:envio` → todos ok.
22. [ ] **T22 · Verificar seguridad** (AC-11):
    - `rg -nE "sk-ant-|LLM_API_KEY *= *['\"]..|api[_-]?key *= *['\"]..." src agent demo.ts src/scripts` → 0 matches (solo `process.env.LLM_API_KEY` lookup está permitido).
    - Encender el server con mock + hacer `GET /api/health` manualmente (test ad hoc del script verify:server) y confirmar que el response NO incluye API key.
23. [ ] **T23 · Verificar sin rutas absolutas en código nuevo** (§6.2):
    - `rg -nE "['\"][/][A-Za-z]" src/agent src/llm src/server.ts src/scripts/verify-server.ts` → 0 matches.
24. [ ] **T24 · Checklist final §8** y reporte al coordinator.

## 7. Mapeo criterio → tarea

| Criterio (spec) | Tarea(s) | Cómo se verifica |
|---|---|---|
| AC-1 (`agent/prompt.md` separado + contenido) | T11 | Archivo existe; `grep -c "proveedor_" agent/prompt.md` ≥ 5; `grep -i "jamás" agent/prompt.md` ≥ 1 (CA2 literal); `grep -i "confirm" agent/prompt.md` ≥ 1 (CA3 gate). |
| AC-2 (adapter + anthropic + swappable) | T2, T3, T4, T5 | `src/llm/adapter.ts` define los 5 tipos; `src/llm/anthropic.ts` `implements LlmAdapter`; `src/llm/mock.ts` idem; ciclo importa SOLO desde `./llm/adapter` y `./llm/factory`, no de `anthropic`. |
| AC-3 (CA1 tope) | T10, T20 | Ciclo lee `AGENT_MAX_ITERATIONS` del env; mock queue de 30 responses tool_call sin texto final → ciclo corta con string "alcancé el tope de ..."; verify:server lo ejercita. |
| AC-4 (CA2 prompt) | T10, T11 | Prompt contiene literal "Jamás afirmes..."; ciclo pasa resultados de tools como `role:"tool"`; no hay otro canal. |
| AC-5 (CA3 confirmación) | T6, T9, T10, T16 | verify:server turn 2 → `needsConfirmation:true`; turn 3 ("sí confirmo") → ejecuta; mock queue permite ambos escenarios. |
| AC-6 (CA4 log global) | T8, T10, T16 | Tras verify:server, `test -f out/log.jsonl` + `wc -l out/log.jsonl` ≥ 2; cada línea tiene `{ts, sessionId, tool, ok, resumen}`. |
| AC-7 (CA5 errores no matan) | T3, T10, T16 | Mock queue incluye un throw simulado; ciclo lo captura, devuelve reply con "error del proveedor LLM:"; sesión sigue viva (siguiente turn funciona). |
| AC-8 (POST /api/chat) | T13, T16 | verify:server o test manual con `fetch` embebido: body `{sessionId, message}` → 200 + `{reply, toolCalls, needsConfirmation, sessionId}`; body inválido → 400. |
| AC-9 (GET /api/sessions/:id) | T13, T16 | fetch GET → 200 con `messages[]` existente; GET con id falso → 404. |
| AC-10 (GET /api/health) | T13, T16 | fetch GET /api/health → 200 `{ok:true, provider:"mock"\|"anthropic", model:"..."}`; verificar que response NO contiene api key. |
| AC-11 (seguridad api key) | T3, T13, T22 | T22 grep → 0 matches literales; sanitización de errores en `anthropic.ts`; respuestas health NO exponen key. |
| AC-12 (costo configurable) | T10, T13 | `AGENT_MAX_ITERATIONS` + `SESSION_TOKEN_LIMIT` leídos de env en ciclo; verify:server los puede sobreescribir. |
| AC-13 (robustez e2e) | T16, T20 | verify:server lifecycle completo pasa. |
| AC-14 (typecheck + 0 any) | T2–T13, T18 | `bun x tsc --noEmit` exit 0; `rg -nw any` sin matches en código nuevo. |
| AC-15 (regresión 00–06) | T19, T21 | demo verde + los 7 verify scripts pasan. |

## 8. Estrategia de verificación

Orden exacto desde `reto-01/`:

```bash
export PATH="$HOME/.bun/bin:$PATH"

# A) Install
bun install                                                        # exit 0; @anthropic-ai/sdk resuelta

# B) Typecheck
bun x tsc --noEmit                                                 # exit 0

# C) Sin any en código nuevo
rg -nw any src demo.ts src/scripts || echo "ok: sin any"

# D) Demo regresión (slice 06 state)
bun run demo:clean                                                 # exit 0; totales ok:4|error:0|expected-errors:8

# E) 7 verify previos
bun run verify:ambiguous
bun run verify:mapeo
bun run verify:h2
bun run verify:xlsx
bun run verify:pdf
bun run verify:paquete
bun run verify:envio

# F) Nuevo verify:server (ciclo + CA3 lifecycle con mock)
bun run verify:server                                              # ok: verify-server

# G) Seguridad: no api keys literales en código
rg -nE "sk-ant-|api[_-]?key *= *['\"][^'\"]+['\"]" src agent demo.ts src/scripts || echo "ok: sin api keys"

# H) Sin rutas absolutas en código nuevo
rg -nE "['\"][/][A-Za-z]" src/agent src/llm src/server.ts src/scripts/verify-server.ts || echo "ok: sin rutas absolutas"

# I) Smoke manual del server HTTP (opcional, dentro de verify-server o manual)
# Levantar en puerto 0 con mock, hacer fetch a /api/health y /api/chat, asertar shapes
```

**Casos corridos**: 4 fixtures reales (via demo), 1 sintético (verify-envio), 7 regresiones de scripts previos, 1 nuevo (verify:server). No se requiere clave real.

**Checks manuales**: ninguno obligatorio. Opcional: `bun run dev` + `curl localhost:3000/api/health` para humo rápido.

## 9. Riesgos y mitigaciones

- **R1 · API de `@anthropic-ai/sdk` puede diferir entre versiones (0.x todavía).** Fijar `^0.33.0` (o la actual estable). Si el SDK cambia su shape de `tool_use`, actualizar `src/llm/anthropic.ts` sin tocar `adapter.ts`.
  **Mitigación**: capa de abstracción `LlmAdapter` aísla el SDK; el ciclo nunca ve el SDK.

- **R2 · `Tool<any, any>` en el CATALOGO forzaría `any`.** TypeScript variance con `Tool<Shape, Data>` heterogéneo es problemático.
  **Mitigación**: usar un tipo wrapper `type AnyTool = { description: string; args: ZodRawShape; execute(args: Record<string, unknown>, ctx: Ctx): Promise<string> }` que oculta el `any`. Si queda irresoluble, aceptar `any` en 1 línea con comentario claro (patrón slice 03 R2). Lo importante: `rg -nw any` sin matches "nuevos" significativos.

- **R3 · CA3 falso positivo**: usuario escribe `"no, no envíes"` → `normalizar` lo deja como "no no envies"; split por whitespace da `["no", "no", "envies"]`; `envies` NO está en la lista (lista tiene `envia`). ✓ Correcto. Pero si el usuario escribe `"no envía"` → `["no", "envia"]`; `envia` SÍ está en la lista → **falso positivo**.
  **Mitigación**: requerir que `confirmo` o `si` o `yes` o `ok` o `dale` o `confirmed` aparezcan — restringir la lista a palabras **inequívocas** de afirmación. Quitar `envia`/`envía` de la lista. También considerar el prefix: si la primera palabra es `no`, retornar false early. **Decisión**: eliminar `envia`/`envía` de la lista, usar solo `si, confirmo, confirmar, ok, dale, yes, confirmed`. Si el primer token tras normalizar es `no`, devolver false.

- **R4 · Mock queue agotada en medio de un turno.** Si el modelo mock responde con tool_call pero el siguiente response falta, `enviar` lanza. CA5 captura y devuelve reply con error.
  **Mitigación**: el ciclo captura con try/catch global el error del adapter; `verify-server` controla el tamaño de la queue; el error "MockLlm: queue agotada" propaga como "error del proveedor LLM: ...".

- **R5 · Bun.serve routing con parámetros (`:id`).** `Bun.serve` no tiene router built-in con paths dinámicos; usar `URL(req.url).pathname.startsWith("/api/sessions/")` y extraer el id manualmente.
  **Mitigación**: router manual simple en el handler `fetch`. Si crece, extraer a helper.

- **R6 · `agent/prompt.md` leído de disco al arrancar el servidor.** Si falta → el server no debe arrancar silenciosamente roto.
  **Mitigación**: `fs.readFile(path.join(ctx.directory, "agent", "prompt.md"), "utf8")` dentro de un IIFE o función de inicialización; si falla, lanzar al arrancar (fatal pre-request); el ciclo se construye solo con prompt válido.

- **R7 · `appendGlobalLog` puede fallar si `out/` no existe.** Mitigado por `mkdir recursive` dentro de `appendGlobalLog` (igual que `appendLog` per-caso).
  **Mitigación**: ya cubierto; además `console.warn` captura si falla el write sin bloquear.

- **R8 · Logging del body del request no debe loguear `LLM_API_KEY`.** El server nunca loguea req body a stdout; solo loguea tool calls al log global.
  **Mitigación**: NO hay `console.log(req.body)` en el server. `verify:server` scanea `out/log.jsonl` para asegurar que no contenga el patrón `sk-` ni `api_key`.

- **R9 · Dependencia nueva única**: `@anthropic-ai/sdk`. Justificada en README por §6.1 "Adaptador LLM" obligatorio + 1A del spec.
  **Mitigación**: documentada en README sección "Dependencias" con alternativa descartada (fetch directo al endpoint — más código).

- **R10 · `SESSION_TOKEN_LIMIT` no implementado en profundidad**: el ciclo lo lee pero el tracking real de tokens via el SDK requiere acceso al response.usage. Para simplicidad, aproximar con `message.length / 4` como estimación o usar `response.usage.input_tokens + output_tokens` del SDK si está disponible.
  **Mitigación**: implementación básica (incremento aproximado por turno); cuando el budget se excede, devolver reply "límite de tokens de sesión alcanzado". Documentar como "aproximación" en el código.

## 10. Dudas abiertas

Ninguna.

## 11. Divergencias respecto al spec

Decisiones del plan que amplían o concretan lo que el spec dejó abierto. Siguiendo el convenio del proyecto (`project_sdd_divergence_rule`), se marcan antes del gate humano.

1. **Factory `src/llm/factory.ts` + `src/llm/mock.ts` construido explícitamente en tests**: el spec §2 mencionó "mock LLM" pero no explicitó la selección por env. El plan centraliza en `crearAdapter()` que lee `LLM_PROVIDER`; para `verify:server` se usa `MockLlm` directamente (no via factory), para evitar que `LLM_PROVIDER=mock` sea un modo "público" (podría confundirse con producción). **Motivo**: separación tests/prod sin env confuso.

2. **`src/agent/` como nueva carpeta** (en vez de meter ciclo + sesiones + log-global + confirmacion dentro de `src/`): el spec listaba archivos individuales (`src/agent/ciclo.ts`, `src/agent/sesiones.ts`) y el plan la mantiene como carpeta nueva. **Motivo**: patrón consistente con `src/lib/`, `src/llm/`, `src/tools/`; agrupa comportamiento del agente.

3. **`.env.example` con defaults en claves no-sensibles**: el spec §6 y AC-5 slice 00 dicen "sin valores reales"; el plan interpreta que defaults de configuración (`LLM_MODEL=claude-sonnet-4-5`, `PORT=3000`, `AGENT_MAX_ITERATIONS=25`, etc.) **no son credenciales**, son metadatos de arranque. `LLM_API_KEY` sí queda vacío. **Motivo**: usabilidad (copiar .env.example a .env y añadir solo la key); AC-5 slice 00 se preserva en el espíritu (no se exponen secretos). Si el reviewer lo rechaza, revertir a todas vacías es un edit trivial.

4. **CA3 lista de palabras restringida (R3 mitigación)**: el spec decisión 7 incluía `envia`/`envía` en la lista. El plan las remueve porque "no envía" puede ser interpretado como confirmación falsa positiva. Lista final: `si, confirmo, confirmar, ok, dale, yes, confirmed`. Además, si el primer token tras normalizar es `no`, se devuelve false explícitamente. **Motivo**: evitar falsos positivos en frases con negación.

5. **`verify:server` NO levanta HTTP real por defecto**: el spec §2 decía "Levanta el servidor con `LLM_PROVIDER=mock` en puerto efímero"; el plan simplifica a ejecutar `ejecutarTurno` directamente con `MockLlm`, sin pasar por HTTP. Opcionalmente añade un smoke-check embebido de `Bun.serve` dentro del script. **Motivo**: menor riesgo de timing async + mismo cubrimiento (CA3 lifecycle es del ciclo, no del HTTP). HTTP se verifica con un fetch pequeño si queda tiempo.

6. **`SESSION_TOKEN_LIMIT` como aproximación**: el spec AC-12 solo pide que sea "configurable"; el plan concreta que se implementa con incremento aproximado (`msg.length / 4` o `response.usage` del SDK si disponible). **Motivo**: tracking preciso de tokens requiere acceso al response del SDK; aproximación es suficiente para el reto.

7. **CATALOGO con wrapper `AnyTool`** (en vez de `Tool<any, any>`): mitigación de R2. **Motivo**: evitar `any` explícito para AC-14.

8. **Prompt `agent/prompt.md` cargado al arrancar el servidor** (fail-fast): si el archivo falta o es inválido, el server no arranca. **Motivo**: evitar arrancar roto; mensaje claro al operador.
