# Plan — 01-leer-solicitud

## 1. Objetivo
Implementar `leer_solicitud` en `src/tools/proveedor.ts` cumpliendo contrato §6.2, dejar `demo.ts` iterando los 4 casos reales con línea-resumen determinista, y emitir `out/<caso>/log.jsonl` por llamada (RN5/CA4).

## 2. Alcance

**En alcance**
- Nuevo export `leer_solicitud` en `src/tools/proveedor.ts` (zod args + `execute` que devuelve string JSON, nunca lanza).
- Nuevos helpers compartidos reutilizables por slices posteriores:
  - `src/tools/types.ts` — tipos TS para `Ctx`, `Tool<Args, Data>`, `ToolResult<Data>`.
  - `src/lib/log.ts` — append-to-jsonl por caso, con `mkdir -p`.
  - `src/lib/paths.ts` — resolución de rutas relativas a `ctx.directory`.
- Normalización de `campos[]` unificada (xlsx con `destino`; pdf/portal sin `destino`).
- Detección de etiquetas ambiguas (lista cerrada del spec §2), case-insensitive, trim.
- Reescritura de `demo.ts`: itera los 4 casos reales + imprime una línea-resumen por caso + exit 0/1.
- Script de verificación de AC-5 (etiqueta ambigua) en `src/scripts/verify-ambiguous.ts`, invocable con `bun run verify:ambiguous`.
- Script `demo:clean` para resetear `out/` entre corridas (apoya determinismo AC-7).

**Fuera de alcance**
- `maestro.json`, mapeo, generación de formulario, armado de paquete, envío simulado, ciclo del agente, servidor HTTP, front, adaptador LLM (todos slices posteriores).
- Dependencias nuevas en `package.json` (solo `zod` + stdlib Bun/Node).
- Validación semántica de campos del maestro.

## 3. Reglas del PRD que aplican

- **§6.2 contrato de herramientas** — export con `{description, args, execute}`; `args` zod + `.describe()`; `execute(args, ctx)` devuelve **string JSON** `{ok,data} | {ok:false,error}`; nunca lanza; `ctx.directory` como raíz.
- **§6.5 estructura** — herramienta vive en `src/tools/`; helpers en `src/lib/`; scripts en `src/scripts/`.
- **§6.3 CA4** — toda llamada queda en `out/<caso>/log.jsonl` (empezamos a emitirlo aquí).
- **§6.3 CA5** — errores de herramienta no matan nada; mensaje en lenguaje claro; nunca `throw` hacia afuera.
- **§6.6 `demo.ts` sin clave** — itera todos los casos, no requiere var de entorno de LLM.
- **§7.1 estructura del caso** — forma de `solicitud.json`, `plantilla-celdas.json`, `plantilla-campos.json`, `soportes-exigidos.json`.
- **§7.3 RN1** — ambigüedad → `requiere_confirmacion: true` + `nota_pais` con el identificador tributario sugerido por país.
- **§8 no-funcionales** — TS sin `any`, determinismo (`demo.ts` idéntico entre corridas), sin shell, deps justificadas.

## 4. Archivos a tocar

| Ruta (relativa a `reto-01/`) | Acción | Motivo |
|---|---|---|
| `src/tools/proveedor.ts` | reescribir | Exporta `leer_solicitud` (quita placeholder vacío) |
| `src/tools/types.ts` | crear | `Ctx`, `Tool`, `ToolResult`, tipos del contrato §6.2 |
| `src/lib/log.ts` | crear | `appendLog(ctx, caso, entry)` escribe JSONL idempotente |
| `src/lib/paths.ts` | crear | `casoDir(ctx, caso)`, `outDir(ctx, caso)` relativos a `ctx.directory` |
| `demo.ts` | reescribir | Itera 4 casos y resume cada uno; `ctx.directory = import.meta.dir` |
| `src/scripts/verify-ambiguous.ts` | crear | AC-5: crea caso sintético en `out/_test/`, invoca herramienta, afirma, limpia |
| `src/scripts/clean-out.ts` | crear | Borra `out/` (`fs.rm` recursivo, idempotente) — soporta determinismo AC-7 |
| `package.json` | editar | Añadir scripts `demo:clean`, `verify:ambiguous`, `check` (encadenado) |
| `README.md` | editar | Documentar los nuevos scripts bajo "Arranque local" |
| `docs/sdd/01-leer-solicitud/history.md` | el coordinator la lleva | — |

**No se toca**: fixtures, PRD, `.env.example`, `.gitignore`, `tsconfig.json`, `src/llm/*`, `src/server.ts`, `src/knowledge/*`, `agent/prompt.md`.

## 5. Interfaces y tipos

### 5.1 `src/tools/types.ts`
```ts
import type { ZodRawShape, z } from "zod"

export type Ctx = {
  directory: string      // raíz del proyecto (reto-01/)
  sessionId: string      // libre; demo.ts puede usar "demo"
}

export type ToolResultOk<Data> = { ok: true; data: Data }
export type ToolResultErr = { ok: false; error: string }
export type ToolResult<Data> = ToolResultOk<Data> | ToolResultErr

export type Tool<Shape extends ZodRawShape, Data> = {
  description: string
  args: Shape
  execute(args: z.infer<z.ZodObject<Shape>>, ctx: Ctx): Promise<string>  // JSON stringificado
}
```

### 5.2 Zod args para `leer_solicitud`
```ts
export const leer_solicitud_args = {
  caso: z.string().min(1).describe(
    "Nombre de la carpeta del caso en reto-01/fixtures/casos/ (p.ej. 'co-industrias-delta')."
  ),
}
```

### 5.3 Shape de `data` (caso ok)
```ts
type Pais = "CO" | "EC" | "PE" | "PA" | "HN"
type Formato = "xlsx" | "pdf" | "portal"

type DestinoCelda = {
  hoja: string
  celda_etiqueta: string
  celda_valor: string
}

type Campo = {
  etiqueta: string
  obligatorio: boolean
  destino?: DestinoCelda           // solo si formato === "xlsx"
  requiere_confirmacion?: true     // omitido si false
  nota_pais?: string               // solo si requiere_confirmacion === true
}

type Correo = {
  de: string
  para: string
  asunto: string
  fecha: string                    // ISO date del fixture
  cuerpo: string
}

type LeerSolicitudData = {
  pais: Pais
  cliente: string
  formato: Formato
  campos: Campo[]
  soportes: string[]
  correo: Correo
  adjuntos: string[]
}
```

### 5.4 Códigos de error esperados (strings exactos)
| Caso | `error` |
|---|---|
| Carpeta del caso ausente | `caso no encontrado: <nombre>` |
| `solicitud.json` ausente | `solicitud ausente para caso <nombre>` |
| `soportes-exigidos.json` ausente | `soportes-exigidos ausente para caso <nombre>` |
| `formato` = `xlsx` y falta `plantilla-celdas.json` | `plantilla ausente para formato xlsx (caso <nombre>)` |
| `formato` ∈ {`pdf`,`portal`} y falta `plantilla-campos.json` | `plantilla ausente para formato <fmt> (caso <nombre>)` |
| `formato` inválido o ausente en `solicitud.json` | `formato inválido en solicitud (caso <nombre>): <valor>` |
| `pais` inválido o ausente | `pais inválido en solicitud (caso <nombre>): <valor>` |
| JSON corrupto en cualquier archivo | `json inválido en <ruta>: <mensaje>` |
| Excepción no clasificada | `fallo leyendo <ruta>: <mensaje>` |

### 5.5 Reglas RN1 — `nota_pais` por país
Mapa fijo, construido una vez:
```ts
const NOTA_POR_PAIS: Record<Pais, string> = {
  CO: "sugerido: NIT (identificador tributario de Colombia)",
  EC: "sugerido: RUC (identificador tributario de Ecuador)",
  PE: "sugerido: RUC (identificador tributario de Perú)",
  PA: "sugerido: RUC (identificador tributario de Panamá)",
  HN: "sugerido: RTN (identificador tributario de Honduras)",
}
```

### 5.6 Lista cerrada de etiquetas ambiguas
```ts
const AMBIGUAS = new Set([
  "identificación tributaria",
  "identificacion tributaria",
  "identificación fiscal",
  "identificacion fiscal",
  "número tributario",
  "numero tributario",
  "id tributario",
])
const esAmbigua = (etiqueta: string) => AMBIGUAS.has(etiqueta.trim().toLowerCase())
```

### 5.7 Shape del log (una línea por llamada en `out/<caso>/log.jsonl`)
```ts
// Ok:
{ "ts": "2026-10-05T12:34:56.789Z", "herramienta": "proveedor_leer_solicitud",
  "ok": true, "resumen": { "pais": "CO", "formato": "xlsx", "n_campos": 17,
  "n_ambiguos": 0, "n_obligatorios": 17, "n_soportes": 4 } }
// Error:
{ "ts": "...", "herramienta": "proveedor_leer_solicitud", "ok": false,
  "resumen": { "caso": "bogus", "error": "caso no encontrado: bogus" } }
```

### 5.8 Shape de la línea-resumen en stdout (determinista, sin `ts`)
```
caso: co-industrias-delta | pais: CO | formato: xlsx | 17 campos (0 ambiguos, 17 obligatorios) | 4 soportes
```
Al final, línea de totales:
```
total: 4 casos | ok: 4 | error: 0
```

## 6. Tareas en orden

1. [ ] **T1 · Crear `src/tools/types.ts`** con `Ctx`, `Tool`, `ToolResult*` según §5.1. Sin lógica.
2. [ ] **T2 · Crear `src/lib/paths.ts`** exportando `casoDir(ctx, caso) = path.join(ctx.directory, "fixtures", "casos", caso)` y `outDir(ctx, caso) = path.join(ctx.directory, "out", caso)`. Usa `node:path`.
3. [ ] **T3 · Crear `src/lib/log.ts`** exportando `async appendLog(ctx, caso, entry): Promise<void>`:
   - `await fs.mkdir(outDir(ctx, caso), { recursive: true })`
   - `await fs.appendFile(path.join(outDir(ctx, caso), "log.jsonl"), JSON.stringify(entry) + "\n", "utf8")`
   - Usa `node:fs/promises`. Nunca lanza — captura y descarta (loguear a stderr `console.warn` si falla el write).
4. [ ] **T4 · Implementar `leer_solicitud` en `src/tools/proveedor.ts`**:
   - Imports: `z`, `fs/promises`, `path`, tipos de T1, helpers T2/T3.
   - `description`: una frase precisa (ver §5 abajo). Sugerencia: `"Lee la solicitud, su plantilla y los soportes exigidos de un caso en reto-01/fixtures/casos/<caso>/ y devuelve país, cliente, formato, campos normalizados y soportes exigidos."`
   - `args`: §5.2.
   - `execute({ caso }, ctx)`: try/catch global; adentro:
     1. Verificar directorio: `fs.access(casoDir(ctx, caso))` → si falla, retornar error "caso no encontrado".
     2. Leer `solicitud.json`, validar formato/pais, extraer `cliente`, `correo`, `adjuntos`.
     3. Según `formato`, leer la plantilla correspondiente; mapear a `Campo[]` unificado.
     4. Para cada campo, aplicar `esAmbigua`; si true, setear `requiere_confirmacion` + `nota_pais`.
     5. Leer `soportes-exigidos.json` como `string[]`.
     6. `appendLog(ctx, caso, { ts, herramienta, ok:true, resumen })`.
     7. `return JSON.stringify({ ok:true, data })`.
   - Catch global: construir `error` según §5.4; `appendLog(... ok:false ...)`; `return JSON.stringify({ ok:false, error })`.
   - **Nunca** lanza al llamante.
5. [ ] **T5 · Validar formato con zod** dentro de `execute`: parsear `solicitud.json` con un `SolicitudSchema` interno (`z.object({ id, de, para, asunto, fecha, pais: z.enum([...]), cliente, cuerpo, formato: z.enum([...]), adjuntos: z.array(z.string()) })`). Si `safeParse` falla, mapear a error §5.4.
6. [ ] **T6 · Reescribir `demo.ts`**:
   - `import { leer_solicitud } from "./src/tools/proveedor"` + `node:path`.
   - `const CASOS = ["co-industrias-delta", "ec-corp-andina", "hn-agroexport-sula", "pa-logistica-istmo"]` (orden fijo para determinismo AC-7).
   - `const ctx = { directory: import.meta.dir, sessionId: "demo" }`.
   - Para cada caso: `const resStr = await leer_solicitud.execute({ caso }, ctx); const res = JSON.parse(resStr)`; imprimir línea-resumen o línea de error.
   - Al final, línea de totales. `process.exit(nErr === 0 ? 0 : 1)`.
7. [ ] **T7 · Crear `src/scripts/clean-out.ts`**: `await fs.rm(path.join(import.meta.dir, "..", "..", "out"), { recursive: true, force: true })`. Idempotente.
8. [ ] **T8 · Crear `src/scripts/verify-ambiguous.ts`** (AC-5):
   - Crea temp root bajo `out/_test/01-leer-solicitud/` con la estructura: `fixtures/casos/sintetico/{solicitud.json, plantilla-campos.json, soportes-exigidos.json}`.
   - `solicitud.json`: `pais: "EC"`, `formato: "pdf"`, cliente dummy, correo mínimo.
   - `plantilla-campos.json`: incluye un item con `{ etiqueta: "Identificación tributaria", obligatorio: true }` y uno de control con etiqueta benigna.
   - `soportes-exigidos.json`: `[]`.
   - Invoca `leer_solicitud.execute({ caso: "sintetico" }, { directory: tempRoot, sessionId: "verify" })`.
   - Parsea JSON y afirma: `data.campos` contiene exactamente 1 campo con `requiere_confirmacion === true` y `nota_pais` que empieza con `"sugerido: RUC"` (porque `pais: "EC"`). El campo benigno **no** tiene `requiere_confirmacion`.
   - Limpia el temp root tras la aserción (`fs.rm`).
   - Imprime `ok: verify-ambiguous` y exit 0, o `fail: ...` y exit 1.
9. [ ] **T9 · Actualizar `package.json`** scripts:
   - `"demo:clean": "bun run src/scripts/clean-out.ts && bun run demo.ts"`
   - `"verify:ambiguous": "bun run src/scripts/verify-ambiguous.ts"`
   - `"check": "bun run typecheck && bun run demo:clean && bun run verify:ambiguous"`
   - Dejar `demo`, `typecheck`, `dev` como están.
10. [ ] **T10 · Actualizar `README.md`** sección "Arranque local": listar los nuevos scripts con una línea de propósito. Añadir ejemplo de salida esperada de `bun run demo`.
11. [ ] **T11 · Verificar typecheck y demo**:
    - `bun x tsc --noEmit` → exit 0, 0 errores, cero `any`.
    - `bun run src/scripts/clean-out.ts`.
    - `bun run demo` → 4 líneas-resumen + línea de totales + exit 0.
    - Confirmar `out/<caso>/log.jsonl` para los 4 casos (`ls` + `wc -l` = 1 por archivo + `jq .` parsea).
12. [ ] **T12 · Verificar AC-5**:
    - `bun run verify:ambiguous` → exit 0, stdout `ok: verify-ambiguous`.
    - `test ! -d reto-01/out/_test` (limpieza).
13. [ ] **T13 · Verificar AC-7 determinismo**:
    - `bun run demo:clean > /tmp/a.txt` y luego `bun run demo:clean > /tmp/b.txt`.
    - `diff /tmp/a.txt /tmp/b.txt` → exit 0 (idéntico).
14. [ ] **T14 · Verificar AC-4 error path**:
    - `bun -e 'import {leer_solicitud} from "./src/tools/proveedor"; const r = await leer_solicitud.execute({caso:"bogus"},{directory: import.meta.dir, sessionId:"t"}); console.log(r)'` → stdout contiene `"ok":false` y `"caso no encontrado"`; exit 0; nada lanzado.
15. [ ] **T15 · Grep `any`**: `rg "\\bany\\b" reto-01/src reto-01/demo.ts reto-01/src/scripts` → sin matches reales (comentarios aceptables si quedaran, pero preferible evitar).
16. [ ] **T16 · Checklist final de AC**: correr el bloque §8 completo y reportar al coordinator.

## 7. Mapeo criterio → tarea

| Criterio (spec) | Tarea(s) | Cómo se verifica |
|---|---|---|
| AC-1 (contrato §6.2) | T1, T4, T5 | `src/tools/proveedor.ts` exporta `{description, args, execute}`; `args.caso` es `z.string().describe(...)`; `execute` siempre `return JSON.stringify(...)` dentro de try/catch; tipos de T1 fuerzan `Promise<string>`. |
| AC-2 (nombre `proveedor_leer_solicitud`) | T4 | Export se llama exactamente `leer_solicitud` desde archivo `proveedor.ts`, de modo que `<archivo>_<export>` = `proveedor_leer_solicitud`. Validado por lectura del archivo + comentario explícito al pie. |
| AC-3 (4 casos ok) | T4, T6, T11 | `bun run demo` imprime 4 líneas-resumen con `ok` + `n_campos > 0` + `n_soportes` acorde al fixture; totales `ok: 4 | error: 0`. |
| AC-4 (caso inexistente) | T4, T14 | T14: invocación directa con `caso:"bogus"` devuelve `{ok:false, error:"caso no encontrado: bogus"}` sin lanzar. |
| AC-5 (ambigüedad + RN1) | T4, T8, T12 | `bun run verify:ambiguous` → exit 0, afirma `requiere_confirmacion:true` + `nota_pais` empieza con `"sugerido: RUC"` para país EC. |
| AC-6 (`demo.ts` sin clave) | T6, T11, T13 | Correr `bun run demo` **sin** ninguna var LLM (`env -i PATH=... bun run demo`) → exit 0 y 4 líneas-resumen. |
| AC-7 (determinismo) | T6, T7, T13 | T13: dos corridas con `demo:clean` → `diff` sin diferencias. `demo.ts` no imprime `ts`; el `ts` solo vive en `log.jsonl` (fuera de stdout). |
| AC-8 (`out/<caso>/log.jsonl`) | T3, T4, T11 | Tras `demo`, `ls reto-01/out/*/log.jsonl` lista 4 archivos; cada uno `wc -l` = 1; `jq .` parsea; claves `{ts, herramienta, ok, resumen}` presentes. |
| AC-9 (`tsc --noEmit` + sin `any`) | T1–T6, T11, T15 | `bun x tsc --noEmit` exit 0; `rg "\\bany\\b"` sin matches en código nuevo. |
| AC-10 (rutas desde `ctx.directory`) | T2, T4 | Todas las rutas en `proveedor.ts` pasan por `casoDir(ctx, caso)` / `outDir(ctx, caso)` de `src/lib/paths.ts`; `rg "^[\"']/" src/tools src/lib` → sin rutas absolutas. |

## 8. Estrategia de verificación

Orden exacto desde `reto-01/` (con `export PATH="$HOME/.bun/bin:$PATH"` prepended cuando aplique):

```bash
# A) Typecheck
bun x tsc --noEmit                                # exit 0, 0 errores

# B) sin `any`
rg -nE "\\bany\\b" src demo.ts src/scripts || echo "ok: sin any"

# C) Demo determinista
bun run src/scripts/clean-out.ts
bun run demo | tee /tmp/demo-a.txt                # exit 0, 4 líneas + totales
bun run src/scripts/clean-out.ts
bun run demo | tee /tmp/demo-b.txt
diff /tmp/demo-a.txt /tmp/demo-b.txt && echo "ok: determinismo stdout"

# D) Logs por caso
for c in co-industrias-delta ec-corp-andina hn-agroexport-sula pa-logistica-istmo; do
  test -f "out/$c/log.jsonl" && wc -l "out/$c/log.jsonl" | awk '{print $1,$2}' \
    && head -1 "out/$c/log.jsonl" | bun x -p -e "p=process.stdin;let s='';for await(const c of p)s+=c;const o=JSON.parse(s);console.log(['ts','herramienta','ok','resumen'].every(k=>k in o)?'ok':'FALLA')" <<< "$(head -1 out/$c/log.jsonl)"
done

# E) Error path
bun -e 'import {leer_solicitud} from "./src/tools/proveedor"; const r = await leer_solicitud.execute({caso:"bogus"},{directory:import.meta.dir,sessionId:"t"}); const o=JSON.parse(r); console.log(o.ok===false && o.error.startsWith("caso no encontrado") ? "ok: AC-4" : "FALLA")'

# F) Ambigüedad RN1
bun run verify:ambiguous                          # exit 0, stdout "ok: verify-ambiguous"

# G) Sin clave LLM
env -i HOME="$HOME" PATH="$HOME/.bun/bin:$PATH" bash -lc 'cd reto-01 && bun run demo' \
  && echo "ok: AC-6 sin env LLM"

# H) Rutas absolutas en código de herramienta
rg -nE "[\"']/[^\"']+[\"']" src/tools src/lib || echo "ok: sin rutas absolutas"
```

**Casos a correr**: los 4 reales + 1 sintético (verify-ambiguous) + 1 inexistente (`bogus`).

**Checks manuales adicionales**: ninguno — todo arriba es automatizable.

## 9. Riesgos y mitigaciones

- **R1 · `import.meta.dir` apunta a `reto-01/` en `demo.ts`, pero puede diferir si se ejecuta desde otro cwd.** En Bun, `import.meta.dir` es el dir del archivo compilado, no del cwd — es estable.
  **Mitigación**: usar `import.meta.dir` consistentemente en `demo.ts` y en los scripts; nunca `process.cwd()`.
- **R2 · AC-5 con caso sintético puede dejar artefactos si falla a medio camino.**
  **Mitigación**: el script usa `try/finally` con `fs.rm({force:true, recursive:true})` en el `finally`. `out/_test/` ya está bajo `out/` (ignorado por `.gitignore`).
- **R3 · Determinismo stdout — orden de iteración.**
  **Mitigación**: `CASOS` es una constante literal con orden fijo; no se usa `fs.readdir` para enumerar casos.
- **R4 · `appendFile` concurrente podría intercalar líneas.**
  **Mitigación**: `demo.ts` corre casos secuencialmente (`for … of … await`); no hay concurrencia. Si en slice 06 el ciclo del agente paraleliza, se revisará entonces.
- **R5 · Script `verify-ambiguous` no es un test runner formal.** No se pide uno — PRD no exige framework de tests y el reto es acotado.
  **Mitigación**: es el "simplest option" pedido en la directiva; un test runner (bun:test) añadiría overhead sin cubrir mejor el AC-5. Un unit test puede añadirse en slice posterior si el reviewer lo pide.
- **R6 · `appendLog` que falle silenciosamente puede ocultar bugs.**
  **Mitigación**: en caso de fallo del write, `console.warn` a stderr con la ruta — no bloquea la herramienta (CA5). El reviewer puede inspeccionar stderr durante AC-11-equivalente.
- **R7 · Lista cerrada de etiquetas ambiguas puede resultar insuficiente en producción** (riesgo mencionado por PRD §10 "plantillas peores").
  **Mitigación**: lista aislada en constante; en slice posterior puede migrarse a `src/knowledge/registro-proveedor.md` o a un JSON de reglas sin tocar la herramienta. Fuera de alcance para este slice.
- **R8 · Dependencias nuevas: ninguna.** Solo `zod` + `node:fs/promises` + `node:path` + Bun built-ins. PRD §8 ok.

## 10. Dudas abiertas

Ninguna.
