import {
  leer_solicitud,
  mapear_campos,
  generar_formulario,
  armar_paquete,
  simular_envio,
} from "./src/tools/proveedor"
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

type ArmarOk = {
  ok: true
  data: {
    ruta: string
    listo_para_firma: boolean
    checklist: {
      soportes: { presentes: string[]; vencidos: string[]; ausentes: string[] }
      bloqueos: string[]
    }
  }
}
type ArmarErr = { ok: false; error: string }

type EnvioOk = { ok: true; data: { ruta: string } }
type EnvioErr = { ok: false; error: string }

const EXPECTED_ERRORS = [
  "requiere confirmación explícita",
  "no listo para firma",
]

const truncar = (s: string, n: number): string => (s.length > n ? s.slice(0, n) + "…" : s)

let okCount = 0
let errCount = 0
let expectedCount = 0

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

  const armStr = await armar_paquete.execute({ caso }, ctx)
  const armRes = JSON.parse(armStr) as ArmarOk | ArmarErr
  if (armRes.ok) {
    const s = armRes.data.checklist.soportes
    console.log(
      `  paquete: ruta=${armRes.data.ruta} (listo=${armRes.data.listo_para_firma}; P/A/V=${s.presentes.length}/${s.ausentes.length}/${s.vencidos.length})`
    )
  } else {
    console.log(`  paquete: ERROR: ${armRes.error}`)
    errCount++
  }

  // Dos invocaciones de simular_envio para ejercitar las dos ramas de error (CA3/RN4 + RN3).
  const envioInvocaciones: Array<[number, boolean]> = [
    [1, false],
    [2, true],
  ]
  for (const [idx, confirmado] of envioInvocaciones) {
    const envStr = await simular_envio.execute({ caso, confirmado }, ctx)
    const envRes = JSON.parse(envStr) as EnvioOk | EnvioErr
    if (envRes.ok) {
      console.log(`  envio[${idx}]: ruta=${envRes.data.ruta}`)
    } else {
      const isExpected = EXPECTED_ERRORS.some((p) => envRes.error.startsWith(p))
      const err = truncar(envRes.error, 60)
      if (isExpected) {
        console.log(`  envio[${idx}]: ERROR: ${err}`)
        expectedCount++
      } else {
        console.log(`  envio[${idx}]: ERROR UNEXPECTED: ${err}`)
        errCount++
      }
    }
  }
}

console.log(
  `total: ${CASOS.length} casos | ok: ${okCount} | error: ${errCount} | expected-errors: ${expectedCount}`
)
process.exit(errCount === 0 ? 0 : 1)
