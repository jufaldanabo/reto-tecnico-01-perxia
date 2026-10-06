import { leer_solicitud, mapear_campos, generar_formulario } from "./src/tools/proveedor"
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

type LlenoRaw = { etiqueta: string; valor: unknown; [k: string]: unknown }
type EtiquetaRaw = { etiqueta: string; [k: string]: unknown }
type MapData = {
  llenos: LlenoRaw[]
  faltantes: EtiquetaRaw[]
  requiere_confirmacion: EtiquetaRaw[]
}
type MapOk = { ok: true; data: MapData }
type MapErr = { ok: false; error: string }

type GenOk = {
  ok: true
  data: { ruta: string; formato: string }
  n_escritos?: number
  n_vacios?: number
}
type GenErr = { ok: false; error: string }

let okCount = 0
let errCount = 0

for (const caso of CASOS) {
  const resStr = await leer_solicitud.execute({ caso }, ctx)
  const res = JSON.parse(resStr) as LeerOk | LeerErr
  if (!res.ok) {
    console.log(`caso: ${caso} | ERROR: ${res.error}`)
    errCount++
    continue
  }
  const campos = res.data.campos
  const nAmbiguos = campos.filter((c) => c.requiere_confirmacion).length
  const nObligatorios = campos.filter((c) => c.obligatorio).length
  console.log(
    `caso: ${caso} | pais: ${res.data.pais} | formato: ${res.data.formato} | ${campos.length} campos (${nAmbiguos} ambiguos, ${nObligatorios} obligatorios) | ${res.data.soportes.length} soportes`
  )

  const mapStr = await mapear_campos.execute({ caso, campos: res.data.campos }, ctx)
  const mapRes = JSON.parse(mapStr) as MapOk | MapErr
  if (!mapRes.ok) {
    console.log(`  mapeo: ERROR: ${mapRes.error}`)
    errCount++
    continue
  }
  console.log(
    `  mapeo: ${mapRes.data.llenos.length} llenos, ${mapRes.data.faltantes.length} faltantes, ${mapRes.data.requiere_confirmacion.length} requiere_confirmacion`
  )

  const genStr = await generar_formulario.execute({ caso, mapeo: mapRes.data }, ctx)
  const genRes = JSON.parse(genStr) as GenOk | GenErr
  if (genRes.ok) {
    const nEsc = genRes.n_escritos ?? 0
    const nVac = genRes.n_vacios ?? 0
    console.log(`  generar: ruta=${genRes.data.ruta} (${nEsc} escritos, ${nVac} vacíos)`)
    okCount++
  } else if (
    genRes.error.startsWith("formato pdf no implementado") ||
    genRes.error.startsWith("formato portal no implementado")
  ) {
    const fmt = res.data.formato
    console.log(`  generar: skipped (formato ${fmt})`)
    okCount++
  } else {
    console.log(`  generar: ERROR: ${genRes.error}`)
    errCount++
  }
}

console.log(`total: ${CASOS.length} casos | ok: ${okCount} | error: ${errCount}`)
process.exit(errCount === 0 ? 0 : 1)
