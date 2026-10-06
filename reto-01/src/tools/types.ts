import type { ZodRawShape, z } from "zod"

export type Ctx = {
  directory: string
  sessionId: string
}

export type ToolResultOk<Data> = { ok: true; data: Data }
export type ToolResultErr = { ok: false; error: string }
export type ToolResult<Data> = ToolResultOk<Data> | ToolResultErr

export type Tool<Shape extends ZodRawShape, Data> = {
  description: string
  args: Shape
  execute(args: z.infer<z.ZodObject<Shape>>, ctx: Ctx): Promise<string>
}
