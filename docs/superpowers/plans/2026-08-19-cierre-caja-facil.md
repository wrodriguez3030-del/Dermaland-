# Cierre de caja fácil — Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cerrar caja con conteo por denominaciones, diferencia en vivo y ticket 80mm.

**Architecture:** Lógica pura probada en `features/sales/cash-count.ts`; el asistente reemplaza al `CerrarCajaButton` recibiendo el `ShiftDetail` de la página; el ticket reutiliza la clase `.receipt-80mm` y una página de impresión que recalcula el detalle server-side. La API `PATCH /api/cash/[id]` no cambia.

**Tech Stack:** Next.js App Router · React client modal existente · Vitest.

## Global Constraints

- Español es-DO; sin librerías UI nuevas; probar 390/768/1280.
- `pnpm --filter web typecheck|test|build` verdes antes de cada commit.
- SemVer + CHANGELOG al cerrar (v0.136.0).

### Task 1: `cash-count.ts` puro + tests (TDD)
- Create: `apps/web/src/features/sales/cash-count.ts`, `cash-count.test.ts`
- `RD_DENOMINATIONS = [2000,1000,500,200,100,50,25,10,5,1]`;
  `cashCountTotal(counts: Record<number, number>): number`;
  `differenceLabel(diff: number): {tone, label}` (umbral centavo: |d|<0.005 = ok).
- [ ] Test primero (falla) → implementar → verde → commit.

### Task 2: Asistente de cierre
- Create: `apps/web/src/app/(app)/caja/cerrar-caja.tsx` (nuevo `CerrarCajaButton` con prop `detail: ShiftDetail`)
- Modify: `caja/page.tsx` (importar del archivo nuevo y pasar `detail`), `caja/caja-actions.tsx` (quitar el viejo)
- [ ] Modo denominaciones (default) + modo total; resumen esperado; diferencia viva con color; botón que nombra la diferencia; estado de éxito con enlace al ticket; commit.

### Task 3: Ticket 80mm + página de impresión
- Create: `apps/web/src/features/sales/components/cash-closing-ticket.tsx`
- Create: `apps/web/src/app/(app)/caja/historial/[id]/print/page.tsx` (server: sesión de `history/current`, proformas y movimientos → `computeShiftDetail` → ticket + botón imprimir)
- Modify: `caja/historial/page.tsx` (enlace "Ticket" en filas cerradas)
- [ ] Implementar y commit.

### Task 4: Validación + docs + versión
- [ ] typecheck + suite + build; CHANGELOG v0.136.0; estado-actual; commit; push gitea; preguntar deploy.
