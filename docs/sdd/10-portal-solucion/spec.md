# Spec — 10-portal-solucion

**Slice:** Rama portal (`valores-portal.md`) + `SOLUCION.md` + deploy (slices 10 y 11 del plan original, combinados)
**Autoridad:** `reto-01/PRD.md` §6.2 HU-3 P2, §7.4, §9.1, §9.2, §9.3
**Fecha:** 2026-10-06
**Depende de:** slices 00–09 cerrados.

## 1. Resumen en una frase

Completar la rama `portal` de `generar_formulario` para que produzca `out/<caso>/valores-portal.md` (en vez del error placeholder actual), escribir `SOLUCION.md` con las 10 secciones obligatorias del PRD §9.1, y documentar el deploy en README.

## 2. Alcance

**En alcance**

### Parte A — Rama portal (`valores-portal.md`)

- **`src/tools/proveedor.ts`** — reemplazar el bloque `if (formato === "portal")` que hoy devuelve `{ ok: false, error: "formato portal no implementado..." }` por la implementación real:
  - Leer `plantilla-campos.json` del caso (ya existe en `pa-logistica-istmo/`; PA es el único caso portal en los fixtures).
  - Construir un mapeo `etiqueta → valor` desde `mapeo.llenos` (igual que xlsx/pdf).
  - Escribir `out/<caso>/valores-portal.md` con:
    - Encabezado `# Valores para portal — <cliente>`
    - Metadatos: caso, país, fecha de generación.
    - Tabla markdown con columnas `Campo | Valor | Obligatorio` para cada campo en `plantilla-campos.json`.
    - Nota: `**Nota: estos valores son para copiar manualmente en el portal del cliente. El agente no interactúa con portales web.**`
  - Devolver `{ ok: true, data: { ruta: "out/<caso>/valores-portal.md", formato: "portal" } }`.
  - Si `plantilla-campos.json` no existe → `{ ok: false, error: "plantilla-campos.json ausente para caso <nombre>" }`.
  - Campos marcados como bancarios (banco, número de cuenta, SWIFT, IBAN) → poner valor `[enviar por canal seguro]` en la tabla en lugar del valor real (RN2 — bancarios no en documentos compartibles). Detectar bancarios por nombre normalizado: si `normalizar(etiqueta)` contiene alguna de: `banco`, `cuenta`, `swift`, `iban`, `numero de cuenta`.
- **`demo.ts`** — actualizar la línea `generar: skipped (formato portal)` para el caso PA:
  - Ahora debe imprimir `generar: ruta=out/pa-logistica-istmo/valores-portal.md (portal, N campos)`.
  - El `errCount` no cambia (PA antes era "skipped", no error).
- **`src/scripts/verify-xlsx.ts`** — actualizar la aserción que verifica que PA no produce xlsx (sigue siendo verdad) y añadir aserción de que PA **sí** produce `valores-portal.md` con las secciones esperadas.

### Parte B — `SOLUCION.md`

Crear `reto-01/SOLUCION.md` con las **10 secciones obligatorias** del PRD §9.1:

1. **Problema en una frase** y a quién le duele.
2. **Arquitectura**: diagrama ASCII front → backend → herramientas → archivos; dónde vive el prompt, el conocimiento y la ejecución.
3. **Ciclo del agente**: bucle, tope de iteraciones (CA1), confirmación humana (CA3), logging (CA4).
4. **Elección del modelo**: Anthropic `claude-sonnet-4-5`, por qué, costo estimado por caso procesado.
5. **Diseño del portal web** (§7.4): estrategia de automatización (browser-use/playwright), límites (CAPTCHA/MFA), dónde viven credenciales, qué hace el agente vs qué hace el humano.
6. **Decisiones y trade-offs**: mínimo 3 con alternativa descartada y por qué (Bun vs Node, vanilla HTML vs React, in-memory sessions vs persistencia, etc.).
7. **Supuestos** al interpretar el PRD.
8. **Cobertura**: tabla HU-1 a HU-5 con estado (hecho/parcial/no hecho) y qué faltaría para producción.
9. **Uso de IA**: Claude Code (claude-sonnet-4-6) para todo el desarrollo bajo el proceso SDD; qué se descartó de lo propuesto y por qué.
10. **Riesgos** de llevar a producción y mitigaciones.

### Parte C — README final y deploy

- **`README.md`** — añadir sección "Link de prueba" con la URL pública del deploy (o instrucción de cómo correrlo localmente si no hay deploy aún).
- **Deploy** — desplegar en Render, Fly.io, Railway u otro proveedor gratuito. Variables de entorno: `LLM_API_KEY`, `LLM_PROVIDER=anthropic`, `LLM_MODEL=claude-sonnet-4-5`. El front se sirve desde el mismo proceso (`GET /`). Actualizar README con la URL real.
  - Si el deploy no es posible en esta sesión: documentar en README las instrucciones locales exactas y marcar como "pendiente deploy" con `-10 pts` aceptados según §9.3.

**Fuera de alcance**
- Slice 12 (módulo reutilizable, bonus +10).
- Autenticación, streaming, persistencia.
- Implementación real de portales (CAPTCHA, browser automation).

## 3. Criterios de aceptación

| # | Criterio | Fuente PRD |
|---|---|---|
| AC-1 | `generar_formulario` con `formato=portal` devuelve `{ ok: true, data: { ruta: "out/<caso>/valores-portal.md", formato: "portal" } }` y el archivo existe con encabezado, tabla de campos y nota SIMULADO. | §6.2 HU-3 P2 |
| AC-2 | Campos bancarios en `valores-portal.md` muestran `[enviar por canal seguro]` en vez del valor real (RN2). | §7.3 RN2 |
| AC-3 | `bun run demo:clean` produce `generar: ruta=out/pa-logistica-istmo/valores-portal.md` para PA; `ok:4 | error:0 | expected-errors:8` sin cambios. | Regresión §6.6 |
| AC-4 | `bun run verify:xlsx` (o nuevo `verify:portal`) verifica que `valores-portal.md` existe con secciones esperadas; los 7 verify previos siguen verdes. | Regresión |
| AC-5 | `SOLUCION.md` existe con las 10 secciones del PRD §9.1 (verificable por `grep` de los encabezados). | §9.1 obligatorio |
| AC-6 | `SOLUCION.md` sección 5 (diseño portal) menciona: estrategia de automatización, límites (CAPTCHA/MFA), manejo de credenciales, división humano/agente. | §7.4 |
| AC-7 | `README.md` tiene link de prueba (URL pública o instrucción local clara). | §9.2 |
| AC-8 | `bun x tsc --noEmit` exit 0 tras cambios a `src/tools/proveedor.ts`. | §8 |
| AC-9 | `bun run verify:server` sigue 26/26. | Regresión |

## 4. Reglas del PRD que aplican

- **§6.2 HU-3 P2** — `valores-portal.md` con valores listos para copiar.
- **§7.3 RN2** — bancarios solo por canal seguro; no en documentos.
- **§7.4** — diseño documentado del portal web (no implementación).
- **§9.1** — 10 secciones obligatorias en `SOLUCION.md`.
- **§9.2** — README con instrucciones de arranque y link.
- **§9.3** — URL pública activa durante la defensa (-10 si solo local).

## 5. Dependencias

- **Requiere**: slices 00–09 cerrados.
- **Es el último slice de desarrollo** (slice 12 es bonus opcional).

## 6. Decisiones

1. **`valores-portal.md` reemplaza el error placeholder** en la misma función `generar_formulario` — no se añade una nueva herramienta. El PRD §6.2 dice que el agente "responde con `formato no soportado` **y** produce `valores-portal.md`"; la implementación produce el archivo y devuelve `ok: true` con la ruta, lo que es más útil para el agente y para el usuario.
2. **Bancarios ocultos en portal** (RN2 por diseño): detectados por nombre normalizado. Alternativa (flag en maestro.json) descartada por complejidad innecesaria.
3. **`SOLUCION.md` escrito en este slice** (no en un slice dedicado) porque es documentación que describe todo lo construido en los slices anteriores.
4. **Deploy**: se intenta en esta sesión. Si falla por restricciones de red/CLI, se documenta el proceso exacto en README para hacerlo manualmente.

## 7. Dudas abiertas

Ninguna.
