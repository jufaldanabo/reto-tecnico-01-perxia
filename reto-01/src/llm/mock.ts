import type { HerramientaSpec, LlmAdapter, Mensaje, RespuestaLlm } from "./adapter"

export class MockLlm implements LlmAdapter {
  readonly provider = "mock"
  readonly model = "mock-stub"
  private readonly queue: RespuestaLlm[]
  private readonly thrownErrors: (string | null)[]

  constructor(responses: RespuestaLlm[], opts?: { throwOn?: (string | null)[] }) {
    this.queue = [...responses]
    this.thrownErrors = opts?.throwOn ?? []
  }

  async enviar(_mensajes: Mensaje[], _herramientas: HerramientaSpec[]): Promise<RespuestaLlm> {
    const errorMsg = this.thrownErrors.shift() ?? null
    if (errorMsg) {
      throw new Error(errorMsg)
    }
    const next = this.queue.shift()
    if (!next) {
      throw new Error("MockLlm: queue agotada")
    }
    return next
  }
}
