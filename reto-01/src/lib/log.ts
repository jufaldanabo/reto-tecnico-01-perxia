import fs from "node:fs/promises"
import path from "node:path"
import type { Ctx } from "../tools/types"
import { outDir } from "./paths"

export type LogEntry = {
  ts: string
  herramienta: string
  ok: boolean
  resumen: Record<string, unknown>
}

export const appendLog = async (
  ctx: Ctx,
  caso: string,
  entry: LogEntry
): Promise<void> => {
  try {
    const dir = outDir(ctx, caso)
    await fs.mkdir(dir, { recursive: true })
    await fs.appendFile(path.join(dir, "log.jsonl"), JSON.stringify(entry) + "\n", "utf8")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`appendLog: fallo escribiendo log para caso ${caso}: ${msg}`)
  }
}
