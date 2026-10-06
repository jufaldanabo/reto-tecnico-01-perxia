/**
 * verify-server: ejercita el ciclo del agente con MockLlm.
 * Cubre: CA3 lifecycle (bloqueo + confirmación), CA4 log global, CA1 tope iteraciones, CA5 errores LLM.
 * No levanta HTTP; prueba ejecutarTurno directamente para evitar timing async.
 */

import fs from "node:fs/promises"
import path from "node:path"
import { ejecutarTurno } from "../agent/ciclo"
import { clearAll } from "../agent/sesiones"
import { MockLlm } from "../llm/mock"
import type { RespuestaLlm } from "../llm/adapter"
import type { Ctx } from "../tools/types"

const projectRoot = path.resolve(import.meta.dir, "..", "..")
const logPath = path.join(projectRoot, "out", "log.jsonl")

const SYSTEM_PROMPT = `Eres el asistente de registro como proveedor.
Jamás afirmes un valor que no haya salido de una herramienta.
Antes de llamar proveedor_simular_envio con confirmado:true, DEBES preguntar al usuario y recibir confirmación verbal.`

let failures = 0

const assert = (condition: boolean, label: string): void => {
  if (condition) {
    console.log(`  ✓ ${label}`)
  } else {
    console.error(`  ✗ FALLO: ${label}`)
    failures++
  }
}

const makeMockResponse = (overrides?: Partial<RespuestaLlm>): RespuestaLlm => ({
  role: "assistant",
  content: null,
  ...overrides,
})

// -----------------------------------------------------------------------
// Suite 1: CA3 lifecycle — bloqueo + confirmación
// -----------------------------------------------------------------------
console.log("\n[Suite 1] CA3 lifecycle — leer → simular_envio bloqueado → confirmar → ejecutar")

clearAll()

const queue1: RespuestaLlm[] = [
  // Turn 1: modelo pide leer_solicitud
  makeMockResponse({
    content: null,
    tool_calls: [{ id: "tc1", name: "proveedor_leer_solicitud", arguments: { caso: "co-industrias-delta" } }],
  }),
  // After tool result: modelo responde con texto (no más tool calls)
  makeMockResponse({ content: "Solicitud leída. El paquete está listo. ¿Confirmas el envío?" }),
  // Turn 2: modelo intenta simular_envio con confirmado:true SIN confirmación verbal del usuario → debe ser bloqueado
  makeMockResponse({
    content: null,
    tool_calls: [{ id: "tc2", name: "proveedor_simular_envio", arguments: { caso: "co-industrias-delta", confirmado: true } }],
  }),
  // Turn 3: después de confirmación verbal del usuario → modelo vuelve a intentar simular_envio → ahora se ejecuta
  makeMockResponse({
    content: null,
    tool_calls: [{ id: "tc3", name: "proveedor_simular_envio", arguments: { caso: "co-industrias-delta", confirmado: true } }],
  }),
  // Respuesta final post-envío
  makeMockResponse({ content: "Envío procesado." }),
]

const ctx1: Ctx = { directory: projectRoot, sessionId: "verify-server-s1" }
const llm1 = new MockLlm(queue1)

// Turn 1: procesa solicitud
const r1 = await ejecutarTurno({
  sessionId: "verify-server-s1",
  message: "procesa el caso co-industrias-delta",
  llm: llm1,
  ctx: ctx1,
  systemPrompt: SYSTEM_PROMPT,
})
assert(r1.toolCalls.length >= 1, "Turn 1: ejecutó al menos 1 tool call (leer_solicitud)")
assert(r1.toolCalls.some((tc) => tc.name === "proveedor_leer_solicitud"), "Turn 1: tool call es proveedor_leer_solicitud")
assert(r1.needsConfirmation === false, "Turn 1: needsConfirmation=false (no envío todavía)")

// Turn 2: usuario pide enviar SIN confirmar → modelo intenta simular_envio → ciclo lo bloquea
const llm2 = new MockLlm(queue1.slice(2))
const r2 = await ejecutarTurno({
  sessionId: "verify-server-s2",
  message: "envía el paquete ahora",
  llm: llm2,
  ctx: { ...ctx1, sessionId: "verify-server-s2" },
  systemPrompt: SYSTEM_PROMPT,
})
assert(r2.needsConfirmation === true, "Turn 2: needsConfirmation=true cuando simular_envio bloqueado")
assert(r2.toolCalls.some((tc) => tc.name === "proveedor_simular_envio" && !tc.ok), "Turn 2: simular_envio devuelve ok=false (bloqueado)")

// Turn 3: usuario confirma con "sí confirmo" → ciclo ejecuta simular_envio
const llm3 = new MockLlm(queue1.slice(3))
const r3 = await ejecutarTurno({
  sessionId: "verify-server-s2",
  message: "sí confirmo",
  llm: llm3,
  ctx: { ...ctx1, sessionId: "verify-server-s2" },
  systemPrompt: SYSTEM_PROMPT,
})
// simular_envio ejecutado: puede devolver error "no listo para firma" (fixtures reales),
// pero el ciclo lo ejecutó (no lo bloqueó) → needsConfirmation=false
assert(r3.needsConfirmation === false, "Turn 3: needsConfirmation=false después de confirmación")
assert(r3.toolCalls.some((tc) => tc.name === "proveedor_simular_envio"), "Turn 3: simular_envio efectivamente llamado")

// -----------------------------------------------------------------------
// Suite 2: CA4 — log global escrito
// -----------------------------------------------------------------------
console.log("\n[Suite 2] CA4 log global — out/log.jsonl tiene entradas")

let logExists = false
let logLines = 0
try {
  const logContent = await fs.readFile(logPath, "utf8")
  logLines = logContent.trim().split("\n").filter((l) => l.length > 0).length
  logExists = true
} catch {
  logExists = false
}
assert(logExists, "out/log.jsonl existe tras ejecutar turnos")
assert(logLines >= 2, `out/log.jsonl tiene al menos 2 líneas (tiene ${logLines})`)

// Verificar shape de la primera línea
if (logExists && logLines > 0) {
  const rawLines = (await fs.readFile(logPath, "utf8")).trim().split("\n")
  let shapeOk = false
  for (const line of rawLines) {
    try {
      const entry = JSON.parse(line) as Record<string, unknown>
      if (entry.ts && entry.sessionId && entry.tool && "ok" in entry) {
        shapeOk = true
        break
      }
    } catch {
      // skip malformed lines
    }
  }
  assert(shapeOk, "out/log.jsonl: al menos 1 línea con {ts, sessionId, tool, ok}")
}

// -----------------------------------------------------------------------
// Suite 3: CA1 — tope de iteraciones
// -----------------------------------------------------------------------
console.log("\n[Suite 3] CA1 — tope de iteraciones")

clearAll()

// Crear queue que solo emite tool_calls infinitamente (sin texto final)
const infiniteQueue: RespuestaLlm[] = Array.from({ length: 30 }, (_, i) =>
  makeMockResponse({
    content: null,
    tool_calls: [{ id: `tc-loop-${i}`, name: "proveedor_armar_paquete", arguments: { caso: "co-industrias-delta" } }],
  })
)

const llmInfinite = new MockLlm(infiniteQueue)
const r4 = await ejecutarTurno({
  sessionId: "verify-server-s3",
  message: "arma el paquete repetidamente",
  llm: llmInfinite,
  ctx: { directory: projectRoot, sessionId: "verify-server-s3" },
  systemPrompt: SYSTEM_PROMPT,
  maxIteraciones: 3,
})
assert(r4.reply.includes("alcancé el tope de"), `CA1: respuesta incluye "alcancé el tope de" (fue: "${r4.reply.slice(0, 80)}")`)
assert(r4.needsConfirmation === false, "CA1: needsConfirmation=false al alcanzar tope")

// -----------------------------------------------------------------------
// Suite 4: CA5 — error del LLM no mata la sesión
// -----------------------------------------------------------------------
console.log("\n[Suite 4] CA5 — error del LLM no mata la sesión")

clearAll()

class ErrorLlm {
  readonly provider = "error-mock"
  readonly model = "error-stub"
  async enviar(): Promise<RespuestaLlm> {
    throw new Error("timeout simulado del proveedor")
  }
}

const r5 = await ejecutarTurno({
  sessionId: "verify-server-s4",
  message: "procesa algo",
  llm: new ErrorLlm() as unknown as MockLlm,
  ctx: { directory: projectRoot, sessionId: "verify-server-s4" },
  systemPrompt: SYSTEM_PROMPT,
})
assert(r5.reply.includes("error del proveedor LLM"), `CA5: reply incluye "error del proveedor LLM" (fue: "${r5.reply.slice(0, 80)}")`)
assert(r5.needsConfirmation === false, "CA5: sesión sigue viva, needsConfirmation=false")

// -----------------------------------------------------------------------
// Suite 5: Seguridad — sin api keys en logs
// -----------------------------------------------------------------------
console.log("\n[Suite 5] Seguridad — sin api keys en out/log.jsonl")

if (logExists) {
  const logContent = await fs.readFile(logPath, "utf8")
  assert(!logContent.includes("sk-ant-"), "out/log.jsonl no contiene sk-ant-")
  assert(!logContent.includes("LLM_API_KEY"), "out/log.jsonl no contiene LLM_API_KEY literal")
}

// -----------------------------------------------------------------------
// Suite 6: HTTP smoke — /api/health y /api/chat con mock embebido
// -----------------------------------------------------------------------
console.log("\n[Suite 6] HTTP smoke — Bun.serve con mock embebido")

import * as nodePath from "node:path"
import * as nodeFs from "node:fs/promises"

const promptPath = nodePath.join(projectRoot, "agent", "prompt.md")
const embeddedSystemPrompt = await nodeFs.readFile(promptPath, "utf8")

const healthQueueLlm = new MockLlm([makeMockResponse({ content: "hola" })])

const httpServer = Bun.serve({
  port: 0,
  async fetch(req) {
    const url = new URL(req.url)
    const CORS = { "access-control-allow-origin": "*", "content-type": "application/json" }
    const j = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: CORS })
    if (req.method === "OPTIONS") return new Response(null, { status: 204 })
    if (url.pathname === "/api/health" && req.method === "GET") {
      return j({ ok: true, provider: healthQueueLlm.provider, model: healthQueueLlm.model })
    }
    if (url.pathname === "/api/chat" && req.method === "POST") {
      let body: unknown
      try { body = await req.json() } catch { return j({ ok: false, error: "body inválido" }, 400) }
      const { sessionId, message } = body as { sessionId: string; message: string }
      const result = await ejecutarTurno({
        sessionId,
        message,
        llm: healthQueueLlm,
        ctx: { directory: projectRoot, sessionId },
        systemPrompt: embeddedSystemPrompt,
      })
      return j({ ...result, sessionId })
    }
    return j({ ok: false, error: "ruta no encontrada" }, 404)
  },
})

const base = `http://localhost:${httpServer.port}`

// /api/health
const healthRes = await fetch(`${base}/api/health`)
const healthBody = await healthRes.json() as { ok: boolean; provider: string; model: string }
assert(healthRes.status === 200, `/api/health → 200 (fue ${healthRes.status})`)
assert(healthBody.ok === true, `/api/health → { ok: true }`)
assert(typeof healthBody.provider === "string", `/api/health → provider es string`)
assert(!JSON.stringify(healthBody).includes("sk-ant-"), "/api/health → sin api key en response")

// /api/chat
const chatRes = await fetch(`${base}/api/chat`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ sessionId: "smoke-1", message: "hola" }),
})
const chatBody = await chatRes.json() as { reply: string; toolCalls: unknown[]; needsConfirmation: boolean; sessionId: string }
assert(chatRes.status === 200, `/api/chat → 200 (fue ${chatRes.status})`)
assert(typeof chatBody.reply === "string", "/api/chat → reply es string")
assert(Array.isArray(chatBody.toolCalls), "/api/chat → toolCalls es array")
assert(typeof chatBody.needsConfirmation === "boolean", "/api/chat → needsConfirmation es boolean")
assert(chatBody.sessionId === "smoke-1", "/api/chat → sessionId devuelto")

// /api/chat → 400 para body inválido
const bad = await fetch(`${base}/api/chat`, { method: "POST", headers: { "content-type": "application/json" }, body: "{invalid}" })
assert(bad.status === 400, "/api/chat body inválido → 400")

// 404
const notFound = await fetch(`${base}/api/unknown`)
assert(notFound.status === 404, "/api/unknown → 404")

httpServer.stop()

// -----------------------------------------------------------------------
// Resultado final
// -----------------------------------------------------------------------
console.log("")
if (failures === 0) {
  console.log("ok: verify-server")
  process.exit(0)
} else {
  console.error(`FAILED: ${failures} aserción(es) fallidas`)
  process.exit(1)
}
