import Anthropic from "@anthropic-ai/sdk"
import type {
  HerramientaSpec,
  LlmAdapter,
  Mensaje,
  RespuestaLlm,
  ToolCallSpec,
} from "./adapter"

type SdkContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }

type SdkMessage = {
  role: "user" | "assistant"
  content: string | SdkContentBlock[] | Array<{ type: "tool_result"; tool_use_id: string; content: string }>
}

const sanitizarError = (msg: string, apiKey: string | undefined): string => {
  if (!apiKey) return msg
  return msg.split(apiKey).join("[REDACTED]")
}

export class AnthropicAdapter implements LlmAdapter {
  readonly provider = "anthropic"
  readonly model: string
  private readonly maxTokens: number
  private readonly client: Anthropic
  private readonly apiKey: string

  constructor(opts?: { apiKey?: string; model?: string; maxTokens?: number }) {
    const apiKey = opts?.apiKey ?? process.env.LLM_API_KEY ?? ""
    if (!apiKey) {
      throw new Error("LLM_API_KEY no configurada en el env del backend")
    }
    this.apiKey = apiKey
    this.model = opts?.model ?? process.env.LLM_MODEL ?? "claude-sonnet-4-5"
    this.maxTokens = opts?.maxTokens ?? Number(process.env.LLM_MAX_TOKENS ?? 2048)
    this.client = new Anthropic({ apiKey })
  }

  async enviar(mensajes: Mensaje[], herramientas: HerramientaSpec[]): Promise<RespuestaLlm> {
    const systemContent = mensajes
      .filter((m) => m.role === "system")
      .map((m) => m.content)
      .join("\n\n")

    const sdkMessages: SdkMessage[] = []
    for (const m of mensajes) {
      if (m.role === "system") continue
      if (m.role === "user") {
        sdkMessages.push({ role: "user", content: m.content })
      } else if (m.role === "assistant") {
        const blocks: SdkContentBlock[] = []
        if (m.content && m.content.length > 0) {
          blocks.push({ type: "text", text: m.content })
        }
        if (m.tool_calls && m.tool_calls.length > 0) {
          for (const tc of m.tool_calls) {
            blocks.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.arguments })
          }
        }
        sdkMessages.push({ role: "assistant", content: blocks.length > 0 ? blocks : m.content })
      } else if (m.role === "tool") {
        const toolUseId = m.tool_call_id ?? ""
        sdkMessages.push({
          role: "user",
          content: [{ type: "tool_result", tool_use_id: toolUseId, content: m.content }],
        })
      }
    }

    const sdkTools = herramientas.map((h) => ({
      name: h.name,
      description: h.description,
      input_schema: h.parameters,
    }))

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: this.maxTokens,
        system: systemContent || undefined,
        messages: sdkMessages as Anthropic.MessageParam[],
        tools: sdkTools.length > 0 ? (sdkTools as Anthropic.Tool[]) : undefined,
      })

      let text = ""
      const toolCalls: ToolCallSpec[] = []
      for (const block of response.content) {
        if (block.type === "text") {
          text += block.text
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            name: block.name,
            arguments: block.input as Record<string, unknown>,
          })
        }
      }

      const result: RespuestaLlm = {
        role: "assistant",
        content: text.length > 0 ? text : null,
      }
      if (toolCalls.length > 0) result.tool_calls = toolCalls
      return result
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err)
      const safe = sanitizarError(raw, this.apiKey)
      throw new Error(safe)
    }
  }
}
