# Spec — 00-esqueleto

**Slice:** esqueleto del proyecto
**Autoridad:** `reto-01/PRD.md` §6.5, §8, §9.2
**Fecha:** 2026-10-05

## 1. Resumen en una frase
Dejar la estructura de carpetas, dependencias mínimas y `demo.ts` compilable, tal que cualquier slice posterior pueda enchufar su herramienta sin tocar fontanería.

## 2. Alcance

**En alcance**
- Estructura de directorios exactamente como PRD §6.5:
  ```
  reto-01/
  ├── agent/prompt.md
  ├── src/server.ts
  ├── src/llm/adapter.ts
  ├── src/llm/<proveedor>.ts        (placeholder, provider se elige en slice posterior)
  ├── src/tools/proveedor.ts
  ├── src/knowledge/registro-proveedor.md
  ├── web/                           (placeholder .gitkeep; front se construye luego)
  ├── fixtures/                      (ya existe — no se toca)
  ├── out/                           (se crea en runtime; .gitignore)
  ├── demo.ts
  ├── .env.example
  ├── package.json
  ├── tsconfig.json
  ├── README.md
  └── SOLUCION.md                    (placeholder)
  ```
- `package.json` con `zod` como única dependencia de producción justificada por PRD §6.2 ("`zod` obligatorio"). Scripts: `dev`, `demo`, `typecheck`.
- `tsconfig.json` strict, `noImplicitAny`, target compatible con Bun/Node 20+.
- `.env.example` con `LLM_PROVIDER=`, `LLM_API_KEY=`, `LLM_MODEL=`, `AGENT_MAX_ITERATIONS=25`, `SESSION_TOKEN_LIMIT=` (sin valores).
- `.gitignore` que ignora `node_modules/`, `out/`, `.env`, `.DS_Store`.
- `demo.ts` placeholder que importa de `src/tools/proveedor.ts`, no requiere clave LLM, y al correrse imprime "pendiente — slice 00 solo valida compilación".
- `README.md` con sección "Arranque local" (comando único) y "Variables de entorno".
- Archivos placeholder (`agent/prompt.md`, `src/knowledge/registro-proveedor.md`, `src/server.ts`, `src/llm/adapter.ts`, `src/tools/proveedor.ts`) con comentarios TODO explicando qué va ahí.

**Fuera de alcance**
- Implementación real de cualquier herramienta.
- Adaptador LLM concreto (slice posterior).
- Front web (slice posterior).
- Lógica de servidor HTTP.
- `SOLUCION.md` completo (solo plantilla con secciones vacías).

## 3. Criterios de aceptación (literales / derivados del PRD)

| # | Criterio | Fuente PRD |
|---|---|---|
| AC-1 | Estructura de carpetas idéntica a §6.5 (todos los archivos listados existen). | §6.5 |
| AC-2 | `bun install` corre sin error en una máquina limpia. | §8 "Arranque" |
| AC-3 | `bun x tsc --noEmit` pasa sin errores. | §8 "Legibilidad: TypeScript sin `any`" |
| AC-4 | `bun run demo.ts` termina con código 0 y escribe mensaje "pendiente — slice 00 solo valida compilación". | §6.6 (`demo.ts` corre sin clave) |
| AC-5 | `.env` NO existe en el repo; `.env.example` SÍ existe y no contiene valores. | §8 "Seguridad" |
| AC-6 | `README.md` documenta el comando único de arranque y las variables de entorno. | §9.2 |
| AC-7 | `.gitignore` excluye `node_modules/`, `out/`, `.env`. | §9.5 ("sin node_modules/, sin out/, sin .env") |
| AC-8 | `package.json` lista `zod` y justifica cualquier otra dependencia en `SOLUCION.md` o `README.md`. | §8 "Dependencias" |

## 4. Reglas del PRD que aplican

- **§6.5** — estructura obligatoria.
- **§6.2** — `zod` obligatorio.
- **§8** — arranque < 2min, sin `any`, clave solo en env.
- **§9.5** — sin `node_modules/`, `out/`, `.env` en el repo.

## 5. Dependencias con otros slices
Ninguna. Este slice es prerrequisito de todos los siguientes.

## 6. Decisiones (resueltas)
- **Runtime: Bun.** Scripts `bun run demo`, `bun install`, `bun x tsc --noEmit`. Node 20+ queda documentado como fallback aceptable en el README pero no se configura.
- **Raíz del proyecto: `reto-01/` (opción B).** Se **mueve** `reto-01/fixtures/reto-01/*` → `reto-01/fixtures/*`. La carpeta intermedia `fixtures/reto-01/` se elimina.
  - Riesgo: cualquier ruta ya referenciada a `fixtures/reto-01/...` debe reescribirse. Hoy el único archivo que menciona esa ruta es el propio PRD y el `index.json` de soportes (que usa rutas relativas internas: no se afecta). Verificar con grep antes de mover.
  - Mitigación: el implementer hace el `git mv` en una tarea discreta y verifica con grep post-move que no quedan referencias colgantes.
