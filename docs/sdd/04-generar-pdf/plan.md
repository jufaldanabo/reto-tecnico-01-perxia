# Plan — 04-generar-pdf

## 1. Objetivo
Reemplazar la rama `pdf` del switch en `generar_formulario` (hoy stub `"no implementado"`) por una implementación real con `pdfkit` que escriba `out/<caso>/formulario.pdf` reproduciendo cada etiqueta de `plantilla-campos.json` seguida de su valor serializado (o `___`) en el orden del fixture, con encabezado por `solicitud.cliente`; extraer `serializarValor` a `src/lib/serialize.ts` para compartir con el pdf; verificar con `pdf-parse` (devDep) sin regresar los slices 01/02/03.

## 2. Alcance

**En alcance**
- Nuevo helper compartido `src/lib/serialize.ts` con `serializarValor` (migrado desde `src/lib/xlsx.ts`); `src/lib/xlsx.ts` lo re-importa.
- Nuevo helper `src/lib/pdf.ts` con `escribirFormularioPdf(ruta, plantilla, lookup, contexto): Promise<{n_escritos, n_vacios}>` que encapsula `pdfkit`.
- Widen de `GenerarData` en `src/tools/proveedor.ts`: `{ ruta: string, formato: "xlsx" | "pdf" }`.
- Reemplazo del body del `if (formato === "pdf")` en `runGenerar` (hoy stub `:683-689`) por: leer `plantilla-campos.json` → construir `valores` desde `mapeo.llenos` → leer `solicitud.cliente` para el título → `fs.mkdir(outDir)` → `escribirFormularioPdf(...)` → devolver `{ ok: true, data: { ruta: "out/<caso>/formulario.pdf", formato: "pdf" }, n_escritos, n_vacios }`.
- Branch `portal` **no se toca** (sigue devolviendo "formato portal no implementado en slice 03; disponible en slice posterior").
- Branch `xlsx` **no se toca** salvo por el refactor de `serializarValor` (import desde `serialize.ts`).
- `demo.ts`: ningún cambio necesario — la lógica actual (`else if genRes.error.startsWith("formato pdf no implementado")`) dejará de dispararse para EC porque ahora `genRes.ok === true`; EC caerá automáticamente a la rama `generar: ruta=... (N escritos, M vacíos)`.
- Nuevo script `src/scripts/verify-pdf.ts` (patrón de `verify-xlsx.ts`):
  - Para EC: corre `leer_solicitud + mapear_campos + generar_formulario`; afirma `genRes.ok === true` y `genRes.data.formato === "pdf"`; verifica archivo existe y tamaño > 0; extrae texto con `pdf-parse`; afirma que las 15 etiquetas aparecen en el orden del fixture; afirma que, para cada etiqueta, el token siguiente es su valor (`llenos`) o `___` (`faltantes`/`req_conf`); afirma que el título `Registro como proveedor — Corporación Andina de Servicios S.A.` aparece.
  - Para PA: afirma `genRes.ok === false` con error `"formato portal no implementado..."` y archivo `out/pa-logistica-istmo/formulario.pdf` no existe.
  - Determinismo: `escribirFormularioPdf` dos veces a rutas temp con mismas entradas → texto extraído idéntico.
- `package.json`:
  - `dependencies`: `+ "pdfkit": "^0.15.0"`.
  - `devDependencies`: `+ "@types/pdfkit": "^0.13.0"`, `+ "pdf-parse": "^1.1.1"`.
  - `scripts`: `+ "verify:pdf": "bun run src/scripts/verify-pdf.ts"`; `check` extendido para encadenar `verify:pdf` al final.
- `README.md`: `verify:pdf` en la tabla de scripts; sección "Dependencias" ampliada con `pdfkit` (prod, justificación) y `pdf-parse` + `@types/pdfkit` (dev, solo verificación/tipado).

**Fuera de alcance**
- Rama `portal` + `valores-portal.md` (slice posterior).
- Edición de pdfs existentes (AcroForm) — HU-3 P1 explícitamente permite "PDF generado".
- Firma electrónica, logos, imágenes, fuentes custom.
- Validación semántica de valores.
- Cambios en el contrato §6.2.

## 3. Reglas del PRD que aplican

- **§6.2 contrato de herramientas** — no cambia: el nombre `proveedor_generar_formulario`, zod args, `execute` string JSON y "nunca lanza" se preservan.
- **§7.1 "plantilla-campos.json"** — lista ordenada de `{etiqueta, obligatorio}` como fuente de verdad del contenido del pdf.
- **HU-3 P1** — "PDF generado... con etiqueta y valor en el orden dado" (literal).
- **§6.3 CA2** — `pdf` solo escribe `valores.get(etiqueta)` del `Map` derivado de `mapeo.llenos`; nunca lee del maestro ni fabrica strings. Para faltantes/req_conf escribe `___` (no un valor plausible).
- **§6.3 CA4** — `appendLog` tras cada invocación de `generar_formulario`, igual que xlsx.
- **§6.3 CA5** — try/catch global en `execute`; `runGenerar` nunca lanza; errores de IO/pdfkit se capturan y mapean a `{ok:false, error}` con string claro.
- **§8 TS sin `any`, determinismo, deps justificadas** — nuevas deps declaradas en `package.json` y justificadas en `README`; `@types/pdfkit` evita `any` en el uso de `pdfkit`.

## 4. Archivos a tocar

| Ruta (relativa a `reto-01/`) | Acción | Motivo |
|---|---|---|
| `package.json` | editar | +`pdfkit` (deps), +`@types/pdfkit` (devDeps), +`pdf-parse` (devDeps), +script `verify:pdf`, `check` extendido |
| `bun.lock` | regenerado | Resultado de `bun install` |
| `src/lib/serialize.ts` | crear | Extrae `serializarValor` (fuente única para xlsx + pdf) |
| `src/lib/xlsx.ts` | editar | Elimina `serializarValor` local y lo importa desde `./serialize` |
| `src/lib/pdf.ts` | crear | `escribirFormularioPdf` + tipos; encapsula uso de pdfkit |
| `src/tools/proveedor.ts` | editar | Widen `GenerarData.formato` a `"xlsx" \| "pdf"`; reemplaza body del `if (formato === "pdf")` en `runGenerar`; mantiene branch portal y branch xlsx |
| `src/scripts/verify-pdf.ts` | crear | Fidelidad texto + no-existencia portal + determinismo-writer |
| `README.md` | editar | Documenta `verify:pdf` + justifica nuevas deps |

**No se toca**: fixtures, `reto-01/PRD.md`, `tsconfig.json`, `.env.example`, `.gitignore`, `src/tools/types.ts`, `src/lib/{paths,log,normalize,levenshtein,pais,maestro}.ts`, `src/scripts/{clean-out,verify-ambiguous,verify-mapeo,verify-h2-regression,verify-xlsx}.ts`, `demo.ts` (auto-funciona por polimorfismo del contrato), `agent/prompt.md`, `src/server.ts`, `src/llm/*`, `src/knowledge/*`, `web/`.

## 5. Interfaces y tipos

### 5.1 `src/lib/serialize.ts` (extraído desde xlsx.ts, idéntico)
```ts
export type Serializable = string | number | boolean | null | undefined | object | unknown[]

// Serializa un valor para una celda/línea:
//   string→string, number→number, boolean→"Sí"|"No" (D7 del slice 03),
//   null/undefined→null, object/array→JSON.stringify (defensivo).
export const serializarValor = (v: Serializable): string | number | null => {
  if (v === null || v === undefined) return null
  if (typeof v === "string") return v
  if (typeof v === "number") return v
  if (typeof v === "boolean") return v ? "Sí" : "No"
  return JSON.stringify(v)
}
```

### 5.2 `src/lib/xlsx.ts` — cambios
- Elimina la definición local de `serializarValor`.
- Importa: `import { serializarValor, type Serializable } from "./serialize"`.
- Reemplaza `type ValorCelda = ...` por `type ValorCelda = Serializable` (o importa directamente).
- Mantiene `escribirFormulario`, `PlantillaCelda`, `EscribirResultado` sin cambios de interfaz.
- Regresión: `verify:xlsx` sigue en verde (misma firma pública).

### 5.3 `src/lib/pdf.ts`
```ts
import fs from "node:fs"
import PDFDocument from "pdfkit"
import { serializarValor, type Serializable } from "./serialize"

export type PlantillaCampo = {
  etiqueta: string
  obligatorio: boolean
}

export type EscribirPdfResultado = { n_escritos: number; n_vacios: number }

export type ContextoPdf = {
  titulo: string      // "Registro como proveedor — <cliente>"
  fecha: string       // ISO date (p.ej. "2026-10-05"); formato visual libre
}

// Formato de línea:
//   "<etiqueta>[ (obligatorio)]: <valor-o-'___'>"
// El sufijo " (obligatorio)" va ANTES del ":" para que el verificador pueda
// afirmar el prefijo "<etiqueta>" por substring exacto sobre el texto extraído.
// Ejemplo:
//   "RUC (obligatorio): 900123456"
//   "Página web: ___"
const formatearLinea = (
  campo: PlantillaCampo,
  valor: unknown,
  tieneValor: boolean
): string => {
  const et = campo.obligatorio ? `${campo.etiqueta} (obligatorio)` : campo.etiqueta
  if (!tieneValor) return `${et}: ___`
  const s = serializarValor(valor as Serializable)
  return `${et}: ${s === null ? "___" : String(s)}`
}

export const escribirFormularioPdf = async (
  ruta: string,
  plantilla: PlantillaCampo[],
  valores: Map<string, unknown>,
  contexto: ContextoPdf
): Promise<EscribirPdfResultado> => {
  // Crea el documento; info.CreationDate NO se fija (metadata ignorada por AC-9).
  const doc = new PDFDocument({ margin: 50 })
  const stream = fs.createWriteStream(ruta)
  doc.pipe(stream)

  // Encabezado.
  doc.fontSize(16).text(contexto.titulo)
  doc.moveDown(0.3)
  doc.fontSize(10).text(contexto.fecha)
  doc.moveDown(1)
  doc.fontSize(11)

  let n_escritos = 0
  let n_vacios = 0
  for (const p of plantilla) {
    const tieneValor = valores.has(p.etiqueta)
    doc.text(formatearLinea(p, valores.get(p.etiqueta), tieneValor))
    if (tieneValor) n_escritos++
    else n_vacios++
  }

  doc.end()
  // Espera flush del stream antes de retornar (pdfkit es async por streams).
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", () => resolve())
    stream.on("error", (err) => reject(err))
  })

  return { n_escritos, n_vacios }
}
```

### 5.4 Cambios en `src/tools/proveedor.ts`

- `GenerarData` cambia:
  ```ts
  // ANTES:
  type GenerarData = { ruta: string; formato: "xlsx" }
  // DESPUÉS:
  type GenerarData = { ruta: string; formato: "xlsx" | "pdf" }
  ```
- `runGenerar` rama pdf (reemplaza líneas `:683-689`):
  ```ts
  if (formato === "pdf") {
    const plantillaRuta = path.join(dir, "plantilla-campos.json")
    if (!(await existsFile(plantillaRuta))) {
      return { ok: false, error: `plantilla ausente para formato pdf (caso ${nombre})`, formato }
    }
    const plantillaRes = await leerJson(plantillaRuta, PlantillaCamposSchema)
    if (!plantillaRes.ok) return { ok: false, error: plantillaRes.error, formato }

    const valores = new Map<string, unknown>()
    for (const l of input.mapeo.llenos) valores.set(l.etiqueta, l.valor)

    const dirSalida = outDir(ctx, nombre)
    try {
      await fs.mkdir(dirSalida, { recursive: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: `fallo escribiendo pdf para caso ${nombre}: ${msg}`, formato }
    }

    const rutaAbs = path.join(dirSalida, "formulario.pdf")
    const contexto: ContextoPdf = {
      titulo: `Registro como proveedor — ${solicitudRes.data.cliente}`,
      fecha: new Date().toISOString().slice(0, 10),  // "YYYY-MM-DD"
    }
    let n_escritos = 0
    let n_vacios = 0
    try {
      const r = await escribirFormularioPdf(rutaAbs, plantillaRes.data, valores, contexto)
      n_escritos = r.n_escritos
      n_vacios = r.n_vacios
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { ok: false, error: `fallo escribiendo pdf para caso ${nombre}: ${msg}`, formato }
    }

    const rutaRelativa = path.join("out", nombre, "formulario.pdf")
    return { ok: true, data: { ruta: rutaRelativa, formato: "pdf" }, n_escritos, n_vacios }
  }
  ```
- **Nota sobre `fecha` y determinismo (D-1)**: `new Date().toISOString().slice(0, 10)` cambia entre días pero no entre segundos. AC-9 compara dos escrituras consecutivas (mismo día), por lo que la fecha sale idéntica. Si en el futuro el reviewer corriera verificaciones en el borde de la medianoche, podría fallar; mitigación en §9 R-X.
- Zod schema nuevo necesario (si no existe): `PlantillaCamposSchema = z.array(z.object({ etiqueta: z.string(), obligatorio: z.boolean() }))`. Verificar primero si ya está en el archivo (slice 01 lo leyó para `leer_solicitud`); si existe, reutilizarlo; si no, crearlo.
- Actualizar el header de "Export names" (comentario arriba del archivo) si menciona que la rama pdf es un stub; eliminar esa nota.

### 5.5 Códigos de error exactos (strings)

| Caso | `error` |
|---|---|
| Carpeta del caso ausente | `caso no encontrado: <nombre>` (heredado, no cambia) |
| `solicitud.json` ausente | `solicitud ausente para caso <nombre>` (heredado) |
| `plantilla-campos.json` ausente (pdf) | `plantilla ausente para formato pdf (caso <nombre>)` |
| `plantilla-campos.json` corrupta | `json inválido en <ruta>: <issues>` (vía `leerJson`) |
| `fs.mkdir` falla | `fallo escribiendo pdf para caso <nombre>: <mensaje>` |
| `escribirFormularioPdf` lanza | `fallo escribiendo pdf para caso <nombre>: <mensaje>` |
| Formato portal (sin cambio) | `formato portal no implementado en slice 03; disponible en slice posterior` |
| Formato pdf (ya no aplica — ahora produce ok) | — |
| Excepción no clasificada (catch global) | `fallo generando formulario (caso <nombre>): <mensaje>` |

### 5.6 Shape del log (3ª línea para EC)

```ts
// Ok (pdf):
{ "ts": "<iso>", "herramienta": "proveedor_generar_formulario", "ok": true,
  "resumen": { "formato": "pdf", "ruta": "out/ec-corp-andina/formulario.pdf",
               "n_escritos": N, "n_vacios": M } }
```

Para CO/HN sigue siendo xlsx (sin cambios). Para PA sigue siendo `ok:false` con error de portal (sin cambios).

### 5.7 Línea en stdout del demo

Sin cambios en `demo.ts`. Por el polimorfismo del contrato:
- EC: `  generar: ruta=out/ec-corp-andina/formulario.pdf (N escritos, M vacíos)`
- PA: `  generar: skipped (formato portal)` (sin cambios)

El `else if` en `demo.ts:79-82` solo matchea strings `"formato portal no implementado"` (ya que `"formato pdf no implementado"` dejará de existir); seguirá funcionando para PA.

### 5.8 Snapshot determinista pdf (para verify-pdf)

```ts
// Representación canónica = texto extraído, normalizado por líneas.
import pdfParse from "pdf-parse/lib/pdf-parse.js"  // ver §9 R3

const snapshotPdf = async (ruta: string): Promise<string> => {
  const buf = await fs.readFile(ruta)
  const parsed = await pdfParse(buf)
  // Normalización: trim por línea, colapsa whitespace, elimina líneas vacías.
  return parsed.text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 0)
    .join("\n")
}
```

Comparación: `snapshotA === snapshotB` → determinismo del contenido textual.

### 5.9 Aserción de "etiqueta → valor" en orden

```ts
// Para EC, el texto extraído debe contener las 15 etiquetas en orden.
// Estrategia tolerante a quirks de pdf-parse (ver §9 R3):
//   1. Buscar cada etiqueta por indexOf en el texto normalizado.
//   2. Afirmar que los indices son estrictamente crecientes.
//   3. Para cada etiqueta, extraer el "token siguiente" (hasta el próximo "\n")
//      y afirmar que, si el campo está en llenos, el token contiene String(valor);
//      si no, el token contiene "___".
```

## 6. Tareas en orden

1. [ ] **T1 · Crear `src/lib/serialize.ts`** con `Serializable` + `serializarValor` (§5.1). Sin dependencias.
2. [ ] **T2 · Editar `src/lib/xlsx.ts`**: elimina `serializarValor` local; `import { serializarValor, type Serializable } from "./serialize"`; `type ValorCelda = Serializable`. Firma pública de `escribirFormulario` sin cambios.
3. [ ] **T3 · Regresión xlsx**: `cd reto-01 && export PATH="$HOME/.bun/bin:$PATH" && bun x tsc --noEmit && bun run verify:xlsx` → ambos exit 0. Si falla, STOP y reportar bloqueo (ningún otro cambio es seguro sin esta regresión limpia).
4. [ ] **T4 · Añadir dependencias en `package.json`**:
   - `dependencies.pdfkit = "^0.15.0"`
   - `devDependencies["@types/pdfkit"] = "^0.13.0"`
   - `devDependencies["pdf-parse"] = "^1.1.1"`
   - Correr `bun install`; confirmar `node_modules/{pdfkit,pdf-parse}` presentes y `bun.lock` actualizado.
5. [ ] **T5 · Crear `src/lib/pdf.ts`** con `PlantillaCampo`, `EscribirPdfResultado`, `ContextoPdf`, `formatearLinea`, `escribirFormularioPdf` (§5.3). Import `PDFDocument from "pdfkit"`. Si `@types/pdfkit` no cubre algún método (p. ej. `.moveDown(x)` con número), usar `as unknown as X` con comentario de 1 línea (plan slice 03 R2 pattern).
6. [ ] **T6 · Widen `GenerarData`** en `src/tools/proveedor.ts`: `{ ruta: string; formato: "xlsx" | "pdf" }`. Actualizar `GenerarRunResult` si TS marca algún narrowing roto.
7. [ ] **T7 · Reemplazar body del `if (formato === "pdf")` en `runGenerar`** (§5.4):
   - Verificar presencia de `PlantillaCamposSchema` en el archivo; si no está, añadirlo cerca de otros schemas.
   - Insertar la lógica completa: leer plantilla → construir `valores` → `mkdir` → `escribirFormularioPdf(...)` → retornar con `n_escritos`/`n_vacios` top-level.
   - Importar `escribirFormularioPdf` y `ContextoPdf` desde `../lib/pdf`.
   - **No** tocar la rama xlsx ni la rama portal.
   - Eliminar/actualizar comentario del header del archivo si menciona pdf como stub.
8. [ ] **T8 · `demo.ts` auto-funciona**: validar leyendo el código actual (`:72-89`) que la rama ok del generar maneja xlsx+pdf uniformemente y que `else if ("formato portal no implementado")` sigue capturando PA. Si TS compila sin cambios, no se toca.
9. [ ] **T9 · Crear `src/scripts/verify-pdf.ts`**:
   - Estructura paralela a `verify-xlsx.ts`.
   - `verifyCasePdf("ec-corp-andina")`:
     - Pipeline leer + mapear + generar; afirma `genRes.ok === true` y `formato === "pdf"`.
     - `fs.stat(ruta)` → `size > 0`.
     - `pdf-parse` sobre el archivo; snapshot textual (§5.8).
     - Para cada ítem de la plantilla, afirma orden creciente de `indexOf` en el snapshot; afirma que el valor esperado (serializado) o `___` aparece **después** de la etiqueta y **antes** de la siguiente etiqueta.
     - Afirma que el título `Registro como proveedor — Corporación Andina de Servicios S.A.` aparece en el snapshot.
   - `verifyCaseNoPdf("pa-logistica-istmo", "formato portal no implementado")`:
     - Pipeline leer + mapear + generar; afirma `genRes.ok === false` y `error.startsWith(prefix)`.
     - `fs.access(.../formulario.pdf)` → debe fallar (archivo no existe).
   - `verifyDeterminismoPdf()`:
     - Plantilla sintética (3 campos; 1 lleno obligatorio, 1 lleno no obligatorio, 1 faltante).
     - `escribirFormularioPdf(a, ...)` y `escribirFormularioPdf(b, ...)` con mismas entradas; `snapshotPdf(a) === snapshotPdf(b)`.
   - `try/finally fs.rm({recursive:true, force:true})` sobre `out/_test/04-generar-pdf/`.
   - Imprime `ok: verify-pdf` o `fail: <msg>` + `process.exit(1)`.
10. [ ] **T10 · Actualizar `package.json` scripts**:
    - `"verify:pdf": "bun run src/scripts/verify-pdf.ts"`.
    - Extender `check`: `... && bun run verify:xlsx && bun run verify:pdf`.
11. [ ] **T11 · Actualizar `README.md`**:
    - Tabla de scripts: añadir `verify:pdf` con 1 línea.
    - Sección "Dependencias": añadir `pdfkit` (prod, justificación: PDF generado desde cero per HU-3 P1; alternativa descartada = OOXML/PDF a mano) y nota sobre `pdf-parse` + `@types/pdfkit` (dev, solo verificación/tipos).
    - Actualizar la salida esperada de `bun run demo` para que EC muestre `generar: ruta=... (N escritos, M vacíos)` en lugar de `skipped`.
12. [ ] **T12 · Typecheck + sin `any`** (AC-10):
    - `bun x tsc --noEmit` exit 0.
    - `rg -nw any reto-01/src reto-01/demo.ts reto-01/src/scripts` → 0 matches reales en código nuevo (comentarios aceptables si justifican un cast).
13. [ ] **T13 · Verificar demo**:
    - `bun run src/scripts/clean-out.ts && bun run demo` → exit 0.
    - CO/HN siguen generando xlsx; EC ahora muestra `generar: ruta=out/ec-corp-andina/formulario.pdf (N escritos, M vacíos)`; PA sigue `skipped (formato portal)`.
    - `test -f out/ec-corp-andina/formulario.pdf && test $(stat -f%z out/ec-corp-andina/formulario.pdf) -gt 0` → ok (AC-2).
    - `test ! -f out/pa-logistica-istmo/formulario.pdf` → ok (AC-6).
14. [ ] **T14 · Verificar logs** (AC-8):
    - `wc -l out/ec-corp-andina/log.jsonl` = 3; 3ª línea tiene `herramienta=proveedor_generar_formulario`, `ok=true`, `resumen.formato=pdf`, `resumen.ruta`, `resumen.n_escritos`, `resumen.n_vacios`.
    - Para CO/HN sigue siendo xlsx (regresión); para PA 3ª línea `ok=false` con error de portal.
15. [ ] **T15 · Verificar fidelidad y determinismo pdf** (AC-3, AC-5, AC-9):
    - `bun run verify:pdf` → `ok: verify-pdf`.
16. [ ] **T16 · Determinismo stdout** (AC-9 stdout):
    - `bun run demo:clean > /tmp/a.txt && bun run demo:clean > /tmp/b.txt && diff /tmp/a.txt /tmp/b.txt` → exit 0.
17. [ ] **T17 · Error path pdf** (AC-7):
    - `bun -e` que invoca `generar_formulario` con `caso:"bogus"` → `{ok:false, "caso no encontrado: bogus"}`, sin throw.
    - `bun -e` con `mapeo` mal formado (p. ej. `llenos: "no-array"`) → zod lo captura; `execute` retorna `{ok:false, error}` sin throw.
18. [ ] **T18 · Regresión slices 01+02+03** (AC-13):
    - `bun run verify:ambiguous` → ok.
    - `bun run verify:mapeo` → ok.
    - `bun run verify:h2` → ok.
    - `bun run verify:xlsx` → ok (regresión crítica del refactor de `serializarValor`).
19. [ ] **T19 · Sin rutas absolutas en código nuevo** (AC-11):
    - `rg -nE "[\"']/[^\"']+[\"']" reto-01/src/tools reto-01/src/lib` → 0 matches.
20. [ ] **T20 · Dependencias listadas** (AC-12):
    - `jq '.dependencies | keys' reto-01/package.json` → `["exceljs","pdfkit","zod"]` (3 prod).
    - `jq '.devDependencies | keys' reto-01/package.json` incluye `@types/bun`, `@types/pdfkit`, `pdf-parse`, `typescript`.
    - `grep -c pdfkit reto-01/README.md` ≥ 1.
21. [ ] **T21 · Checklist final §8** y reporte al coordinator.

## 7. Mapeo criterio → tarea

| Criterio (spec) | Tarea(s) | Cómo se verifica |
|---|---|---|
| AC-1 (rama pdf produce ok; contrato §6.2 intacto) | T6, T7 | `src/tools/proveedor.ts`: rama `if (formato === "pdf")` retorna `{ok:true, data:{ruta, formato:"pdf"}, n_escritos, n_vacios}`; `rg "\\bthrow\\b" src/tools src/lib` → 0; export name `generar_formulario` sin cambios. |
| AC-2 (`out/ec-corp-andina/formulario.pdf` existe y >0 bytes) | T7, T13 | `test -f` y `stat` tras `bun run demo`. |
| AC-3 (fidelidad texto + orden) | T5, T7, T9, T15 | `verify:pdf` extrae texto con `pdf-parse`, afirma indices crecientes de las 15 etiquetas y la aparición del valor esperado o `___` entre etiquetas consecutivas. |
| AC-4 (CA2 nunca inventa) | T5, T7, T9 | `escribirFormularioPdf` solo lee `valores.get(etiqueta)`; para faltantes/req_conf escribe `___` (string literal, no un valor plausible). `verify:pdf` lo valida indirectamente al afirmar que entre etiquetas aparece exactamente el valor esperado o `___`. |
| AC-5 (encabezado con cliente) | T5, T7, T9 | `verify:pdf` afirma que `Registro como proveedor — Corporación Andina de Servicios S.A.` aparece en el snapshot. |
| AC-6 (portal sigue diferido + xlsx intacto) | T7 (no toca), T9, T13 | PA sigue devolviendo `"formato portal no implementado..."` sin crear pdf; `verify:xlsx` sigue en verde (regresión del slice 03). |
| AC-7 (error path) | T7, T17 | Invocación con `caso:"bogus"` y con `mapeo` inválido → `{ok:false,error}` sin throw. |
| AC-8 (log 3 líneas × 4 claves, 3ª línea pdf) | T7, T14 | `wc -l` + `jq` sobre `log.jsonl` de EC. |
| AC-9 (determinismo stdout + texto pdf) | T5, T9, T15, T16 | `diff` stdout; `verify:pdf` sub-asserción determinismo. |
| AC-10 (typecheck + sin `any`) | T1–T9, T12 | `tsc --noEmit` exit 0; `rg -nw any` 0 matches. |
| AC-11 (sin rutas absolutas) | T5, T7, T19 | `rg` en `src/tools`+`src/lib`. |
| AC-12 (deps justificadas) | T4, T10, T11, T20 | `package.json` + `README` sección Dependencias. |
| AC-13 (regresión slices anteriores) | T3, T18 | `verify:ambiguous`, `verify:mapeo`, `verify:h2`, `verify:xlsx` todos en verde. |

## 8. Estrategia de verificación

Orden exacto desde `reto-01/` (prepend `export PATH="$HOME/.bun/bin:$PATH"` donde aplique):

```bash
# A) Install
bun install                                          # exit 0; pdfkit + pdf-parse resueltos

# B) Typecheck
bun x tsc --noEmit                                   # exit 0

# C) Sin any
rg -nw any src demo.ts src/scripts || echo "ok: sin any"

# D) Sin rutas absolutas
rg -nE "[\"']/[^\"']+[\"']" src/tools src/lib || echo "ok: sin rutas absolutas"

# E) Demo determinista + artefactos esperados
bun run src/scripts/clean-out.ts
bun run demo | tee /tmp/demo-a.txt                   # EC ahora genera pdf, PA skipped
test -f out/co-industrias-delta/formulario.xlsx      && echo "ok CO xlsx"
test -f out/hn-agroexport-sula/formulario.xlsx       && echo "ok HN xlsx"
test -f out/ec-corp-andina/formulario.pdf            && echo "ok EC pdf"
test ! -f out/pa-logistica-istmo/formulario.pdf      && echo "ok PA sin pdf"
test ! -f out/pa-logistica-istmo/formulario.xlsx     && echo "ok PA sin xlsx"
bun run src/scripts/clean-out.ts
bun run demo | tee /tmp/demo-b.txt
diff /tmp/demo-a.txt /tmp/demo-b.txt && echo "ok: determinismo stdout"

# F) Log 3 líneas × 4 claves (EC con pdf)
bun -e "const l=await Bun.file('out/ec-corp-andina/log.jsonl').text(); const lines=l.trim().split('\\n'); console.log(lines.length===3?'ok 3 líneas':'FALLA'); const last=JSON.parse(lines[2]); console.log(last.herramienta==='proveedor_generar_formulario'&&last.ok===true&&last.resumen.formato==='pdf'?'ok 3ª línea pdf':'FALLA');"

# G) Fidelidad + determinismo pdf
bun run verify:pdf                                   # ok: verify-pdf

# H) Regresión slices anteriores (CRÍTICO)
bun run verify:ambiguous
bun run verify:mapeo
bun run verify:h2
bun run verify:xlsx                                  # ← este es el que puede romper por el refactor de serializarValor

# I) Error path AC-7
bun -e '
import {generar_formulario} from "./src/tools/proveedor"
const ctx = { directory: import.meta.dir, sessionId: "t" }
const r = JSON.parse(await generar_formulario.execute({caso:"bogus", mapeo:{llenos:[],faltantes:[],requiere_confirmacion:[]}}, ctx))
console.log(r.ok===false && r.error.startsWith("caso no encontrado") ? "ok bogus" : "FALLA bogus")'

# J) Dependencias listadas
jq '.dependencies | keys' package.json               # ["exceljs","pdfkit","zod"]
jq '.devDependencies | keys' package.json            # incluye pdf-parse, @types/pdfkit
grep -q pdfkit README.md && echo "ok: pdfkit documentada"
```

**Casos a correr**: 4 reales (CO/EC/HN/PA) + 1 inexistente (bogus) + 1 determinismo-writer (sub de verify:pdf) + 4 regresiones (ambiguous, mapeo, h2, xlsx) = 10 ejecuciones.

**Checks manuales adicionales**: ninguno.

## 9. Riesgos y mitigaciones

- **R1 · Regresión del refactor `serializarValor`**. Al mover la función fuera de `xlsx.ts`, el import de `verify-xlsx.ts` (su copia local `serializeExpected`) no cambia, pero `xlsx.ts` sí; si el refactor rompe la firma o la lógica, `verify:xlsx` se cae.
  **Mitigación**: T2 preserva la firma exacta; T3 corre `verify:xlsx` como gate antes de cualquier otro cambio. Si T3 falla, el implementer para y reporta `blocked`.

- **R2 · `pdfkit` tipos vs runtime (puede exigir casts)**. `@types/pdfkit` cubre casi todo pero su typing de `.pipe(stream)` y `.text(string, options)` puede exigir ajustes.
  **Mitigación**: encapsular todo el uso de pdfkit en `src/lib/pdf.ts`; si TS exige un cast, usar `as unknown as X` con comentario de 1 línea (patrón slice 03 R2). Prohibido `any`.

- **R3 · `pdf-parse` tiene un bug conocido: su `import` default ejecuta un test file que falla si no existe `./test/data/05-versions-space.pdf` en cwd.** Workaround standard: importar desde `"pdf-parse/lib/pdf-parse.js"` (bypass al index.js).
  **Mitigación**: `verify-pdf.ts` usa `import pdfParse from "pdf-parse/lib/pdf-parse.js"`. Documentado en §5.8. Si falla por otra razón (p. ej. versión), el implementer para y reporta.

- **R4 · `pdf-parse` concatena texto sin espacios en algunos layouts**. Las aserciones basadas en `includes` o `indexOf` pueden fallar o pasar falsamente.
  **Mitigación**: `snapshotPdf` normaliza colapsando whitespace y filtrando líneas vacías; las aserciones comparan **substrings exactos** sobre el texto normalizado línea-a-línea; cada línea esperada es `"<etiqueta>[ (obligatorio)]: <valor-o-'___'>"`, lo que es robusto porque incluye el separador `: ` que raramente se funde con texto vecino.

- **R5 · pdfkit es asíncrono por streams; retornar antes del `finish` deja el archivo truncado**. Si olvido el `await` sobre el `"finish"` event, `verify:pdf` falla al leer el archivo (vacío o corrupto).
  **Mitigación**: `escribirFormularioPdf` envuelve el stream en `await new Promise((resolve, reject) => stream.on("finish", resolve); stream.on("error", reject))`. Documentado en §5.3.

- **R6 · Metadata del pdf (`info.CreationDate`, `info.Producer`) cambia entre corridas**. Comparar bytes falla aunque el contenido sea idéntico.
  **Mitigación**: AC-9 define determinismo como "texto extraído idéntico" (§5.8). Mismo patrón que xlsx del slice 03 (snapshot canónico, no bytes).

- **R7 · `fecha` del encabezado cambia entre días**. `new Date().toISOString().slice(0,10)` es "YYYY-MM-DD"; dos corridas en días distintos producen pdfs con fecha distinta → `verify:pdf` falla si se corre a medianoche en el borde.
  **Mitigación**: AC-9 compara dos corridas **consecutivas** (segundos de diferencia), por lo que la fecha coincide. Si en el futuro se exige determinismo cross-day, inyectar `fecha` por `ctx` o fijarla a `"demo"`. Fuera de alcance aquí.

- **R8 · Divergencia potencial en el formato de línea**: spec §2 dijo `<etiqueta>: <valor>` y `(obligatorio)` como "después de la etiqueta". El plan fija "antes del `:`" (ver §5.3). Es una decisión del planner que concreta la spec; documentada en §11.
  **Mitigación**: declarado en §11 Divergencias.

- **R9 · `demo.ts` no se toca pero su branch `else if ("formato pdf no implementado")` ya no se activará** (porque EC devuelve `ok:true`). El código queda muerto para pdf pero sigue siendo útil para portal.
  **Mitigación**: el condicional sigue vivo para portal (PA sigue cayendo ahí); eliminar el `pdf` del string sería una micro-divergencia innecesaria. Dejar el string actual (`startsWith("formato portal no implementado")`) es suficiente — portal es el único formato que lo dispara ahora.

- **R10 · Dependencias nuevas (3) justificadas**. `pdfkit` prod (necesario para HU-3 P1); `pdf-parse` dev (verificación); `@types/pdfkit` dev (tipos). Documentadas en README.
  **Mitigación**: ninguna adicional; §9 del PRD lo permite con justificación.

- **R11 · `demo.ts` tiene un bug conceptual: cuenta `skipped` como ok (H-1 del review slice 03)**. Fuera de alcance; no se arregla aquí.
  **Mitigación**: no es un bug para este slice; EC pasa de `skipped` a `ok real`, lo que acerca la semántica. PA seguirá siendo `skipped` como `ok` (comportamiento heredado, aceptado por el usuario).

## 10. Dudas abiertas

Ninguna.

## 11. Divergencias respecto al spec

Decisiones del plan que amplían o concretan lo que el spec dejó abierto. Siguiendo el convenio del proyecto (`project_sdd_divergence_rule`), se marcan antes del gate humano.

1. **Nuevo helper compartido `src/lib/serialize.ts`**: el spec §6 decisión 1 solo pedía "extraer `serializarValor`"; el plan concreta el nombre del archivo (`serialize.ts`) y el tipo exportado (`Serializable`). **Motivo**: alinea con el patrón `src/lib/<responsabilidad>.ts` ya establecido en slices 02/03.

2. **Formato de línea con `(obligatorio)` ANTES del `:`**: el spec §2 dijo "`(obligatorio)` después de la etiqueta" sin fijar posición respecto al `:`. El plan lo coloca **antes** del `:` (ej. `"RUC (obligatorio): 900123456"`). **Motivo**: el verificador puede entonces afirmar `line.startsWith("<etiqueta>")` sin preocuparse por el sufijo; también lee más natural para el analista.

3. **`fecha` en encabezado = `YYYY-MM-DD` (día), no ISO completa**: el spec dijo "fecha ISO de generación"; el plan la trunca a 10 chars para que no varíe entre segundos (determinismo AC-9 estable para dos corridas consecutivas). **Motivo**: paralela al problema R7; "fecha ISO" en castellano admite ambas (ISO 8601 permite "YYYY-MM-DD" como forma extendida de fecha).

4. **Encabezado en 2 líneas (título + fecha), separado por `moveDown(0.3)` + línea en fuente 10 + `moveDown(1)` antes de las filas**: el spec dijo "título + fecha ISO en la primera línea; luego filas en orden". El plan concreta el layout en 2 líneas separadas (título fontSize 16, fecha fontSize 10). **Motivo**: legibilidad; "primera línea" en spec es ambiguo (una sola línea tipográfica o un bloque de encabezado).

5. **`PlantillaCamposSchema` reutilizado o creado**: el spec no explicita si ya existe. El plan dice "verificar primero si está, reutilizar; si no, crear". **Motivo**: minimalista, DRY, evita duplicación con slice 01.

6. **`demo.ts` NO se edita en este slice**: el spec §2 decía "EC pasa de skipped a generar: ruta=...". El plan concluye que esto es automático por el polimorfismo del contrato: `demo.ts` ya maneja `ok:true` uniformemente para xlsx y pdf. **Motivo**: minimizar cambios, menor blast radius. El `else if ("formato pdf no implementado")` del condicional ya no dispara (nadie emite ese string), pero el fragmento `"formato portal no implementado"` sigue vivo para PA; se deja el `||` para claridad declarativa.

7. **Error string para pdf**: `fallo escribiendo pdf para caso <nombre>: <mensaje>` + `plantilla ausente para formato pdf (caso <nombre>)` — paralelos a los de xlsx (`fallo escribiendo xlsx…` / `plantilla ausente para formato xlsx…`). El spec no fijó exactos; el plan los deriva por simetría con slice 03. **Motivo**: coherencia de patrones de error en la herramienta.

8. **Snapshot pdf vía normalización por líneas (trim + collapse whitespace + filter empty)**: el spec AC-9 dijo "texto extraído idéntico"; el plan concreta la normalización (§5.8). **Motivo**: `pdf-parse` puede introducir espaciado variable (R4); normalizar canoniza el snapshot.
