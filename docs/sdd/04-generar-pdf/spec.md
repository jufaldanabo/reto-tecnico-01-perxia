# Spec — 04-generar-pdf

**Slice:** `proveedor_generar_formulario` — rama **pdf (P1)** (HU-3)
**Autoridad:** `reto-01/PRD.md` HU-3 P1, §6.2, §7.1 "plantilla-campos.json", §6.3 CA2/CA4/CA5
**Fecha:** 2026-10-05
**Depende de:** slice 00 + 01 + 02 + 03 (todos cerrados)

## 1. Resumen en una frase
Extender `generar_formulario` reemplazando el stub de la rama `pdf` por una implementación real que escriba `out/<caso>/formulario.pdf` reproduciendo cada etiqueta de `plantilla-campos.json` seguida de su valor en el orden del fixture.

## 2. Alcance

**En alcance**
- Modificar **solo la rama `pdf`** del switch en `src/tools/proveedor.ts` (`runGenerar`); el stub actual deja de devolver "no implementado" y empieza a producir el pdf.
- Nuevo helper reutilizable `src/lib/pdf.ts` con `escribirFormularioPdf(ruta, plantilla, lookup) → Promise<{ n_escritos, n_vacios }>` que encapsula el uso de la librería pdf (ver duda 2).
- La herramienta devuelve `{ ok: true, data: { ruta: "out/<caso>/formulario.pdf", formato: "pdf" }, n_escritos, n_vacios }`.
- Reglas de escritura pdf (paralelas a xlsx del slice 03):
  - Para **cada ítem** de `plantilla-campos.json` (orden del fixture): escribir una línea `<etiqueta>: <valor>` o `<etiqueta>: ___` (valor vacío) seguida de salto de línea.
  - Si la etiqueta está en `mapeo.llenos[]` por match exacto → `valor` serializado (strings tal cual, number como string, booleanos `"Sí"`/`"No"`, objetos `JSON.stringify` — reutilizar `serializarValor` de `src/lib/xlsx.ts` → extraerlo a `src/lib/serialize.ts` compartido).
  - Si está en `faltantes` o `requiere_confirmacion` → línea con `___` (3 underscores) en lugar del valor, para que el humano pueda escribirlo a mano antes de la firma.
  - Encabezado del pdf: título `Registro como proveedor — <cliente>` (del `solicitud.cliente`) + fecha ISO de generación en la primera línea. Luego las filas en orden.
  - Marcar `(obligatorio)` después de la etiqueta solo si `obligatorio === true` en la plantilla (opcional pero útil para el analista; ver duda 3).
- Dependencia nueva de producción: librería pdf (ver duda 2). Propuesta: `pdfkit`.
- (Opcional) Dependencia nueva de dev para `verify:pdf`: `pdf-parse` (ver duda 4).
- Logging RN5/CA4: `appendLog` con `{ formato: "pdf", ruta, n_escritos, n_vacios }` (misma forma que xlsx).
- `demo.ts`: EC pasa de `generar: skipped (formato pdf)` a `generar: ruta=out/ec-corp-andina/formulario.pdf (N escritos, M vacíos)`. PA mantiene `skipped (formato portal)` (slice posterior).
- Verificación automatizada: nuevo script `verify:pdf` que, para EC:
  - Confirma que `out/ec-corp-andina/formulario.pdf` existe y tiene tamaño > 0.
  - Extrae texto del pdf con la lib de dev y afirma que contiene (en orden) cada `etiqueta` de la plantilla + el valor esperado (o `___` si no está en llenos).
  - Para PA (portal), afirma que `out/pa-logistica-istmo/formulario.pdf` **no** existe (sigue siendo rama diferida).
- Preserva todas las regresiones de slices 01/02/03 en el chain `check`.

**Fuera de alcance**
- Rama `portal` + `valores-portal.md` (slice posterior).
- Firma electrónica, embebido de imágenes, formato visual rico (fuentes custom, colores, logos).
- AcroForm (rellenar un pdf existente). PRD HU-3 P1 explícitamente permite "PDF generado (no AcroForm)".
- Validación semántica de valores.
- Rama `xlsx` (ya en slice 03; se verifica solo que no regresione).

## 3. Criterios de aceptación

| # | Criterio | Fuente PRD |
|---|---|---|
| AC-1 | La rama pdf del switch en `generar_formulario` ya no devuelve error "no implementado"; produce `{ ok: true, data: { ruta, formato: "pdf" } }` para EC. Nombre expuesto sin cambios: `proveedor_generar_formulario`. | HU-3 P1, §6.2 |
| AC-2 | `out/ec-corp-andina/formulario.pdf` existe en disco tras `bun run demo` y pesa > 0 bytes. | HU-3 P1 |
| AC-3 | **Fidelidad al template**: el texto extraído del pdf contiene las 15 etiquetas de `plantilla-campos.json` **en el orden del fixture**; cada etiqueta aparece seguida de su valor (si está en `llenos`) o del marcador `___` (si está en `faltantes`/`requiere_confirmacion`). | HU-3 P1 "reproduzca todos los campos con etiqueta y valor en el orden dado" |
| AC-4 | **CA2 — nunca inventa**: ninguna línea contiene valor que no provenga de `mapeo.llenos[].valor`. Verificable por el verify-script. | §6.3 CA2 |
| AC-5 | **Encabezado**: la primera página incluye el título `Registro como proveedor — <cliente>` donde `<cliente>` viene de `solicitud.json` del caso. | HU-3 P1 (contexto para firma) |
| AC-6 | **Portal sigue diferido**: para PA, la herramienta devuelve `{ ok: false, error: "formato portal no implementado…" }` sin crear archivo. (xlsx sigue funcionando: no regresión del slice 03.) | PRD §6.2, HU-3 P2 (diferida) |
| AC-7 | **Error path**: caso inexistente, `mapeo` inválido, o fallo escribiendo el pdf devuelven `{ ok: false, error }` sin lanzar. | CA5 |
| AC-8 | **CA4/RN5 logging**: tras `demo:clean && demo`, `out/<caso>/log.jsonl` para EC contiene 3 líneas y la 3ª es `herramienta: "proveedor_generar_formulario"` + `ok: true` + `resumen: { formato: "pdf", ruta, n_escritos, n_vacios }`. | CA4, RN5 |
| AC-9 | **Determinismo**: `bun run demo:clean` produce stdout idéntico entre 2 corridas, y el **texto extraído** del pdf (no los bytes, ver §6 duda 5) es idéntico entre 2 escrituras consecutivas con las mismas entradas. | §8 |
| AC-10 | **Typecheck + sin `any`**: `bun x tsc --noEmit` exit 0; `rg "\\bany\\b"` sin matches en código nuevo. | §8 |
| AC-11 | **Rutas desde `ctx.directory`**: `data.ruta` es relativa (`out/<caso>/formulario.pdf`); el código no usa rutas absolutas. | §6.2 |
| AC-12 | **Dependencias nuevas justificadas**: la librería pdf (prod) y el extractor (dev, si aplica) están listados en `package.json` y justificados en `README.md` (sección "Dependencias"). | §8 |
| AC-13 | **Regresión slices anteriores**: `verify:ambiguous`, `verify:mapeo`, `verify:h2`, `verify:xlsx` siguen todos en verde tras el cambio. CO/HN xlsx se producen correctamente sin cambios. | Regresión controlada |

## 4. Reglas del PRD que aplican

- **§6.2 contrato de herramientas** — se modifica el body de la rama pdf; el contrato no cambia.
- **§7.1 "plantilla-campos.json"** — lista ordenada de `{ etiqueta, obligatorio }`.
- **HU-3 P1** — "PDF generado (no AcroForm) con etiqueta y valor en orden".
- **§6.3 CA2** — no inventar valores.
- **§6.3 CA4** — tool call registrada en log.
- **§6.3 CA5** — errores no matan; mensaje claro.
- **§8** — sin `any`, determinismo, deps justificadas.

## 5. Dependencias con otros slices

- **Requiere**: slice 03 cerrado (switch en `runGenerar` ya aislada, cambio solo en la rama pdf).
- **Alimenta**:
  - slice posterior portal: reutilizará la switch; el "valores-portal.md" tendrá un helper paralelo.
  - slice 05 (`armar_paquete`): incluirá `formulario.pdf` en el paquete junto con los soportes.

## 6. Decisiones (resueltas)

1. **`serializarValor` se extrae a `src/lib/serialize.ts`**. `src/lib/xlsx.ts` se refactoriza para importarlo desde ahí; `src/lib/pdf.ts` lo consume también. Motivo: fuente única de la regla de serialización (strings/number/boolean/`JSON.stringify`), evita acoplamiento transitivo xlsx→pdf. Regresión controlada: `verify:xlsx` del slice 03 debe seguir verde tras el refactor.
2. **Librería de generación: `pdfkit` (prod dep)**. API alto nivel (`.text(...)`, `.moveDown()`), pure JS, maduro, maneja layout básico. Alternativa descartada: `pdf-lib` (orientado a editar) y OOXML/PDF a mano (fuera de alcance temporal).
3. **Sufijo `(obligatorio)` sí se incluye** cuando `obligatorio === true` del fixture. Motivo: ayuda al analista a saber qué campos no puede dejar vacíos antes de la firma; coste mínimo (una línea de condicional).
4. **`pdf-parse` como devDependency** (~500 KB) para `verify:pdf`. Solo se usa en el script de verificación, nunca en runtime (no afecta tamaño del bundle ni carga en producción). Permite asertos estrictos sobre contenido/orden del texto renderizado.
5. **Determinismo del pdf vía texto extraído**, no bytes. Dos escrituras consecutivas con mismas entradas → texto extraído por `pdf-parse` idéntico. Metadata del pdf (createdAt, producer) se ignora. Alternativa descartada: fijar `info.CreationDate` en pdfkit → más frágil, no cubre otros metadatos.
