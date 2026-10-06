import fs from "node:fs/promises"
import path from "node:path"

const target = path.join(import.meta.dir, "..", "..", "out")
await fs.rm(target, { recursive: true, force: true })
console.log(`clean-out: removed ${target}`)
