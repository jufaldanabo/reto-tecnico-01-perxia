# Spec — 02-mapear-campos

**Slice:** herramienta `proveedor_mapear_campos` (HU-2)
**Autoridad:** `reto-01/PRD.md` HU-2, §6.2, §7.2, §7.3 RN1, §6.3 CA2/CA4/CA5
**Fecha:** 2026-10-05
**Depende de:** slice 00-esqueleto + slice 01-leer-solicitud (ambos cerrados)

## 1. Resumen en una frase
Implementar `mapear_campos` que, dado un caso y la lista de campos (output de `leer_solicitud`), cruce cada etiqueta contra el `glosario-campos.json` y el `maestro.json`, y devuelva tres listas: `llenos`, `faltantes`, `requiere_confirmacion` — **sin inventar ningún valor** (CA2).

## 2. Alcance

**En alcance**
- Nuevo export `mapear_campos` en `src/tools/proveedor.ts` siguiendo contrato §6.2 (zod args + `execute` que devuelve string JSON, nunca lanza).
- `args` zod: `{ caso: z.string().min(1).describe(...), campos: z.array(CampoInputSchema).describe(...) }`.
- `CampoInputSchema` acepta el shape producido por `leer_solicitud` (ver duda 1).
- `data` ok (shape mínimo PRD §6.2 + extras para slice 03):
  - `llenos: Lleno[]` donde `Lleno = { etiqueta, ruta_maestro, valor, confianza, destino? }`
  - `faltantes: Faltante[]` donde `Faltante = { etiqueta, motivo, destino? }`
  - `requiere_confirmacion: Confirmacion[]` donde `Confirmacion = { etiqueta, ruta_maestro?, valor?, confianza?, motivo, nota_pais?, destino? }`
- Algoritmo de resolución (por campo):
  1. **Normalizar** etiqueta: lowercase, trim, colapsar espacios, remover acentos.
  2. **Match exacto en glosario normalizado** → `confianza: 1.0` → candidato.
  3. Si no hay match exacto, calcular **similitud Levenshtein normalizada** (`1 - dist / max(len)`) contra cada etiqueta del glosario normalizada; tomar la mejor.
     - Si `confianza >= 0.8` → candidato pero → `requiere_confirmacion` con `motivo: "mapeo aproximado: <glosario_original>"`.
     - Si `confianza < 0.8` → `faltante` con `motivo: "sin equivalente en glosario (confianza <0.8 contra '<mejor_glosario>')"`.
  4. Si el candidato tiene `ruta_maestro = "nit"` **y** `caso.pais != "CO"` → `requiere_confirmacion` con `nota_pais: "identificador extranjero: Periferia solo tiene NIT colombiano; para <PAIS> se espera <RUC|RTN>"` (RN1 literal).
  5. Si la etiqueta vino del slice 01 con `requiere_confirmacion: true` (ambigüedad) → `requiere_confirmacion` con la nota original preservada; adicionalmente, si el glosario lo resuelve, incluir `ruta_maestro` + `valor` como "sugerido".
  6. Si `ruta_maestro` existe pero el **valor en el maestro es `undefined`/`null`** → `faltante` con `motivo: "clave en glosario pero ausente en maestro: <ruta>"` (nunca inventar valor — CA2).
  7. Caso ok (no bancario, no RN1, no ambigüedad, no aproximado) → `llenos`.
- Resolución de rutas con punto (ej. `banco.nombre`, `ingresos_ultimo_ano.valor`): walker recursivo seguro (sin `eval`); si alguna parte del path falla, tratar como `faltante` (regla 6).
- Preservar `destino` del campo original en las tres listas de salida (necesario para `generar_formulario` xlsx en slice 03).
- Logging RN5/CA4: appendear a `out/<caso>/log.jsonl` con `{ ts, herramienta: "proveedor_mapear_campos", ok, resumen: { n_llenos, n_faltantes, n_requiere_confirmacion } }`.
- `demo.ts` se extiende: tras `leer_solicitud` para cada caso, llamar `mapear_campos(caso, campos)` e imprimir una línea adicional por caso con los conteos.

**Deuda técnica a pagar en este slice (de review slice 01, H-2)**
- Refactor del catch de zod en `leer_solicitud`: dejar de usar `msg.includes("formato"/"pais")` sobre texto crudo; usar `.issues[].path` para clasificar error. Mantener los mismos strings exactos de error (sin regresión de contrato).

**Fuera de alcance**
- `generar_formulario` (slice 03/04), `armar_paquete` (slice 05), `simular_envio` (slice 08), ciclo del agente (slice 06), front (slice 07).
- Validación semántica (ej. que el NIT tenga formato correcto).
- Fuzzy multi-token / embeddings. Levenshtein es suficiente para el reto.
- Añadir dependencias nuevas (`zod` + stdlib).

## 3. Criterios de aceptación

| # | Criterio | Fuente PRD |
|---|---|---|
| AC-1 | Export `mapear_campos` cumple contrato §6.2 (zod args con `.describe`, `execute` devuelve **string**, nunca lanza). Nombre expuesto al modelo = `proveedor_mapear_campos`. | §6.2 |
| AC-2 | Para los 4 casos reales (vía `demo.ts`), la herramienta devuelve `ok: true` con `llenos` + `faltantes` + `requiere_confirmacion` tal que `|llenos| + |faltantes| + |requiere_confirmacion| === campos.length` (partición exacta, sin duplicados). | HU-2 primer criterio |
| AC-3 | **CA2 — nunca inventa**: para un caso sintético con `maestro.json` sin la clave requerida (verify-script), la etiqueta cae en `faltantes` y la salida JSON **no** contiene el valor que estaría en el maestro completo. | §6.3 CA2, HU-2 "nunca inventa" |
| AC-4 | **RN1 — identificador extranjero**: para los casos EC (`ec-corp-andina`), HN (`hn-agroexport-sula`), PA (`pa-logistica-istmo`), la etiqueta mapeada a `nit` cae en `requiere_confirmacion` con `nota_pais` que menciona el identificador esperado del país; `valor` = NIT colombiano del maestro. Para CO (`co-industrias-delta`), la misma etiqueta cae en `llenos`. | §7.3 RN1 (literal) |
| AC-5 | **Glosario normalizado**: etiquetas con/sin tilde o case variantes se resuelven igual (verify-script con "RAZON SOCIAL" ↔ "Razón social"). | HU-2 "sinónimos del glosario se resuelven automáticamente" |
| AC-6 | **Mapeo aproximado**: etiqueta con similitud ∈ [0.8, 1.0) contra el glosario cae en `requiere_confirmacion` con `confianza` numérica y motivo que cita la etiqueta del glosario sugerida (verify-script, ej. "Correo electronico" sin tilde vs "Correo electrónico"). Confianza <0.8 cae en `faltantes`. | HU-2 "confianza < 0.8" |
| AC-7 | **Preservación de `destino`**: campos de origen xlsx conservan su `destino: { hoja, celda_etiqueta, celda_valor }` en cualquiera de las tres listas de salida. | §6.2 (contrato), slice 03 downstream |
| AC-8 | **Error path**: caso inexistente, `campos` vacío, o `campos` con shape inválido devuelven `{ ok: false, error }` claro, sin lanzar. | CA5, §6.2 "nunca lanza" |
| AC-9 | **CA4/RN5 logging**: tras `demo:clean && demo`, `out/<caso>/log.jsonl` para los 4 casos contiene exactamente 2 líneas (una de `leer_solicitud`, una de `mapear_campos`), ambas con las 4 claves `{ts, herramienta, ok, resumen}`. | CA4, RN5 |
| AC-10 | **Determinismo stdout**: `bun run demo:clean` produce stdout idéntico en 2 corridas consecutivas (campos ordenados, Levenshtein determinista). | §8 |
| AC-11 | **Typecheck + sin `any`**: `bun x tsc --noEmit` exit 0; `rg "\\bany\\b"` sin matches en código nuevo. | §8 |
| AC-12 | **Rutas desde `ctx.directory`**: no hay rutas absolutas en el código de herramientas. | §6.2 |
| AC-13 | **Deuda H-2 pagada**: la clasificación de error de zod en `leer_solicitud` ya no depende del texto `.message`; usa `.issues[].path`. Verificable con grep + rama de prueba. | Review slice 01 H-2 |

## 4. Reglas del PRD que aplican

- **§6.2 contrato de herramientas** — forma del export, zod, `{ok,data}` string, nunca lanza.
- **§7.2 repositorio maestro** — forma de `maestro.json` (claves `snake_case`, nested bancario / representante / contactos), `glosario-campos.json` (etiqueta → clave).
- **§6.3 CA2** — "el modelo no puede afirmar un valor que no haya salido de una herramienta". La herramienta no inventa valores; `null`/`undefined` en el maestro → `faltante`.
- **§6.3 CA4** — tool calls en `out/<caso>/log.jsonl`.
- **§6.3 CA5** — errores no matan nada; mensaje claro.
- **§7.3 RN1** — identificador tributario por país; para países no-CO, `nit` colombiano + `requiere_confirmacion`.
- **§8** — sin `any`, determinismo, sin shell, deps justificadas.

## 5. Dependencias con otros slices

- **Requiere**: slice 01-leer-solicitud cerrado (consume `data.campos[]`, `data.correo.pais` inferido vía re-lectura o paso explícito).
- **Alimenta**:
  - slice 03 (`generar_formulario` xlsx) consume `llenos[]` con `destino` + `valor`.
  - slice 04 (`generar_formulario` pdf) consume `llenos[]` + `faltantes[]` + `requiere_confirmacion[]`.
  - slice 05 (`armar_paquete`) usa los conteos para `checklist.md`.

## 6. Decisiones (resueltas)

1. **Shape de entrada con `.passthrough()`.** `CampoInputSchema` valida los campos conocidos (`etiqueta`, `obligatorio`, `destino?`, `requiere_confirmacion?`, `nota_pais?`) y tolera extras vía `.passthrough()`. Motivo: acepta el shape nativo producido por `leer_solicitud` sin acoplamiento rígido; evita que una futura extensión del slice 01 rompa este slice.
2. **`llenos[]` extendido con `valor` + `destino`.** Shape final: `{ etiqueta, ruta_maestro, valor, confianza, destino? }` donde `destino` solo aparece si el campo original lo traía (xlsx). Motivo: `generar_formulario` (slice 03) necesita el valor y el destino para escribir el xlsx sin re-mapear ni re-leer el maestro. PRD §6.2 lista el shape mínimo; no prohíbe extras internos.
3. **Deuda H-2 se paga en este slice.** Nueva tarea en el plan: refactorizar el catch de zod en `leer_solicitud` para clasificar por `issues[].path` en vez de `.message.includes(...)`. Motivo: ya vamos a tocar `src/tools/proveedor.ts`, el blast radius es mínimo si mantenemos los strings de error exactos (verificables con los AC existentes del slice 01). Riesgo de regresión mitigado por re-ejecutar `bun run demo` y `verify:ambiguous` tras el refactor.
