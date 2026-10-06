import path from "node:path"
import type { Ctx } from "../tools/types"

export const casoDir = (ctx: Ctx, caso: string): string =>
  path.join(ctx.directory, "fixtures", "casos", caso)

export const outDir = (ctx: Ctx, caso: string): string =>
  path.join(ctx.directory, "out", caso)
