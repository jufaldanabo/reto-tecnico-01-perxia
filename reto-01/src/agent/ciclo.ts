import type { Ctx } from "../tools/types"
import type { LlmAdapter, Mensaje, ToolCallSpec } from "../llm/adapter"
import { esConfirmacion } from "./confirmacion"
import { CATALOGO, TOOL_SCHEMAS, TOOLS_CONFIRMACION } from "./herramientas"
import { appendGlobalLog } from "./log-global"
import { getOrCreate, type Sesion } from "./sesiones"

export type ToolCallResult = {
  name: string
  arguments: Record<string, unknown>
  ok: boolean
  resumen: string
}

export type CicloResult = {
  reply: string
  toolCalls: ToolCallResult[]
  needsConfirmation: boolean
  sessionId: string
}

type EjecutarTurnoOpts = {
  sessionId: string
  message: string
  llm: LlmAdapter
  ctx: Ctx
  systemPrompt: string
  maxIteraciones?: number
}

const MAX_RESUMEN_LEN = 200

const resumirResultado = (resultStr: string): string => {
  if (resultStr.length <= MAX_RESUMEN_LEN) return resultStr
  return resultStr.slice(0, MAX_RESUMEN_LEN) + "…"
}

const previousUserMessage = (session: Sesion): string | null => {
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const m = session.messages[i]
    if (m.role === "user") return m.content
  }
  return null
}

export const ejecutarTurno = async (opts: EjecutarTurnoOpts): Promise<CicloResult> => {
  const { sessionId, message, llm, ctx, systemPrompt } = opts
  const maxIter =
    opts.maxIteraciones ?? Number(process.env.AGENT_MAX_ITERATIONS ?? 25)

  const session = getOrCreate(sessionId, systemPrompt)
  const previousUser = previousUserMessage(session)
  const userConfirmed = esConfirmacion(message)

  // Push user message
  session.messages.push({ role: "user", content: message })

  const toolCallsCollected: ToolCallResult[] = []

  // Handle pending confirmation bypass
  if (session.confirmacionPendiente && userConfirmed) {
    const pending = session.confirmacionPendiente
    session.confirmacionPendiente = undefined
    const tool = CATALOGO[pending.toolName]
    if (tool) {
      let resultStr: string
      try {
        resultStr = await tool.execute(pending.args, ctx)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        resultStr = JSON.stringify({ ok: false, error: `fallo ejecutando ${pending.toolName}: ${msg}` })
      }
      let okFlag = false
      try {
        okFlag = (JSON.parse(resultStr) as { ok?: boolean }).ok === true
      } catch {
        okFlag = false
      }
      toolCallsCollected.push({
        name: pending.toolName,
        arguments: pending.args,
        ok: okFlag,
        resumen: resumirResultado(resultStr),
      })
      await appendGlobalLog(ctx, {
        ts: new Date().toISOString(),
        sessionId,
        caso: typeof pending.args.caso === "string" ? pending.args.caso : undefined,
        tool: pending.toolName,
        ok: okFlag,
        resumen: { argsConfirmados: true, resultado: resumirResultado(resultStr) },
      })
      const reply = okFlag
        ? `Confirmado. Ejecuté ${pending.toolName}: ${resumirResultado(resultStr)}`
        : `Confirmado. Pero ${pending.toolName} devolvió error: ${resumirResultado(resultStr)}`
      session.messages.push({ role: "assistant", content: reply })
      return { reply, toolCalls: toolCallsCollected, needsConfirmation: false, sessionId }
    }
  }

  if (session.confirmacionPendiente && !userConfirmed) {
    // User responded but not with confirmation → cancel pending
    session.confirmacionPendiente = undefined
  }

  // Main loop
  let iter = 0
  while (iter < maxIter) {
    iter++
    let response
    try {
      response = await llm.enviar(session.messages, TOOL_SCHEMAS)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const reply = `error del proveedor LLM: ${msg}`
      session.messages.push({ role: "assistant", content: reply })
      return { reply, toolCalls: toolCallsCollected, needsConfirmation: false, sessionId }
    }

    // Push assistant message to history
    const assistantMsg: Mensaje = { role: "assistant", content: response.content ?? "" }
    if (response.tool_calls && response.tool_calls.length > 0) {
      assistantMsg.tool_calls = response.tool_calls
    }
    session.messages.push(assistantMsg)

    // No tool calls → return
    if (!response.tool_calls || response.tool_calls.length === 0) {
      const reply = response.content ?? ""
      return {
        reply,
        toolCalls: toolCallsCollected,
        needsConfirmation: false,
        sessionId,
      }
    }

    // Process each tool call
    for (const tc of response.tool_calls) {
      await procesarToolCall(tc, session, ctx, sessionId, userConfirmed, previousUser, toolCallsCollected)
      // If we set confirmacionPendiente, break and return
      if (session.confirmacionPendiente) {
        const descripcion = session.confirmacionPendiente.descripcion
        const reply = `Antes de ejecutar ${session.confirmacionPendiente.toolName}, necesito tu confirmación explícita. ${descripcion} Responde "sí" o "confirmo" para proceder.`
        session.messages.push({ role: "assistant", content: reply })
        return {
          reply,
          toolCalls: toolCallsCollected,
          needsConfirmation: true,
          sessionId,
        }
      }
    }
  }

  // Max iterations reached
  const lastResumen = toolCallsCollected.length > 0
    ? toolCallsCollected[toolCallsCollected.length - 1].resumen
    : "sin resultados"
  const reply = `alcancé el tope de ${maxIter} iteraciones; aquí lo que tengo: ${lastResumen}`
  session.messages.push({ role: "assistant", content: reply })
  return { reply, toolCalls: toolCallsCollected, needsConfirmation: false, sessionId }
}

const procesarToolCall = async (
  tc: ToolCallSpec,
  session: Sesion,
  ctx: Ctx,
  sessionId: string,
  userConfirmed: boolean,
  previousUserMsg: string | null,
  collected: ToolCallResult[]
): Promise<void> => {
  // CA3 gate: if tool requires confirmation and user didn't confirm this turn or previous
  if (TOOLS_CONFIRMACION.has(tc.name)) {
    const confirmadoArg = tc.arguments.confirmado === true
    const previousConfirmed = previousUserMsg !== null && esConfirmacion(previousUserMsg)
    if (confirmadoArg && !userConfirmed && !previousConfirmed) {
      // Block: set pending confirmation
      session.confirmacionPendiente = {
        toolName: tc.name,
        args: tc.arguments,
        descripcion: `Caso: ${typeof tc.arguments.caso === "string" ? tc.arguments.caso : "desconocido"}.`,
      }
      const errorResult = JSON.stringify({
        ok: false,
        error: "requiere confirmación explícita del usuario",
      })
      session.messages.push({
        role: "tool",
        content: errorResult,
        tool_call_id: tc.id,
      })
      collected.push({
        name: tc.name,
        arguments: tc.arguments,
        ok: false,
        resumen: "requiere confirmación explícita del usuario",
      })
      await appendGlobalLog(ctx, {
        ts: new Date().toISOString(),
        sessionId,
        caso: typeof tc.arguments.caso === "string" ? tc.arguments.caso : undefined,
        tool: tc.name,
        ok: false,
        resumen: { bloqueado: "requiere confirmación explícita del usuario" },
      })
      return
    }
  }

  // Lookup tool
  const tool = CATALOGO[tc.name]
  if (!tool) {
    const errorStr = JSON.stringify({ ok: false, error: `herramienta desconocida: ${tc.name}` })
    session.messages.push({ role: "tool", content: errorStr, tool_call_id: tc.id })
    collected.push({ name: tc.name, arguments: tc.arguments, ok: false, resumen: `herramienta desconocida: ${tc.name}` })
    await appendGlobalLog(ctx, {
      ts: new Date().toISOString(),
      sessionId,
      tool: tc.name,
      ok: false,
      resumen: { error: `herramienta desconocida: ${tc.name}` },
    })
    return
  }

  // Execute
  let resultStr: string
  try {
    resultStr = await tool.execute(tc.arguments, ctx)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    resultStr = JSON.stringify({ ok: false, error: `fallo ejecutando ${tc.name}: ${msg}` })
  }
  let okFlag = false
  try {
    okFlag = (JSON.parse(resultStr) as { ok?: boolean }).ok === true
  } catch {
    okFlag = false
  }
  session.messages.push({ role: "tool", content: resultStr, tool_call_id: tc.id })
  const resumenCorto = resumirResultado(resultStr)
  collected.push({
    name: tc.name,
    arguments: tc.arguments,
    ok: okFlag,
    resumen: resumenCorto,
  })
  await appendGlobalLog(ctx, {
    ts: new Date().toISOString(),
    sessionId,
    caso: typeof tc.arguments.caso === "string" ? tc.arguments.caso : undefined,
    tool: tc.name,
    ok: okFlag,
    resumen: { resultado: resumenCorto },
  })
}
