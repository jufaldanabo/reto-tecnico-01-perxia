# Spec — 06-simular-envio

**Slice:** herramienta `proveedor_simular_envio` (HU-4 cierre + RN4)
**Autoridad:** `reto-01/PRD.md` HU-4 último párrafo, §6.2, §7.3 RN3/RN4/RN5, §6.3 CA2/CA3/CA4/CA5
**Fecha:** 2026-10-06
**Depende de:** slice 00 + 01 + 02 + 03 + 04 + 05 (todos cerrados)

## 1. Resumen en una frase
Implementar `simular_envio` que, dado `{ caso, confirmado }`, exija (a) confirmación explícita y (b) paquete `listo_para_firma`, y SOLO si ambas condiciones se cumplen escriba `out/<caso>/ENVIO-SIMULADO.md`; en cualquier otro caso devuelva un error claro **sin side effects** (RN4 estricto, PRD §6.2 literal).

## 2. Alcance

**En alcance**
- Nuevo export `simular_envio` en `src/tools/proveedor.ts` cumpliendo contrato §6.2.
- `args` zod: `{ caso: z.string().min(1), confirmado: z.boolean() }`.
- `data` ok: `{ ruta: string }` (contrato §6.2 literal) donde `ruta = "out/<caso>/ENVIO-SIMULADO.md"`.
- Reglas de clasificación (orden de evaluación):
  1. Caso inexistente → `{ ok: false, error: "caso no encontrado: <nombre>" }`.
  2. `confirmado !== true` → `{ ok: false, error: "requiere confirmación explícita" }` (PRD §6.2 **literal**).
  3. `confirmado === true` pero `listo_para_firma === false` → `{ ok: false, error: "no listo para firma: <bloqueos>" }` donde `<bloqueos>` es la concatenación de los strings de `data.checklist.bloqueos` separados por `; `.
  4. `confirmado === true` y `listo_para_firma === true` → escribir `ENVIO-SIMULADO.md` y devolver `{ ok: true, data: { ruta: "out/<caso>/ENVIO-SIMULADO.md" } }`.
- **Cómo obtener `listo_para_firma`**: `simular_envio` llama internamente a `runArmar` (misma función interna que usa `armar_paquete`, patrón D2 del slice 05). Esto re-deriva la clasificación de soportes de forma determinista y NO introduce un `appendLog` extra para `armar_paquete`.
  - **Nota**: el flujo del demo entonces hace: `leer → mapear → generar → armar → envio` con 5 líneas de log por caso (una por tool call vía `.execute()`), pero `runArmar` interno dentro de `simular_envio` NO emite log propio.
- Comportamiento FS:
  - Caso no-ok: **ningún archivo nuevo** en `out/<caso>/` (RN4 estricto).
  - Caso ok: escribir `out/<caso>/ENVIO-SIMULADO.md` con:
    - Encabezado `# Envío simulado — <cliente>`
    - Metadatos: `Para`, `Asunto`, `Fecha`, `Caso`, `País`.
    - Lista de archivos adjuntos (formulario + soportes del paquete, nombres relativos).
    - Nota explícita: `**Nota: este envío es SIMULADO. Ninguna acción externa (correo, portal, firma) fue ejecutada por el agente.**`
    - Firma genérica.
- Logging RN5/CA4: appendLog con `{ formato: "envio", ruta?: string, listo_para_firma: boolean, confirmado: boolean, error?: string }`. 5ª línea por caso en `out/<caso>/log.jsonl`.
- `demo.ts`: tras `armar_paquete`, invocar `simular_envio` **DOS veces** por caso para ejercitar las dos ramas de error (CA3/RN4):
  1. Primera llamada: `confirmado: false` → error "requiere confirmación explícita".
  2. Segunda llamada: `confirmado: true` → en los fixtures actuales produce error "no listo para firma: ..." para los 4 casos.
  - Imprimir una línea por cada llamada: `  envio[1]: ERROR: requiere confirmación explícita` y `  envio[2]: ERROR: no listo para firma: ...` (truncado a 80 chars si largo).
  - Entonces `log.jsonl` tiene **6 líneas** por caso (leer + mapear + generar + armar + envio[1] + envio[2]). Los stdout `okCount`/`errCount` del demo: estos errores "esperados" NO suman a `errCount` para no romper el total `ok:4 | error:0`; se trata como `expected error` (ver duda 2).
- Verificación automatizada: nuevo `verify:envio` con:
  - **AC confirmación**: para cada caso real, `simular_envio({caso, confirmado: false})` devuelve exactamente `"requiere confirmación explícita"` sin crear archivos.
  - **AC bloqueo**: para cada caso real con `confirmado: true`, devuelve error "no listo para firma" porque todos están bloqueados por `camara_comercio` vencido.
  - **AC happy path (sintético)**: crear fixtures sintéticos (`out/_test/06-simular-envio/`) donde todos los soportes tengan `vigencia_hasta` futura (ej. 2030-01-01); correr la cadena completa `leer → mapear → generar → armar → envio({caso, confirmado: true})` y afirmar que `data.ruta = "out/<caso>/ENVIO-SIMULADO.md"` y que el archivo existe con las secciones esperadas.
  - **AC side effects**: tras invocar `simular_envio` con `confirmado:false`, afirmar que `out/<caso>/ENVIO-SIMULADO.md` NO existe (RN4 estricto).

**Fuera de alcance**
- Envío real (correo, portal). Imposible por diseño del reto.
- Ciclo del agente, servidor HTTP, front chat (slices posteriores).
- Rama `portal` de `generar_formulario`.
- Firma electrónica.
- Validación de que todos los archivos del paquete existen físicamente antes de "enviar" (confiamos en que `armar_paquete` dejó un paquete coherente).

## 3. Criterios de aceptación

| # | Criterio | Fuente PRD |
|---|---|---|
| AC-1 | Export `simular_envio` cumple contrato §6.2 (zod + string JSON + nunca lanza). Nombre expuesto = `proveedor_simular_envio`. | §6.2 |
| AC-2 | **CA3/RN4 literal**: `confirmado: false` o ausente → `{ ok: false, error: "requiere confirmación explícita" }` **sin crear ningún archivo** en `out/<caso>/`. | §6.2 literal, §6.3 CA3, §7.3 RN4 |
| AC-3 | **RN3 cascada**: `confirmado: true` pero paquete `listo_para_firma: false` → `{ ok: false, error: "no listo para firma: <bloqueos>" }` con los bloqueos reales, sin crear `ENVIO-SIMULADO.md`. | §7.3 RN3 |
| AC-4 | **Happy path (sintético)**: `confirmado: true` + paquete `listo_para_firma: true` → `{ ok: true, data: { ruta: "out/<caso>/ENVIO-SIMULADO.md" } }` y el archivo existe con las secciones esperadas (`# Envío simulado`, `Para`, `Asunto`, lista de adjuntos, nota SIMULADO). | HU-4 "escribe out/<caso>/ENVIO-SIMULADO.md" |
| AC-5 | **Error path**: caso inexistente devuelve `{ ok: false, error: "caso no encontrado: <nombre>" }` sin lanzar. | CA5 |
| AC-6 | **CA4/RN5 logging**: tras `demo:clean && demo`, `out/<caso>/log.jsonl` para los 4 casos contiene **6 líneas** (leer + mapear + generar + armar + envio[1] + envio[2]); todas con las 4 claves `{ts, herramienta, ok, resumen}`. | CA4, RN5 |
| AC-7 | **Determinismo stdout**: `bun run demo:clean` produce stdout idéntico en 2 corridas consecutivas (los errores "esperados" son deterministas). | §8 |
| AC-8 | **Typecheck + sin `any`**: `bun x tsc --noEmit` exit 0; `rg -nw any` sin matches en código nuevo. | §8 |
| AC-9 | **Sin rutas absolutas**: `rg` en `src/tools`+`src/lib` → sin matches. | §6.2 |
| AC-10 | **Regresión slices 01–05**: `verify:ambiguous`, `verify:mapeo`, `verify:h2`, `verify:xlsx`, `verify:pdf`, `verify:paquete` siguen todos verdes. | Regresión controlada |

## 4. Reglas del PRD que aplican

- **§6.2 contrato de herramientas** — forma del export; `data = { ruta }` literal; error string **literal** `"requiere confirmación explícita"` del PRD.
- **HU-4 último párrafo** — "escribe `out/<caso>/ENVIO-SIMULADO.md`" solo tras confirmación explícita.
- **§6.3 CA2** — no inventar; `ENVIO-SIMULADO.md` lista archivos que **existen** en el paquete.
- **§6.3 CA3** — confirmación explícita antes de acción externa.
- **§6.3 CA4** — tool call en log.
- **§6.3 CA5** — errores no matan; mensaje claro.
- **§7.3 RN3** — vencidos/ausentes bloquean `listo_para_firma`, que a su vez bloquea el envío.
- **§7.3 RN4** — ninguna acción externa sin confirmación explícita del turno inmediatamente anterior.
- **§7.3 RN5** — log por caso.
- **§8** — sin `any`, determinismo (stdout idéntico), sin shell.

## 5. Dependencias con otros slices

- **Requiere**: slice 05 cerrado (`runArmar` interno reusable).
- **Alimenta**: slice del ciclo del agente / front (slices 07+) consumirá `simular_envio` cerrando el flujo end-to-end con la gate CA3 real en el chat.

## 6. Decisiones (resueltas)

1. **`simular_envio` llama a `runArmar` internamente** (patrón D2 slice 05). Garantiza determinismo y autocontención. Sin segundo `appendLog` (porque es la función interna, no `.execute()`). Alternativas B (parsear log) y C (arg explícito que viola PRD §6.2) descartadas.
2. **Errores "esperados" NO suman a `errCount`.** Las dos ramas de error esperadas (`"requiere confirmación explícita"` y `"no listo para firma: ..."`) se contabilizan como `expectedCount`, no como `errCount`. Totales siguen `ok:4 | error:0`. Solo errores inesperados (p.ej. caso no encontrado) suman al `errCount`.
3. **`verify:envio` end-to-end con fixtures sintéticos.** Crea estructura completa (`solicitud/plantilla/soportes-exigidos/maestro/glosario/soportes-index`) con `vigencia_hasta` futura (ej. 2030-01-01) bajo `out/_test/06-simular-envio/`. Corre la cadena `leer → mapear → generar → armar → envio({confirmado:true})` y afirma `data.ruta = "out/<caso-sintetico>/ENVIO-SIMULADO.md"` + archivo existe + secciones esperadas. Limpia con `try/finally fs.rm`.
4. **`ENVIO-SIMULADO.md` como "recibo interno" propio.** Encabezado `# Envío simulado — <cliente>`, metadata (Para/Asunto/Fecha/Caso/País), lista de adjuntos del paquete, **nota SIMULADO en bold**, firma genérica. Distinto del `borrador-correo.md` (que es texto para el cliente). No contiene datos bancarios (hereda RN2 por diseño, aunque no es un correo).
