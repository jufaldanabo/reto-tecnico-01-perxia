import type { Mensaje } from "../llm/adapter"

export type ConfirmacionPendiente = {
  toolName: string
  args: Record<string, unknown>
  descripcion: string
}

export type Sesion = {
  id: string
  messages: Mensaje[]
  createdAt: string
  confirmacionPendiente?: ConfirmacionPendiente
  tokensUsados: number
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

export const clearAll = (): void => {
  store.clear()
}
