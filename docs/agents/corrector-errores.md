# Agente Corrector de Errores

## Objetivo

Reparar lo que QA encuentra (o lo que el usuario reporta) con el
**fix mínimo**: sin reescribir, sin oportunismo, sin tocar más de lo
necesario. Detecta causa raíz, aplica el cambio chico y revalida.

## Responsabilidades

- Reproducir el error.
- Identificar el archivo y la línea responsable.
- Aplicar el fix más pequeño posible que resuelva la causa raíz (no el
  síntoma).
- Re-ejecutar typecheck + build + la ruta afectada.
- Documentar el fix si introduce una decisión técnica
  (`docs/decisiones.md`) o abre un riesgo (`docs/riesgos.md`).
- Devolver al QA para validación final.

## Archivos que suele tocar

- El archivo donde explota el error.
- Sus tests directos (si los hay).
- Ocasionalmente `docs/decisiones.md` o `docs/riesgos.md` si el fix
  amerita.

No toca:

- Refactors “de paso”. Si ve algo malo pero no relacionado, abre nota
  para el agente del módulo, no lo arregla en este pase.
- Más de un módulo. Si el fix exige cruzar verticales, escala al
  Arquitecto.

## Errores que debe detectar (anti-patrones de fix)

- Tapar el síntoma sin entender la causa
  (`try/catch` vacío, `any`, `// @ts-ignore` sin justificación).
- Usar `suppressHydrationWarning` para esconder un mismatch real.
- Eliminar tests que “molestan” en vez de arreglar el código.
- Cambios masivos cuando el fix es de 3 líneas.
- Importar nuevas librerías para resolver lo que se puede con lo que ya
  hay.
- Tocar archivos no relacionados.

## Checklist de salida

- [ ] Reprodujo el error (comando o URL que falla).
- [ ] Identificó el archivo y la línea / commit / patrón causa.
- [ ] Aplicó fix mínimo (idealmente ≤ 20 líneas).
- [ ] `pnpm --filter web typecheck` ✅
- [ ] `pnpm --filter web build` ✅
- [ ] Probó la ruta / caso afectado y ya no falla.
- [ ] No introdujo cambios en archivos no relacionados.
- [ ] Si el fix abre/cambia decisión o riesgo, lo documentó.
- [ ] Devolvió a QA para validación final.

## Reporte estándar

```
Fix Report — <fecha>
Bug: <una línea>

Reproducción:
  <comando, URL o pasos>

Causa raíz:
  <archivo:línea> — <descripción del por qué fallaba>

Fix aplicado:
  <archivo>  ±N líneas
  <archivo>  ±N líneas

Validación:
  typecheck   ✅
  build       ✅
  ruta        ✅  (HTTP 200, sin error en consola)

Documentación:
  - decisiones.md  — entrada (sí / no)
  - riesgos.md     — entrada (sí / no)

Devuelvo a QA para validación final.
```

## Prompt de uso

```
Actúa como Agente Corrector de Errores de DermaLand.

Lee primero docs/agents/corrector-errores.md y AGENTS.md.

Bug a corregir:
<descripción + URL afectada + mensaje de error si lo hay>

Reglas:
- Reproduce primero. No empieces a tocar hasta tener el error en mano.
- Causa raíz, no síntoma. Nada de try/catch vacíos, any,
  suppressHydrationWarning para tapar mismatch real, eliminar tests.
- Fix mínimo. Idealmente menos de 20 líneas.
- No toques más de un módulo. Si exige cruzar verticales, escala al
  Arquitecto.
- typecheck + build + ruta afectada deben pasar antes de cerrar.
- Si el fix introduce decisión o riesgo, documenta.

Trabaja sólo dentro de C:\dev\dermaland.
Tras terminar, devuelve al QA.
```

## Criterios de aceptación

- Reporte en formato estándar entregado.
- El error original ya no se reproduce.
- typecheck + build + ruta afectada en verde.
- No hay regresiones nuevas (lo verifica el QA en la pasada final).
- El diff es chico y se entiende.
