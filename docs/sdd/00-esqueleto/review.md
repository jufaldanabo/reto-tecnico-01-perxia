# Review — 00-esqueleto

**Fecha:** 2026-10-05T00:30:00Z
**Verdict:** pass
**Iteración:** 1

## 1. Resumen ejecutivo
Esqueleto §6.5 completo bajo `reto-01/`, con fixtures reubicados a `reto-01/fixtures/` (opción B). `bun install`, `bun x tsc --noEmit` y `bun run demo` ejecutan en verde y de forma determinista. Los 8 criterios de aceptación quedan cubiertos con evidencia independiente. Las reglas CA* y RN* del PRD no aplican a este slice (no hay herramientas ni ciclo de agente aún). No hay hallazgos bloqueantes ni mayores; sí hay 3 observaciones menores que vale la pena anotar para slices siguientes.

## 2. Cobertura de criterios

| Criterio (del spec) | Estado | Evidencia |
|---|---|---|
| AC-1 — Estructura §6.5 | cubierto | `find reto-01 -maxdepth 3` lista: `agent/prompt.md`, `src/server.ts`, `src/llm/{adapter.ts, placeholder.ts}`, `src/tools/proveedor.ts`, `src/knowledge/registro-proveedor.md`, `web/.gitkeep`, `fixtures/{casos,glosario-campos.json,repositorio}`, `demo.ts`, `.env.example`, `package.json`, `tsconfig.json`, `README.md`, `SOLUCION.md`. `out/` ausente (correcto: se crea en runtime, §.gitignore). |
| AC-2 — `bun install` limpio | cubierto | Primera corrida: exit 0, 6 packages instalados. Segunda corrida (idempotencia): exit 0, "no changes" en 19ms. |
| AC-3 — `bun x tsc --noEmit` sin errores | cubierto | exit 0, cero errores. `tsconfig.json:5–9` configura `strict: true` + `noImplicitAny: true` + `noEmit: true`. `grep -nE "\\bany\\b" src/**/*.ts demo.ts` → ningún match. |
| AC-4 — `bun run demo` exit 0 + mensaje exacto | cubierto | stdout = `pendiente — slice 00 solo valida compilación`, exit 0, idéntico en 2 corridas consecutivas (determinismo §8). |
| AC-5 — `.env` ausente, `.env.example` sin valores | cubierto | `ls reto-01/.env` → No such file. `grep -En "=.+" reto-01/.env.example` → sin matches (las 5 claves terminan en `=` solo). |
| AC-6 — README documenta arranque y variables | cubierto | `reto-01/README.md:9–13` muestra `cd reto-01 && bun install && bun run demo`. `reto-01/README.md:27–35` tabla con las 5 variables de `.env.example`, cada una con propósito y default sugerido. |
| AC-7 — `.gitignore` cubre `node_modules/`, `out/`, `.env` | cubierto | `reto-01/.gitignore` contiene: `node_modules/`, `out/`, `.env`, `.DS_Store`, `*.log`. Los 4 patrones del spec +1 extra (`*.log`) presentes. |
| AC-8 — `zod` presente, otras deps justificadas | cubierto | `package.json:11–13` → `dependencies: { zod: ^3.23.0 }` (única prod dep). `devDependencies: typescript ^5.5.0`, `@types/bun` latest, justificadas en `reto-01/README.md:37–40` ("Dependencias de build: typescript (type-check), @types/bun (tipos del runtime Bun)"). |

### Reglas del PRD — aplicabilidad
- **§6.2 (contrato de herramientas)** — N/A: `src/tools/proveedor.ts` es placeholder vacío; se evaluará en slice 01+.
- **§6.3 CA1–CA5 (ciclo del agente)** — N/A: no hay ciclo todavía. CA1 default (`AGENT_MAX_ITERATIONS=25`) ya documentado en README. CA2 y CA3 insinuados en TODOs de `agent/prompt.md`. CA4 insinuado en TODO de `src/server.ts`. Se evaluarán en slice 06.
- **§7.3 RN1–RN5 (reglas de negocio)** — N/A: no hay herramientas que las apliquen; se evaluarán en slices 02–08.
- **§6.5 (estructura)** — pass (ver AC-1).
- **§8 (no-funcionales: sin `any`, clave en env, determinismo, arranque)** — pass. Scan de secretos literales (`grep -nE "(api[_-]?key|secret|token|password)\\s*[:=]\\s*[\"'][^\"']+[\"']"`) → sin matches. Clave LLM solo referenciada por nombre en `.env.example` y README.
- **§9.5 (entrega sin `node_modules/`, `out/`, `.env`)** — `node_modules/` presente localmente pero ignorado por `.gitignore`; `out/` ausente; `.env` ausente. OK.

## 3. Hallazgos

### H-1 — Spec contradicción interna (menor, informativo)
- **Severidad:** menor
- **Regla violada:** ninguna (spec vs AC inconsistente)
- **Ubicación:** `docs/sdd/00-esqueleto/spec.md:34` vs `:55`
- **Qué pasa:** §2 listaba `AGENT_MAX_ITERATIONS=25` como contenido esperado de `.env.example`, pero AC-5 exige "sin valores". El implementer resolvió correctamente a favor de AC-5 (ambos literales del PRD) y movió el default `25` al README.
- **Qué debería pasar:** spec coherente consigo misma.
- **Fix sugerido:** en próximos specs, listar `.env.example` sin valores por defecto y referir los defaults a README/código; no modificar `spec.md` cerrado — anotarlo como lección aprendida.

### H-2 — Comando de arranque multilínea en README (menor, aceptable)
- **Severidad:** menor
- **Regla violada:** ninguna aplicable al slice 00
- **Ubicación:** `reto-01/README.md:9–13`
- **Qué pasa:** README muestra 3 comandos secuenciales (`cd`, `bun install`, `bun run demo`), no uno único.
- **Qué debería pasar:** PRD §8 exige "un comando" solo para levantar `dev` (front+backend). Para skeleton sin servidor, es aceptable; el slice del servidor (slice 07) deberá consolidar en `bun run dev` o `docker compose up`.
- **Fix sugerido:** ninguno ahora. Dejar nota en spec/plan del slice 07 para incluir "comando único" como AC explícito.

### H-3 — `chmod -R u+w reto-01/` fuera del plan (menor, sin impacto observable)
- **Severidad:** menor
- **Regla violada:** ninguna
- **Ubicación:** reto-01/ (ejecutado por implementer)
- **Qué pasa:** El implementer aplicó `chmod -R u+w reto-01/` porque la carpeta venía con permisos `dr-xr-xr-x`. No estaba listado en el plan.
- **Qué debería pasar:** acciones fuera del plan deben elevarse al coordinator antes de ejecutarse. Caso aceptable: era prerrequisito mecánico para `mv` y es reversible.
- **Fix sugerido:** ninguno ahora. Para el proceso: documentarlo en `history.md` como "acción forzada fuera del plan" (ya está en el reporte del implementer).

## 4. Resultados de ejecución
- **typecheck**: pass — `bun x tsc --noEmit` exit 0, 0 errores.
- **demo.ts**: pass — exit 0, stdout exacto; corrido 2 veces con output idéntico (determinismo §8).
- **bun install**: pass — exit 0 en primera corrida; segunda corrida idempotente (19ms, "no changes").
- **casos corridos**: ninguno (N/A en slice 00).
- **artefactos en `out/`**: ninguno (correcto: slice 00 no genera outputs; `out/` ni siquiera existe).
- **referencias colgantes a `fixtures/reto-01/`**: solo 1, intencional, en `reto-01/README.md:44` explicando la divergencia respecto al PRD. PRD propio no se modificó (documento autoritativo).
- **secret scan**: pass — ningún literal con pinta de credencial en `reto-01/`.

## 5. Veredicto
**pass**. Los 8 criterios de aceptación del spec quedan cubiertos con evidencia que yo mismo rederivé. Las verificaciones de ejecución (typecheck, install, demo, determinismo) están todas en verde. Las reglas CA* y RN* del PRD no aplican a este slice (y así se declara). Los 3 hallazgos son observaciones menores sin impacto en la calidad del esqueleto; ninguno justifica degradar el verdict a partial.

## 6. Siguientes pasos recomendados
Ninguno para este slice. Recomendaciones para el coordinator al abrir el próximo slice:
1. Al redactar `spec.md` del slice 01 (`proveedor_leer_solicitud`), evitar la contradicción tipo H-1 (listar `.env.example` solo con claves vacías; mover defaults a README/código).
2. Al redactar el spec del slice 07 (servidor), incluir como AC explícito "un único comando levanta todo" (`bun run dev` o `docker compose up`) para cerrar H-2 definitivamente.
3. Confirmar con usuario cuándo commitear el estado actual (hoy todo está untracked por decisión; cualquier `git add` queda a su criterio).
