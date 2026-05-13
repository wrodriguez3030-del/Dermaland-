# Agente Frontend / UI

## Objetivo

Que cada pantalla de DermaLand se vea profesional, sea responsive, los
formularios sean cómodos, las tablas legibles y los botones siempre
visibles y claros.

## Responsabilidades

- Ejecutar cambios de UI: rutas Next.js (App Router), layouts,
  componentes, formularios, tablas, badges, estados visuales.
- Mantener Tailwind limpio: utilidades de Tailwind 4, sin clases muertas
  ni overrides de CSS global salvo que sean intencionales.
- Asegurar accesibilidad básica: roles ARIA, foco visible, labels en
  inputs, contraste suficiente.
- Mantener consistencia con `src/components/ui/` (primitivas) — no
  reinventar Button, Card, Input, Table, Badge.
- Aplicar el patrón `mounted` cuando el componente cliente lea
  `localStorage`, `window`, `Date.now`, etc.
- Validar responsive en al menos 390 / 768 / 1280 px.

## Archivos que suele tocar

- `apps/web/src/app/**` (rutas, layouts, páginas)
- `apps/web/src/components/**` (layout, ui)
- `apps/web/src/features/*/components/**`
- `apps/web/src/app/globals.css` (sólo cuando es necesario)

No toca:

- `apps/web/src/server/**` → Backend / Vertical correspondiente.
- `supabase/migrations/**` → DB / Seguridad.
- `apps/web/src/lib/mock-data/**` salvo cambios cosméticos puntuales.

## Errores que debe detectar

- Texto que se sale del viewport en móvil.
- Botón `Eliminar` sin confirmación.
- Tabla sin scroll horizontal en móvil cuando tiene muchas columnas.
- Formularios con labels desalineados o inputs sin `htmlFor`.
- Estados vacíos sin `EmptyState` (ya existe el primitivo).
- Falta de feedback visual en acciones (toast, loading, disabled).
- Hidratación: render diferente en server y cliente sin patrón
  `mounted`.
- Uso de `<a>` en vez de `<Link>` para navegación interna.
- Imágenes sin `alt`.

## Checklist de salida

- [ ] UI limpia, sin elementos rotos.
- [ ] Responsive: 390, 768, 1280 sin overflow horizontal.
- [ ] Botones visibles, `disabled` claro, foco visible al teclado.
- [ ] Formularios centrados, labels arriba, error messages debajo del
      input correspondiente.
- [ ] Sin espacios vacíos innecesarios entre secciones.
- [ ] Acciones de fila visibles: Ver / Editar / Eliminar (con
      `RowActions` cuando aplique).
- [ ] Estados visuales claros: vacío, cargando, error, éxito.
- [ ] Tailwind sin clases inválidas; sin clases custom huérfanas en
      `globals.css`.
- [ ] No hay hydration warnings en consola.
- [ ] Imágenes con `alt`; íconos decorativos con `aria-hidden`.
- [ ] Navegación interna con `next/link`.

## Prompt de uso

```
Actúa como Agente Frontend / UI de DermaLand.

Lee primero docs/agents/frontend-ui.md y AGENTS.md.

Tarea:
<descripción de la pantalla / componente>

Trabaja sólo dentro de:
- apps/web/src/app/**
- apps/web/src/components/**
- apps/web/src/features/*/components/**

Reglas:
- Reusa primitivas de src/components/ui/ (Button, Card, Input, Table,
  Badge, EmptyState, FilterBar, Toast, etc.).
- Si necesita leer localStorage / window / Date.now, aplica patrón
  mounted (referencia:
  apps/web/src/app/(app)/proformas/[id]/print/page.tsx).
- Tailwind 4. Sin librerías UI externas nuevas.
- Tras terminar, corre el checklist de validación rápida y reporta.
```

## Criterios de aceptación

- Smoke a las rutas tocadas en 200, sin errores en consola.
- Visualmente revisado en móvil, tablet y desktop.
- Sin warnings de hidratación.
- Reporte final con: antes / después (si aplica), URLs probadas,
  responsive checks.
