# Próximos pasos — DermaLand

> Lista priorizada. Marca con `[x]` lo que cierres y mueve a la sección
> "Hecho recientemente" con la fecha. Léelo después de
> `docs/estado-actual.md`.

**Última actualización:** 2026-05-07

## Prioridad 0 — bloqueantes

Cosas que rompen el flujo principal o impiden seguir construyendo.

- [ ] **Validar manualmente POS en Chrome real** (resoluciones 1280,
      1440, 1920 + iPad horizontal): reglas de pago, impresión 80mm,
      "Generar PDF", emisión de factura simulada para los 6 escenarios
      definidos en `docs/decisiones.md` § 2026-05-07 POS.
- [ ] **Confirmar reglas documentales con el negocio** (R-FIS-01).
      Ajustar `resolveDocumentToIssue` si hace falta y añadir tests por
      cada caso ajustado.

## Prioridad 1 — corregir errores críticos

- [ ] Probar con datos reales de catálogo para detectar regresiones de
      cálculo (subtotal, descuento global, ITBIS, total).
- [ ] Verificar que la sesión de caja abierta sea requisito para emitir
      desde POS (gate UI + validación servidor cuando entre Supabase).
- [ ] Revisar `Receipt80mm` en impresora térmica física, no sólo
      "Guardar como PDF".
- [ ] Audit hidratación en otras páginas que lean `localStorage`
      (`/proformas`, `/clientes` si lo hacen). Reusar
      `apps/web/tests/hydration-proforma-print.mjs` como plantilla.

## Prioridad 2 — mejoras de UX

- [ ] **Mejorar productos con fotos** (agente `imagenes-productos`).
      Llenar lo pendiente, marcar `imageStatus` por producto, generar
      `data/product-image-import-report.json`.
- [ ] Mejorar responsive del POS en monitor ancho 4K (validar que el
      grid 2xl:5 cols no queda demasiado pequeño).
- [ ] Botón "Nueva venta" más visible en el panel de venta emitida.
- [ ] Atajo de teclado para alternar método de pago (1·2·3 = cash · card
      · transfer).
- [ ] Búsqueda fonética / por SKU parcial en POS más tolerante.

## Prioridad 3 — backend real

- [ ] **Conectar Supabase** (`DATA_SOURCE=supabase`).
- [ ] Reemplazar mocks por repositorios reales en
      `apps/web/src/server/repositories/supabase/**`. Mantener el contrato
      de la factory.
- [ ] Activar **RLS por `business_id`** en todas las tablas de tenant.
- [ ] Plan de respaldos (Supabase backups + retención).
- [ ] Observabilidad: logs estructurados, métricas básicas.

## Prioridad 4 — fiscal

- [ ] **DGII real**: certificado, secuencias e-CF, envío y recepción
      de estados.
- [ ] Materializar `sequenceType` devuelto por `resolveDocumentToIssue`
      en el repositorio de secuencias (R-FIS-02).
- [ ] Conversión de proforma a e-CF (transición de status
      `issued` / `paid` → `pending_ecf` → `converted_to_ecf`).
- [ ] Pruebas con NCF de pre-producción DGII.

## Prioridad 5 — canales

- [ ] **WhatsApp Cloud API real**: webhook firmado, plantillas
      aprobadas, envío de tickets.
- [ ] **Agente IA real** (OpenAI / Claude): tools registradas, bloqueo
      de agendamiento intacto, observabilidad de costo por mensaje.
- [ ] Conectar IA con catálogo + recomendaciones.

## Prioridad 6 — calidad y CI/CD

- [ ] CI/CD verde end-to-end (lint + typecheck + test + build + e2e).
- [ ] Playwright E2E ampliado: flujo completo de venta + impresión.
- [ ] Smoke browser POS extendido al flujo de emisión real (no sólo
      indicador).
- [ ] Audit de accesibilidad básica (aria, foco, contraste).

## Prioridad 7 — go-live

- [ ] Cerrar `docs/production-checklist.md`.
- [ ] Hosting + dominio + SSL.
- [ ] Plan de rollback.
- [ ] Cierre de R-FIS-01 (reglas confirmadas) y R-FIS-02 (DGII real).
- [ ] Cierre del riesgo "proformas en localStorage" (R-POS-LOCAL).

---

## Hecho recientemente

| Fecha | Item |
|---|---|
| 2026-05-07 | Memoria persistente del proyecto: `CLAUDE.md`, `PROJECT_MEMORY.md`, `docs/contexto-general.md`, `docs/estado-actual.md`, `docs/proximos-pasos.md`, `docs/comandos-locales.md`. |
| 2026-05-07 | Rediseño POS: layout fluido + reglas documentales (`resolveDocumentToIssue`) + selector de pago explícito + indicador de documento + botón dinámico + aviso CF sin RNC. |
| 2026-05-07 | Sistema de agentes de desarrollo: `AGENTS.md` + 10 docs en `docs/agents/` + workflow + checklist + prompt. |
| 2026-05-07 | Fix hydration mismatch en `/proformas/[id]/print` (patrón `mounted`). |
