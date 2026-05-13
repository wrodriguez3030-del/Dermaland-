# Agente Clientes / CRM

## Objetivo

Que el alta, edición y selección de clientes sea limpia, sin duplicados,
con validaciones correctas y con los campos que el negocio necesita
(tipo de piel, tipo de facturación). Que el cliente fluya hacia el POS
sin fricción.

## Responsabilidades

- Listado de clientes con búsqueda y filtros.
- Alta de cliente nuevo: formulario, validaciones, formateo.
- Edición de cliente existente.
- Perfil de cliente: historial, preferencias, tipo de piel.
- Detección de duplicados (mismo documento, mismo teléfono).
- Tipo de facturación por defecto (consumo, fiscal, gubernamental,
  régimen especial).
- Tipo de piel como desplegable (no texto libre).

## Archivos que suele tocar

- `apps/web/src/features/customers/**` (billing, validators, types)
- `apps/web/src/app/(app)/clientes/**`
- `apps/web/src/server/repositories/{mock,supabase}/customers.ts`
- `apps/web/src/lib/mock-data/customers.ts`
- `apps/web/src/types/` (Customer, BillingType, SkinType)

No toca:

- Lógica fiscal del e-CF → vertical Fiscal.
- POS en sí → vertical POS (pero el cliente debe quedar disponible para
  selección).

## Errores que debe detectar

- Permite crear dos clientes con el mismo documento (cédula o RNC) sin
  aviso.
- Cédula RD no formateada (debe quedar como `XXX-XXXXXXX-X`).
- RNC no formateado (`X-XX-XXXXX-X`).
- Teléfono sin máscara (`(809) 555-1234`).
- Formulario que no se limpia o redirige tras guardar exitosamente.
- Tipo de facturación faltante (no se puede dejar vacío).
- Tipo de piel como input libre en vez de select.
- Campo `Tags` en el formulario de nuevo cliente (no debe existir en
  MVP).
- Cliente recién creado que no aparece en POS.
- Perfil de cliente sin link de regreso al listado.

## Checklist de salida

- [ ] Alta: no permite duplicados por documento; aviso claro si lo
      detecta.
- [ ] Cédula, RNC y teléfono se formatean al perder foco.
- [ ] Validación de cédula RD activa (longitud + dígito verificador
      cuando aplique).
- [ ] Tras guardar, el formulario se limpia o redirige al perfil /
      listado.
- [ ] Tipo de facturación tiene valor por defecto (`consumo` típicamente)
      y no se puede dejar vacío.
- [ ] Tipo de piel es un `<select>` con valores definidos en types.
- [ ] No hay campo `Tags` en el formulario de alta.
- [ ] Cliente recién creado aparece en el buscador del POS.
- [ ] Edición no rompe IDs ni desvincula relaciones existentes.
- [ ] Búsqueda en listado funciona por nombre, documento, teléfono.

## Prompt de uso

```
Actúa como Agente Clientes / CRM de DermaLand.

Lee primero docs/agents/clientes-crm.md, AGENTS.md.

Tarea:
<descripción del cambio en clientes>

Trabaja sólo dentro de:
- apps/web/src/features/customers/**
- apps/web/src/app/(app)/clientes/**
- apps/web/src/server/repositories/{mock,supabase}/customers.ts
- apps/web/src/lib/mock-data/customers.ts
- apps/web/src/types/ (Customer y afines)

Reglas:
- Sin duplicados por documento.
- Cédula / RNC / teléfono formateados.
- Tipo de facturación por defecto siempre presente.
- Tipo de piel como desplegable.
- Sin campo Tags en alta.
- Cliente nuevo debe aparecer en POS al instante.

Tras terminar, corre el checklist de validación rápida y verifica que
el cliente creado aparezca en /pos.
```

## Criterios de aceptación

- Smoke a `/clientes`, `/clientes/nuevo`, `/clientes/[id]`,
  `/clientes/[id]/editar` en 200.
- Crear cliente → aparece en listado y en POS.
- Crear cliente con documento ya existente → bloqueado o aviso.
- Editar cliente → cambios persisten.
- Sin hydration warnings.
