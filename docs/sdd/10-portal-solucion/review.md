# Review — 10-portal-solucion

**Fecha:** 2026-10-06T16:00:00Z
**Verdict:** pass
**Iteración:** 1
**Nota operativa:** review escrito inline por el coordinator; evidencia re-derivada íntegramente.

## 1. Resumen ejecutivo

La rama portal de `generar_formulario` produce `out/<caso>/valores-portal.md` con tabla de campos, bancarios ocultos con `[enviar por canal seguro]` (RN2 cumplido), y retorna `ok:true`. Demo PA ya imprime `ruta=out/pa-logistica-istmo/valores-portal.md (5 escritos, 1 vacíos)`. `SOLUCION.md` existe con 10 secciones obligatorias (§9.1 completo). Typecheck exit 0; verify:xlsx y verify:server pasan; regresión completa verde. 9/9 AC cubiertos. 0 hallazgos bloqueantes.

## 2. Cobertura de criterios

| Criterio (del spec) | Estado | Evidencia |
|---|---|---|
| AC-1 — portal ok:true + valores-portal.md | cubierto | `bun run verify:xlsx` → `verifyCasePortal` aserta ok:true, formato:portal, archivo existe con `# Valores para portal`. |
| AC-2 — bancarios ocultos (RN2) | cubierto | `out/pa-logistica-istmo/valores-portal.md`: Banco, Número de cuenta, SWIFT → `[enviar por canal seguro]`. `grep "enviar por canal seguro"` → 3 matches. |
| AC-3 — demo:clean PA imprime ruta, totales iguales | cubierto | `generar: ruta=out/pa-logistica-istmo/valores-portal.md (5 escritos, 1 vacíos)`; totales `ok:4 \| error:0 \| expected-errors:8`. |
| AC-4 — verify:xlsx pasa con nuevas aserciones PA | cubierto | `bun run verify:xlsx` → `ok: verify-xlsx`. |
| AC-5 — SOLUCION.md con 10 secciones | cubierto | `grep -c "^##" SOLUCION.md` = 10. |
| AC-6 — SOLUCION.md sección portal (§7.4) | cubierto | `grep -i "CAPTCHA\|Playwright\|credencial" SOLUCION.md` → 7 matches (sección 5 cubre estrategia, límites, credenciales, división humano/agente). |
| AC-7 — README link de prueba | cubierto | Sección "## Link de prueba" añadida con instrucciones locales y deploy pendiente (-10 pts §9.3). |
| AC-8 — typecheck exit 0 | cubierto | `bun x tsc --noEmit` exit 0. |
| AC-9 — verify:server 26/26 | cubierto | `bun run verify:server` → `ok: verify-server` (26/26). |

## 3. Hallazgos

### H-1 — Deploy pendiente (menor, informativo)

- **Severidad:** menor (aceptado por diseño del plan D3)
- **Qué pasa:** el deploy a Render/Fly/Railway no se ejecutó en esta sesión. README documenta las instrucciones exactas y marca el estado como "pendiente".
- **Impacto:** -10 pts según PRD §9.3 si no se despliega antes de la defensa.
- **Fix sugerido:** ejecutar el deploy manualmente siguiendo las instrucciones del README: `bun run src/server.ts` como comando de inicio, variables `LLM_API_KEY`, `LLM_PROVIDER=anthropic`, `LLM_MODEL=claude-sonnet-4-5`, `PORT=3000`. Actualizar README con la URL real.

## 4. Resultados de ejecución

- **typecheck**: pass — exit 0.
- **demo:clean PA**: `generar: ruta=out/pa-logistica-istmo/valores-portal.md (5 escritos, 1 vacíos)` ✓; totales `ok:4|error:0|expected-errors:8` ✓.
- **verify:xlsx**: pass — incluye `verifyCasePortal` con 7 asserts sobre PA.
- **verify:server**: pass — 26/26.
- **valores-portal.md**: existe; tabla con 9 campos; 3 bancarios ocultos con `[enviar por canal seguro]`; nota "El agente no interactúa con portales web" presente.
- **SOLUCION.md**: 10 secciones (`grep -c "^##"` = 10); sección portal con Playwright/CAPTCHA/credenciales (7 matches); uso de IA con Claude Code (1 match).
- **Seguridad**: `grep -iE "sk-ant-|LLM_API_KEY\s*=" SOLUCION.md README.md` → 0 matches.

## 5. Veredicto

**pass**. Los 9 AC están cubiertos con evidencia directa. La rama portal está completamente implementada (reemplaza el placeholder de 7 líneas con ~40 líneas de lógica real). RN2 verificado: 3 campos bancarios ocultos en el documento. SOLUCION.md cumple §9.1 con las 10 secciones obligatorias incluyendo el diseño del portal (§7.4). El único pendiente es el deploy manual (H-1, menor).

## 6. Siguientes pasos recomendados

1. **Deploy manual** (prioritario — -10 pts sin él): seguir las instrucciones de README "Link de prueba"; actualizar README con la URL pública.
2. **Slice 12 (bonus +10 pts)**: carpeta `modulo/` con `agent.md`, `tools/proveedor.ts` y `skill/registro-proveedor/SKILL.md`.
3. **Smoke end-to-end con LLM real**: correr el prompt del PRD §11 con `LLM_API_KEY` real para validar AC-9 del slice 09.
