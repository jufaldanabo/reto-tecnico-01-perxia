import { leer_solicitud, mapear_campos } from "./src/tools/proveedor"
import type { Ctx } from "./src/tools/types"

const CASOS = [
  "co-industrias-delta",
  "ec-corp-andina",
  "hn-agroexport-sula",
  "pa-logistica-istmo",
] as const

const ctx: Ctx = { directory: import.meta.dir, sessionId: "demo" }

type Campo = { etiqueta: string; obligatorio: boolean; requiere_confirmacion?: true }
type LeerOk = {
  ok: true
  data: {
    pais: string
    formato: string
    campos: Campo[]
    soportes: string[]
  }
}
type LeerErr = { ok: false; error: string }

type MapOk = {
  ok: true
  data: {
    llenos: unknown[]
    faltantes: unknown[]
    requiere_confirmacion: unknown[]
  }
}
type MapErr = { ok: false; error: string }

let okCount = 0
let errCount = 0

for (const caso of CASOS) {
  const resStr = await leer_solicitud.execute({ caso }, ctx)
  const res = JSON.parse(resStr) as LeerOk | LeerErr
  if (res.ok) {
    const campos = res.data.campos
    const nAmbiguos = campos.filter((c) => c.requiere_confirmacion).length
    const nObligatorios = campos.filter((c) => c.obligatorio).length
    console.log(
      `caso: ${caso} | pais: ${res.data.pais} | formato: ${res.data.formato} | ${campos.length} campos (${nAmbiguos} ambiguos, ${nObligatorios} obligatorios) | ${res.data.soportes.length} soportes`
    )

    const mapStr = await mapear_campos.execute({ caso, campos: res.data.campos }, ctx)
    const mapRes = JSON.parse(mapStr) as MapOk | MapErr
    if (mapRes.ok) {
      console.log(
        `  mapeo: ${mapRes.data.llenos.length} llenos, ${mapRes.data.faltantes.length} faltantes, ${mapRes.data.requiere_confirmacion.length} requiere_confirmacion`
      )
      okCount++
    } else {
      console.log(`  mapeo: ERROR: ${mapRes.error}`)
      errCount++
    }
  } else {
    console.log(`caso: ${caso} | ERROR: ${res.error}`)
    errCount++
  }
}

console.log(`total: ${CASOS.length} casos | ok: ${okCount} | error: ${errCount}`)
process.exit(errCount === 0 ? 0 : 1)
