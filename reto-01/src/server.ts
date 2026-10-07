import * as fs from "node:fs/promises"
import * as path from "node:path"
import { crearAdapter } from "./llm/factory"
import { ejecutarTurno } from "./agent/ciclo"
import { get } from "./agent/sesiones"
import type { Ctx } from "./tools/types"

const CORS_HEADERS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
}

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "content-type": "application/json" },
  })

const rootDir = path.resolve(import.meta.dir, "..")

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content
  const end = content.indexOf("\n---", 3)
  if (end === -1) return content
  return content.slice(end + 4).replace(/^\n/, "")
}

async function cargarPrompt(): Promise<string> {
  const promptPath = path.join(rootDir, "modulo", "agent.md")
  const content = await fs.readFile(promptPath, "utf8")
  return stripFrontmatter(content)
}

const adapter = crearAdapter()
const systemPrompt = await cargarPrompt()

const ctx: Ctx = {
  directory: rootDir,
  sessionId: "server",
}

const port = Number(process.env.PORT ?? 3000)

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)

    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    // GET /api/health
    if (url.pathname === "/api/health" && req.method === "GET") {
      return json({ ok: true, provider: adapter.provider, model: adapter.model })
    }

    // POST /api/chat
    if (url.pathname === "/api/chat" && req.method === "POST") {
      let body: unknown
      try {
        body = await req.json()
      } catch {
        return json({ ok: false, error: "body inválido" }, 400)
      }
      if (
        typeof body !== "object" ||
        body === null ||
        typeof (body as Record<string, unknown>).sessionId !== "string" ||
        typeof (body as Record<string, unknown>).message !== "string"
      ) {
        return json({ ok: false, error: "body inválido" }, 400)
      }
      const { sessionId, message } = body as { sessionId: string; message: string }
      const sessionTokenLimit = Number(process.env.SESSION_TOKEN_LIMIT ?? 100000)

      const sesion = get(sessionId)
      if (sesion && sesion.tokensUsados >= sessionTokenLimit) {
        return json({
          reply: "límite de tokens de sesión alcanzado",
          toolCalls: [],
          needsConfirmation: false,
          sessionId,
        })
      }

      const sessionCtx: Ctx = { directory: rootDir, sessionId }
      const result = await ejecutarTurno({
        sessionId,
        message,
        llm: adapter,
        ctx: sessionCtx,
        systemPrompt,
      })

      const sesionActualizada = get(sessionId)
      if (sesionActualizada) {
        const approxTokens = message.length / 4 + result.reply.length / 4
        sesionActualizada.tokensUsados += Math.ceil(approxTokens)
      }

      return json({ ...result, sessionId })
    }

    // GET /api/sessions/:id
    if (url.pathname.startsWith("/api/sessions/") && req.method === "GET") {
      const id = url.pathname.slice("/api/sessions/".length)
      if (!id) return json({ ok: false, error: "session not found" }, 404)
      const sesion = get(id)
      if (!sesion) return json({ ok: false, error: "session not found" }, 404)
      const mensajesPublicos = sesion.messages.filter((m) => m.role !== "system")
      return json({ ok: true, sessionId: id, messages: mensajesPublicos, createdAt: sesion.createdAt })
    }

    // Servir web/index.html para GET / y GET /index.html
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const htmlPath = path.join(rootDir, "web", "index.html")
      try {
        const html = await fs.readFile(htmlPath, "utf8")
        return new Response(html, {
          headers: { ...CORS_HEADERS, "content-type": "text/html; charset=utf-8" },
        })
      } catch {
        return json({ ok: false, error: "front no disponible" }, 404)
      }
    }

    return json({ ok: false, error: "ruta no encontrada" }, 404)
  },
})

console.log(`servidor listo en puerto ${port} | provider=${adapter.provider} model=${adapter.model}`)
