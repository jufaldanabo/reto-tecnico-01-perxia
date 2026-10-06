import { AnthropicAdapter } from "./anthropic"
import type { LlmAdapter } from "./adapter"

export const crearAdapter = (): LlmAdapter => {
  const provider = process.env.LLM_PROVIDER ?? "anthropic"
  if (provider === "anthropic") {
    return new AnthropicAdapter()
  }
  if (provider === "mock") {
    throw new Error("LLM_PROVIDER=mock requiere construcción explícita; usar MockLlm en tests")
  }
  throw new Error(`LLM_PROVIDER desconocido: ${provider}`)
}

export { AnthropicAdapter } from "./anthropic"
export { MockLlm } from "./mock"
export type { LlmAdapter, Mensaje, HerramientaSpec, ToolCallSpec, RespuestaLlm } from "./adapter"
