# Plan — 00-esqueleto

## 1. Objetivo
Levantar en `reto-01/` el esqueleto exacto de PRD §6.5, mover los fixtures a `reto-01/fixtures/`, y dejar `demo.ts` compilando y corriendo sin clave de LLM, para que los slices posteriores enchufen herramientas sin tocar fontanería.

## 2. Alcance

**En alcance**
- Crear archivos y carpetas de PRD §6.5 bajo `reto-01/` (todo el árbol listado en spec §2).
- Reubicar fixtures: `reto-01/fixtures/reto-01/*` → `reto-01/fixtures/*`; eliminar carpeta intermedia.
- `package.json`, `tsconfig.json`, `.env.example`, `.gitignore` en `reto-01/`.
- `demo.ts` placeholder que compila y corre con exit 0 imprimiendo el mensaje acordado.
- `README.md` dentro de `reto-01/` con arranque y variables.
- Placeholders TS/MD en `src/`, `agent/`, `web/`.
- Actualizar la única referencia a la ruta vieja fuera del PRD: `.claude/agents/coordinator.md`.

**Fuera de alcance**
- Lógica real de herramientas, adaptador LLM concreto, servidor HTTP, front web, pruebas automatizadas, Docker.
- Reescritura del PRD (texto autoritativo histórico; se anota la discrepancia de rutas en README).
- `SOLUCION.md` completo (solo plantilla con secciones vacías listadas en PRD §9.1).

## 3. Reglas del PRD que aplican
- **§6.5 (estructura obligatoria)** — todos los archivos listados existen bajo `reto-01/` con los nombres exactos; `fixtures/` queda directamente bajo `reto-01/`.
- **§6.2 (contrato de herramientas, `zod` obligatorio)** — `zod` se instala en este slice aunque no haya herramientas aún, para que el implementer de slice 01 solo tenga que importar.
- **§6.6 (`demo.ts` sin clave)** — `demo.ts` debe correr con exit 0 sin ninguna variable de entorno de LLM.
- **§8 "Arranque"** — `bun install` corre en menos de 2 min en máquina limpia; el README indica el flujo.
- **§8 "Legibilidad"** — `tsc --noEmit` con `strict: true` + `noImplicitAny: true`; cero `any`.
- **§8 "Seguridad"** — `.env` no en repo; `.env.example` sin valores reales; sin credenciales en código.
- **§8 "Dependencias"** — `zod` justificado por §6.2; cualquier otra se documenta en README.
- **§9.5 (entrega)** — `.gitignore` cubre `node_modules/`, `out/`, `.env`; también `.DS_Store`.

## 4. Archivos a tocar

| Ruta | Acción | Motivo |
|---|---|---|
| `reto-01/package.json` | crear | dependencias (`zod`), devDeps (`typescript`, `@types/bun`), scripts (`demo`, `typecheck`, `dev`) |
| `reto-01/tsconfig.json` | crear | strict + noImplicitAny + bundler resolution; include demo.ts y src/** |
| `reto-01/.env.example` | crear | `LLM_PROVIDER=`, `LLM_API_KEY=`, `LLM_MODEL=`, `AGENT_MAX_ITERATIONS=25`, `SESSION_TOKEN_LIMIT=` (sin valores) |
| `reto-01/.gitignore` | crear | `node_modules/`, `out/`, `.env`, `.DS_Store`, `*.log` |
| `reto-01/README.md` | crear | sección "Arranque local", "Variables de entorno", nota sobre layout de fixtures |
| `reto-01/SOLUCION.md` | crear | plantilla con los 10 encabezados de PRD §9.1, cada sección vacía con `TODO` |
| `reto-01/demo.ts` | crear | side-effect import a `src/tools/proveedor`, imprime "pendiente — slice 00 solo valida compilación", exit 0 |
| `reto-01/agent/prompt.md` | crear | placeholder MD con TODO explicando que aquí vive el system prompt (PRD §6.5) |
| `reto-01/src/server.ts` | crear | `export {};` + comentario TODO (API HTTP + ciclo del agente) |
| `reto-01/src/llm/adapter.ts` | crear | `export {};` + comentario TODO (interfaz `enviar(mensajes, herramientas) → respuesta`) |
| `reto-01/src/llm/placeholder.ts` | crear | `export {};` + comentario TODO (reemplazar por proveedor real en slice posterior) |
| `reto-01/src/tools/proveedor.ts` | crear | `export {};` + comentario TODO (herramientas se agregan desde slice 01) |
| `reto-01/src/knowledge/registro-proveedor.md` | crear | placeholder MD con TODO |
| `reto-01/web/.gitkeep` | crear | reserva la carpeta `web/` (front se construye luego) |
| `reto-01/fixtures/reto-01/*` | **mover** → `reto-01/fixtures/*` | opción B del spec |
| `reto-01/fixtures/reto-01/` | eliminar | queda vacía tras el move |
| `.claude/agents/coordinator.md` | editar | corregir referencia `reto-01/fixtures/reto-01/` → `reto-01/fixtures/` |
| `reto-01/.DS_Store` (si existe) | eliminar | lo ignora `.gitignore` pero conviene borrarlo si quedó |

**No se toca**: `reto-01/PRD.md` (histórico autoritativo), `README.md` raíz (puede dejarse como pointer al proyecto), `docs/sdd/**` (lo gestiona SDD), `.claude/agents/{planner,implementer,reviewer}.md`.

## 5. Interfaces y tipos

Este slice **no define interfaces productivas**. Solo scaffolding compilable. Formas aproximadas que los placeholders deben insinuar vía comentarios TODO (no exportan nada todavía):

- `src/llm/adapter.ts`:
  ```ts
  // TODO (slice 06 — adaptador LLM): exportar
  //   export interface LlmAdapter {
  //     enviar(mensajes: Mensaje[], herramientas: Herramienta[]): Promise<RespuestaLlm>
  //   }
  export {}
  ```
- `src/tools/proveedor.ts`:
  ```ts
  // TODO (slice 01+): cada export aquí se expone al modelo como proveedor_<export>
  //   según PRD §6.2. Shape obligatorio:
  //     { description: string, args: ZodRawShape, execute(args, ctx): Promise<string> }
  //   execute devuelve string JSON con { ok: true, data } | { ok: false, error }. Nunca lanza.
  export {}
  ```
- `src/server.ts`:
  ```ts
  // TODO (slice 07): API HTTP (POST /api/chat, GET /api/sessions/:id, GET /api/health)
  //   + ciclo del agente con tope de iteraciones (CA1) y logging a out/log.jsonl (CA4).
  export {}
  ```

**Tipos de retorno de scripts** (expectativa, no código):
- `bun run demo` → exit 0, stdout contiene exactamente la línea `pendiente — slice 00 solo valida compilación`.
- `bun run typecheck` → exit 0, 0 errores.

**Códigos de error esperados** (del slice): ninguno. Si algo falla aquí es un bug.

## 6. Tareas en orden

1. [ ] **T1 · Precheck del move**: ejecutar `grep -rn "fixtures/reto-01" reto-01/fixtures/` para confirmar que ningún fixture referencia la ruta vieja internamente (ya verificado por planner — repetir por idempotencia).
2. [ ] **T2 · Mover fixtures (opción B)**:
   - `mv reto-01/fixtures/reto-01/casos reto-01/fixtures/casos`
   - `mv reto-01/fixtures/reto-01/glosario-campos.json reto-01/fixtures/glosario-campos.json`
   - `mv reto-01/fixtures/reto-01/repositorio reto-01/fixtures/repositorio`
   - `rmdir reto-01/fixtures/reto-01`
   - Verificación post: `test -f reto-01/fixtures/glosario-campos.json && test -d reto-01/fixtures/casos && test -d reto-01/fixtures/repositorio && ! test -e reto-01/fixtures/reto-01`.
3. [ ] **T3 · Actualizar referencia en `.claude/agents/coordinator.md`**: reemplazar `reto-01/fixtures/reto-01/` por `reto-01/fixtures/`.
4. [ ] **T4 · Crear `reto-01/.gitignore`** con: `node_modules/`, `out/`, `.env`, `.DS_Store`, `*.log`.
5. [ ] **T5 · Crear `reto-01/package.json`**:
   - `"name": "reto-01-perxia"`, `"private": true`, `"type": "module"`.
   - `"dependencies": { "zod": "^3.23.0" }`.
   - `"devDependencies": { "typescript": "^5.5.0", "@types/bun": "latest" }`.
   - `"scripts": { "demo": "bun run demo.ts", "typecheck": "bun x tsc --noEmit", "dev": "echo 'TODO: slice servidor'" }`.
6. [ ] **T6 · Crear `reto-01/tsconfig.json`** con:
   - `"target": "ES2022"`, `"module": "ESNext"`, `"moduleResolution": "bundler"`.
   - `"strict": true`, `"noImplicitAny": true`, `"noEmit": true`.
   - `"esModuleInterop": true`, `"skipLibCheck": true`.
   - `"types": ["bun"]`.
   - `"include": ["demo.ts", "src/**/*"]`.
7. [ ] **T7 · Crear placeholders TS**:
   - `reto-01/src/tools/proveedor.ts` (ver §5).
   - `reto-01/src/llm/adapter.ts` (ver §5).
   - `reto-01/src/llm/placeholder.ts` (ver §5).
   - `reto-01/src/server.ts` (ver §5).
8. [ ] **T8 · Crear placeholders MD y carpetas**:
   - `reto-01/agent/prompt.md` con TODO 1-línea.
   - `reto-01/src/knowledge/registro-proveedor.md` con TODO 1-línea.
   - `reto-01/web/.gitkeep` vacío.
9. [ ] **T9 · Crear `reto-01/.env.example`** con las claves listadas en spec §2, sin valores.
10. [ ] **T10 · Crear `reto-01/demo.ts`**:
    ```ts
    import "./src/tools/proveedor"
    console.log("pendiente — slice 00 solo valida compilación")
    ```
11. [ ] **T11 · Crear `reto-01/README.md`** con:
    - Sección "Arranque local": `cd reto-01 && bun install && bun run demo`.
    - Sección "Variables de entorno": enumerar las de `.env.example` con una línea de propósito.
    - Nota: "Las rutas del PRD §6.5 muestran `fixtures/reto-01/`. En este repo los fixtures viven en `reto-01/fixtures/` (sin carpeta intermedia); las herramientas usan esta ruta."
    - Scripts disponibles: `bun run demo`, `bun run typecheck`, `bun run dev` (placeholder).
12. [ ] **T12 · Crear `reto-01/SOLUCION.md`** con los 10 encabezados de PRD §9.1, cada sección con `_TODO (slice posterior)_`.
13. [ ] **T13 · Instalar y verificar**:
    - `cd reto-01 && bun install` → exit 0, `node_modules/` y `bun.lockb` creados.
    - `bun x tsc --noEmit` → exit 0, 0 errores.
    - `bun run demo` → exit 0, stdout `pendiente — slice 00 solo valida compilación`.
14. [ ] **T14 · Limpiar `.DS_Store`**: `find reto-01 -name '.DS_Store' -delete`.
15. [ ] **T15 · Checklist final de AC**: correr los 8 checks del §8 ("Estrategia de verificación") y reportar al coordinator.

## 7. Mapeo criterio → tarea

| Criterio (spec) | Tarea(s) | Cómo se verifica |
|---|---|---|
| AC-1 (estructura §6.5) | T2, T5–T10 | `find reto-01 -maxdepth 3 -not -path '*/node_modules/*' -not -path '*/.git/*'` lista todos los archivos de la tabla §4; carpetas `agent`, `src/{tools,llm,knowledge}`, `web`, `fixtures`, `out` (esta última creada en runtime) existen bajo `reto-01/`. |
| AC-2 (`bun install` limpio) | T5, T13 | `cd reto-01 && bun install` termina exit 0 en < 60s en máquina con Bun instalado. |
| AC-3 (`tsc --noEmit` pasa) | T6, T7, T10, T13 | `cd reto-01 && bun x tsc --noEmit` termina exit 0, 0 errores; `rg "\\bany\\b" src demo.ts` no reporta `any` real (solo en comentarios TODO si aparece). |
| AC-4 (`bun run demo` exit 0 + mensaje) | T10, T13 | `cd reto-01 && bun run demo` termina exit 0, stdout contiene exactamente `pendiente — slice 00 solo valida compilación`. |
| AC-5 (`.env` ausente, `.env.example` presente y sin valores) | T4, T9 | `test ! -f reto-01/.env && test -f reto-01/.env.example`; `grep -E "=.+" reto-01/.env.example` no devuelve nada (todas las claves terminan en `=`). |
| AC-6 (README documenta arranque y env) | T11 | `grep -q "bun install" reto-01/README.md && grep -q "LLM_API_KEY" reto-01/README.md`. |
| AC-7 (`.gitignore` cubre node_modules/out/.env) | T4 | `grep -q "^node_modules" reto-01/.gitignore && grep -q "^out" reto-01/.gitignore && grep -q "^\\.env$" reto-01/.gitignore`. |
| AC-8 (deps justificadas; `zod` presente) | T5, T11 | `jq '.dependencies | keys' reto-01/package.json` = `["zod"]`; devDeps `typescript`, `@types/bun` mencionadas en README como herramientas de build (justificación §8). |

## 8. Estrategia de verificación

Comandos a correr en orden tras T14, todos desde la raíz del repo:

```bash
# Estructura
find reto-01 -maxdepth 3 \
  -not -path '*/node_modules/*' -not -path '*/.git/*' \
  | sort

# Instalación
cd reto-01 && bun install

# Typecheck
bun x tsc --noEmit

# Demo
bun run demo
# → stdout: pendiente — slice 00 solo valida compilación
# → exit 0

# Env hygiene
test ! -f .env && echo "ok: no .env"
grep -E "=.+" .env.example && echo "FALLA: .env.example tiene valores" || echo "ok: .env.example sin valores"

# gitignore hygiene
for pat in "node_modules" "out" "\\.env$" "\\.DS_Store"; do
  grep -qE "$pat" .gitignore && echo "ok: ignora $pat" || echo "FALLA: falta $pat"
done

# Fixture move
test -f fixtures/glosario-campos.json \
  && test -d fixtures/casos \
  && test -d fixtures/repositorio \
  && test ! -e fixtures/reto-01 \
  && echo "ok: fixtures reubicados"
```

Casos a correr: ninguno (sin herramientas aún).

Checks manuales adicionales: ninguno — todo es automatizable con los comandos arriba.

## 9. Riesgos y mitigaciones

- **Riesgo R1 · Drift PRD vs layout real.** El PRD referencia `fixtures/reto-01/...` en 7 lugares; nuestro layout no coincide tras el move.
  **Mitigación**: no modificar el PRD (es documento histórico y autoridad de requisitos, no la fuente de rutas); el README nota explícitamente la divergencia y las herramientas de slices posteriores usan `reto-01/fixtures/` relativo a `ctx.directory`.
- **Riesgo R2 · `bun x tsc` requiere TypeScript resolvible.** Si Bun no encuentra `tsc`, el typecheck falla.
  **Mitigación**: `typescript` queda en `devDependencies`; T13 valida tras `bun install`. Alternativa documentada: `bunx typescript tsc --noEmit`.
- **Riesgo R3 · `@types/bun` quiebra con versiones recientes.** El tipo `Bun.*` puede exigir TS 5.x.
  **Mitigación**: fijar `typescript: ^5.5.0`; si falla, el implementer baja a `bun-types` como fallback (ambos empaquetan los tipos globales de Bun).
- **Riesgo R4 · Dependencias no justificadas.** `typescript` y `@types/bun` son devDeps y PRD §8 exige justificar las de producción; aun así el reviewer puede marcarlo.
  **Mitigación**: README incluye una línea "Dependencias de build: typescript (type-check), @types/bun (tipos del runtime)".
- **Riesgo R5 · Move con fixtures no tracked.** Las fixtures aún no están en git (initial commit solo incluyó README). `git mv` no aplica; usamos `mv` plano. Las nuevas rutas quedarán como untracked hasta que el usuario pida un commit.
  **Mitigación**: documentar en el reporte final que las fixtures quedan untracked; `git add` queda a decisión del usuario (regla "no commitear sin instrucción").
- **Riesgo R6 · `.DS_Store` ya presente en la raíz del repo.** Afecta cosmética pero no funcionalidad. T14 lo borra bajo `reto-01/`; el `.DS_Store` de la raíz del repo (fuera de `reto-01/`) queda fuera de alcance de este slice.
  **Mitigación**: el `.gitignore` del slice solo cubre `reto-01/`; para la raíz, slice posterior o acción manual del usuario.

## 10. Dudas abiertas

Ninguna. Las dos del spec quedaron resueltas (Bun + opción B). Las decisiones de borde (nombre del placeholder LLM, naming de scripts, redacción del aviso en README) están tomadas dentro de este plan y pueden ajustarse en implementer sin recabar al usuario.
