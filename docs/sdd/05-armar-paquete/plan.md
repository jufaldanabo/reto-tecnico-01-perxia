# Plan — 05-armar-paquete

## 1. Objetivo
Implementar `armar_paquete` en `src/tools/proveedor.ts` que, dado `{caso}`, cree `out/<caso>/paquete/` con copias de los soportes exigidos presentes/vencidos, copia del formulario cuando existe (xlsx/pdf), un `checklist.md` con estado por soporte + faltantes/req_conf del mapeo (RN3) y un `borrador-correo.md` sin ninguna palabra bancaria (RN2); devolver `{ ruta, listo_para_firma, checklist }` siguiendo contrato §6.2. Extender `demo.ts` con la cuarta línea por caso; añadir `verify:paquete` con RN2 scan por grep sobre `borrador-correo.md`.

## 2. Alcance

**En alcance**
- Nuevo export `armar_paquete` en `src/tools/proveedor.ts` (contrato §6.2).
- Nuevos helpers compartidos:
  - `src/lib/soportes.ts` — tipos (`SoporteIndexItem`, `EstadoSoporte`, `ClasificacionSoportes`), loader `cargarSoportes(ctx)`, utilidad `estadoSoporte(item, now)`, `clasificarSoportes(exigidos, index, now)`.
  - `src/lib/paquete.ts` — generadores de texto (`renderChecklist`, `renderBorradorCorreo`) y escritor FS (`armarPaqueteFS`). RN2 scan reside en el verify (no en el escritor).
- Reutilización interna de `runLeer` y `runMapear` dentro del mismo módulo `src/tools/proveedor.ts` para obtener país/cliente/correo/soportes exigidos/campos faltantes-req_conf **sin** pasar por `.execute()` (así `appendLog` no se dispara dentro de `armar_paquete`; el log queda limpio con 4 líneas por caso en el demo: leer+mapear+generar+armar).
- Extensión de `src/tools/proveedor.ts`:
  - Zod args: `{ caso: z.string().min(1).describe(...) }`.
  - Tipos de salida `ArmarPaqueteData`, `ChecklistResumen`.
  - Export `armar_paquete: Tool<typeof armarArgs, ArmarPaqueteData>` con try/catch global, `appendLog` ok/error.
- Extensión de `demo.ts`:
  - Imports `armar_paquete`.
  - Tras `generar_formulario`, invocar `armar_paquete.execute({caso}, ctx)` siempre (independiente del resultado de generar, porque PA termina sin formulario pero igual arma paquete).
  - Línea `  paquete: ruta=out/<caso>/paquete/ (listo=<true|false>; P/A/V=X/Y/Z)` (indent 2 espacios, sin fecha absoluta).
  - Error → `  paquete: ERROR: <error>` y cuenta como `errCount`.
- Nuevo script `src/scripts/verify-paquete.ts`:
  - Para cada uno de los 4 casos:
    - Llama cadena `leer → mapear → generar → armar`.
    - Afirma `data.ruta === "out/<caso>/paquete/"`.
    - Afirma `data.listo_para_firma === false` (con fixture 2026-10-06).
    - Compara `data.checklist.soportes.{presentes,ausentes,vencidos}` con la expectativa derivada del `index.json` + `soportes-exigidos.json` del caso + fecha de ejecución.
    - Lista archivos en `out/<caso>/paquete/soportes/` y afirma que coincide con `presentes ∪ vencidos` (tipos → archivo).
    - Afirma formulario copiado según formato (CO/HN xlsx, EC pdf, PA sin formulario).
    - Lee `checklist.md` y asegura secciones esperadas (regex por secciones): encabezado, "## Soportes", "## Campos del mapeo", "## Bloqueos", "**listo_para_firma:** `false`".
    - Lee `borrador-correo.md` y hace **RN2 scan**: `grep -iE "Bancolombia|03100012345|COLOCOBM|SWIFT|Número de cuenta|cuenta bancaria"` → **0 matches**.
    - Verificación extra: `borrador-correo.md` contiene `Representante legal — Periferia IT Group S.A.S.` (firma genérica).
- `package.json`:
  - Nuevo script `"verify:paquete": "bun run src/scripts/verify-paquete.ts"`.
  - Extender `check` para incluir `verify:paquete` al final.
- `README.md`:
  - Añadir `verify:paquete` a la tabla de scripts con 1 línea.
  - Actualizar salida esperada de `bun run demo` incluyendo la 4ª línea `paquete:` por caso.

**Fuera de alcance**
- `simular_envio` / `ENVIO-SIMULADO.md` (slice posterior).
- Rama `portal` de `generar_formulario` (sigue siendo stub skipped).
- Firma electrónica, envío real, validación semántica de contenido de soportes.
- Dependencias nuevas (solo stdlib + ya instaladas).
- Edición de `verify:xlsx` o `verify:pdf` (ningún wc-de-líneas allí; AC-10 del slice se verifica aparte).

## 3. Reglas del PRD que aplican

- **§6.2 contrato de herramientas** — export `{description, args, execute}`; `args` zod + `.describe()`; `execute` devuelve string JSON `{ok,data}|{ok:false,error}`; nunca lanza; `ctx.directory` como raíz.
- **§6.5 estructura** — herramienta en `src/tools/`; helpers compartidos en `src/lib/`.
- **§6.3 CA2 (no inventa)** — valores del checklist/borrador provienen solo de `maestro`, `solicitud`, `soportes-index`; sin fabricar.
- **§6.3 CA4 (log por tool call)** — cada invocación de `armar_paquete` emite una línea en `out/<caso>/log.jsonl`.
- **§6.3 CA5 (errores no matan)** — ramas de error clasificadas + catch global; nunca lanza al llamante.
- **§7.1 "solicitud.json"** — se consume `pais, cliente, formato, de, asunto`.
- **§7.2 "soportes/index.json"** — se consume `tipo, archivo, vigencia_hasta, descripcion` (no `pais_emisor`, por ahora).
- **§7.3 RN2 (bancarios fuera del correo)** — ningún `banco.*` ni "cuenta bancaria"/"SWIFT"/"Número de cuenta" en `borrador-correo.md`. Scan por grep en `verify:paquete`.
- **§7.3 RN3 (vencidos/ausentes bloquean)** — `listo_para_firma = false` si hay cualquier vencido o ausente entre los exigidos.
- **§7.3 RN3 (campo faltante NO bloquea)** — `mapeo.faltantes` + `mapeo.requiere_confirmacion` aparecen en `checklist.md` pero NO en `bloqueos`.
- **§7.3 RN5 (log por caso)** — línea nueva de `armar_paquete`.
- **§8 TS sin `any`, determinismo, deps justificadas** — 0 deps nuevas, 0 `any`, stdout del demo determinista entre dos corridas del mismo día.

## 4. Archivos a tocar

| Ruta (relativa a `reto-01/`) | Acción | Motivo |
|---|---|---|
| `src/lib/soportes.ts` | **crear** | tipos + loader + clasificador reutilizable |
| `src/lib/paquete.ts` | **crear** | renders `checklist.md` + `borrador-correo.md` + escritor FS (`armarPaqueteFS`) |
| `src/tools/proveedor.ts` | **editar** | añadir export `armar_paquete` + tipos `ArmarPaqueteData`/`ChecklistResumen`; actualizar comentario del header |
| `demo.ts` | **editar** | encadenar `armar_paquete`; nueva 4ª línea `  paquete: ...`; adaptar `okCount` (PA no-genera sigue sumando ok mientras armar no falle) |
| `src/scripts/verify-paquete.ts` | **crear** | fidelidad por caso + RN2 scan + listo_para_firma=false para los 4 |
| `package.json` | **editar** | nuevo script `verify:paquete`; extender `check` para encadenarlo al final |
| `README.md` | **editar** | `verify:paquete` en tabla; salida esperada del demo incluye la 4ª línea |

**No se toca** (verificado):
- `fixtures/` (read-only).
- `reto-01/PRD.md`.
- `src/tools/types.ts`, `src/lib/{paths,log,maestro,pais,normalize,levenshtein,serialize,xlsx,pdf}.ts`.
- `tsconfig.json`, `.env.example`, `.gitignore`.
- `agent/prompt.md`, `src/server.ts`, `src/llm/*`, `src/knowledge/*`, `web/`.
- Scripts previos: `clean-out.ts`, `verify-ambiguous.ts`, `verify-mapeo.ts`, `verify-h2-regression.ts`, `verify-xlsx.ts`, `verify-pdf.ts` — **grep confirmó que ninguno contiene aserciones sobre `wc -l log.jsonl` ni "3 líneas"**. La 4ª línea del log (ahora: leer+mapear+generar+armar) no rompe ninguna.

## 5. Interfaces y tipos

### 5.1 `src/lib/soportes.ts`
```ts
import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import type { Ctx } from "../tools/types"

export const SoporteIndexItemSchema = z.object({
  tipo: z.string(),
  archivo: z.string(),
  vigencia_hasta: z.union([z.string(), z.null()]),
  pais_emisor: z.string(),
  descripcion: z.string(),
})
export type SoporteIndexItem = z.infer<typeof SoporteIndexItemSchema>

export const SoporteIndexSchema = z.array(SoporteIndexItemSchema)
export type SoporteIndex = z.infer<typeof SoporteIndexSchema>

export type JsonResult<T> = { ok: true; data: T } | { ok: false; error: string }

export type EstadoSoporte = "vigente" | "vencido"

export type ClasificacionSoportes = {
  presentes: SoporteIndexItem[]  // existe en index Y vigente
  vencidos: SoporteIndexItem[]   // existe en index Y vencido
  ausentes: string[]             // tipos exigidos SIN entrada en index
}

const indexPath = (ctx: Ctx): string =>
  path.join(ctx.directory, "fixtures", "repositorio", "soportes", "index.json")

export const cargarSoportes = async (ctx: Ctx): Promise<JsonResult<SoporteIndex>> => {
  const ruta = indexPath(ctx)
  try {
    await fs.access(ruta)
  } catch {
    return { ok: false, error: `soportes ausentes en fixtures/repositorio/soportes/index.json` }
  }
  let raw: string
  try {
    raw = await fs.readFile(ruta, "utf8")
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `fallo leyendo ${ruta}: ${msg}` }
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `json inválido en ${ruta}: ${msg}` }
  }
  const result = SoporteIndexSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    return { ok: false, error: `json inválido en ${ruta}: ${issues}` }
  }
  return { ok: true, data: result.data }
}

// vigencia_hasta=null => vigente para siempre. Caso borde: hoy > vigencia_hasta => vencido.
// Si hoy === vigencia_hasta, se considera vigente (vence al día siguiente).
export const estadoSoporte = (item: SoporteIndexItem, now: Date): EstadoSoporte => {
  if (item.vigencia_hasta === null) return "vigente"
  const hoyIso = now.toISOString().slice(0, 10)  // YYYY-MM-DD lexicográfico
  return item.vigencia_hasta >= hoyIso ? "vigente" : "vencido"
}

export const clasificarSoportes = (
  exigidos: string[],
  index: SoporteIndex,
  now: Date
): ClasificacionSoportes => {
  const porTipo = new Map(index.map((i) => [i.tipo, i]))
  const presentes: SoporteIndexItem[] = []
  const vencidos: SoporteIndexItem[] = []
  const ausentes: string[] = []
  for (const tipo of exigidos) {
    const item = porTipo.get(tipo)
    if (item === undefined) {
      ausentes.push(tipo)
      continue
    }
    if (estadoSoporte(item, now) === "vigente") presentes.push(item)
    else vencidos.push(item)
  }
  return { presentes, vencidos, ausentes }
}
```

### 5.2 `src/lib/paquete.ts`
```ts
import fs from "node:fs/promises"
import path from "node:path"
import type { ClasificacionSoportes, SoporteIndexItem } from "./soportes"

export type Correo = { de: string; para: string; asunto: string; fecha: string; cuerpo: string }

export type MapeoRef = {
  faltantes: Array<{ etiqueta: string; motivo: string }>
  requiere_confirmacion: Array<{ etiqueta: string; motivo: string }>
}

export type ArmarPaqueteConfig = {
  // Contexto
  caso: string
  cliente: string
  pais: string
  formato: "xlsx" | "pdf" | "portal"
  correo: Correo
  // Clasificación de soportes
  clasificacion: ClasificacionSoportes
  // Mapeo (para checklist, no para bloqueos)
  mapeo: MapeoRef
  // Formulario a copiar (si existe)
  formulario?: { rutaOrigen: string; nombreDestino: string }  // ej. { out/<caso>/formulario.xlsx, formulario.xlsx }
  // Rutas FS
  paqueteDir: string           // out/<caso>/paquete  (abs)
  soportesRepoDir: string      // fixtures/repositorio/soportes (abs)
  // Fecha ISO corta para el checklist (YYYY-MM-DD)
  fecha: string
}

export type ArmarPaqueteResultado = {
  listo_para_firma: boolean
  bloqueos: string[]
  n_presentes: number
  n_vencidos: number
  n_ausentes: number
}

// Mapa de display names RN2-safe. Nombres SIN "cuenta" / "SWIFT" / "número de cuenta".
const DISPLAY_SOPORTE: Record<string, string> = {
  camara_comercio: "Cámara de Comercio",
  rut: "RUT",
  certificacion_bancaria: "Certificación bancaria",
  parafiscales: "Parafiscales",
  estados_financieros: "Estados financieros",
  certificado_iso_9001: "Certificado ISO 9001",
}
const displayTipo = (tipo: string): string =>
  DISPLAY_SOPORTE[tipo] ?? tipo.replace(/_/g, " ")

export const renderChecklist = (c: ArmarPaqueteConfig, bloqueos: string[], listo: boolean): string => {
  const lines: string[] = []
  lines.push(`# Checklist — ${c.cliente}`)
  lines.push("")
  lines.push(`**Caso:** ${c.caso}`)
  lines.push(`**Fecha:** ${c.fecha}`)
  lines.push(`**País:** ${c.pais}`)
  lines.push(`**Formato:** ${c.formato}`)
  lines.push("")
  lines.push("## Formulario")
  lines.push("")
  if (c.formulario) {
    lines.push(`- Incluido: \`${c.formulario.nombreDestino}\` (formato: ${c.formato})`)
  } else {
    lines.push(`- Formulario pendiente — formato ${c.formato} diferido`)
  }
  lines.push("")
  lines.push("## Soportes")
  lines.push("")
  lines.push("| tipo | estado | archivo | vigencia_hasta |")
  lines.push("|---|---|---|---|")
  for (const s of c.clasificacion.presentes) {
    lines.push(`| ${s.tipo} | presente | ${s.archivo} | ${s.vigencia_hasta ?? "—"} |`)
  }
  for (const s of c.clasificacion.vencidos) {
    lines.push(`| ${s.tipo} | vencido | ${s.archivo} | ${s.vigencia_hasta} |`)
  }
  for (const tipo of c.clasificacion.ausentes) {
    lines.push(`| ${tipo} | ausente | — | — |`)
  }
  lines.push("")
  lines.push(`### Resumen soportes`)
  lines.push("")
  lines.push(`- Presentes (${c.clasificacion.presentes.length}): ${c.clasificacion.presentes.map((s) => s.tipo).join(", ") || "—"}`)
  lines.push(`- Vencidos (${c.clasificacion.vencidos.length}): ${c.clasificacion.vencidos.map((s) => s.tipo).join(", ") || "—"}`)
  lines.push(`- Ausentes (${c.clasificacion.ausentes.length}): ${c.clasificacion.ausentes.join(", ") || "—"}`)
  lines.push("")
  lines.push("## Campos del mapeo")
  lines.push("")
  lines.push(`### Faltantes (${c.mapeo.faltantes.length})`)
  lines.push("")
  if (c.mapeo.faltantes.length === 0) lines.push("- —")
  else for (const f of c.mapeo.faltantes) lines.push(`- **${f.etiqueta}**: ${f.motivo}`)
  lines.push("")
  lines.push(`### Requiere confirmación (${c.mapeo.requiere_confirmacion.length})`)
  lines.push("")
  if (c.mapeo.requiere_confirmacion.length === 0) lines.push("- —")
  else for (const r of c.mapeo.requiere_confirmacion) lines.push(`- **${r.etiqueta}**: ${r.motivo}`)
  lines.push("")
  lines.push("## Bloqueos")
  lines.push("")
  if (bloqueos.length === 0) lines.push("- —")
  else for (const b of bloqueos) lines.push(`- ${b}`)
  lines.push("")
  lines.push("## Estado final")
  lines.push("")
  lines.push(`**listo_para_firma:** \`${listo}\``)
  lines.push("")
  return lines.join("\n")
}

export const renderBorradorCorreo = (c: ArmarPaqueteConfig): string => {
  const lines: string[] = []
  lines.push(`# Borrador — correo de respuesta`)
  lines.push("")
  lines.push(`**Para:** ${c.correo.de}`)
  lines.push(`**Asunto:** Re: ${c.correo.asunto}`)
  lines.push("")
  lines.push("---")
  lines.push("")
  lines.push(`Buenos días,`)
  lines.push("")
  if (c.formulario) {
    lines.push(`Adjuntamos el formulario diligenciado para el registro como proveedor y los siguientes soportes:`)
  } else {
    lines.push(`Adjuntamos los siguientes soportes para el registro como proveedor:`)
  }
  lines.push("")
  const incluir: SoporteIndexItem[] = [...c.clasificacion.presentes, ...c.clasificacion.vencidos]
  if (incluir.length === 0) lines.push("- —")
  else for (const s of incluir) lines.push(`- ${displayTipo(s.tipo)} (${s.archivo})`)
  lines.push("")
  lines.push(`Quedamos atentos a su confirmación.`)
  lines.push("")
  lines.push(`Cordialmente,`)
  lines.push("")
  lines.push(`Representante legal — Periferia IT Group S.A.S.`)
  lines.push("")
  return lines.join("\n")
}

export const armarPaqueteFS = async (c: ArmarPaqueteConfig): Promise<ArmarPaqueteResultado> => {
  // 1. Crear paqueteDir + paqueteDir/soportes
  const soportesDir = path.join(c.paqueteDir, "soportes")
  await fs.mkdir(soportesDir, { recursive: true })

  // 2. Copiar soportes (presentes + vencidos; ausentes NO).
  for (const s of [...c.clasificacion.presentes, ...c.clasificacion.vencidos]) {
    const src = path.join(c.soportesRepoDir, s.archivo)
    const dst = path.join(soportesDir, s.archivo)
    try {
      await fs.copyFile(src, dst)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`fallo copiando soporte ${s.archivo}: ${msg}`)
    }
  }

  // 3. Copiar formulario (si existe).
  if (c.formulario) {
    const dst = path.join(c.paqueteDir, c.formulario.nombreDestino)
    try {
      await fs.copyFile(c.formulario.rutaOrigen, dst)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`fallo copiando formulario ${c.formulario.nombreDestino}: ${msg}`)
    }
  }

  // 4. Calcular bloqueos (RN3).
  const bloqueos: string[] = []
  for (const s of c.clasificacion.vencidos) {
    bloqueos.push(`Soporte vencido: ${s.tipo} (vigencia_hasta ${s.vigencia_hasta})`)
  }
  for (const tipo of c.clasificacion.ausentes) {
    bloqueos.push(`Soporte ausente: ${tipo}`)
  }
  if (!c.formulario) {
    bloqueos.push(`Formulario pendiente — formato ${c.formato} diferido`)
  }
  const listo = bloqueos.length === 0

  // 5. Escribir checklist.md y borrador-correo.md.
  await fs.writeFile(path.join(c.paqueteDir, "checklist.md"), renderChecklist(c, bloqueos, listo), "utf8")
  await fs.writeFile(path.join(c.paqueteDir, "borrador-correo.md"), renderBorradorCorreo(c), "utf8")

  return {
    listo_para_firma: listo,
    bloqueos,
    n_presentes: c.clasificacion.presentes.length,
    n_vencidos: c.clasificacion.vencidos.length,
    n_ausentes: c.clasificacion.ausentes.length,
  }
}
```

### 5.3 Zod args + tipos de salida en `src/tools/proveedor.ts`
```ts
const armarArgs = {
  caso: z.string().min(1).describe(
    "Nombre de la carpeta del caso en reto-01/fixtures/casos/ (p.ej. 'co-industrias-delta')."
  ),
}

type ChecklistResumen = {
  soportes: {
    presentes: string[]  // array de tipos (string)
    vencidos: string[]
    ausentes: string[]
  }
  bloqueos: string[]
}

type ArmarPaqueteData = {
  ruta: string
  listo_para_firma: boolean
  checklist: ChecklistResumen
}

type ArmarRunResult = { ok: true; data: ArmarPaqueteData; resumenLog: { n_presentes: number; n_ausentes: number; n_vencidos: number } }
                   | { ok: false; error: string }
```

### 5.4 Flujo de `runArmar(input, ctx)`
1. `casoDir(ctx, caso)` existe → sí, continuar; no → `caso no encontrado: <nombre>`.
2. Llamar `runLeer({caso}, ctx)` directamente (sin log pollution; `runLeer` ya existe y no llama a `appendLog`). Si falla, propagar `error`.
3. Llamar `runMapear({caso, campos: leerData.campos}, ctx)` directamente (misma razón). Si falla, propagar.
4. Llamar `cargarSoportes(ctx)`; si falla, propagar `error`.
5. Clasificar: `clasificarSoportes(leerData.soportes, index, new Date())`.
6. Resolver formulario:
   - Si `formato === "xlsx"` y existe `out/<caso>/formulario.xlsx` → `{ rutaOrigen: outDir(ctx, caso)/formulario.xlsx, nombreDestino: "formulario.xlsx" }`.
   - Si `formato === "pdf"` y existe `out/<caso>/formulario.pdf` → `{ rutaOrigen: ..., nombreDestino: "formulario.pdf" }`.
   - Else → `undefined` (PA portal o si el usuario no generó el formulario antes).
7. Construir `ArmarPaqueteConfig` con:
   - `paqueteDir = path.join(outDir(ctx, caso), "paquete")`
   - `soportesRepoDir = path.join(ctx.directory, "fixtures", "repositorio", "soportes")`
   - `fecha = new Date().toISOString().slice(0, 10)`
8. Llamar `armarPaqueteFS(config)`. Si lanza, catch y mapear a `fallo armando paquete (caso <nombre>): <mensaje>`.
9. Construir `data: ArmarPaqueteData`:
   - `ruta = path.join("out", caso, "paquete") + "/"` (ver §5.5)
   - `listo_para_firma = resultado.listo_para_firma`
   - `checklist = { soportes: { presentes: tipos, vencidos: tipos, ausentes: ausentes }, bloqueos: resultado.bloqueos }`
10. Retornar `{ ok: true, data, resumenLog: { n_presentes, n_ausentes, n_vencidos } }`.

### 5.5 Ruta devuelta
`data.ruta = "out/<caso>/paquete/"` (termina con `/`, relativa, D4 slice 03 preservado).

### 5.6 Códigos de error (strings exactos)

| Caso | `error` |
|---|---|
| Carpeta del caso ausente | `caso no encontrado: <nombre>` |
| `solicitud.json` ausente | heredado de `runLeer`: `solicitud ausente para caso <nombre>` |
| `solicitud.json` inválido | heredado de `runLeer` (via `issues[].path`) |
| `plantilla-*.json` ausente/inválida | heredado de `runLeer` |
| `maestro.json` ausente/inválido | heredado de `runMapear` |
| `glosario-campos.json` ausente/inválido | heredado de `runMapear` |
| `soportes/index.json` ausente | `soportes ausentes en fixtures/repositorio/soportes/index.json` |
| `soportes/index.json` inválido | `json inválido en <ruta>: <issues>` |
| Fallo copiando soporte | `fallo copiando soporte <archivo>: <mensaje>` (desde `armarPaqueteFS` → re-lanzado y capturado por catch global) |
| Fallo copiando formulario | `fallo copiando formulario <nombreDestino>: <mensaje>` |
| Excepción no clasificada | `fallo armando paquete (caso <nombre>): <mensaje>` |

### 5.7 Shape del log (línea nueva)
```ts
// Ok:
{ "ts": "<iso>", "herramienta": "proveedor_armar_paquete", "ok": true,
  "resumen": { "ruta": "out/<caso>/paquete/", "listo_para_firma": false,
               "n_presentes": 3, "n_vencidos": 1, "n_ausentes": 0 } }

// Error:
{ "ts": "<iso>", "herramienta": "proveedor_armar_paquete", "ok": false,
  "resumen": { "caso": "<nombre>", "error": "<string exacto>" } }
```

### 5.8 Línea en stdout del demo (determinista, 2 espacios de indent, sin fecha absoluta)
```
  paquete: ruta=out/<caso>/paquete/ (listo=<true|false>; P/A/V=X/Y/Z)
```
Error: `  paquete: ERROR: <error>`.

### 5.9 `demo.ts` — cambios puntuales
- Añadir `armar_paquete` al import.
- Añadir tipos `ArmarOk` / `ArmarErr`:
  ```ts
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
  ```
- Al final del cuerpo del `for` (tras el bloque de `generar`), llamar siempre `armar_paquete`:
  ```ts
  const armStr = await armar_paquete.execute({ caso }, ctx)
  const armRes = JSON.parse(armStr) as ArmarOk | ArmarErr
  if (armRes.ok) {
    const s = armRes.data.checklist.soportes
    console.log(`  paquete: ruta=${armRes.data.ruta} (listo=${armRes.data.listo_para_firma}; P/A/V=${s.presentes.length}/${s.ausentes.length}/${s.vencidos.length})`)
  } else {
    console.log(`  paquete: ERROR: ${armRes.error}`)
    errCount++
  }
  ```
- **`okCount` policy**: el `armar` NO afecta `okCount` por ok/error (el counter actual se incrementa en el `generar.ok` o en el `skipped`). Solo si `armar` falla, incrementar `errCount`. Esto mantiene la semántica del slice 03/04 (H-1 heredado) sin cambios.

## 6. Tareas en orden

1. [ ] **T1 · Crear `src/lib/soportes.ts`** con `SoporteIndexItemSchema`, `SoporteIndexSchema`, `cargarSoportes`, `estadoSoporte`, `clasificarSoportes` según §5.1. Usa `node:fs/promises`, `node:path`, `zod`. Verificar que `estadoSoporte` trata `vigencia_hasta=null` como vigente para siempre y hoy===vigencia_hasta como vigente (vence al día siguiente).
2. [ ] **T2 · Crear `src/lib/paquete.ts`** con tipos `Correo`, `MapeoRef`, `ArmarPaqueteConfig`, `ArmarPaqueteResultado`, `DISPLAY_SOPORTE`, `displayTipo`, `renderChecklist`, `renderBorradorCorreo`, `armarPaqueteFS` según §5.2. Usa `node:fs/promises`, `node:path`.
3. [ ] **T3 · Añadir imports y tipos en `src/tools/proveedor.ts`**:
   - `import { cargarSoportes, clasificarSoportes } from "../lib/soportes"`
   - `import type { ArmarPaqueteConfig, ArmarPaqueteResultado, MapeoRef } from "../lib/paquete"` (si se usan)
   - `import { armarPaqueteFS } from "../lib/paquete"`
   - Añadir tipos locales `ChecklistResumen`, `ArmarPaqueteData`, `ArmarRunResult`.
4. [ ] **T4 · Implementar `runArmar(input, ctx)` en `src/tools/proveedor.ts`** siguiendo §5.4:
   - Verificar `casoDir` existe.
   - Llamar `runLeer`, `runMapear` directamente (sin `.execute()`).
   - Llamar `cargarSoportes` + `clasificarSoportes`.
   - Detectar formulario (fs.access sobre xlsx/pdf según formato).
   - Construir config y llamar `armarPaqueteFS`.
   - Serializar `checklist.soportes` a `string[]` (tipos) para el `data`.
   - Retornar `ArmarRunResult`.
5. [ ] **T5 · Export `armar_paquete` en `src/tools/proveedor.ts`**:
   - `description`: `"Arma el paquete para firma: copia soportes exigidos presentes/vencidos, copia formulario si existe, escribe checklist.md y borrador-correo.md (sin datos bancarios, RN2). Devuelve ruta del paquete, listo_para_firma y resumen del checklist."`
   - `args: armarArgs`.
   - `execute({caso}, ctx)` con try/catch global:
     - Llamar `runArmar`.
     - Si ok: `appendLog(ok=true, resumen={ruta, listo_para_firma, n_presentes, n_vencidos, n_ausentes})`; `return JSON.stringify({ok, data})`.
     - Si error: `appendLog(ok=false, resumen={caso, error})`; `return JSON.stringify({ok:false, error})`.
     - Catch global: `fallo armando paquete (caso <nombre>): <msg>`; log + return.
   - Actualizar comentario del header de `proveedor.ts` para incluir `armar_paquete → proveedor_armar_paquete`.
6. [ ] **T6 · Extender `demo.ts`** según §5.9:
   - Import `armar_paquete`.
   - Añadir tipos `ArmarOk`, `ArmarErr`.
   - Al final del cuerpo del `for`, invocar `armar_paquete.execute` y printear la 4ª línea (`  paquete: ...`).
   - En caso de error, `errCount++`.
7. [ ] **T7 · Crear `src/scripts/verify-paquete.ts`**:
   - Imports: `fs/promises`, `path`, `leer_solicitud`, `mapear_campos`, `generar_formulario`, `armar_paquete`, tipos.
   - `projectRoot = path.join(import.meta.dir, "..", "..")`.
   - Función `verifyCasePaquete(caso)`:
     - Ejecuta cadena `leer → mapear → generar → armar`.
     - Lee `fixtures/casos/<caso>/soportes-exigidos.json`.
     - Lee `fixtures/repositorio/soportes/index.json`.
     - Deriva expectativa clasificando con `new Date()` (misma función `clasificarSoportes` del lib).
     - Afirma `armRes.data.listo_para_firma === false`.
     - Afirma `armRes.data.ruta === "out/<caso>/paquete/"` o `===path.join("out", caso, "paquete") + path.sep` (cross-platform).
     - Afirma `armRes.data.checklist.soportes.presentes === expectativa.presentes.tipos`, idem vencidos/ausentes (igual contenido, orden del input).
     - Lista archivos de `out/<caso>/paquete/soportes/`; afirma match con `presentes ∪ vencidos` por nombre de archivo.
     - Formulario: para xlsx (CO/HN) afirma `fs.access(out/<caso>/paquete/formulario.xlsx)` ok; pdf (EC) afirma formulario.pdf ok; portal (PA) afirma NO existe formulario.*.
     - Lee `out/<caso>/paquete/checklist.md`: afirma contiene `/^# Checklist/m`, `/^## Soportes$/m`, `/^## Campos del mapeo$/m`, `/^## Bloqueos$/m`, `/\*\*listo_para_firma:\*\* `false``.
     - Lee `out/<caso>/paquete/borrador-correo.md`:
       - **RN2 scan**: para cada patrón en `["Bancolombia","03100012345","COLOCOBM","SWIFT","Número de cuenta","cuenta bancaria"]`, afirma `!contenido.toLowerCase().includes(patron.toLowerCase())` → 0 matches.
       - Afirma incluye `Representante legal — Periferia IT Group S.A.S.`.
       - Afirma incluye `Re: ` + asunto del `solicitud.json`.
   - `main()`: itera los 4 casos; imprime `ok: verify-paquete` y exit 0 o `fail: <msg>` + exit 1.
8. [ ] **T8 · Actualizar `package.json` scripts**:
   - Añadir `"verify:paquete": "bun run src/scripts/verify-paquete.ts"`.
   - Actualizar `check` para encadenar al final: `"check": "bun run typecheck && bun run demo:clean && bun run verify:ambiguous && bun run verify:mapeo && bun run verify:h2 && bun run verify:xlsx && bun run verify:pdf && bun run verify:paquete"`.
9. [ ] **T9 · Actualizar `README.md`**:
   - Añadir `bun run verify:paquete` a la tabla de scripts con una línea de propósito.
   - Actualizar la salida esperada de `bun run demo` para incluir la 4ª línea `  paquete: ruta=... (listo=false; P/A/V=X/Y/Z)` por caso.
10. [ ] **T10 · Verificar typecheck + sin `any`** (AC-12):
    - `cd reto-01 && export PATH="$HOME/.bun/bin:$PATH" && bun x tsc --noEmit` → exit 0.
    - `rg -nw any reto-01/src reto-01/demo.ts reto-01/src/scripts` → 0 matches en código nuevo.
11. [ ] **T11 · Verificar demo** (AC-2, AC-4, AC-11):
    - `bun run src/scripts/clean-out.ts && bun run demo` → exit 0; 4 bloques por caso (resumen + mapeo + generar + paquete) + totales.
    - Confirmar `out/{co,hn}/paquete/formulario.xlsx` existe.
    - Confirmar `out/ec/paquete/formulario.pdf` existe.
    - Confirmar `out/pa/paquete/` existe pero `out/pa/paquete/formulario.*` NO existe.
12. [ ] **T12 · Verificar logs** (AC-10):
    - Para cada uno de los 4 casos: `wc -l out/<caso>/log.jsonl` = **4** (leer + mapear + generar + armar).
    - Afirmar que cada línea tiene las 4 claves `{ts, herramienta, ok, resumen}` (`bun -e` + `JSON.parse` + `Object.keys`).
    - 4ª línea con `herramienta === "proveedor_armar_paquete"` y `ok === true`.
13. [ ] **T13 · Verificar determinismo stdout** (AC-11):
    - `bun run demo:clean > /tmp/paq-a.txt && bun run demo:clean > /tmp/paq-b.txt && diff /tmp/paq-a.txt /tmp/paq-b.txt` → exit 0 (idéntico; la fecha absoluta no aparece en stdout).
14. [ ] **T14 · Verificar listo_para_firma = false (AC-5)**:
    - Para cada caso, invocar `armar_paquete` directamente con `bun -e` y afirmar `data.listo_para_firma === false` + `data.checklist.bloqueos.length > 0`.
    - Afirmar que **al menos un bloqueo** menciona `camara_comercio` (soporte vencido 2026-09-30 en el fixture).
15. [ ] **T15 · Verificar RN3 campo faltante NO bloquea** (AC-6):
    - Inspeccionar el checklist de EC: debe listar `Número de contribuyente especial` en la sección "Faltantes" PERO NO debe aparecer en "Bloqueos".
    - Afirmar `data.checklist.bloqueos` solo contiene strings que empiezan por `"Soporte vencido:"`, `"Soporte ausente:"`, o `"Formulario pendiente"` (nunca por nombre de campo).
16. [ ] **T16 · RN2 scan sobre borrador-correo** (AC-7):
    - Para cada uno de los 4 casos: leer `out/<caso>/paquete/borrador-correo.md` y afirmar que `grep -iE "Bancolombia|03100012345|COLOCOBM|SWIFT|Número de cuenta|cuenta bancaria"` → 0 matches.
    - Hecho dentro de `verify:paquete`.
17. [ ] **T17 · Error path** (AC-9):
    - `bun -e 'import {armar_paquete} from "./src/tools/proveedor"; const r = JSON.parse(await armar_paquete.execute({caso:"bogus"},{directory:import.meta.dir,sessionId:"t"})); console.log(r.ok===false && r.error.startsWith("caso no encontrado") ? "ok bogus" : "FALLA bogus")'` → `ok bogus`.
18. [ ] **T18 · Regresión slices 01+02+03+04** (AC-14):
    - `bun run verify:ambiguous` → ok.
    - `bun run verify:mapeo` → ok.
    - `bun run verify:h2` → ok.
    - `bun run verify:xlsx` → ok (sin regresión; log line count no es afirmado allí).
    - `bun run verify:pdf` → ok (idem).
19. [ ] **T19 · Verificar sin rutas absolutas en código nuevo** (AC-13):
    - `rg -nE "[\"']/[^\"']+[\"']" reto-01/src/tools reto-01/src/lib` → 0 matches (strings literales con path absoluto).
20. [ ] **T20 · Correr `verify:paquete` end-to-end**:
    - `bun run verify:paquete` → `ok: verify-paquete`, exit 0.
21. [ ] **T21 · Checklist final §8** y reporte al coordinator.

## 7. Mapeo criterio → tarea

| Criterio (spec) | Tarea(s) | Cómo se verifica |
|---|---|---|
| AC-1 (contrato §6.2) | T3, T4, T5 | Export `armar_paquete: Tool<...>` con `description` precisa; `args.caso.describe()`; `execute` siempre `return JSON.stringify(...)` dentro de try/catch; `rg "\\bthrow\\b" src/tools src/lib` → 0 matches. Nombre expuesto: `proveedor_armar_paquete`. |
| AC-2 (4 casos ok + directorio existe) | T5, T6, T11 | `bun run demo` produce 4 líneas `paquete: ruta=... (listo=...; P/A/V=...)`; `test -d out/<caso>/paquete` pass para los 4. |
| AC-3 (copias de soportes = presentes ∪ vencidos) | T2, T4, T7 | `verify:paquete`: lista archivos de `paquete/soportes/`, compara con `presentes ∪ vencidos` esperado derivado del index + exigidos + fecha. Afirma ausentes NO están. |
| AC-4 (formulario copiado) | T4, T7, T11 | CO/HN: `test -f out/<caso>/paquete/formulario.xlsx`; EC: `test -f out/ec-corp-andina/paquete/formulario.pdf`; PA: `test ! -f out/pa-logistica-istmo/paquete/formulario.*`. `verify:paquete` lo afirma. Para PA el `checklist.md` incluye `- Formulario pendiente — formato portal diferido`. |
| AC-5 (RN3 vencidos + ausentes bloquean; listo=false para los 4) | T2, T4, T7, T14 | `verify:paquete` + T14: `data.listo_para_firma === false` para los 4 casos (fixture 2026-10-06); `data.checklist.bloqueos` contiene al menos `"Soporte vencido: camara_comercio (vigencia_hasta 2026-09-30)"`. |
| AC-6 (RN3 campo faltante NO bloquea) | T2, T4, T15 | T15: inspeccionar `data.checklist.bloqueos` para EC: no contiene el nombre `"Número de contribuyente especial"`; sí aparece en el `checklist.md` sección Faltantes. |
| AC-7 (RN2 bancarios fuera del correo) | T2, T7, T16 | `verify:paquete`: para los 4 borrador-correo.md, `.toLowerCase().includes(patron.toLowerCase())` === false para cada uno de los 6 patrones. Hecho vía regex/includes case-insensitive. |
| AC-8 (CA2 nunca inventa) | T2, T4, T7 | `armarPaqueteFS` solo lee de `soportes-index`, `solicitud.correo`, `mapeo` (no re-mapea maestro). `verify:paquete` detecta cualquier string inventado al afirmar contenido exacto del checklist. |
| AC-9 (error path) | T5, T17 | T17: `caso:"bogus"` → `{ok:false, error:"caso no encontrado: bogus"}` sin throw. Shape inválido del args rechazado por zod → capturado por catch global. |
| AC-10 (log 4 líneas × 4 claves) | T5, T12 | T12: `wc -l out/<caso>/log.jsonl` = 4 para los 4; `Object.keys = {ts,herramienta,ok,resumen}` en cada línea; 4ª línea `herramienta === "proveedor_armar_paquete"`. |
| AC-11 (determinismo stdout) | T6, T13 | T13: `diff` entre 2 corridas de `demo:clean` → vacío (la fecha no aparece en stdout, solo en checklist.md). |
| AC-12 (typecheck + sin any) | T1–T7, T10 | `bun x tsc --noEmit` exit 0; `rg -nw any` sin matches. |
| AC-13 (sin rutas absolutas) | T1–T5, T19 | `rg` en `src/tools`+`src/lib` → 0 matches. `armarPaqueteFS` recibe `paqueteDir` y `soportesRepoDir` por parámetro; nunca string absoluto. |
| AC-14 (regresión 01+02+03+04) | T18 | Correr `verify:ambiguous`, `verify:mapeo`, `verify:h2`, `verify:xlsx`, `verify:pdf` → todos exit 0. |

## 8. Estrategia de verificación

Orden exacto desde `reto-01/` (prepend `export PATH="$HOME/.bun/bin:$PATH"` donde aplique):

```bash
# A) Typecheck
bun x tsc --noEmit                                      # exit 0

# B) Sin any en código nuevo
rg -nw any src demo.ts src/scripts || echo "ok: sin any"

# C) Demo + artefactos esperados
bun run src/scripts/clean-out.ts
bun run demo | tee /tmp/paq-a.txt                       # exit 0; 4 líneas por caso + totales
test -d out/co-industrias-delta/paquete && echo "ok CO paquete"
test -d out/ec-corp-andina/paquete       && echo "ok EC paquete"
test -d out/hn-agroexport-sula/paquete   && echo "ok HN paquete"
test -d out/pa-logistica-istmo/paquete   && echo "ok PA paquete"
test -f out/co-industrias-delta/paquete/formulario.xlsx && echo "ok CO xlsx en paquete"
test -f out/hn-agroexport-sula/paquete/formulario.xlsx  && echo "ok HN xlsx en paquete"
test -f out/ec-corp-andina/paquete/formulario.pdf       && echo "ok EC pdf en paquete"
test ! -f out/pa-logistica-istmo/paquete/formulario.xlsx && test ! -f out/pa-logistica-istmo/paquete/formulario.pdf \
   && echo "ok PA sin formulario en paquete"

# D) Determinismo stdout
bun run src/scripts/clean-out.ts
bun run demo | tee /tmp/paq-b.txt
diff /tmp/paq-a.txt /tmp/paq-b.txt && echo "ok: determinismo stdout AC-11"

# E) Log 4 líneas × 4 claves
for c in co-industrias-delta ec-corp-andina hn-agroexport-sula pa-logistica-istmo; do
  n=$(wc -l < "out/$c/log.jsonl")
  [ "$n" = "4" ] && echo "ok $c: 4 líneas" || echo "FALLA $c: $n líneas"
  bun -e "const l=await Bun.file('out/$c/log.jsonl').text(); for (const ln of l.trim().split('\\n')) { const o=JSON.parse(ln); console.log(['ts','herramienta','ok','resumen'].every(k=>k in o)?'ok':'FALLA', o.herramienta) }"
done

# F) RN2 scan sobre borrador-correo
for c in co-industrias-delta ec-corp-andina hn-agroexport-sula pa-logistica-istmo; do
  n=$(grep -iEc "Bancolombia|03100012345|COLOCOBM|SWIFT|Número de cuenta|cuenta bancaria" "out/$c/paquete/borrador-correo.md" || true)
  [ "$n" = "0" ] && echo "ok $c: RN2 scan 0 matches" || echo "FALLA $c: $n matches RN2"
done

# G) listo_para_firma = false para los 4 (AC-5)
for c in co-industrias-delta ec-corp-andina hn-agroexport-sula pa-logistica-istmo; do
  bun -e "import {armar_paquete} from './src/tools/proveedor'; const r=JSON.parse(await armar_paquete.execute({caso:'$c'},{directory:import.meta.dir,sessionId:'t'})); console.log(r.ok && r.data.listo_para_firma===false && r.data.checklist.bloqueos.length>0 ? 'ok $c' : 'FALLA $c '+JSON.stringify(r))"
done

# H) Regresión slices 01+02+03+04
bun run verify:ambiguous
bun run verify:mapeo
bun run verify:h2
bun run verify:xlsx
bun run verify:pdf

# I) Error path bogus (AC-9)
bun -e 'import {armar_paquete} from "./src/tools/proveedor"; const r=JSON.parse(await armar_paquete.execute({caso:"bogus"},{directory:import.meta.dir,sessionId:"t"})); console.log(r.ok===false && r.error.startsWith("caso no encontrado") ? "ok bogus" : "FALLA bogus")'

# J) Verify:paquete end-to-end
bun run verify:paquete                                  # ok: verify-paquete

# K) Sin rutas absolutas en código nuevo
rg -nE "[\"']/[^\"']+[\"']" src/tools src/lib || echo "ok: sin rutas absolutas"
```

**Casos a correr**: 4 reales + 1 inexistente (bogus) + 4 regresiones (verify:ambiguous, verify:mapeo, verify:h2, verify:xlsx, verify:pdf) + 1 end-to-end (verify:paquete).

**Checks manuales adicionales**: ninguno — todo arriba es automatizable.

## 9. Riesgos y mitigaciones

- **R1 · Comparación de fechas lexicográfica vs objetos `Date`.** `vigencia_hasta` viene como string `"YYYY-MM-DD"` del fixture; `now` es un `Date`. El plan compara via `now.toISOString().slice(0, 10) >= vigencia_hasta` (lexicográfico sobre ISO). ISO 8601 permite comparación lexicográfica de fechas truncadas a día, y evita problemas de zona horaria.
  **Mitigación**: documentado en §5.1; test implícito en `verify:paquete` (fixture 2026-09-30 → vencido respecto a 2026-10-06; afirmar via `estadoSoporte` directamente).

- **R2 · Edge case "hoy === vigencia_hasta".** ¿Vence hoy o mañana? Decisión: vigente HOY (vence al día siguiente). `now.iso >= vigencia_hasta` ⇒ vencido se dispara solo cuando `now > vigencia_hasta` estrictamente al nivel de día. Verificación: si hoy = 2026-09-30 y vigencia_hasta = 2026-09-30, `"2026-09-30" >= "2026-09-30"` ⇒ vigente ✓.
  **Mitigación**: documentar en comentario de `estadoSoporte`.

- **R3 · Fallo copiando archivos.** `fs.copyFile` lanza si el source no existe (p. ej. `index.json` lista un archivo que fue borrado del disco).
  **Mitigación**: `armarPaqueteFS` captura y re-lanza con mensaje `fallo copiando soporte <archivo>: <msg>`; el `execute` captura y mapea a `{ok:false, error}`. El fixture actual tiene todos los archivos en disco, así que el camino no se activa en el demo (pero sí si alguien borra uno).

- **R4 · RN2 scan false negatives.** Si el implementer añade variantes nuevas al borrador (p. ej. "ACH", "bancolombia S.A." sin mayúscula) que no estén en la lista. La lista fija de patrones es minimalista.
  **Mitigación**: usar case-insensitive (`toLowerCase()`); los 6 patrones cubren los literales específicos del maestro + palabras clave bancarias (SWIFT, cuenta bancaria, Número de cuenta). Si el reviewer identifica más, el implementer puede añadirlos sin ampliar alcance.

- **R5 · Doble ejecución de `runLeer`/`runMapear`.** El demo invoca `leer_solicitud.execute` + `mapear_campos.execute` directamente, y luego `armar_paquete.execute` que internamente llama `runLeer` + `runMapear` otra vez (sin log, porque son las funciones internas, no `.execute`). Son 2 ejecuciones de `runLeer` por caso en el demo (una de `demo.ts`, otra de `armar_paquete`).
  **Mitigación**: `runLeer` + `runMapear` son determinísticos y rápidos; archivos pequeños. Alternativa descartada: contrato `{caso, mapeo?}` opcional para pasar el mapeo si ya existe — complica el contrato §6.2 y no gana nada observable. Decisión: aceptable que armar_paquete internamente re-lea; el log mantiene 4 líneas por caso (porque los calls internos no van por `.execute()`).

- **R6 · `data.ruta` termina con `/` o `/` separador del OS.** En Windows, `path.sep = "\\"`. Para que `data.ruta === "out/<caso>/paquete/"` sea portable, construir con `path.join("out", caso, "paquete") + "/"` o directamente concatenar strings con `/`. Decisión: strings con `/` (consistente con slice 03/04 D4 que uso `path.join("out", nombre, "formulario.xlsx")` — ver que ese también usa `path.sep` en Windows). Hoy el reto se evalúa en macOS/Linux; en Windows habría otros problemas (pdfkit).
  **Mitigación**: documentar que `data.ruta` usa `/` como separador por consistencia con PRD §6.2 (que usa `/` en ejemplos); construir con `"out/" + caso + "/paquete/"` para evitar `path.sep`.

- **R7 · Zod `.passthrough()` en `MapeoInputSchema` de generar_formulario.** `armar_paquete` NO toma `mapeo` como arg; solo `caso`. No hay riesgo de zod aquí.
  **Mitigación**: n/a.

- **R8 · Log line count impact en verify-xlsx y verify-pdf.** **Grep ejecutado**: ningún `wc -l` ni "3 líneas" en `src/scripts/verify-*.ts`. Confirmado seguro.
  **Mitigación**: n/a (verificado proactivamente).

- **R9 · Semántica de `okCount` para PA.** PA no genera formulario (ok=true `skipped` según el slice 04). El `armar_paquete` para PA debería retornar ok (el paquete se arma sin formulario). Entonces totales siguen `ok: 4 | error: 0`.
  **Mitigación**: `armar_paquete` NO falla por ausencia de formulario; solo lo nota en el checklist y en los bloqueos.

- **R10 · Fecha absoluta en checklist.md rompe determinismo entre días.** El checklist incluye `**Fecha:** 2026-10-06`. Dos corridas en días distintos producen checklists distintos.
  **Mitigación**: AC-11 aplica solo al stdout del demo (determinista intra-día). El `verify:paquete` NO afirma el valor exacto de la fecha en el checklist; solo busca la línea con regex `/^\\*\\*Fecha:\\*\\* \\d{4}-\\d{2}-\\d{2}$/m` si acaso. Para el reto, suficiente.

## 10. Dudas abiertas

Ninguna.

## 11. Divergencias respecto al spec

Decisiones del plan que amplían o concretan lo que el spec dejó abierto. Siguiendo el convenio del proyecto (`project_sdd_divergence_rule`), se marcan antes del gate humano.

1. **Nuevo helper `src/lib/paquete.ts`** (templates + escritor FS): el spec §2 mencionaba el escritor pero no fijó archivo. El plan lo extrae a `src/lib/paquete.ts` para no engordar `src/tools/proveedor.ts`. **Motivo**: patrón idéntico a slices 02/03/04 (helpers en `src/lib/`); separación tool ↔ IO.

2. **`runLeer`/`runMapear` llamados internamente desde `runArmar` (sin pasar por `.execute()`)**: el spec §2 pedía "reutilizar leer_solicitud + mapear_campos internamente". El plan concreta que lo hace vía las funciones internas (no `.execute()`), para que `appendLog` no se dispare dos veces por caso. **Motivo**: AC-10 exige exactamente **4 líneas** en el log por caso (leer+mapear+generar+armar, una por tool call vía `.execute()` desde `demo.ts`). Si `armar` hiciera `.execute()` interno, serían 6 líneas.

3. **`armar_paquete` NO falla por ausencia de formulario**: el spec dejaba la decisión abierta en §6.1; el plan confirma que PA (portal) sin formulario produce `ok:true` con `listo_para_firma=false` + bloqueo "Formulario pendiente". **Motivo**: coherente con decisión spec §6.1 opción A; mantiene flujo end-to-end del demo.

4. **`data.ruta` con separador `/` hardcoded**: el spec §2 dijo "`out/<caso>/paquete/` (relativa)" sin fijar separador. El plan construye con `"out/" + caso + "/paquete/"` para que el string sea idéntico cross-platform y comparable literal. **Motivo**: paralelo a D4 del slice 03 (ruta relativa), pero más estricto para evitar `path.sep` divergente.

5. **DISPLAY_SOPORTE map para prettificar tipos en el correo**: el spec §2 solo decía "lista de soportes incluidos". El plan añade un mapa fijo de display names (`"camara_comercio" → "Cámara de Comercio"`, etc.) para que el correo sea legible y, críticamente, **RN2-safe** (evita que `tipo.replace(/_/g, " ")` genere strings con "cuenta" o similares; en el fixture actual, "certificacion_bancaria" → "Certificación bancaria" no choca con los patrones RN2). **Motivo**: legibilidad + RN2 estricto.

6. **"hoy === vigencia_hasta" ⇒ vigente** (no vencido): el spec no fijó el edge case. El plan lo documenta explícitamente en `estadoSoporte` (§5.1 y §9 R2). **Motivo**: interpretación natural ("vigencia hasta DD" = válido hasta final del día DD).

7. **Lista fija de 6 patrones RN2** para el scan: el spec §2 enumeró "Bancolombia, 03100012345, COLOCOBM, SWIFT, Número de cuenta, cuenta bancaria". El plan los replica literales y los aplica case-insensitive via `.toLowerCase().includes(patron.toLowerCase())`. **Motivo**: hace el scan determinista y afirmable sin regex ambiguo.

8. **Imports de `armar_paquete` desde demo.ts manejan error como `errCount`**: el spec no detalló cómo integrar `armar` en el counter actual de `demo.ts`. El plan: `armar.ok === true` no suma a `okCount` adicional (el counter actual se incrementa en `generar.ok` o `skipped`); `armar.error` sí incrementa `errCount`. **Motivo**: minimiza cambios al demo preservando semántica actual del counter (H-1 heredado de slice 03/04).
