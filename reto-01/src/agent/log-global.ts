import fs from "node:fs/promises"
import path from "node:path"
import type { Ctx } from "../tools/types"

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
    await fs.appendFile(
      path.join(outRoot, "log.jsonl"),
      JSON.stringify(entry) + "\n",
      "utf8"
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`appendGlobalLog: ${msg}`)
  }
}
