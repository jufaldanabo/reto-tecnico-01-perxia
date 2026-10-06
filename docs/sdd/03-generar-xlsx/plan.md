# Plan — 03-generar-xlsx

## 1. Objetivo
Implementar `generar_formulario` (rama xlsx) en `src/tools/proveedor.ts` que, dado `{caso, mapeo}`, escriba `out/<caso>/formulario.xlsx` colocando cada etiqueta de `plantilla-celdas.json` en su `celda_etiqueta` y el valor de `mapeo.llenos[]` (match por etiqueta) en su `celda_valor` dentro de la hoja indicada; devolver error claro para `pdf`/`portal` (ramas en slices posteriores); encadenar `generar_formulario` en `demo.ts`; añadir `exceljs` como dependencia justificada.

## 2. Alcance

**En alcance**
- Dependencia nueva de producción: `exceljs@^4.4.0` (pinned en `package.json`).
- Nuevo helper reutilizable `src/lib/xlsx.ts` con `escribirFormulario(ruta, plantilla, lookup) → Promise<{ n_escritos, n_vacios }>` encapsulando el uso de `exceljs` (slice posterior puede reutilizar si surge otro xlsx).
- Extensión de `src/tools/proveedor.ts`:
  - Zod schemas: `MapeoInputSchema`, `DestinoSchema` (reuso), ítems con `.passthrough()`.
  - Export `generar_formulario: Tool<typeof generarArgs, GenerarData>`.
  - `execute` resuelve el `formato` leyendo `solicitud.json` del caso (mismo patrón que `mapear_campos`) y hace switch de 3 ramas: `xlsx` (implementada), `pdf` (error diferido), `portal` (error diferido).
- Extensión de `demo.ts`: tras el bloque de `mapear_campos`, llama `generar_formulario` cuando el formato es xlsx; imprime línea `  generar: ruta=... (N escritos, M vacíos)` o `  generar: skipped (formato <X>)`.
- Nuevo script `src/scripts/verify-xlsx.ts` que:
  - Para CO y HN, re-lee `out/<caso>/formulario.xlsx` con `exceljs` y afirma, para cada ítem de `plantilla-celdas.json`:
    - `ws.getCell(celda_etiqueta).value === etiqueta`
    - `ws.getCell(celda_valor).value === esperado` (donde `esperado` = `llenos[i].valor` si está en llenos, else `null`/`undefined`/`""`).
  - Para CO, afirma que las 2 worksheets ("Datos Proveedor", "Datos Bancarios") existen.
  - Para EC y PA, afirma `out/<caso>/formulario.xlsx` **no** existe.
  - Determinismo del xlsx (AC-9 parte "contenido"): llama `generar_formulario.execute(...)` una segunda vez dentro de un `out/_test/03-generar-xlsx/determinismo/<caso>/`, re-lee el xlsx producido y compara **celda a celda** contra la primera corrida (ignorando metadatos del zip como `created`/`modified`).
  - Preserva regresión: no toca `verify:ambiguous`, `verify:mapeo`, `verify:h2`; estos siguen en el chain `check`.
- `package.json`:
  - `dependencies`: añadir `"exceljs": "^4.4.0"`.
  - `scripts`: añadir `"verify:xlsx": "bun run src/scripts/verify-xlsx.ts"`; extender `check` para encadenarlo al final.
- `README.md`: añadir `verify:xlsx` a la tabla de scripts y una línea en "Dependencias" justificando `exceljs` (única alternativa realista a implementar OOXML a mano).

**Fuera de alcance**
- Rama `pdf` de `generar_formulario` (slice 04).
- Rama `portal` + `valores-portal.md` (slice posterior).
- Estilos de celda, bordes, fuentes, colores, comentarios, validaciones, imágenes, fórmulas.
- Marcas visuales de `faltantes`/`requiere_confirmacion` en el xlsx (decisión 1 del spec: celda vacía, sin estilo).
- Validación semántica de valores (NIT con dígito correcto, etc.).

## 3. Reglas del PRD que aplican

- **§6.2 contrato de herramientas** — export `{description, args, execute}`; `args` zod + `.describe()`; `execute` devuelve **string JSON** `{ok,data}|{ok:false,error}`; nunca lanza; `ctx.directory` como raíz.
- **§7.1 "plantilla-celdas.json"** — lista de `{hoja, celda_etiqueta, etiqueta, celda_valor}`. Para xlsx se itera esta lista como fuente de verdad del formato de salida.
- **HU-3 P0** — "cada etiqueta y su valor exactamente en la hoja y celda" indicadas por la plantilla.
- **§6.3 CA2** — no inventar valores: solo escribe en `celda_valor` lo que venga en `mapeo.llenos[].valor` (match por `etiqueta` string exacta).
- **§6.3 CA4** — toda tool call en `out/<caso>/log.jsonl`.
- **§6.3 CA5** — errores no matan nada; mensaje claro vía `{ok:false,error}`.
- **§8 TS sin `any`, determinismo, deps justificadas** — `exceljs` justificada en README/plan; stdout y contenido xlsx deterministas.
- **§6.5 estructura** — herramienta en `src/tools/`; helper reutilizable en `src/lib/`.

## 4. Archivos a tocar

| Ruta (relativa a `reto-01/`) | Acción | Motivo |
|---|---|---|
| `package.json` | editar | Añadir `"exceljs": "^4.4.0"` en `dependencies`; añadir script `verify:xlsx`; extender `check`. |
| `bun.lock` | regenerado | Resultado de `bun install` tras añadir `exceljs`. Trackeado. |
| `src/lib/xlsx.ts` | crear | `escribirFormulario(ruta, plantilla, lookup)` encapsula uso de exceljs y conteos. |
| `src/tools/proveedor.ts` | editar | Añadir zod schemas `MapeoInputSchema`, `GenerarData`; export `generar_formulario` con switch por formato. |
| `demo.ts` | editar | Encadenar `generar_formulario`; nueva línea `  generar: ...`. |
| `src/scripts/verify-xlsx.ts` | crear | Verificación fidelidad + multi-sheet + no-existencia + determinismo-contenido. |
| `README.md` | editar | Documentar `verify:xlsx`; justificar `exceljs` en sección de dependencias. |

**No se toca**: fixtures, `reto-01/PRD.md`, `tsconfig.json`, `.env.example`, `.gitignore`, `src/tools/types.ts`, `src/lib/{paths,log,normalize,levenshtein,pais,maestro}.ts`, `src/scripts/{clean-out,verify-ambiguous,verify-mapeo,verify-h2-regression}.ts`, `agent/prompt.md`, `src/server.ts`, `src/llm/*`, `src/knowledge/*`, `web/`.

## 5. Interfaces y tipos

### 5.1 `src/lib/xlsx.ts`
```ts
import ExcelJS from "exceljs"

export type PlantillaCelda = {
  hoja: string
  celda_etiqueta: string
  etiqueta: string
  celda_valor: string
}

export type ValorCelda = string | number | boolean | null | undefined | object | unknown[]

export type EscribirResultado = { n_escritos: number; n_vacios: number }

/**
 * Serializa un valor para una celda xlsx.
 *   - string → string
 *   - number → number
 *   - boolean → "Sí" | "No" (snapshot determinista; HU-3 pide "valor", no formato nativo)
 *   - null / undefined → null (celda vacía)
 *   - object / array → JSON.stringify compacto (defensivo; en el maestro actual solo
 *     "ingresos_ultimo_ano" podría caer aquí si no se profundiza en el path, pero el
 *     glosario mapea a "ingresos_ultimo_ano.valor" (number), así que no debería ocurrir).
 */
export const serializarValor = (v: ValorCelda): string | number | null => {
  if (v === null || v === undefined) return null
  if (typeof v === "string") return v
  if (typeof v === "number") return v
  if (typeof v === "boolean") return v ? "Sí" : "No"
  return JSON.stringify(v)
}

export const escribirFormulario = async (
  ruta: string,
  plantilla: PlantillaCelda[],
  valores: Map<string, unknown>  // etiqueta → valor (del mapeo.llenos). Solo contiene llenos.
): Promise<EscribirResultado> => {
  const wb = new ExcelJS.Workbook()
  let n_escritos = 0
  let n_vacios = 0
  for (const p of plantilla) {
    const ws = wb.getWorksheet(p.hoja) ?? wb.addWorksheet(p.hoja)
    ws.getCell(p.celda_etiqueta).value = p.etiqueta
    if (valores.has(p.etiqueta)) {
      ws.getCell(p.celda_valor).value = serializarValor(valores.get(p.etiqueta) as ValorCelda)
      n_escritos++
    } else {
      ws.getCell(p.celda_valor).value = null
      n_vacios++
    }
  }
  await wb.xlsx.writeFile(ruta)
  return { n_escritos, n_vacios }
}
```

### 5.2 Zod args y tipos en `src/tools/proveedor.ts`
```ts
// Reutiliza DestinoSchema ya existente.
const LlenoInputSchema = z.object({
  etiqueta: z.string(),
  valor: z.unknown(),
}).passthrough()  // tolera ruta_maestro, confianza, destino, ...

const FaltanteInputSchema = z.object({
  etiqueta: z.string(),
}).passthrough()

const ConfirmacionInputSchema = z.object({
  etiqueta: z.string(),
}).passthrough()

const MapeoInputSchema = z.object({
  llenos: z.array(LlenoInputSchema),
  faltantes: z.array(FaltanteInputSchema),
  requiere_confirmacion: z.array(ConfirmacionInputSchema),
})

const generarArgs = {
  caso: z.string().min(1).describe(
    "Nombre de la carpeta del caso en reto-01/fixtures/casos/ (p.ej. 'co-industrias-delta')."
  ),
  mapeo: MapeoInputSchema.describe(
    "Mapeo producido por proveedor_mapear_campos: { llenos[], faltantes[], requiere_confirmacion[] }."
  ),
}

type GenerarData = { ruta: string; formato: "xlsx" }

type GenerarRunResult =
  | { ok: true; data: GenerarData; n_escritos: number; n_vacios: number }
  | { ok: false; error: string }
```

### 5.3 Códigos de error esperados (strings exactos)

| Caso | `error` |
|---|---|
| Carpeta del caso ausente | `caso no encontrado: <nombre>` |
| `solicitud.json` ausente | `solicitud ausente para caso <nombre>` |
| `solicitud.json` corrupto | `json inválido en <ruta>: <issues>` (vía `leerJson`) |
| `plantilla-celdas.json` ausente para xlsx | `plantilla ausente para formato xlsx (caso <nombre>)` |
| `plantilla-celdas.json` corrupta | `json inválido en <ruta>: <issues>` |
| Formato pdf | `formato pdf no implementado en slice 03; disponible en slice 04` |
| Formato portal | `formato portal no implementado en slice 03; disponible en slice posterior` |
| Fallo escribiendo xlsx (fs/exceljs) | `fallo escribiendo xlsx para caso <nombre>: <mensaje>` |
| Excepción no clasificada | `fallo generando formulario (caso <nombre>): <mensaje>` |

### 5.4 Shape del log

```ts
// Ok (xlsx):
{ "ts": "<iso>", "herramienta": "proveedor_generar_formulario", "ok": true,
  "resumen": { "formato": "xlsx", "ruta": "out/<caso>/formulario.xlsx",
               "n_escritos": 15, "n_vacios": 2 } }

// Error (pdf/portal diferidos o fallos):
{ "ts": "<iso>", "herramienta": "proveedor_generar_formulario", "ok": false,
  "resumen": { "caso": "<nombre>", "formato": "<pdf|portal|xlsx>", "error": "<string exacto>" } }
```

### 5.5 Línea en stdout del demo (determinista, 2 espacios de indent)

```
  generar: ruta=out/<caso>/formulario.xlsx (N escritos, M vacíos)
```
o
```
  generar: skipped (formato pdf)
  generar: skipped (formato portal)
```

Semántica: `N escritos` = ítems de plantilla cuyo valor se escribió (match con `llenos`); `M vacíos` = ítems de plantilla sin match (faltantes + requiere_confirmacion desde la perspectiva del template, pero contados sobre la plantilla, no sobre el mapeo).

### 5.6 Ruta de salida y relación con `ctx.directory`

```ts
// En generar_formulario.execute:
const rutaAbs = path.join(outDir(ctx, nombre), "formulario.xlsx")
const rutaRelativa = path.join("out", nombre, "formulario.xlsx")  // devuelta en data.ruta
```

`data.ruta` es relativa a `ctx.directory` para que el modelo pueda citarla al usuario sin exponer rutas absolutas (AC-11). El escritor interno sí usa `rutaAbs`.

### 5.7 Snapshot determinista del xlsx (para verify-xlsx)

```ts
// Representación canónica para comparar dos xlsx producidos.
type CellSnapshot = { hoja: string; celda: string; valor: unknown }

const snapshotXlsx = async (ruta: string): Promise<CellSnapshot[]> => {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(ruta)
  const out: CellSnapshot[] = []
  wb.worksheets.forEach((ws) => {
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        out.push({ hoja: ws.name, celda: cell.address, valor: cell.value })
      })
    })
  })
  // Orden canónico por hoja → address.
  out.sort((a, b) => (a.hoja + a.celda).localeCompare(b.hoja + b.celda))
  return out
}
```

Comparación: `JSON.stringify(snap1) === JSON.stringify(snap2)` → determinismo del contenido.

## 6. Tareas en orden

1. [ ] **T1 · Añadir `exceljs` a `package.json`** `dependencies` como `"exceljs": "^4.4.0"`; correr `cd reto-01 && export PATH="$HOME/.bun/bin:$PATH" && bun install`; confirmar `node_modules/exceljs` presente y `bun.lock` actualizado.
2. [ ] **T2 · Crear `src/lib/xlsx.ts`** con `PlantillaCelda`, `ValorCelda`, `EscribirResultado`, `serializarValor`, `escribirFormulario` (§5.1). Import `ExcelJS from "exceljs"`.
3. [ ] **T3 · Añadir zod schemas en `src/tools/proveedor.ts`**: `LlenoInputSchema`, `FaltanteInputSchema`, `ConfirmacionInputSchema`, `MapeoInputSchema` (§5.2). Reutilizar `DestinoSchema` existente.
4. [ ] **T4 · Implementar `generar_formulario` en `src/tools/proveedor.ts`**:
   - `description`: `"Genera el formulario del cliente a partir del mapeo. Soporta xlsx (escribe out/<caso>/formulario.xlsx siguiendo plantilla-celdas.json). pdf y portal devuelven error de 'no implementado' en este slice."`
   - `args`: `generarArgs` (§5.2).
   - `execute({caso, mapeo}, ctx)` con try/catch global:
     1. `casoDir`/`existsDir` → si falla, retornar `caso no encontrado: <nombre>`.
     2. Leer `solicitud.json` con `leerJson(SolicitudSchema)` reutilizado; propagar errores (misma clasificación por `issues[].path`).
     3. Según `solicitud.formato`:
        - **xlsx**:
          - Verificar `plantilla-celdas.json` existe; leer con `PlantillaCeldasSchema`.
          - Construir `valores: Map<etiqueta, valor>` iterando `mapeo.llenos`.
          - `fs.mkdir(outDir(ctx, nombre), { recursive: true })`.
          - `rutaAbs = path.join(outDir(ctx, nombre), "formulario.xlsx")`.
          - `const { n_escritos, n_vacios } = await escribirFormulario(rutaAbs, plantilla, valores)`.
          - Retornar `{ ok: true, data: { ruta: path.join("out", nombre, "formulario.xlsx"), formato: "xlsx" }, n_escritos, n_vacios }`.
        - **pdf**: `{ ok: false, error: "formato pdf no implementado en slice 03; disponible en slice 04" }`.
        - **portal**: `{ ok: false, error: "formato portal no implementado en slice 03; disponible en slice posterior" }`.
   - Al retornar, `appendLog` con `{formato, ruta?, n_escritos?, n_vacios?, error?}` según resultado.
   - Catch global: `fallo generando formulario (caso <nombre>): <mensaje>` + `appendLog` + return.
5. [ ] **T5 · Export + comentario** al pie del nuevo bloque: `export const generar_formulario: Tool<typeof generarArgs, GenerarData> = { ... }`; añadir línea de comentario `//   generar_formulario → proveedor_generar_formulario` al header de export names.
6. [ ] **T6 · Extender `demo.ts`**:
   - Añadir import `generar_formulario`.
   - Añadir tipos `GenOk = { ok: true; data: { ruta: string; formato: string } }` y `GenErr`.
   - Dentro del `if (mapRes.ok)`: después de la línea `mapeo:`, invocar `generar_formulario.execute({ caso, mapeo: mapRes.data }, ctx)`.
   - Si `formato === "xlsx"` y ok: imprimir `  generar: ruta=${data.ruta} (${n_escritos} escritos, ${n_vacios} vacíos)`. **IMPORTANTE**: `n_escritos`/`n_vacios` no están en `data` del contrato, están en el `resumen` del log. Opciones: (a) parsear el log; (b) incluir `n_escritos`/`n_vacios` en el JSON retornado por `execute` solo para el demo. **Decisión**: la herramienta retorna `JSON.stringify({ ok: true, data: {...}, n_escritos, n_vacios })` donde `n_escritos`/`n_vacios` son top-level opcionales (no afectan al contrato porque el modelo lee `data`); el demo los consume cuando están. Ver nota en §9 R-X.
   - Si `formato === "pdf"` o `"portal"` y !ok con string "formato <X> no implementado": imprimir `  generar: skipped (formato ${formato})`.
   - Si otro error: imprimir `  generar: ERROR: <error>` y contar como error.
7. [ ] **T7 · Crear `src/scripts/verify-xlsx.ts`**:
   - Lee `plantilla-celdas.json` de CO y HN.
   - Para cada: ejecuta `leer_solicitud` + `mapear_campos` + `generar_formulario` en orden; afirma el retorno.
   - Re-abre `out/<caso>/formulario.xlsx` con exceljs; itera plantilla y afirma `ws.getCell(ce).value === et` y `ws.getCell(cv).value === esperado` (donde `esperado = valores.get(etiqueta) ?? null`).
   - Para CO, afirma `wb.worksheets.map(w=>w.name)` incluye `"Datos Proveedor"` y `"Datos Bancarios"`.
   - Para EC y PA: invoca `generar_formulario` con mapeo trivial y afirma `{ok: false}` con error `"formato pdf no implementado..."` o `"formato portal no implementado..."` exacto; afirma `out/<caso>/formulario.xlsx` no existe.
   - Determinismo (AC-9 contenido): usa un subdir temp `out/_test/03-generar-xlsx/determinismo/<caso>/` como `ctx.directory` NO; alternativa más simple: invocar `escribirFormulario` dos veces con la misma plantilla y mismos valores escribiendo a dos rutas diferentes en `out/_test/.../a.xlsx` y `.../b.xlsx`; `snapshotXlsx(a)` vs `snapshotXlsx(b)` → `JSON.stringify` igual.
   - `try/finally fs.rm({recursive:true, force:true})` para limpieza del `_test/`.
   - Imprime `ok: verify-xlsx` y exit 0, o `fail: <sub>` y exit 1.
8. [ ] **T8 · Actualizar `package.json`**:
   - `"verify:xlsx": "bun run src/scripts/verify-xlsx.ts"`.
   - `"check": "bun run typecheck && bun run demo:clean && bun run verify:ambiguous && bun run verify:mapeo && bun run verify:h2 && bun run verify:xlsx"`.
9. [ ] **T9 · Actualizar `README.md`**:
   - Añadir `bun run verify:xlsx` a la tabla de scripts con una línea.
   - Añadir sección (o línea) "Dependencias": justificar `exceljs` (pure JS, API cell-level, única alternativa realista a implementar OOXML a mano) y referenciar que el detalle completo irá a `SOLUCION.md`.
   - Actualizar la salida esperada de `bun run demo` para incluir la línea `generar:`.
10. [ ] **T10 · Verificar typecheck**:
    - `cd reto-01 && export PATH="$HOME/.bun/bin:$PATH" && bun x tsc --noEmit` → exit 0, 0 errores.
11. [ ] **T11 · Verificar demo**:
    - `bun run src/scripts/clean-out.ts && bun run demo` → exit 0; 4 bloques (resumen + mapeo + generar) + totales.
    - Confirmar que CO/HN muestran `generar: ruta=...` y EC/PA muestran `generar: skipped (formato ...)`.
    - Confirmar que `out/co-industrias-delta/formulario.xlsx` y `out/hn-agroexport-sula/formulario.xlsx` existen; `out/ec-corp-andina/formulario.xlsx` y `out/pa-logistica-istmo/formulario.xlsx` NO existen.
12. [ ] **T12 · Verificar logs**:
    - Para CO/HN: `wc -l out/<caso>/log.jsonl` = 3 (leer + mapear + generar); 3ª línea `herramienta: "proveedor_generar_formulario"` + `ok: true` + `resumen` con `formato`, `ruta`, `n_escritos`, `n_vacios`.
    - Para EC/PA: `wc -l out/<caso>/log.jsonl` = 3; 3ª línea `ok: false` + `error` con el string "no implementado".
    - Todas las líneas con las 4 claves `{ts, herramienta, ok, resumen}` (`bun -e` con `JSON.parse` + `Object.keys`).
13. [ ] **T13 · Verificar determinismo stdout** (AC-9 parte stdout):
    - `bun run demo:clean > /tmp/demo-a.txt && bun run demo:clean > /tmp/demo-b.txt && diff /tmp/demo-a.txt /tmp/demo-b.txt` → exit 0.
14. [ ] **T14 · Verificar determinismo xlsx** (AC-9 parte contenido):
    - `bun run verify:xlsx` → `ok: verify-xlsx`; la sub-aserción de determinismo pasa.
15. [ ] **T15 · Verificar error path** (AC-7):
    - `bun -e 'import {generar_formulario} from "./src/tools/proveedor"; const r = JSON.parse(await generar_formulario.execute({caso:"bogus", mapeo:{llenos:[],faltantes:[],requiere_confirmacion:[]}}, {directory: import.meta.dir, sessionId:"t"})); console.log(r.ok===false && r.error.startsWith("caso no encontrado") ? "ok bogus" : "FALLA")'` → `ok bogus`.
    - `bun -e` con `mapeo` sin `llenos` → zod rechaza; capturado por `execute`; retorna `{ok:false, error:...}` sin throw.
16. [ ] **T16 · Regresión slices 00/01/02**:
    - `bun run verify:ambiguous` → ok.
    - `bun run verify:mapeo` → ok.
    - `bun run verify:h2` → ok.
17. [ ] **T17 · Sin `any`** (AC-10):
    - `rg -nE "\\bany\\b" reto-01/src reto-01/demo.ts reto-01/src/scripts` → sin matches reales en código nuevo (comentarios aceptables si quedaran).
18. [ ] **T18 · Sin rutas absolutas en código nuevo** (AC-11):
    - `rg -nE "[\"']/[^\"']+[\"']" reto-01/src/tools reto-01/src/lib` → sin matches.
19. [ ] **T19 · Justificación de dependencia** (AC-12):
    - `grep -c "exceljs" reto-01/README.md` ≥ 1.
    - `jq '.dependencies | keys' reto-01/package.json` = `["exceljs","zod"]`.
20. [ ] **T20 · Checklist final §8** y reporte al coordinator.

## 7. Mapeo criterio → tarea

| Criterio (spec) | Tarea(s) | Cómo se verifica |
|---|---|---|
| AC-1 (contrato §6.2) | T3, T4, T5 | `src/tools/proveedor.ts` exporta `generar_formulario: Tool<...>` con `description` precisa; `args.caso.describe()`, `args.mapeo.describe()`; `execute` siempre `return JSON.stringify(...)` dentro de try/catch; `rg "\\bthrow\\b" src/tools src/lib` → 0 matches. |
| AC-2 (xlsx ok para CO, HN) | T4, T11 | `out/{co-industrias-delta,hn-agroexport-sula}/formulario.xlsx` existe tras `bun run demo`; log entry con `ok:true` y `ruta`/`formato=xlsx`. |
| AC-3 (fidelidad al template) | T4, T7 | `verify:xlsx` itera plantilla y afirma celda a celda `celda_etiqueta`=etiqueta, `celda_valor`=valor-si-lleno-else-null. |
| AC-4 (CA2 nunca inventa) | T2, T4, T7 | `escribirFormulario` solo escribe `valores.get(etiqueta)` (del mapa derivado de `llenos`); nunca lee del maestro ni fabrica strings. `verify:xlsx` captura cualquier celda cuyo valor no esté en `llenos`. |
| AC-5 (multi-hoja CO) | T2, T7 | `verify:xlsx` afirma `wb.worksheets` incluye "Datos Proveedor" y "Datos Bancarios" para CO. |
| AC-6 (pdf/portal error, sin archivo) | T4, T7, T11 | `generar_formulario` devuelve `{ok:false, error:"formato ... no implementado..."}` para EC/PA; `verify:xlsx` afirma archivo no existe; T11 lo confirma también. |
| AC-7 (error path) | T4, T15 | T15 invoca con `caso:"bogus"` → `{ok:false, "caso no encontrado: bogus"}` sin throw; invocación con `mapeo` mal formado → capturado y `{ok:false, error}`. |
| AC-8 (log 3 líneas × 4 claves) | T4, T12 | T12: `wc -l` = 3 para los 4 casos; 3ª línea `herramienta=proveedor_generar_formulario`; todas con `{ts, herramienta, ok, resumen}`. |
| AC-9 (determinismo stdout + xlsx) | T6, T13, T14 | T13: `diff` de 2 corridas de `demo:clean` → vacío. T14: `verify:xlsx` sub-aserción determinismo-contenido → igual. |
| AC-10 (typecheck + sin any) | T2–T6, T10, T17 | `bun x tsc --noEmit` exit 0; `rg "\\bany\\b"` sin matches en código nuevo. |
| AC-11 (sin rutas absolutas) | T4, T18 | `rg` en `src/tools`+`src/lib` sin matches. `rutaAbs` se construye con `path.join(outDir(ctx, ...), ...)`. |
| AC-12 (dep justificada) | T1, T8, T9, T19 | `package.json` lista `exceljs`; README documenta `exceljs` en sección "Dependencias"; slice `spec.md` decisión 3 ya anotó justificación. |

## 8. Estrategia de verificación

Orden exacto desde `reto-01/` (prepend `export PATH="$HOME/.bun/bin:$PATH"` donde aplique):

```bash
# A) Install (una vez tras T1)
bun install                                          # exit 0; exceljs resuelta

# B) Typecheck
bun x tsc --noEmit                                   # exit 0, 0 errores

# C) Sin any en código nuevo
rg -nE "\\bany\\b" src demo.ts src/scripts || echo "ok: sin any"

# D) Sin rutas absolutas en src/tools + src/lib
rg -nE "[\"']/[^\"']+[\"']" src/tools src/lib || echo "ok: sin rutas absolutas"

# E) Demo determinista + artefactos esperados
bun run src/scripts/clean-out.ts
bun run demo | tee /tmp/demo-a.txt                   # exit 0; 4 bloques resumen+mapeo+generar
test -f out/co-industrias-delta/formulario.xlsx      && echo "ok CO xlsx existe"
test -f out/hn-agroexport-sula/formulario.xlsx       && echo "ok HN xlsx existe"
test ! -f out/ec-corp-andina/formulario.xlsx         && echo "ok EC xlsx ausente"
test ! -f out/pa-logistica-istmo/formulario.xlsx     && echo "ok PA xlsx ausente"
bun run src/scripts/clean-out.ts
bun run demo | tee /tmp/demo-b.txt
diff /tmp/demo-a.txt /tmp/demo-b.txt && echo "ok: determinismo stdout AC-9"

# F) Log 3 líneas por caso con 4 claves
for c in co-industrias-delta ec-corp-andina hn-agroexport-sula pa-logistica-istmo; do
  n=$(wc -l < "out/$c/log.jsonl")
  [ "$n" = "3" ] && echo "ok $c: 3 líneas" || echo "FALLA $c: $n líneas"
  bun -e "const l=await Bun.file('out/$c/log.jsonl').text(); for (const ln of l.trim().split('\\n')) { const o=JSON.parse(ln); console.log(['ts','herramienta','ok','resumen'].every(k=>k in o)?'ok':'FALLA', o.herramienta) }"
done

# G) Fidelidad + multi-sheet + determinismo-contenido
bun run verify:xlsx                                  # ok: verify-xlsx

# H) Regresión slices anteriores
bun run verify:ambiguous
bun run verify:mapeo
bun run verify:h2

# I) Error path AC-7
bun -e '
import {generar_formulario} from "./src/tools/proveedor"
const ctx = { directory: import.meta.dir, sessionId: "t" }
const r = JSON.parse(await generar_formulario.execute({caso:"bogus", mapeo:{llenos:[],faltantes:[],requiere_confirmacion:[]}}, ctx))
console.log(r.ok===false && r.error.startsWith("caso no encontrado") ? "ok bogus" : "FALLA bogus")'

# J) Dependencia listada
jq '.dependencies | keys' package.json               # ["exceljs","zod"]
grep -q exceljs README.md && echo "ok: exceljs documentada"
```

**Casos a correr**: 4 reales (CO, EC, HN, PA) + 1 inexistente (bogus) + 1 determinismo-contenido (sub-aserción interna de verify:xlsx) + 3 regresiones (verify:ambiguous, verify:mapeo, verify:h2).

**Checks manuales adicionales**: ninguno — todo arriba es automatizable.

## 9. Riesgos y mitigaciones

- **R1 · `exceljs` es la primera dependencia de producción nueva (además de `zod`).** El evaluador puede objetar.
  **Mitigación**: justificación explícita en `README.md` + `SOLUCION.md` (cuando llegue) sección "Decisiones y trade-offs" con la alternativa descartada (OOXML a mano). PRD §8 explícitamente permite "las que necesites, justificadas".

- **R2 · `exceljs.readFile`/`writeFile` tipos en TS pueden exigir casts.** Las defs tienen `any` en algunos lados.
  **Mitigación**: encapsular todo el uso de `exceljs` en `src/lib/xlsx.ts` con tipos estrictos en la interfaz pública; dentro del helper, si zod no basta, usar `unknown` + narrowing, nunca `any`. Si TS exige una conversión, usar `as unknown as X` con comentario de 1 línea.

- **R3 · `n_escritos`/`n_vacios` fuera del contrato `data` pero necesarios en el demo.** Añadirlos top-level en el JSON de `execute` (fuera de `data`) viola la "pureza" del contrato §6.2 pero no lo rompe (el modelo lee `data`; los extras son ignorados).
  **Mitigación (D-X del §Divergencias)**: documentar explícitamente. Alternativa descartada: hacer que el demo relea el log — complica el demo sin ganar nada. Alternativa descartada: definir `data = { ruta, formato, n_escritos, n_vacios }` — el PRD §6.2 fija `data = { ruta, formato }`, no quiero desviarme. Elegida: `JSON` top-level con `n_escritos`/`n_vacios` adicionales que **no** forman parte del `data` tipado.

- **R4 · `wb.getWorksheet(hoja) ?? wb.addWorksheet(hoja)` — en exceljs `getWorksheet` sobre nombre inexistente retorna `undefined`, no lanza.** OK.
  **Mitigación**: ninguna necesaria. Si en una versión futura cambia a lanzar, el try/catch global de `execute` lo contiene.

- **R5 · Determinismo del xlsx — `wb.xlsx.writeFile` incluye metadatos (createdAt, modifiedAt, creator) en el OOXML.** Comparar sha256 del archivo falla aunque el contenido sea idéntico.
  **Mitigación**: AC-9 define determinismo como "mismo contenido de celda", no "mismos bytes". `verify:xlsx` compara `snapshotXlsx(a)` vs `snapshotXlsx(b)` (JSON canónico ordenado por hoja/celda). Documentado en §5.7.

- **R6 · `boolean → "Sí"/"No"` cambia el tipo nativo de la celda.** Si el cliente abre el xlsx y espera un booleano para una fórmula, no funcionará.
  **Mitigación**: aceptable. HU-3 pide "escribir el valor"; el booleano crudo en xlsx es raramente útil (Excel lo muestra como `TRUE`/`FALSE` en inglés; la demo del cliente colombiano espera "Sí"/"No" en español). En el maestro actual los únicos booleanos son `gran_contribuyente: false` y `autorretenedor: false`, que no aparecen en ninguna plantilla, así que el camino prácticamente no se activa. Documentado en comentario de `serializarValor`.

- **R7 · Valores numéricos como `ingresos_ultimo_ano.valor = 98000000000` (bigint-ish).** JavaScript lo maneja como `number` (precisión 2^53 cubre), exceljs lo escribe como number. OK.
  **Mitigación**: ninguna necesaria para los fixtures; en producción con valores >Number.MAX_SAFE_INTEGER habría que migrar a string.

- **R8 · `exceljs` ocupa ~1 MB en node_modules; añade dependencias transitivas.**
  **Mitigación**: aceptable — es la única dep de producción además de `zod`. Documentado en README.

- **R9 · `verify:xlsx` depende de que `demo:clean` haya corrido antes para tener los xlsx reales.** Si se corre aislado tras `clean-out`, falla.
  **Mitigación**: dentro de `verify:xlsx`, invocar `clean-out` + `demo` (vía import directo, no subprocess) al inicio, para auto-contenerlo. Alternativa descartada: documentar que `verify:xlsx` requiere `demo:clean` antes — frágil. Elegida: el script invoca directamente `leer_solicitud` + `mapear_campos` + `generar_formulario` para cada caso al inicio, no depende de haber corrido `demo:clean`.

- **R10 · Sin dependencias nuevas más allá de `exceljs`.** Confirmado.

## 10. Dudas abiertas

Ninguna.

## 11. Divergencias respecto al spec

Decisiones del plan que amplían o concretan lo que el spec dejó abierto o implícito. Siguiendo el convenio del proyecto (memoria `project_sdd_divergence_rule`), se marcan antes del gate humano.

1. **Nuevo helper `src/lib/xlsx.ts`**: el spec §2 mencionaba "encapsular el uso de exceljs" implícitamente; el plan lo extrae a `src/lib/xlsx.ts` para que `src/tools/proveedor.ts` no cargue con el detalle de ExcelJS. **Motivo**: patrón idéntico al slice 02 (helpers en `src/lib/`); facilita cambiar de librería xlsx si se necesita; separación limpia tool ↔ IO.

2. **`n_escritos`/`n_vacios` top-level en el JSON de `execute`, FUERA de `data`** (ver §9 R3): el spec §2 lista `data = { ruta, formato: "xlsx" }` según PRD §6.2 literal. Para que el demo pueda imprimir `(N escritos, M vacíos)` sin releer el log, el JSON de retorno incluye `n_escritos` y `n_vacios` como campos top-level adicionales (no parte de `data`). El modelo que lea `data` los ignora; el demo (código del proyecto) los consume. **Motivo**: respeta el contrato `data` literal y evita acoplamiento demo→log.

3. **Semántica de "escritos/vacíos" referida a la plantilla, no al mapeo**: `n_vacios` = ítems de la plantilla sin match en `llenos` (es decir, faltantes + requiere_confirmacion). `n_escritos` = ítems con match. Esto puede diferir del número total de `llenos` del mapeo si el mapeo tuviera llenos cuya etiqueta no esté en la plantilla (no debería ocurrir pero el conteo es defensivo). **Motivo**: la plantilla es la fuente de verdad del formato de salida.

4. **Ruta devuelta en `data.ruta` es relativa a `ctx.directory`** (`out/<caso>/formulario.xlsx`), no absoluta: el spec no lo explicita. **Motivo**: alinear con AC-11 (sin rutas absolutas en código) y permitir que el modelo cite la ruta al usuario sin exponer paths del sistema.

5. **`verify:xlsx` auto-contenido (invoca pipeline por sí mismo)**: el spec sugería re-leer el xlsx producido por `demo`; el plan lo hace invocando `leer_solicitud → mapear_campos → generar_formulario` directamente al inicio del script en vez de depender de que `demo:clean` haya corrido. **Motivo**: aislamiento (puede correrse en cualquier momento), evita acoplamiento al orden del `check` chain.

6. **Determinismo del xlsx verificado comparando TWO llamadas a `escribirFormulario` con las mismas entradas, no entre dos corridas completas de `demo`**: el spec AC-9 pide "contenido idéntico entre dos corridas"; el plan simplifica a invocar la escritura dos veces en el mismo proceso (determinismo del *writer*, que es el único origen de posible no-determinismo). **Motivo**: más barato, aísla el "¿es determinista el escritor?" del "¿es determinista el pipeline?" (el pipeline ya se verificó determinista en slices anteriores).

7. **`serializarValor` convierte booleanos a `"Sí"/"No"` en español, no al tipo nativo boolean de exceljs** (ver §9 R6): el spec §2 solo dice "booleanos como `Sí`/`No`"; el plan lo confirma y lo documenta como decisión consciente, no accidental. **Motivo**: HU-3 pide escribir "el valor"; el string español es más legible para el analista; los únicos booleanos del maestro (`gran_contribuyente`, `autorretenedor`) no aparecen en las plantillas actuales, así que el camino es defensivo.
