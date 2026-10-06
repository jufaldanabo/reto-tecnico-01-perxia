export type ToolCallSpec = {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export type Mensaje = {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  tool_call_id?: string
  tool_calls?: ToolCallSpec[]
}

export type HerramientaSpec = {
  name: string
  description: string
  parameters: Record<string, unknown>
}

export type RespuestaLlm = {
  role: "assistant"
  content: string | null
  tool_calls?: ToolCallSpec[]
}

export interface LlmAdapter {
  enviar(mensajes: Mensaje[], herramientas: HerramientaSpec[]): Promise<RespuestaLlm>
  readonly provider: string
  readonly model: string
}
