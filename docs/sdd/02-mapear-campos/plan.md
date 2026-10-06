# Plan — 02-mapear-campos

## 1. Objetivo
Implementar `mapear_campos` en `src/tools/proveedor.ts` que, dado `{ caso, campos[] }`, cruce cada etiqueta contra `glosario-campos.json` (normalización + Levenshtein) y `maestro.json` (walker nested seguro), devolviendo `{ llenos[], faltantes[], requiere_confirmacion[] }` sin inventar valores (CA2); extender `demo.ts` para encadenar `leer_solicitud → mapear_campos`; y pagar la deuda H-2 refactorizando el catch de zod en `leer_solicitud` para usar `issues[].path` en vez de `.message.includes`.

## 2. Alcance

**En alcance**
- Nuevo export `mapear_campos` en `src/tools/proveedor.ts` (contrato §6.2).
- Nuevos helpers compartidos en `src/lib/`:
  - `src/lib/normalize.ts` — `normalizar(etiqueta)` (lowercase + trim + colapsar espacios + strip acentos).
  - `src/lib/levenshtein.ts` — `distancia(a, b): number` + `similitud(a, b): number` (1 − d/max).
  - `src/lib/maestro.ts` — walker `obtenerValor(obj, ruta): unknown` + loader `cargarMaestro(ctx): Promise<Resultado>`.
  - `src/lib/pais.ts` — `IDENT_POR_PAIS: Record<Pais,"NIT"|"RUC"|"RTN">` + `notaIdentExtranjero(pais)` (reutiliza y centraliza la lógica RN1 que hoy vive dentro de `proveedor.ts` como `NOTA_POR_PAIS`).
- Nuevo zod schema compartido `GlosarioSchema` y loader `cargarGlosario(ctx)` en `src/lib/maestro.ts` (misma familia de helpers que `maestro`).
- Extensión de `src/tools/proveedor.ts`:
  - Export `mapear_campos: Tool<...>`.
  - Refactor del catch de zod en `leer_solicitud` (deuda H-2): switch sobre `issues[].path[0]` (`"formato"` / `"pais"`) → mantiene los strings de error exactos del slice 01.
  - Mueve `NOTA_POR_PAIS` a `src/lib/pais.ts` y lo re-exporta/consume desde ambas herramientas.
- Extensión de `demo.ts`: por cada caso, tras la línea actual de resumen, imprime una línea `mapeo: L llenos, F faltantes, C requiere_confirmacion` usando la salida de `mapear_campos`.
- Nuevo script `src/scripts/verify-mapeo.ts` que cubre AC-3 (CA2 sin inventar), AC-5 (normalización RAZON SOCIAL ↔ Razón social), AC-6 (fuzzy ∈ [0.8,1.0) con "Correo electronico") y AC-13 (deuda H-2: forzar error de formato inválido y comparar string exacto).
- Nuevo script `src/scripts/verify-h2-regression.ts` (o reutilizar `verify-mapeo` con sub-aserción) que:
  - Crea un `solicitud.json` sintético con `formato: "bogus"` → afirma string de error `formato inválido en solicitud (caso <X>): ...`.
  - Crea otro con `pais: "ZZ"` → afirma string de error `pais inválido en solicitud (caso <X>): ...`.
- `package.json` scripts: añadir `verify:mapeo` y actualizar `check` para encadenar.
- `README.md`: documentar nuevo script bajo "Arranque local".

**Fuera de alcance**
- `generar_formulario`, `armar_paquete`, `simular_envio`, ciclo del agente, front, adaptador LLM.
- Validación semántica (p. ej. NIT con dígito de verificación correcto).
- Fuzzy multi-token / tokenización / embeddings (Levenshtein basta).
- Dependencias nuevas; `GlosarioSchema` usa zod ya instalado.

## 3. Reglas del PRD que aplican

- **§6.2 contrato de herramientas** — export `{description, args, execute}`; `args` zod + `.describe()`; `execute` devuelve **string JSON** `{ok,data}|{ok:false,error}`; nunca lanza; `ctx.directory` como raíz.
- **§6.5 estructura** — herramienta en `src/tools/`; helpers compartidos en `src/lib/`.
- **§6.3 CA2** — modelo no afirma valores que no vengan de herramienta; `null`/`undefined` en el maestro ⇒ `faltante` (no inventar).
- **§6.3 CA4** — toda tool call en `out/<caso>/log.jsonl`; `mapear_campos` también emite una línea.
- **§6.3 CA5** — errores de herramienta no matan nada; mensaje claro vía `{ok:false,error}`.
- **§7.1 estructura del caso** — para resolver `pais` del caso (necesario para RN1), reutilizar la lectura de `solicitud.json` (opción B del §5.3).
- **§7.2 repositorio maestro** — forma de `maestro.json` y `glosario-campos.json`.
- **§7.3 RN1** — para `ruta_maestro === "nit"` y `pais !== "CO"`: `requiere_confirmacion` con nota literal.
- **§8** — TS sin `any`, determinismo (Levenshtein y mapas ordenados), sin shell, sin deps nuevas.

## 4. Archivos a tocar

| Ruta (relativa a `reto-01/`) | Acción | Motivo |
|---|---|---|
| `src/lib/normalize.ts` | crear | `normalizar(etiqueta: string): string` reusable (slice 02+ y futuros slices de UI/mapeos) |
| `src/lib/levenshtein.ts` | crear | `distancia(a,b)` + `similitud(a,b)` puros |
| `src/lib/pais.ts` | crear | Centraliza `IDENT_POR_PAIS`, `NOTA_POR_PAIS` (RN1); re-exporta tipos `Pais` |
| `src/lib/maestro.ts` | crear | `cargarMaestro(ctx)`, `cargarGlosario(ctx)`, `obtenerValor(obj, ruta)` + `MaestroSchema`, `GlosarioSchema` |
| `src/tools/proveedor.ts` | editar | (1) Añadir export `mapear_campos`; (2) refactor H-2 del catch de zod en `leer_solicitud`; (3) migrar `NOTA_POR_PAIS` para importarlo de `src/lib/pais.ts` |
| `demo.ts` | editar | Encadenar `leer_solicitud → mapear_campos` por caso; nueva línea `mapeo: ...` |
| `src/scripts/verify-mapeo.ts` | crear | AC-3, AC-5, AC-6 (3 sub-aserciones en el mismo script, bajo `out/_test/02-mapear-campos/`) |
| `src/scripts/verify-h2-regression.ts` | crear | AC-13 (dos casos sintéticos: `formato` inválido y `pais` inválido) |
| `package.json` | editar | Scripts `verify:mapeo`, `verify:h2`, actualizar `check` |
| `README.md` | editar | Listar nuevos scripts |

**No se toca**: fixtures, PRD, `tsconfig.json`, `.env.example`, `.gitignore`, `src/tools/types.ts`, `src/lib/{paths.ts, log.ts}` (ya cumplen), `agent/prompt.md`, `src/server.ts`, `src/llm/*`, `src/knowledge/*`, `web/`.

## 5. Interfaces y tipos

### 5.1 `src/lib/normalize.ts`
```ts
export const normalizar = (s: string): string =>
  s.normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .toLowerCase().trim().replace(/\s+/g, " ")
```

### 5.2 `src/lib/levenshtein.ts`
```ts
export const distancia = (a: string, b: string): number => {
  const m = a.length, n = b.length
  if (m === 0) return n
  if (n === 0) return m
  let prev = new Array<number>(n + 1).fill(0).map((_, j) => j)
  let curr = new Array<number>(n + 1).fill(0)
  for (let i = 1; i <= m; i++) {
    curr[0] = i
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[n]
}

export const similitud = (a: string, b: string): number => {
  const max = Math.max(a.length, b.length)
  if (max === 0) return 1
  return 1 - distancia(a, b) / max
}
```

### 5.3 `src/lib/pais.ts`
```ts
export const PAISES = ["CO", "EC", "PE", "PA", "HN"] as const
export type Pais = (typeof PAISES)[number]

export const IDENT_POR_PAIS: Record<Pais, "NIT" | "RUC" | "RTN"> = {
  CO: "NIT", EC: "RUC", PE: "RUC", PA: "RUC", HN: "RTN",
}

export const NOTA_POR_PAIS: Record<Pais, string> = {
  CO: "sugerido: NIT (identificador tributario de Colombia)",
  EC: "sugerido: RUC (identificador tributario de Ecuador)",
  PE: "sugerido: RUC (identificador tributario de Perú)",
  PA: "sugerido: RUC (identificador tributario de Panamá)",
  HN: "sugerido: RTN (identificador tributario de Honduras)",
}

export const notaIdentExtranjero = (pais: Pais): string =>
  `identificador extranjero: Periferia solo tiene NIT colombiano; para ${pais} se espera ${IDENT_POR_PAIS[pais]}`
```

### 5.4 `src/lib/maestro.ts`
```ts
import fs from "node:fs/promises"
import path from "node:path"
import { z } from "zod"
import type { Ctx } from "../tools/types"

export const MaestroSchema = z.record(z.string(), z.unknown())
export type Maestro = z.infer<typeof MaestroSchema>

export const GlosarioSchema = z.record(z.string(), z.string())
export type Glosario = z.infer<typeof GlosarioSchema>

type R<T> = { ok: true; data: T } | { ok: false; error: string }

const leerJson = async <T>(ruta: string, schema: z.ZodType<T>): Promise<R<T>> => { /* mismo patrón que proveedor.ts */ }

export const cargarMaestro = (ctx: Ctx): Promise<R<Maestro>> =>
  leerJson(path.join(ctx.directory, "fixtures", "repositorio", "maestro.json"), MaestroSchema)

export const cargarGlosario = (ctx: Ctx): Promise<R<Glosario>> =>
  leerJson(path.join(ctx.directory, "fixtures", "glosario-campos.json"), GlosarioSchema)

export const obtenerValor = (obj: unknown, ruta: string): unknown => {
  const partes = ruta.split(".")
  let cur: unknown = obj
  for (const p of partes) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}
```

### 5.5 Zod args y tipos de salida (en `src/tools/proveedor.ts`)
```ts
import { z } from "zod"
import { PAISES } from "../lib/pais"

const DestinoSchema = z.object({
  hoja: z.string(), celda_etiqueta: z.string(), celda_valor: z.string(),
})

const CampoInputSchema = z.object({
  etiqueta: z.string(),
  obligatorio: z.boolean(),
  destino: DestinoSchema.optional(),
  requiere_confirmacion: z.literal(true).optional(),
  nota_pais: z.string().optional(),
}).passthrough()

const mapearArgs = {
  caso: z.string().min(1).describe(
    "Nombre de la carpeta del caso en reto-01/fixtures/casos/ (p.ej. 'co-industrias-delta')."
  ),
  campos: z.array(CampoInputSchema).min(1).describe(
    "Lista de campos tal como la devuelve proveedor_leer_solicitud en data.campos[]. Mínimo 1."
  ),
}

type Destino = z.infer<typeof DestinoSchema>

type LlenoItem = {
  etiqueta: string
  ruta_maestro: string
  valor: unknown
  confianza: number
  destino?: Destino
}

type FaltanteItem = {
  etiqueta: string
  motivo: string
  destino?: Destino
}

type ConfirmacionItem = {
  etiqueta: string
  ruta_maestro?: string
  valor?: unknown
  confianza?: number
  motivo: string
  nota_pais?: string
  destino?: Destino
}

type MapeoData = {
  llenos: LlenoItem[]
  faltantes: FaltanteItem[]
  requiere_confirmacion: ConfirmacionItem[]
}
```

### 5.6 Códigos de error esperados (strings exactos de `mapear_campos`)

| Caso | `error` |
|---|---|
| Carpeta del caso ausente | `caso no encontrado: <nombre>` |
| `solicitud.json` ausente/corrupta | heredado de `leerSolicitudCaso(nombre)`: mismos strings de slice 01 |
| `maestro.json` ausente | `maestro ausente en reto-01/fixtures/repositorio/maestro.json` |
| `maestro.json` corrupto | `json inválido en <ruta>: <mensajes>` |
| `glosario-campos.json` ausente | `glosario ausente en reto-01/fixtures/glosario-campos.json` |
| `glosario-campos.json` corrupto | `json inválido en <ruta>: <mensajes>` |
| `campos` con shape inválido | capturado antes por zod del wrapper del servidor; dentro de `execute`, si llega mal, `json inválido en args.campos: <...>` |
| Excepción no clasificada | `fallo mapeando caso <nombre>: <mensaje>` |

### 5.7 Shape del log (una línea por llamada en `out/<caso>/log.jsonl`)
```ts
// Ok:
{ "ts": "<iso>", "herramienta": "proveedor_mapear_campos", "ok": true,
  "resumen": { "n_llenos": 10, "n_faltantes": 2, "n_requiere_confirmacion": 5 } }
// Error:
{ "ts": "<iso>", "herramienta": "proveedor_mapear_campos", "ok": false,
  "resumen": { "caso": "<nombre>", "error": "<string exacto>" } }
```

### 5.8 Shape de la línea-resumen en stdout (determinista)
Tras la línea existente de `leer_solicitud`, se añade:
```
mapeo: L llenos, F faltantes, C requiere_confirmacion
```
Donde L+F+C = n_campos (partición AC-2). El orden de los campos en las listas sigue el orden de entrada (determinismo AC-10).

### 5.9 Refactor H-2 — switch sobre `issues[].path`

Reemplazar en `src/tools/proveedor.ts`:
```ts
// ANTES (frágil):
if (msg.startsWith("json inválido")) {
  if (msg.includes("formato")) { ... }
  if (msg.includes("pais")) { ... }
}
```
Por:
```ts
// DESPUÉS (robusto):
// En leerJson, cuando safeParse falla, además del error como hoy, devolver
// opcionalmente las issues; o: inspeccionar issues antes de concatenar.
// Patrón: construir un leerJsonConPaths que exponga issues; en el llamador de
// SolicitudSchema, revisar issues.some(i => i.path[0] === "formato") / "pais".
// Mantener los strings de error exactos:
//   `formato inválido en solicitud (caso ${nombre}): ver ${ruta}`
//   `pais inválido en solicitud (caso ${nombre}): ver ${ruta}`
```

Implementación concreta: añadir una variante `leerJsonIssues(ruta, schema): Promise<R<T> | { ok:false, error:string, issues: z.ZodIssue[] }>` que, cuando falla la validación, incluya `issues`. El llamador puede entonces hacer:
```ts
if (!solicitudRes.ok) {
  if ("issues" in solicitudRes) {
    if (solicitudRes.issues.some(i => i.path[0] === "formato"))
      return { ok: false, error: `formato inválido en solicitud (caso ${nombre}): ver ${solicitudRuta}` }
    if (solicitudRes.issues.some(i => i.path[0] === "pais"))
      return { ok: false, error: `pais inválido en solicitud (caso ${nombre}): ver ${solicitudRuta}` }
  }
  return solicitudRes
}
```

## 6. Tareas en orden

1. [ ] **T1 · Crear `src/lib/normalize.ts`** con `normalizar` (§5.1). Sin dependencias.
2. [ ] **T2 · Crear `src/lib/levenshtein.ts`** con `distancia` y `similitud` (§5.2). Puros.
3. [ ] **T3 · Crear `src/lib/pais.ts`** con `PAISES`, `Pais`, `IDENT_POR_PAIS`, `NOTA_POR_PAIS`, `notaIdentExtranjero` (§5.3).
4. [ ] **T4 · Crear `src/lib/maestro.ts`** con `MaestroSchema`, `GlosarioSchema`, `cargarMaestro`, `cargarGlosario`, `obtenerValor`, `leerJson` interno (§5.4). Usa `node:fs/promises` y `node:path`.
5. [ ] **T5 · Refactor H-2 en `src/tools/proveedor.ts`** (deuda del slice 01):
    - Añadir `leerJsonIssues` (o adaptar `leerJson`) que devuelva `issues` cuando falla validación.
    - Reescribir el bloque que hoy hace `msg.includes("formato")`/`msg.includes("pais")` para usar `issues[].path[0]`.
    - **No cambiar los strings de error** (regla AC-13 + regresión del slice 01).
6. [ ] **T6 · Migrar `NOTA_POR_PAIS` + `PAISES` + tipo `Pais` desde `src/tools/proveedor.ts` a `src/lib/pais.ts`**. Reemplazar la constante local por un `import { PAISES, NOTA_POR_PAIS, type Pais } from "../lib/pais"`. `AMBIGUAS` y `esAmbigua` se quedan donde están (son de slice 01).
7. [ ] **T7 · Implementar `mapear_campos` en `src/tools/proveedor.ts`**:
    - Imports: `z`, helpers T1–T4, tipos T6, `appendLog`.
    - `description`: una frase precisa. Sugerencia: `"Cruza los campos solicitados (de proveedor_leer_solicitud) contra el repositorio maestro y el glosario; devuelve tres listas: llenos (con valor y ruta), faltantes y requiere_confirmacion. Nunca inventa valores."`
    - `args`: §5.5.
    - `execute({ caso, campos }, ctx)` con try/catch global:
      1. Resolver `pais` del caso llamando internamente a `leer_solicitud.execute({ caso }, ctx)` (reutilización) o leyendo `solicitud.json` directo con `SolicitudSchema`. **Elegir**: lectura directa (más barato, no re-escribe log). Si falla, retornar su error.
      2. `cargarMaestro(ctx)` → si falla, retornar error §5.6.
      3. `cargarGlosario(ctx)` → si falla, retornar error §5.6.
      4. Pre-computar `glosarioNormalizado: Map<string, { original: string; ruta: string }>` iterando `Object.entries(glosario)`.
      5. Para cada `campo` en `campos` (orden preservado):
         - a. Normalizar `campo.etiqueta`.
         - b. Buscar match exacto en `glosarioNormalizado` → si hit, `confianza = 1.0`, `ruta_maestro = hit.ruta`.
         - c. Si no, iterar todo el mapa calculando `similitud(normEtiqueta, normGlos)`, quedarse con el máximo; registrar `confianza` y `rutaCandidata`.
         - d. Resolver `valor` con `obtenerValor(maestro, ruta_maestro)` cuando hay candidato.
         - e. Aplicar reglas de clasificación (orden del spec §2 "Algoritmo de resolución"):
            - Si input `campo.requiere_confirmacion === true` (ambiguo del slice 01) → `requiere_confirmacion` con `motivo: campo.nota_pais ?? "ambigüedad heredada"`, `ruta_maestro`/`valor` opcionales si hubo match.
            - Si confianza < 0.8 → `faltantes` con motivo `"sin equivalente en glosario (confianza <0.8 contra '<glosarioOriginal>')"`.
            - Si confianza ∈ [0.8, 1.0) → `requiere_confirmacion` con `motivo: "mapeo aproximado: <glosarioOriginal>"`, con `ruta_maestro`/`valor`/`confianza`.
            - Si confianza === 1.0 y `ruta_maestro === "nit"` y `pais !== "CO"` → `requiere_confirmacion` con `nota_pais: notaIdentExtranjero(pais)` + `valor` del NIT colombiano + `confianza: 1.0`.
            - Si confianza === 1.0 y `valor === undefined || valor === null` → `faltantes` con `motivo: "clave en glosario pero ausente en maestro: <ruta>"` (CA2).
            - Si confianza === 1.0 y resto → `llenos`.
         - f. Preservar `campo.destino` en el ítem de salida (en los 3 arrays).
      6. Construir `data: MapeoData`; `appendLog` con `n_llenos`/`n_faltantes`/`n_requiere_confirmacion`; `return JSON.stringify({ ok:true, data })`.
    - Catch global: `appendLog` con `ok:false` + `error`; `return JSON.stringify({ ok:false, error })`.
8. [ ] **T8 · Export + comentario** al pie del archivo: `export const mapear_campos: Tool<typeof mapearArgs, MapeoData> = { description, args: mapearArgs, async execute(...) { ... } }`. Comentario `// Export name: mapear_campos → proveedor_mapear_campos`.
9. [ ] **T9 · Extender `demo.ts`**:
    - `import { leer_solicitud, mapear_campos } from "./src/tools/proveedor"`.
    - Dentro del `for … of CASOS`, tras la línea actual de resumen, si `res.ok`, llamar `mapear_campos.execute({ caso, campos: res.data.campos }, ctx)` y parsear la salida.
    - Imprimir: `  mapeo: ${n_llenos} llenos, ${n_faltantes} faltantes, ${n_requiere_confirmacion} requiere_confirmacion` (indentado 2 espacios, determinista).
    - Si `mapear_campos` devuelve error, imprimir `  mapeo: ERROR: <error>` y contar como error del caso.
10. [ ] **T10 · Crear `src/scripts/verify-mapeo.ts`** (AC-3, AC-5, AC-6):
    - Crea temp root `out/_test/02-mapear-campos/` con `fixtures/{casos/sintetico/{solicitud.json, plantilla-campos.json, soportes-exigidos.json}, repositorio/maestro.json, glosario-campos.json}`.
    - **Sub-aserción AC-3 (no inventa)**: `maestro.json` sintético **sin** la clave `razon_social`. Plantilla pide `"Razón social"`. Afirma que `data.faltantes` incluye `"Razón social"` con motivo `"clave en glosario pero ausente en maestro: razon_social"` y que el JSON de salida **no** contiene el string `"Periferia IT Group"` (asertable con `JSON.stringify(data).includes(...)` → false).
    - **Sub-aserción AC-5 (normalización)**: plantilla con `"RAZON SOCIAL"` (todo mayúsculas, sin tilde). `maestro.json` sintético con `razon_social: "Acme S.A."`. `glosario.json` con `"Razón social": "razon_social"`. Afirma que el campo cae en `llenos` con `valor === "Acme S.A."` y `confianza === 1.0`.
    - **Sub-aserción AC-6 (fuzzy ∈ [0.8,1.0))**: plantilla con `"Correo electronico"` (sin tilde, el glosario tiene `"Correo electrónico"` con tilde — ¡pero tras normalizar ambos son idénticos, confianza = 1.0!). **Reemplazar** por un caso donde la etiqueta sí difiera tras normalizar: p. ej. plantilla pide `"Correo electronicos"` (plural ES; normalizado: "correo electronicos") vs glosario `"Correo electrónico"` (normalizado: "correo electronico"); similitud ≈ 1 - 1/19 ≈ 0.947 → `requiere_confirmacion` con `motivo` que contiene `"mapeo aproximado: Correo electrónico"`.
    - Limpia el temp root con `try/finally fs.rm({ recursive: true, force: true })`.
    - Imprime `ok: verify-mapeo` y exit 0, o `fail: <sub>` y exit 1.
11. [ ] **T11 · Crear `src/scripts/verify-h2-regression.ts`** (AC-13):
    - Crea temp root `out/_test/02-mapear-campos-h2/fixtures/casos/{sintetico-formato, sintetico-pais}/`.
    - **Caso 1 (formato)**: `solicitud.json` con `formato: "bogus"` (fuera del enum). Invoca `leer_solicitud.execute({caso:"sintetico-formato"}, {directory: tempRoot, ...})`. Afirma `r.ok === false` y `r.error === "formato inválido en solicitud (caso sintetico-formato): ver <ruta>"`.
    - **Caso 2 (pais)**: `solicitud.json` con `pais: "ZZ"`. Afirma mensaje `"pais inválido en solicitud (caso sintetico-pais): ver <ruta>"`.
    - Limpia; exit 0 si ambas pasan, 1 si falla alguna. Imprime `ok: verify-h2-regression`.
12. [ ] **T12 · Actualizar `package.json`** scripts:
    - `"verify:mapeo": "bun run src/scripts/verify-mapeo.ts"`
    - `"verify:h2": "bun run src/scripts/verify-h2-regression.ts"`
    - `"check": "bun run typecheck && bun run demo:clean && bun run verify:ambiguous && bun run verify:mapeo && bun run verify:h2"`
13. [ ] **T13 · Actualizar `README.md`**: añadir los 2 nuevos scripts bajo la sección de scripts; actualizar salida esperada de `bun run demo` para incluir la línea `mapeo: ...`.
14. [ ] **T14 · Verificar typecheck y demo**:
    - `bun x tsc --noEmit` → exit 0.
    - `bun run src/scripts/clean-out.ts && bun run demo` → exit 0; 4 pares de líneas (resumen + mapeo) + totales.
    - Verificar que `out/<caso>/log.jsonl` tenga **2 líneas** por caso (una `proveedor_leer_solicitud`, una `proveedor_mapear_campos`), cada una con las 4 claves exactas.
15. [ ] **T15 · Verificar AC-10 determinismo**:
    - `bun run demo:clean > /tmp/demo-a.txt; bun run demo:clean > /tmp/demo-b.txt; diff /tmp/demo-a.txt /tmp/demo-b.txt` → exit 0.
16. [ ] **T16 · Verificar AC-4 RN1 real** (inspección del output del demo):
    - Para CO: el campo `NIT` debe aparecer en `llenos` (no en requiere_confirmacion por RN1).
    - Para EC, HN, PA: el campo `RUC`/`RTN`/`RUC` (respectivamente) debe aparecer en `requiere_confirmacion` con `nota_pais` que empieza por `"identificador extranjero"`.
    - Automatizable con un pequeño `bun -e` que parse el output de `mapear_campos` para cada caso o inspeccione `out/<caso>/log.jsonl` + re-ejecución directa.
17. [ ] **T17 · Verificar AC-7 preservación de `destino`**:
    - Para caso xlsx (CO o HN): `bun -e` que invoca `leer_solicitud` + `mapear_campos` y afirma que `data.llenos[0].destino` existe con `{hoja, celda_etiqueta, celda_valor}`.
    - Para caso pdf/portal (EC o PA): afirma que `data.llenos[0].destino === undefined`.
18. [ ] **T18 · Verificar AC-5 (normalización en real)** `bun run verify:mapeo` → exit 0, stdout `ok: verify-mapeo`.
19. [ ] **T19 · Verificar AC-13 (deuda H-2 regresión)**:
    - `bun run verify:h2` → exit 0, stdout `ok: verify-h2-regression`.
    - `rg -nE "msg\\.includes\\(\"(formato|pais)\"\\)" reto-01/src/tools/proveedor.ts` → **cero** matches (confirma que el `.includes` frágil se eliminó).
    - `bun run verify:ambiguous` → sigue exit 0 (regresión del slice 01).
20. [ ] **T20 · Verificar AC-12 (sin rutas absolutas)**:
    - `rg -nE "[\"']/[^\"']+[\"']" reto-01/src/tools reto-01/src/lib` → sin matches.
21. [ ] **T21 · Grep `any`** (AC-11): `rg "\\bany\\b" reto-01/src reto-01/demo.ts reto-01/src/scripts` → sin matches reales en código nuevo.
22. [ ] **T22 · Checklist final de AC**: correr el bloque §8 completo y reportar al coordinator.

## 7. Mapeo criterio → tarea

| Criterio (spec) | Tarea(s) | Cómo se verifica |
|---|---|---|
| AC-1 (contrato §6.2) | T7, T8 | Grep `src/tools/proveedor.ts`: `description` presente, `args.*` con `.describe()`, `execute` siempre `return JSON.stringify(...)` dentro de try/catch; `rg '\\bthrow\\b' src/tools src/lib` → 0 matches. Nombre `proveedor_mapear_campos` por convención `<archivo>_<export>`. |
| AC-2 (partición exacta) | T7, T9, T14 | Para cada caso del demo: `n_llenos + n_faltantes + n_requiere_confirmacion === campos.length`. Verificable comparando los conteos del log vs `n_campos` del log de `leer_solicitud`. |
| AC-3 (CA2 nunca inventa) | T7, T10 | `verify-mapeo` sub-aserción 1: con maestro sintético sin la clave, el output `faltantes` incluye el campo y `JSON.stringify(data)` **no** contiene valores "inventados". |
| AC-4 (RN1 real) | T7, T16 | T16 inspecciona `requiere_confirmacion` de EC/HN/PA buscando `nota_pais` que empiece por `"identificador extranjero"`; para CO, afirma que el ítem NIT está en `llenos`. |
| AC-5 (normalización) | T1, T7, T10, T18 | `verify-mapeo` sub-aserción 2: `"RAZON SOCIAL"` cae en `llenos` con `confianza:1.0`. |
| AC-6 (fuzzy ∈ [0.8,1.0)) | T2, T7, T10, T18 | `verify-mapeo` sub-aserción 3: `"Correo electronicos"` cae en `requiere_confirmacion` con `confianza` ∈ [0.8,1.0) y motivo que cita `"Correo electrónico"`. Confianza <0.8 cae en `faltantes` (sub-sub-aserción con un string totalmente distinto, p. ej. `"abcdefg"`). |
| AC-7 (preservación de `destino`) | T7, T17 | T17 verifica presencia/ausencia de `destino` según formato del caso. |
| AC-8 (error path) | T7, T11, T14 | `bun -e` directo con `caso:"bogus"` o `campos:[]` o shape inválido → `{ok:false,error}` con mensaje específico; nunca lanza. |
| AC-9 (log con 4 claves y 2 líneas) | T7, T14 | Tras `demo:clean && demo`, `wc -l out/<caso>/log.jsonl` = 2; `jq .` parsea; cada línea tiene `{ts, herramienta, ok, resumen}`. |
| AC-10 (determinismo) | T9, T15 | `diff` entre dos corridas de `demo:clean` → vacío. Levenshtein es puramente determinista; orden de iteración del glosario via `Object.entries` es estable en V8/Bun. |
| AC-11 (typecheck + sin any) | T1–T8, T14, T21 | `bun x tsc --noEmit` exit 0; `rg '\\bany\\b'` sin matches. |
| AC-12 (sin rutas absolutas) | T4, T7, T20 | `rg "['\\\"]/[^'\\\"]+['\\\"]" src/tools src/lib` → sin matches. |
| AC-13 (deuda H-2 pagada) | T5, T11, T19 | `rg "msg\\.includes\\(\"(formato\\|pais)\"\\)"` sin matches; `verify:h2` pass; `verify:ambiguous` sigue pass (no regresión). |

## 8. Estrategia de verificación

Orden exacto desde `reto-01/` (prepend `export PATH="$HOME/.bun/bin:$PATH"` donde aplique):

```bash
# A) Typecheck
bun x tsc --noEmit                                         # exit 0

# B) Sin any
rg -nE "\\bany\\b" src demo.ts src/scripts || echo "ok: sin any"

# C) Demo determinista + log por caso
bun run src/scripts/clean-out.ts
bun run demo | tee /tmp/demo-a.txt                         # 4 pares (resumen + mapeo) + totales
bun run src/scripts/clean-out.ts
bun run demo | tee /tmp/demo-b.txt
diff /tmp/demo-a.txt /tmp/demo-b.txt && echo "ok: determinismo AC-10"

# D) 2 líneas por log, 4 claves cada una
for c in co-industrias-delta ec-corp-andina hn-agroexport-sula pa-logistica-istmo; do
  n=$(wc -l < "out/$c/log.jsonl"); [ "$n" = "2" ] && echo "ok $c: 2 líneas" || echo "FALLA $c: $n líneas"
  bun -e "const l=await Bun.file('out/$c/log.jsonl').text(); for (const ln of l.trim().split('\\n')) { const o=JSON.parse(ln); console.log(['ts','herramienta','ok','resumen'].every(k=>k in o)?'ok':'FALLA', o.herramienta) }"
done

# E) AC-4 RN1 real
bun -e '
import {leer_solicitud, mapear_campos} from "./src/tools/proveedor"
const ctx = { directory: import.meta.dir, sessionId: "t" }
for (const [caso, idEsperado] of [["co-industrias-delta","NIT"],["ec-corp-andina","RUC"],["hn-agroexport-sula","RTN"],["pa-logistica-istmo","RUC"]]) {
  const ls = JSON.parse(await leer_solicitud.execute({caso}, ctx))
  const mc = JSON.parse(await mapear_campos.execute({caso, campos: ls.data.campos}, ctx))
  const esCO = caso.startsWith("co-")
  const grupo = esCO ? mc.data.llenos : mc.data.requiere_confirmacion
  const hit = grupo.find(x => x.ruta_maestro === "nit" || (x.ruta_maestro ?? "") === "nit")
  console.log(caso, hit ? (esCO ? "ok (llenos)" : (hit.nota_pais?.startsWith("identificador extranjero") ? "ok (RN1)" : "FALLA nota_pais")) : "FALLA no hit")
}'

# F) AC-5, AC-6, AC-3
bun run verify:mapeo                                       # ok: verify-mapeo

# G) AC-13 deuda H-2
bun run verify:h2                                          # ok: verify-h2-regression
rg -nE "msg\\.includes\\(\"(formato|pais)\"\\)" src/tools/proveedor.ts || echo "ok: H-2 eliminado"
bun run verify:ambiguous                                   # pass (no regresión slice 01)

# H) AC-7 destino
bun -e '
import {leer_solicitud, mapear_campos} from "./src/tools/proveedor"
const ctx = { directory: import.meta.dir, sessionId: "t" }
const co = JSON.parse(await mapear_campos.execute({caso:"co-industrias-delta", campos: JSON.parse(await leer_solicitud.execute({caso:"co-industrias-delta"}, ctx)).data.campos}, ctx))
const ec = JSON.parse(await mapear_campos.execute({caso:"ec-corp-andina",       campos: JSON.parse(await leer_solicitud.execute({caso:"ec-corp-andina"},       ctx)).data.campos}, ctx))
console.log(co.data.llenos[0].destino ? "ok xlsx destino" : "FALLA xlsx destino")
console.log(ec.data.llenos[0].destino === undefined ? "ok pdf sin destino" : "FALLA pdf destino inesperado")'

# I) AC-12 sin rutas absolutas
rg -nE "[\"']/[^\"']+[\"']" src/tools src/lib || echo "ok: sin rutas absolutas"

# J) AC-8 error path
bun -e '
import {mapear_campos} from "./src/tools/proveedor"
const ctx = { directory: import.meta.dir, sessionId: "t" }
const r1 = JSON.parse(await mapear_campos.execute({caso:"bogus", campos:[{etiqueta:"x",obligatorio:true}]}, ctx))
console.log(r1.ok===false && r1.error.startsWith("caso no encontrado") ? "ok bogus" : "FALLA bogus")'
```

**Casos a correr**: 4 reales + 2 sintéticos (verify-mapeo con 3 sub, verify-h2 con 2 sub) + 1 inexistente (bogus) + 1 ambiguo heredado (verify-ambiguous del slice 01).

**Checks manuales adicionales**: ninguno — todo arriba es automatizable.

## 9. Riesgos y mitigaciones

- **R1 · Reciclar lectura de `solicitud.json`.** `mapear_campos` necesita `pais`, que ya se obtiene en `leer_solicitud`. Opción A (reusar la función) acopla las dos herramientas; opción B (releer directo) duplica código pero mantiene la herramienta autocontenida.
  **Mitigación**: elegida **opción B** (relectura directa con `SolicitudSchema`). Vía T7 paso 1. Rendimiento aceptable: una lectura más por invocación, archivos pequeños. Si surge duplicación >20 LOC, extraer a `src/lib/solicitud.ts` en un slice de refactor posterior (no en este).

- **R2 · Refactor H-2 puede regresar strings de error alterados.** Si cambia aunque sea un carácter, el slice 01 romperá sus verificaciones existentes.
  **Mitigación**: T19 incluye re-ejecución de `verify:ambiguous` del slice 01 + script `verify:h2` que compara **strings exactos**. Mantengo los mensajes idénticos al slice 01 §5.4 de su plan.

- **R3 · `Object.entries(glosario)` orden determinista.** V8 preserva orden de inserción para claves string; el JSON del fixture tiene un orden fijo.
  **Mitigación**: documentar en comentario del código que asumimos orden de inserción (lo cual es garantía de la especificación ES2020+ para `Object.entries`). No ordenar explícitamente para no romper el orden "preferente" del glosario.

- **R4 · Ambigüedad `RUC` (EC/PE/PA) resuelve a `nit`, y RN1 lo manda a `requiere_confirmacion`.** Pero el campo `RUC` no es ambiguo del slice 01 (no está en la lista `AMBIGUAS`). ¿Doble `requiere_confirmacion`?
  **Mitigación**: no, es un único `requiere_confirmacion`. El flujo: el campo entra sin `requiere_confirmacion`; durante clasificación, confianza=1.0, pero RN1 lo deriva a `requiere_confirmacion` con `nota_pais`. Un solo ítem en la lista.

- **R5 · "Correo electrónico" (plantillas) vs "Correo electrónico" (glosario) son idénticos tras normalizar.** El valor en el maestro es `contacto_comercial.email`. Esto cae en `llenos` por match exacto normalizado. ¿Problema? No — spec AC-5 cubre exactamente esto.
  **Mitigación**: ninguna necesaria. Nota de T10: el caso de fuzzy ∈ [0.8,1.0) requiere un string que **difiera** tras normalizar; "Correo electronicos" (con "s" extra) es el ejemplo elegido.

- **R6 · Levenshtein sobre todo el glosario (38 entradas) × campos (hasta ~20) = 760 comparaciones por caso.** Trivial en runtime.
  **Mitigación**: ninguna. Suficientemente rápido.

- **R7 · Un valor `false` o `0` en el maestro no debe tratarse como "ausente".** Mi regla CA2 (§2 regla 6) dice "undefined/null". `obtenerValor` devuelve el valor crudo; la clasificación debe comparar estrictamente `=== undefined || === null`.
  **Mitigación**: documentarlo en el código de `execute` paso 5-e (comentario de 1 línea sobre falsy). `gran_contribuyente: false` del maestro es un valor válido.

- **R8 · `GlosarioSchema = z.record(z.string(), z.string())` perdería claves si una ruta no fuera string.** El fixture solo tiene strings; aceptable.
  **Mitigación**: ninguna necesaria. Si en el futuro el glosario tuviera objetos (p. ej. metadatos de prioridad), se migra a `z.record(z.string(), z.object({...}))` en un slice posterior.

- **R9 · El walker `obtenerValor` solo soporta `.` como separador y objetos planos.** Si una ruta tuviera arrays (`certificaciones[0]`), no funcionaría.
  **Mitigación**: documentado como limitación. El glosario actual no usa índices; si se necesita, se extiende el walker en un slice posterior.

- **R10 · Sin dependencias nuevas.** Reafirmado — todo con `zod` + `node:fs/promises` + `node:path`.

## 10. Dudas abiertas

Ninguna.

## 11. Divergencias respecto al spec

Las decisiones del plan que amplían o concretan lo que el spec dejó abierto. Siguiendo el convenio del proyecto (memoria `project_sdd_divergence_rule`), todas se marcan antes del gate humano.

1. **Nuevos helpers en `src/lib/`**: `normalize.ts`, `levenshtein.ts`, `pais.ts`, `maestro.ts`. El spec §2 mencionaba genéricamente "walker recursivo seguro" y "normalización"; el plan los extrae a módulos reutilizables en `src/lib/` en vez de inlinearlos en `src/tools/proveedor.ts`. **Motivo**: slices posteriores (03 generar, 04 pdf, 05 paquete) reutilizarán al menos `pais.ts` y `maestro.ts`.

2. **Migración de `NOTA_POR_PAIS` desde `src/tools/proveedor.ts` a `src/lib/pais.ts`**: el spec no lo pedía. El plan lo hace (T6) para centralizar RN1 y evitar duplicación. **Motivo**: tanto `leer_solicitud` como `mapear_campos` consumen la nota; mejor una fuente única.

3. **Dos scripts de verificación en lugar de uno**: el spec sugería "verify:mapeo que cubre AC-3, AC-5, AC-6". El plan añade `verify:h2-regression` separado para AC-13 (deuda H-2). **Motivo**: AC-13 es ortogonal al mapeo; separarlo facilita diagnosticar regresiones del slice 01 sin ruido del slice 02.

4. **`CampoInputSchema` con `.passthrough()` y `.min(1)` en `campos`**: el spec decisión 1 dijo `.passthrough()` pero no fijó `min(1)`. El plan lo añade. **Motivo**: `mapear_campos` sobre `campos: []` sería un no-op silencioso; mejor rechazar con error claro (`campos` vacío) vía zod.

5. **Línea de demo indentada con 2 espacios**: el spec §2 dijo "nueva línea con conteos"; el plan define el formato exacto `  mapeo: L llenos, F faltantes, C requiere_confirmacion` indentado. **Motivo**: legibilidad del stdout cuando se encadenan 4 casos; determinismo preservado (indent es parte del literal).

6. **Resolución de `pais` por re-lectura directa (opción B del R1)**: el spec §2 asumía que el pais viene del caso pero no fijó cómo. El plan opta por `SolicitudSchema` directo (no llamar a `leer_solicitud`). **Motivo**: evita doble log y acoplamiento entre herramientas; coste trivial (archivo pequeño).

7. **Comparación de `valor` ausente con `=== undefined || === null`** (no truthiness): el spec §2 regla 6 dijo "undefined/null". El plan lo hace explícito para evitar que valores falsy válidos (`false`, `0`, `""`) se traten como faltantes. **Motivo**: `gran_contribuyente: false` del maestro es un valor válido.
