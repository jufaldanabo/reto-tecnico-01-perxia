# Plan — 06-simular-envio

## 1. Objetivo
Implementar `simular_envio` en `src/tools/proveedor.ts` que, dado `{caso, confirmado}`, exija (a) `confirmado === true` y (b) `listo_para_firma === true` derivado internamente, y SOLO en ese caso escriba `out/<caso>/ENVIO-SIMULADO.md`; cualquier otro camino devuelve `{ok:false, error}` **sin side effects** (RN4 estricto, PRD §6.2 literal). Extender `demo.ts` con dos invocaciones por caso (`confirmado:false` + `confirmado:true`) para ejercitar ambas ramas de error; añadir `verify:envio` con happy path end-to-end sobre fixtures sintéticos.

## 2. Alcance

**En alcance**
- Nuevo helper `src/lib/envio.ts` con `renderEnvioSimulado(ctx): string` pura (markdown del "recibo interno").
- **Refactor interno** (ver §11 D1): extraer de `runArmar` una función pura `calcularEstadoPaquete(input, ctx): Promise<EstadoPaqueteResult>` que devuelve `listo_para_firma` + `bloqueos` + `clasificacion` + metadata del caso **sin escribir archivos**. `runArmar` reusa esta función y agrega la escritura FS; `simular_envio` SOLO usa la pura. Elimina el side-effect leak que tendría llamar `runArmar` desde `simular_envio`.
- Extensión de `src/tools/proveedor.ts`:
  - Zod `simularArgs = { caso: z.string().min(1).describe(...), confirmado: z.boolean().default(false).describe(...) }` (default false permite que args sin `confirmado` disparen la rama literal "requiere confirmación explícita" en vez de un zod error).
  - Export `simular_envio: Tool<typeof simularArgs, SimularEnvioData>` con `data = { ruta: string }` literal.
  - Function interna `runEnvio({caso, confirmado}, ctx): Promise<SimularRunResult>`.
- Extensión de `demo.ts`:
  - Dos llamadas de `simular_envio` por caso: `envio[1]` con `confirmado:false`, `envio[2]` con `confirmado:true`.
  - Nuevo contador `expectedCount` (independiente de `okCount`/`errCount`) para errores esperados por semántica (confirmación requerida + no listo).
  - Totales: `ok:4 | error:0 | expected-errors:8`.
- Nuevo script `src/scripts/verify-envio.ts`:
  - Para los 4 casos reales: afirma rama "requiere confirmación explícita" (con `confirmado:false`) + rama "no listo para firma: ..." (con `confirmado:true`); afirma que `ENVIO-SIMULADO.md` NO existe tras ambas invocaciones (AC side effects).
  - Para 1 caso sintético (`out/_test/06-simular-envio/sintetico-ok/`): monta fixtures completos (solicitud + plantilla + soportes-exigidos + maestro + glosario + index) con `vigencia_hasta: 2030-01-01`; corre la cadena completa y afirma happy path.
  - `try/finally fs.rm` para limpiar `_test/`.
- `package.json`: añadir `verify:envio`; extender `check`.
- `README.md`: añadir `verify:envio` a tabla; actualizar salida esperada del demo (dos líneas `envio[N]` por caso).

**Fuera de alcance**
- Envío real (correo, portal, firma).
- Ciclo del agente, servidor HTTP, front chat.
- Rama `portal` de `generar_formulario`.
- Validación de que los archivos del paquete existan físicamente antes de "enviar".
- Nuevas dependencias (solo stdlib + ya instaladas).

## 3. Reglas del PRD que aplican

- **§6.2 contrato de herramientas** — forma del export; `data = { ruta }` literal; error string **literal** `"requiere confirmación explícita"`.
- **§6.5 estructura** — herramienta en `src/tools/`; helper en `src/lib/`.
- **§6.3 CA2 (no inventa)** — `ENVIO-SIMULADO.md` solo lista archivos reales del paquete.
- **§6.3 CA3 (confirmación humana)** — gate explícito antes del write.
- **§6.3 CA4 (log por tool call)** — una línea por invocación en `out/<caso>/log.jsonl` (dos por caso en el demo).
- **§6.3 CA5 (errores no matan)** — ramas de error clasificadas + catch global; nunca lanza al llamante.
- **§7.3 RN3** — vencidos/ausentes bloquean `listo_para_firma`, que bloquea el envío en cascada.
- **§7.3 RN4** — ninguna acción externa sin confirmación explícita del turno inmediatamente anterior. **Interpretación estricta**: sin confirmación, ningún archivo nuevo en `out/<caso>/`.
- **§7.3 RN5** — log por caso.
- **§8** — sin `any`, determinismo stdout, sin shell, deps nuevas = 0.
- **HU-4 último párrafo** — "escribe `out/<caso>/ENVIO-SIMULADO.md`" solo tras confirmación explícita.

## 4. Archivos a tocar

| Ruta (relativa a `reto-01/`) | Acción | Motivo |
|---|---|---|
| `src/lib/envio.ts` | **crear** | `renderEnvioSimulado(ctx)` pura devuelve el markdown; `armarEnvioFS` escribe el archivo |
| `src/tools/proveedor.ts` | **editar** | (1) Extraer `calcularEstadoPaquete` desde `runArmar` (refactor D1); (2) `runArmar` consume la pura; (3) añadir zod schema `simularArgs`, tipos `SimularEnvioData`, `SimularRunResult`; (4) export `simular_envio: Tool<...>`; (5) actualizar comentario del header |
| `demo.ts` | **editar** | Imports; dos llamadas `simular_envio` por caso; nuevo `expectedCount`; totales incluyen `expected-errors:N` |
| `src/scripts/verify-envio.ts` | **crear** | AC-2/AC-3/AC-5 sobre casos reales + AC-4 happy path con fixtures sintéticos end-to-end |
| `package.json` | **editar** | `verify:envio` script; extender `check` |
| `README.md` | **editar** | `verify:envio` en tabla; salida esperada del demo con `envio[1]`/`envio[2]` |

**No se toca** (verificado por grep `wc -l|log\.jsonl|lineasLog` en todos los `verify-*.ts`):
- `verify-ambiguous.ts`, `verify-mapeo.ts`, `verify-h2-regression.ts`, `verify-xlsx.ts`, `verify-pdf.ts`, `verify-paquete.ts` — **ninguno** asertea número de líneas de `log.jsonl`. El cambio 4→6 líneas por caso no rompe regresión.
- `src/lib/{paths,log,maestro,pais,normalize,levenshtein,serialize,xlsx,pdf,soportes,paquete}.ts` (ya cumplen).
- `src/tools/types.ts`, `tsconfig.json`, `.env.example`, `.gitignore`, `fixtures/`, `PRD.md`.
- `agent/prompt.md`, `src/server.ts`, `src/llm/*`, `src/knowledge/*`, `web/`.

## 5. Interfaces y tipos

### 5.1 `src/lib/envio.ts`
```ts
import fs from "node:fs/promises"
import path from "node:path"
import type { SoporteIndexItem } from "./soportes"

export type Correo = { de: string; para: string; asunto: string; fecha: string; cuerpo: string }

export type EnvioConfig = {
  caso: string
  cliente: string
  pais: string
  formato: "xlsx" | "pdf" | "portal"
  correo: Correo
  adjuntos: { formulario?: string; soportes: Array<{ tipo: string; archivo: string }> }
  envioPath: string          // absoluto: out/<caso>/ENVIO-SIMULADO.md
  fecha: string              // YYYY-MM-DD
}

export const renderEnvioSimulado = (c: EnvioConfig): string => {
  const lines: string[] = []
  lines.push(`# Envío simulado — ${c.cliente}`)
  lines.push("")
  lines.push(`**Para:** ${c.correo.de}`)
  lines.push(`**Asunto:** Re: ${c.correo.asunto}`)
  lines.push(`**Fecha:** ${c.fecha}`)
  lines.push(`**Caso:** ${c.caso}`)
  lines.push(`**País:** ${c.pais}`)
  lines.push(`**Formato:** ${c.formato}`)
  lines.push("")
  lines.push(`## Adjuntos`)
  lines.push("")
  if (c.adjuntos.formulario) {
    lines.push(`- Formulario: \`${c.adjuntos.formulario}\``)
  } else {
    lines.push(`- Formulario: pendiente (formato ${c.formato} diferido)`)
  }
  if (c.adjuntos.soportes.length === 0) lines.push(`- Soportes: —`)
  else {
    lines.push(`- Soportes:`)
    for (const s of c.adjuntos.soportes) {
      lines.push(`  - ${s.tipo} (\`${s.archivo}\`)`)
    }
  }
  lines.push("")
  lines.push(`**Nota: este envío es SIMULADO. Ninguna acción externa (correo, portal, firma) fue ejecutada por el agente.**`)
  lines.push("")
  lines.push(`Cordialmente,`)
  lines.push("")
  lines.push(`Representante legal — Periferia IT Group S.A.S.`)
  lines.push("")
  return lines.join("\n")
}

export const armarEnvioFS = async (c: EnvioConfig): Promise<void> => {
  await fs.mkdir(path.dirname(c.envioPath), { recursive: true })
  await fs.writeFile(c.envioPath, renderEnvioSimulado(c), "utf8")
}
```

### 5.2 Zod args + tipos en `src/tools/proveedor.ts`
```ts
const simularArgs = {
  caso: z.string().min(1).describe(
    "Nombre de la carpeta del caso en reto-01/fixtures/casos/ (p.ej. 'co-industrias-delta')."
  ),
  confirmado: z.boolean().default(false).describe(
    "Debe ser true explícito. false o ausente dispara error 'requiere confirmación explícita' sin escribir archivos (CA3/RN4)."
  ),
}

type SimularEnvioData = { ruta: string }

type SimularRunResult =
  | { ok: true; data: SimularEnvioData; resumenLog: { confirmado: boolean; listo_para_firma: boolean } }
  | { ok: false; error: string; resumenLog: { confirmado: boolean; listo_para_firma?: boolean } }
```

### 5.3 Refactor: `calcularEstadoPaquete` (nueva función pura; D1 §11)
```ts
type EstadoPaqueteOk = {
  ok: true
  cliente: string
  pais: string
  formato: "xlsx" | "pdf" | "portal"
  correo: { de: string; para: string; asunto: string; fecha: string; cuerpo: string }
  clasificacion: ClasificacionSoportes
  formulario?: { rutaOrigen: string; nombreDestino: string }
  mapeo: MapeoRef
  listo_para_firma: boolean
  bloqueos: string[]
}
type EstadoPaqueteErr = { ok: false; error: string }
type EstadoPaqueteResult = EstadoPaqueteOk | EstadoPaqueteErr

const calcularEstadoPaquete = async (
  input: { caso: string },
  ctx: Ctx,
): Promise<EstadoPaqueteResult> => {
  // 1. casoDir exists?
  // 2. runLeer, runMapear
  // 3. cargarSoportes
  // 4. clasificarSoportes
  // 5. detectar formulario (existsFile)
  // 6. construir mapeoRef
  // 7. construir bloqueos (vencidos + ausentes + formulario-pendiente si falta)
  // 8. listo_para_firma = bloqueos.length === 0
  //    (NO escribe NADA)
}
```

`runArmar` queda:
```ts
const runArmar = async (input, ctx): Promise<ArmarRunResult> => {
  const estado = await calcularEstadoPaquete(input, ctx)
  if (!estado.ok) return { ok: false, error: estado.error }
  // Construir ArmarPaqueteConfig con estado.* + rutas FS
  // await armarPaqueteFS(config)  (escribe)
  // return { ok: true, data, resumenLog }
}
```

### 5.4 Flujo de `runEnvio(input, ctx)`
1. Verificar `casoDir` existe → si no, `caso no encontrado: <nombre>` + `resumenLog: {confirmado}`.
2. Si `input.confirmado !== true` → `{ ok:false, error: "requiere confirmación explícita", resumenLog: {confirmado:false} }`. **STOP sin más llamadas** (optimización: no re-leemos solicitud; es más barato y respeta RN4 estricto al máximo).
3. Llamar `calcularEstadoPaquete({caso}, ctx)`. Si falla → propagar `error` con `resumenLog: {confirmado:true}`.
4. Si `estado.listo_para_firma === false` → `{ ok:false, error: "no listo para firma: " + bloqueos.join("; "), resumenLog: {confirmado:true, listo_para_firma:false} }`.
5. Happy path: construir `EnvioConfig` con `adjuntos.formulario = estado.formulario?.nombreDestino`, `adjuntos.soportes = [...presentes, ...vencidos].map(s => ({tipo, archivo}))`, `envioPath = outDir(ctx, caso) / ENVIO-SIMULADO.md`, `fecha = new Date().toISOString().slice(0,10)`. Llamar `armarEnvioFS(config)`.
6. Devolver `{ ok:true, data: { ruta: "out/" + caso + "/ENVIO-SIMULADO.md" }, resumenLog: {confirmado:true, listo_para_firma:true} }` (ruta hardcoded con `/` separador, D4 slice 05).

### 5.5 Export `simular_envio` + handler
```ts
export const simular_envio: Tool<typeof simularArgs, SimularEnvioData> = {
  description:
    "Simula el envío del paquete al cliente. Requiere confirmado:true explícito y listo_para_firma:true (sin soportes vencidos ni ausentes). Escribe out/<caso>/ENVIO-SIMULADO.md. Si confirmado:false o paquete no listo, devuelve error claro sin side effects (RN4).",
  args: simularArgs,
  async execute(input, ctx) {
    const nombre = input.caso
    try {
      const r = await runEnvio({ caso: nombre, confirmado: input.confirmado }, ctx)
      await appendLog(ctx, nombre, {
        ts: new Date().toISOString(),
        herramienta: "proveedor_simular_envio",
        ok: r.ok,
        resumen: r.ok
          ? { confirmado: true, listo_para_firma: true, ruta: r.data.ruta }
          : { confirmado: r.resumenLog.confirmado, listo_para_firma: r.resumenLog.listo_para_firma, caso: nombre, error: r.error },
      })
      return JSON.stringify(r.ok ? { ok: true, data: r.data } : { ok: false, error: r.error })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      const errorString = `fallo simulando envío (caso ${nombre}): ${msg}`
      await appendLog(ctx, nombre, {
        ts: new Date().toISOString(),
        herramienta: "proveedor_simular_envio",
        ok: false,
        resumen: { confirmado: input.confirmado, caso: nombre, error: errorString },
      })
      return JSON.stringify({ ok: false, error: errorString })
    }
  },
}
```

### 5.6 Códigos de error (strings exactos)

| Caso | `error` |
|---|---|
| Carpeta del caso ausente | `caso no encontrado: <nombre>` |
| `confirmado !== true` | `requiere confirmación explícita` (**PRD §6.2 literal**) |
| `confirmado:true` pero `listo_para_firma:false` | `no listo para firma: <bloqueos.join("; ")>` |
| `solicitud.json` ausente/inválida | heredado de `runLeer` (via `calcularEstadoPaquete`) |
| `maestro.json`/`glosario`/`soportes/index.json` ausente/inválido | heredado de `runMapear`/`cargarSoportes` |
| Fallo escribiendo `ENVIO-SIMULADO.md` | `fallo simulando envío (caso <nombre>): <mensaje>` |
| Excepción no clasificada | `fallo simulando envío (caso <nombre>): <mensaje>` |

### 5.7 Shape del log

```ts
// Ok (happy path):
{ "ts": "<iso>", "herramienta": "proveedor_simular_envio", "ok": true,
  "resumen": { "confirmado": true, "listo_para_firma": true, "ruta": "out/<caso>/ENVIO-SIMULADO.md" } }

// Error confirmación:
{ "ts": "<iso>", "herramienta": "proveedor_simular_envio", "ok": false,
  "resumen": { "confirmado": false, "caso": "<nombre>", "error": "requiere confirmación explícita" } }

// Error no listo:
{ "ts": "<iso>", "herramienta": "proveedor_simular_envio", "ok": false,
  "resumen": { "confirmado": true, "listo_para_firma": false, "caso": "<nombre>",
               "error": "no listo para firma: Soporte vencido: ..." } }
```

### 5.8 Líneas en stdout del demo (determinista, 2 espacios de indent, sin fecha absoluta)

```
  envio[1]: ERROR: requiere confirmación explícita
  envio[2]: ERROR: no listo para firma: Soporte vencido: camara_comercio (vigencia_hasta 2026-09-30)...
```

Truncar la línea `envio[2]` a 80 chars totales (incluyendo prefijo) + `…` si excede, para legibilidad del stdout. Formato: si `err.length + 20 > 80`, truncar a 60 chars del `err` + `…`.

Error inesperado: `  envio[N]: ERROR UNEXPECTED: <error>` + `errCount++`.

### 5.9 `demo.ts` — cambios puntuales

- Import `simular_envio`.
- Añadir tipos `EnvioOk = { ok: true; data: { ruta: string } }` y `EnvioErr = { ok: false; error: string }`.
- Nuevo contador `let expectedCount = 0`.
- Tras el bloque `armar`, independientemente de si `armar` fue ok, invocar `simular_envio` dos veces:
  ```ts
  const expectedErrors = [
    "requiere confirmación explícita",
    "no listo para firma",
  ]
  for (const [idx, confirmado] of [[1, false], [2, true]] as const) {
    const envStr = await simular_envio.execute({ caso, confirmado }, ctx)
    const envRes = JSON.parse(envStr) as EnvioOk | EnvioErr
    if (envRes.ok) {
      console.log(`  envio[${idx}]: ruta=${envRes.data.ruta}`)
    } else {
      const isExpected = expectedErrors.some((p) => envRes.error.startsWith(p))
      const truncated = envRes.error.length > 60 ? envRes.error.slice(0, 60) + "…" : envRes.error
      if (isExpected) {
        console.log(`  envio[${idx}]: ERROR: ${truncated}`)
        expectedCount++
      } else {
        console.log(`  envio[${idx}]: ERROR UNEXPECTED: ${truncated}`)
        errCount++
      }
    }
  }
  ```
- Línea de totales: `total: 4 casos | ok: 4 | error: 0 | expected-errors: 8`.

### 5.10 `verify-envio.ts` — estructura

- **Parte 1 (casos reales)**: itera los 4 casos.
  - Primero corre la cadena `leer → mapear → generar → armar` (idéntica a verify-paquete; necesaria para que exista el paquete en disco, aunque strictly simular_envio no lo necesita porque calcula estado desde cero).
  - **Rama confirmación**: `simular_envio.execute({caso, confirmado: false})` → afirma `ok===false && error === "requiere confirmación explícita"`. Afirma `!fs.existsSync(out/<caso>/ENVIO-SIMULADO.md)`.
  - **Rama no listo**: `simular_envio.execute({caso, confirmado: true})` → afirma `ok===false && error.startsWith("no listo para firma:")`. Afirma `!fs.existsSync(out/<caso>/ENVIO-SIMULADO.md)`.
- **Parte 2 (happy path sintético)**: en `out/_test/06-simular-envio/`:
  - Monta: `fixtures/casos/sintetico-ok/{solicitud.json, plantilla-campos.json, soportes-exigidos.json}`, `fixtures/repositorio/{maestro.json, soportes/index.json, soportes/<archivo>.txt}`, `fixtures/glosario-campos.json`.
  - Soporte index entries con `vigencia_hasta: "2030-01-01"` (futura).
  - `solicitud.pais: "CO"`, `formato: "pdf"` (reutiliza rama pdf implementada en slice 04).
  - Corre cadena completa `leer → mapear → generar(pdf) → armar → envio({confirmado:true})` con `ctx.directory = out/_test/06-simular-envio`.
  - Afirma `envRes.ok === true && envRes.data.ruta === "out/sintetico-ok/ENVIO-SIMULADO.md"`.
  - Afirma archivo existe en `out/_test/06-simular-envio/out/sintetico-ok/ENVIO-SIMULADO.md`.
  - Afirma contenido contiene: `/^# Envío simulado — /m`, `/^\*\*Para:\*\* /m`, `/^\*\*Fecha:\*\* \d{4}-\d{2}-\d{2}$/m`, `/^## Adjuntos$/m`, `/Nota: este envío es SIMULADO/`, `/Representante legal — Periferia IT Group S.A.S\./`.
  - `try/finally`: `fs.rm(out/_test/, {recursive:true, force:true})`.
- Al final: `console.log("ok: verify-envio")` + exit 0 o `fail: <msg>` + exit 1.

## 6. Tareas en orden

1. [ ] **T1 · Crear `src/lib/envio.ts`** con `EnvioConfig`, `renderEnvioSimulado`, `armarEnvioFS` según §5.1. Sin dependencias nuevas.
2. [ ] **T2 · Refactor `runArmar` en `src/tools/proveedor.ts`**: extraer `calcularEstadoPaquete` (§5.3). `runArmar` queda como "pura + escribir". **Verificación interna** post-refactor: `bun run demo:clean && bun run verify:paquete` → ok (regresión de slice 05).
3. [ ] **T3 · Añadir imports y tipos en `src/tools/proveedor.ts`** para `simular_envio`:
   - `import { renderEnvioSimulado, armarEnvioFS, type EnvioConfig } from "../lib/envio"`.
   - Añadir tipos `SimularEnvioData`, `SimularRunResult`.
   - Añadir zod `simularArgs` (§5.2).
4. [ ] **T4 · Implementar `runEnvio` en `src/tools/proveedor.ts`** siguiendo §5.4:
   - 4 ramas de clasificación en orden.
   - `confirmado !== true` sale INMEDIATAMENTE sin más side effects (no re-lee solicitud; respeta RN4 estricto).
   - `calcularEstadoPaquete` solo si `confirmado === true`.
   - Happy path: construir `EnvioConfig` + `armarEnvioFS`.
5. [ ] **T5 · Export `simular_envio`** en `src/tools/proveedor.ts` (§5.5): `description`, `args: simularArgs`, `execute` con try/catch global + `appendLog`.
   - Actualizar comentario del header `//   simular_envio → proveedor_simular_envio`.
6. [ ] **T6 · Extender `demo.ts`** según §5.8-5.9:
   - Imports + tipos `EnvioOk`/`EnvioErr`.
   - Nuevo `expectedCount`.
   - Dos invocaciones `simular_envio` por caso con contador semántico.
   - Totales con `expected-errors: N`.
7. [ ] **T7 · Crear `src/scripts/verify-envio.ts`** siguiendo §5.10:
   - Parte 1: 4 casos reales × 2 ramas de error, con assert de ausencia de `ENVIO-SIMULADO.md`.
   - Parte 2: fixtures sintéticos end-to-end con `vigencia_hasta: 2030-01-01`.
   - `try/finally` limpieza `_test/`.
8. [ ] **T8 · Actualizar `package.json` scripts**:
   - `"verify:envio": "bun run src/scripts/verify-envio.ts"`.
   - Extender `check`: `"...verify:paquete && bun run verify:envio"`.
9. [ ] **T9 · Actualizar `README.md`**:
   - Añadir `verify:envio` a la tabla de scripts.
   - Actualizar salida esperada del demo (dos líneas `envio[1]`/`envio[2]` por caso + totales con `expected-errors`).
10. [ ] **T10 · Verificar typecheck + sin `any`** (AC-8):
    - `cd reto-01 && export PATH="$HOME/.bun/bin:$PATH" && bun x tsc --noEmit` → exit 0.
    - `rg -nw any reto-01/src reto-01/demo.ts reto-01/src/scripts` → 0 matches en código nuevo.
11. [ ] **T11 · Verificar demo** (AC-6 parcial, AC-7):
    - `bun run src/scripts/clean-out.ts && bun run demo` → exit 0; cada caso tiene 6 líneas (4 previas + 2 nuevas); totales `ok:4 | error:0 | expected-errors:8`.
12. [ ] **T12 · Verificar logs 6 líneas × 4 claves** (AC-6):
    - Para cada caso real: `wc -l out/<caso>/log.jsonl` = **6**.
    - 5ª línea: `herramienta === "proveedor_simular_envio"`, `ok:false`, `resumen.confirmado === false`, `resumen.error === "requiere confirmación explícita"`.
    - 6ª línea: `herramienta === "proveedor_simular_envio"`, `ok:false`, `resumen.confirmado === true`, `resumen.error.startsWith("no listo para firma")`.
    - Cada línea tiene las 4 claves `{ts, herramienta, ok, resumen}`.
13. [ ] **T13 · Verificar side effects estrictos** (AC-2/AC-3 parcial):
    - Tras `demo:clean && demo`, confirmar que NO existe `out/<caso>/ENVIO-SIMULADO.md` para ninguno de los 4 casos reales (porque los 2 llamados terminan en error).
14. [ ] **T14 · Verificar determinismo stdout** (AC-7):
    - `bun run demo:clean > /tmp/env-a.txt && bun run demo:clean > /tmp/env-b.txt && diff /tmp/env-a.txt /tmp/env-b.txt` → exit 0.
15. [ ] **T15 · Verificar happy path sintético** (AC-4):
    - `bun run verify:envio` → `ok: verify-envio`, exit 0.
16. [ ] **T16 · Verificar error path caso inexistente** (AC-5):
    - `bun -e 'import {simular_envio} from "./src/tools/proveedor"; const r=JSON.parse(await simular_envio.execute({caso:"bogus",confirmado:true},{directory:import.meta.dir,sessionId:"t"})); console.log(r.ok===false && r.error.startsWith("caso no encontrado") ? "ok bogus" : "FALLA")'` → `ok bogus`.
17. [ ] **T17 · Regresión slices 01+02+03+04+05** (AC-10):
    - `bun run verify:ambiguous` → ok.
    - `bun run verify:mapeo` → ok.
    - `bun run verify:h2` → ok.
    - `bun run verify:xlsx` → ok.
    - `bun run verify:pdf` → ok.
    - `bun run verify:paquete` → ok (incluye regresión del refactor D1 de `runArmar`).
18. [ ] **T18 · Verificar sin rutas absolutas en código nuevo** (AC-9):
    - `rg -nE '"/[A-Za-z]' reto-01/src/tools reto-01/src/lib` + `rg -n "'/[A-Za-z]" reto-01/src/tools reto-01/src/lib` → 0 matches.
19. [ ] **T19 · Checklist final §8** y reporte al coordinator.

## 7. Mapeo criterio → tarea

| Criterio (spec) | Tarea(s) | Cómo se verifica |
|---|---|---|
| AC-1 (contrato §6.2) | T3, T4, T5 | `src/tools/proveedor.ts` exporta `simular_envio: Tool<...>` con `description` precisa; `args.*` con `.describe()`; `execute` siempre `return JSON.stringify(...)` dentro de try/catch; `rg -n "throw" src/tools src/lib` → 0 matches hacia el llamante. Nombre expuesto: `proveedor_simular_envio`. |
| AC-2 (CA3/RN4 literal) | T4, T7, T13 | T4: en `runEnvio`, `confirmado !== true` sale sin tocar FS. T7 `verify:envio` parte 1: `simular_envio({confirmado:false})` → `error === "requiere confirmación explícita"` + `!fs.existsSync(ENVIO-SIMULADO.md)`. T13 confirma tras demo. |
| AC-3 (RN3 cascada) | T2, T4, T7 | T2 refactor `calcularEstadoPaquete`. T4 rama "no listo". T7 parte 1 verifica el string + ausencia de archivo para los 4 casos reales. |
| AC-4 (happy path sintético) | T1, T4, T7, T15 | T7 parte 2 monta fixtures con `vigencia_hasta:2030-01-01` y corre la cadena completa; T15 lo ejecuta vía `verify:envio` y afirma rutas + contenido. |
| AC-5 (error path caso inexistente) | T4, T16 | T16: `caso:"bogus"` + `confirmado:true` → `{ok:false, error:"caso no encontrado: bogus"}` sin throw. |
| AC-6 (log 6 líneas × 4 claves) | T5, T12 | T12: `wc -l out/<caso>/log.jsonl` = 6; 5ª línea `simular_envio ok:false confirmado:false`; 6ª línea `simular_envio ok:false confirmado:true listo_para_firma:false`. |
| AC-7 (determinismo stdout) | T6, T14 | T14: `diff` entre 2 corridas de `demo:clean` → vacío. Fechas NO aparecen en stdout del demo. |
| AC-8 (typecheck + sin any) | T1–T5, T10 | T10 directo. |
| AC-9 (sin rutas absolutas) | T1–T5, T18 | T18 directo. |
| AC-10 (regresión 01–05) | T17 | T17 corre 6 scripts verify previos. |

## 8. Estrategia de verificación

Orden exacto desde `reto-01/` (prepend `export PATH="$HOME/.bun/bin:$PATH"` donde aplique):

```bash
# A) Typecheck
bun x tsc --noEmit                                 # exit 0

# B) Sin any
rg -nw any src demo.ts src/scripts || echo "ok: sin any"

# C) Demo + artefactos esperados
bun run src/scripts/clean-out.ts
bun run demo | tee /tmp/env-a.txt                  # exit 0; cada caso: 4 líneas previas + 2 nuevas envio
# Totales: ok:4 | error:0 | expected-errors:8

# D) Side effects estrictos (AC-2/AC-3)
for c in co-industrias-delta ec-corp-andina hn-agroexport-sula pa-logistica-istmo; do
  test ! -f "out/$c/ENVIO-SIMULADO.md" && echo "ok $c: envio no creado" || echo "FALLA $c: envio creado indebido"
done

# E) Log 6 líneas × 4 claves
for c in co-industrias-delta ec-corp-andina hn-agroexport-sula pa-logistica-istmo; do
  n=$(wc -l < "out/$c/log.jsonl")
  [ "$n" = "6" ] && echo "ok $c: 6 líneas" || echo "FALLA $c: $n líneas"
  bun -e "const l=await Bun.file('out/$c/log.jsonl').text(); for (const ln of l.trim().split('\\n')) { const o=JSON.parse(ln); console.log(['ts','herramienta','ok','resumen'].every(k=>k in o)?'ok':'FALLA', o.herramienta) }"
done

# F) Determinismo stdout
bun run src/scripts/clean-out.ts
bun run demo | tee /tmp/env-b.txt
diff /tmp/env-a.txt /tmp/env-b.txt && echo "ok: determinismo AC-7"

# G) Error path bogus
bun -e 'import {simular_envio} from "./src/tools/proveedor"; const r=JSON.parse(await simular_envio.execute({caso:"bogus",confirmado:true},{directory:import.meta.dir,sessionId:"t"})); console.log(r.ok===false && r.error.startsWith("caso no encontrado") ? "ok bogus" : "FALLA bogus")'

# H) verify:envio end-to-end
bun run verify:envio                               # ok: verify-envio

# I) Regresión slices 01+02+03+04+05
bun run verify:ambiguous
bun run verify:mapeo
bun run verify:h2
bun run verify:xlsx
bun run verify:pdf
bun run verify:paquete

# J) Sin rutas absolutas
rg -nE '"/[A-Za-z]' src/tools src/lib || echo "ok (abs 1)"
rg -n "'/[A-Za-z]" src/tools src/lib || echo "ok (abs 2)"
```

**Casos a correr**: 4 reales × 2 ramas = 8 ejecuciones esperadas-error + 1 inexistente (bogus) + 1 happy path (sintético verify:envio) + 6 regresiones = 16 ejecuciones.

**Checks manuales adicionales**: ninguno — todo arriba es automatizable.

## 9. Riesgos y mitigaciones

- **R1 · `runArmar` tiene side effects (escribe el paquete)**. Si `simular_envio` reutilizara `runArmar` directamente para obtener `listo_para_firma`, violaría RN4 estricto (crearía archivos en la rama "requiere confirmación").
  **Mitigación**: refactor D1 (§11) — extraer `calcularEstadoPaquete` pura. `simular_envio` nunca llama a `runArmar` ni a `armarPaqueteFS`.

- **R2 · Regresión de `verify:paquete` por el refactor de `runArmar`**. Si el refactor rompe algo (p. ej. `clasificacion` se calcula distinto), slice 05 falla.
  **Mitigación**: T2 incluye verificación interna inmediata (`bun run verify:paquete` tras el refactor); si falla, STOP. El refactor es puramente estructural (misma lógica, movida); baja probabilidad de regresión semántica.

- **R3 · zod `.boolean()` sin `.default(false)` rechaza args sin `confirmado`**. Si el modelo (LLM) omite el flag, zod devuelve error estructural en vez del literal "requiere confirmación explícita".
  **Mitigación**: usar `z.boolean().default(false)` (§5.2). Permite al modelo omitir el flag; el default dispara la rama literal RN4.

- **R4 · "ningún archivo nuevo" tras `confirmado:false` — alcance de la aserción**. Interpretación estricta: tras invocar `simular_envio({confirmado:false})`, ningún archivo bajo `out/<caso>/` que no existiera antes aparece.
  **Mitigación**: `runEnvio` SALE antes de cualquier `fs.*` cuando `confirmado !== true`. T13 lo verifica con `test ! -f out/<caso>/ENVIO-SIMULADO.md`. Nota: `appendLog` sí escribe en `out/<caso>/log.jsonl`, pero el log es el audit trail (CA4) — se considera parte de la observabilidad, no un side effect de la acción externa. Si el reviewer discrepa, documentar en el review y considerar refactor que logue solo tras pasar la gate de confirmación.

- **R5 · Determinismo con `fecha: YYYY-MM-DD` en el ENVIO-SIMULADO.md**: el verify del happy path corre en días distintos → `**Fecha:**` cambia.
  **Mitigación**: `verify:envio` afirma formato de fecha con regex `/\\d{4}-\\d{2}-\\d{2}/`, no valor exacto. Spec AC-4 lo acepta implícito ("secciones esperadas").

- **R6 · Doble escritura del paquete en el demo**: `armar_paquete.execute` llama `runArmar` que escribe el paquete; `simular_envio.execute` llama `calcularEstadoPaquete` que NO escribe. OK — no hay doble escritura (slice 05 escribe una vez; slice 06 solo lee estado).
  **Mitigación**: n/a.

- **R7 · Fixtures sintéticos en `out/_test/` requieren maestro + glosario copiados**: si el verify no los copia, `runLeer`/`runMapear` fallan por rutas inválidas.
  **Mitigación**: §5.10 explícitamente lista los archivos a crear bajo `out/_test/06-simular-envio/fixtures/`. Alternativa descartada: pasar `ctx.directory` apuntando al repo real y crear solo el caso sintético ahí — contamina `fixtures/`.

- **R8 · Lista de bloqueos puede ser muy larga → stdout `envio[2]` crece**: hoy máx ~3 bloqueos; cabe en 80 chars tras truncado.
  **Mitigación**: §5.8 truncado a 60 chars del `err` + `…`. Idempotente.

- **R9 · Sin dependencias nuevas**. Confirmado — solo stdlib + zod + exceljs + pdfkit + pdf-parse ya instaladas.
  **Mitigación**: n/a.

- **R10 · Grep de regresión en `verify-*.ts`**: ejecutado antes de redactar el plan; **0 aserciones** sobre `wc -l log.jsonl` o cuenta de líneas en los 6 scripts previos. El cambio 4→6 líneas no rompe nada.
  **Mitigación**: n/a (verificado proactivamente).

## 10. Dudas abiertas

Ninguna.

## 11. Divergencias respecto al spec

Decisiones del plan que amplían o concretan lo que el spec dejó abierto. Siguiendo el convenio del proyecto (`project_sdd_divergence_rule`), se marcan antes del gate humano.

1. **Refactor `runArmar` → `calcularEstadoPaquete` + `runArmar` escritor** (más intrusivo que lo que el spec declaraba). El spec §6 decisión 1 dijo "simular_envio llama a runArmar internamente". Esto violaría RN4 estricto porque `runArmar` escribe el paquete. El plan refactoriza: extrae la parte pura (sin IO) a `calcularEstadoPaquete`, `runArmar` queda como "pura + escribir", y `simular_envio` consume SOLO la pura. **Motivo**: respeta RN4 literal ("ningún archivo nuevo" cuando `confirmado !== true`). Regresión controlada por T2 (verify:paquete).

2. **`confirmado: z.boolean().default(false)`** (no `z.boolean()` requerido). Permite args sin `confirmado` → dispara el string literal `"requiere confirmación explícita"` (coherente con spec AC-2 "false o ausente"). Alternativa descartada: `.optional()` + manejar `undefined` en lógica (más código). **Motivo**: coincide con el criterio AC-2 del spec sin salirse del contrato §6.2.

3. **Nuevo helper `src/lib/envio.ts`** (templates + escritor). El spec §2 mencionaba el escritor pero no fijó archivo. **Motivo**: patrón idéntico slices 02/03/04/05 (helpers en `src/lib/`); separación tool ↔ IO; render pura testeable.

4. **Nuevo contador `expectedCount` separado**. El spec §6 decisión 2 lo propuso; el plan lo concreta como variable local en `demo.ts` + línea de totales `expected-errors: N`. **Motivo**: operacionaliza la decisión 2 sin ambigüedad.

5. **Truncado del `error` en stdout a 60 chars + `…`**. El spec §2 dijo "truncado a 80 chars si largo"; el plan concreta a 60 chars del error (el prefijo `  envio[N]: ERROR: ` suma ~20 chars). **Motivo**: cumple el espíritu "cabe en una línea de terminal estándar"; determinista.

6. **`simular_envio` NO re-lee `solicitud.json` cuando `confirmado !== true`**. El spec no fijó orden exacto; el plan lo optimiza para que la rama "requiere confirmación" salga lo antes posible, respetando RN4 al máximo (menos IO, menos riesgo de leak). **Motivo**: eficiencia + seguridad.

7. **`appendLog` se emite incluso cuando `confirmado !== true`**. El log es parte del audit trail (CA4/RN5), no un side effect de la acción externa (envío). Spec implícitamente lo acepta en AC-6 (6 líneas por caso ⇒ `envio[1]` también loguea). **Motivo**: CA4 pide registrar TODA llamada a herramienta, incluyendo las que fallan.

8. **`verify:envio` corre la cadena `leer→mapear→generar→armar` antes de `simular_envio` para los casos reales**, aunque strictamente `simular_envio` no la necesita (calcula estado desde cero). **Motivo**: coherencia con `verify:paquete`; verifica que el pipeline previo deje el estado correcto; permite auditar que `simular_envio` funcione DESPUÉS de que el usuario haya corrido la cadena normal.
