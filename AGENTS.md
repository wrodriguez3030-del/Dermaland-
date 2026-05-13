# AGENTS.md — DermaLand

Sistema de **agentes de trabajo** para desarrollar DermaLand con asistentes
IA (Claude / Codex / Cursor / Copilot) de forma organizada.

> Estos agentes **NO son usuarios** de la aplicación DermaLand. Son roles
> de desarrollo: documentación + metodología. No tienen tabla en BD ni
> pantalla en la app.

Cada agente tiene un alcance claro, una checklist de salida y un prompt
reutilizable. Al pedir un cambio, identificas qué agente aplica, ejecutas,
QA valida, Corrector corrige si falla, Documentación actualiza decisiones
y riesgos, y QA vuelve a validar. Detalle del flujo en
[`docs/agents/workflow.md`](docs/agents/workflow.md).

## Reglas globales

1. **Trabajar sólo dentro de `C:\dev\dermaland`.** Nada fuera salvo
   excepción listada (Drive, producción, credenciales — ver
   [`docs/agents/workflow.md`](docs/agents/workflow.md#cuándo-sí-preguntar)).
2. **No preguntar por comandos rutinarios.** `pnpm install`, `pnpm
   --filter web dev|typecheck|build|test`, borrar `.next`, reiniciar dev
   server, smoke local, crear rutas/carpetas/archivos están autorizados.
3. **Hidratación segura.** Cualquier cliente que lea `localStorage`,
   `window`, `Date.now`, `Math.random` usa el patrón `mounted`. Server y
   primer render cliente devuelven el mismo HTML estable.
4. **Multiempresa.** Toda lógica que toque datos de tenant usa
   `business_id`. Sin agendamiento / citas / bookings — DermaLand es
   farmacia/dermocosmética, no clínica.
5. **Mock + Supabase tras la misma interfaz.** Lectura/escritura cruza
   `apps/web/src/server/repositories/`. Páginas no conocen el backend.
6. **Validar antes de cerrar.** Ejecutar el
   [checklist de validación rápida](docs/agents/checklist-validacion-rapida.md).
7. **Documentar decisiones.** Decisión técnica → `docs/decisiones.md`.
   Riesgo abierto → `docs/riesgos.md`. Siempre con fecha.

## Roster

| # | Agente | Doc | En una línea |
|---|---|---|---|
| 1 | **Arquitecto Principal** | [`arquitecto.md`](docs/agents/arquitecto.md) | Estructura general, arquitectura limpia, sin agendamiento, multiempresa |
| 2 | **Frontend / UI** | [`frontend-ui.md`](docs/agents/frontend-ui.md) | Pantallas, responsive, formularios, tablas, botones, diseño profesional |
| 3 | **POS y Ventas** | [`pos-ventas.md`](docs/agents/pos-ventas.md) | POS, carrito, descuentos, proformas, ticket 80mm, PDF |
| 4 | **Inventario** | [`inventario.md`](docs/agents/inventario.md) | Productos, lotes, vencimientos, FEFO, conteo físico, movimientos |
| 5 | **Clientes / CRM** | [`clientes-crm.md`](docs/agents/clientes-crm.md) | Clientes, duplicados, validaciones, tipo de piel y de facturación |
| 6 | **QA / Testing** | [`qa-testing.md`](docs/agents/qa-testing.md) | typecheck, build, test, smoke, hydration, rutas críticas |
| 7 | **Seguridad / SaaS** | [`seguridad-saas.md`](docs/agents/seguridad-saas.md) | Multiempresa, RLS, auth, roles, secretos, aislamiento |
| 8 | **Documentación** | [`documentacion.md`](docs/agents/documentacion.md) | README, decisiones, riesgos, docs técnicas |
| 9 | **Imágenes de Productos** | [`imagenes-productos.md`](docs/agents/imagenes-productos.md) | Buscar / descargar / asociar fotos, reporte de import |
| 10 | **Corrector de Errores** | [`corrector-errores.md`](docs/agents/corrector-errores.md) | Reproducir, ubicar, fix mínimo, revalidar |

## Flujo (resumen)

```
1. Arquitecto         revisa alcance
2. Agente del módulo  ejecuta el cambio
3. QA                 valida
4. Corrector          corrige errores (si hay)
5. Documentación      actualiza decisiones / riesgos
6. QA                 vuelve a validar
7. Resumen            qué cambió, cómo probarlo, pendientes
```

Detalle en [`docs/agents/workflow.md`](docs/agents/workflow.md).

## Cómo invocar

Pega [`docs/agents/prompt-usar-agentes.md`](docs/agents/prompt-usar-agentes.md)
al inicio de la conversación con tu asistente IA. Luego escribe el pedido
en lenguaje natural. El asistente entrará al flujo declarando los cambios
de agente en línea (`# Cambio a agente: <nombre>`).

Para tareas largas conviene una conversación por agente — pega el prompt
+ encabezado `Actúa exclusivamente como agente: <nombre>`.

## Ámbito y archivos por agente (referencia rápida)

Cada agente lista sus archivos en su `.md`. Vista cruzada:

| Agente | Carpetas / archivos típicos |
|---|---|
| Arquitecto | `apps/web/src/**` (lectura), `docs/decisiones.md`, `docs/riesgos.md` |
| Frontend / UI | `apps/web/src/app/**`, `apps/web/src/components/**`, `apps/web/src/features/**/components/**` |
| POS y Ventas | `apps/web/src/features/pos/**`, `apps/web/src/features/sales/**`, `apps/web/src/app/(app)/{pos,proformas,caja}/**` |
| Inventario | `apps/web/src/features/inventory{,-counts}/**`, `apps/web/src/app/(app)/{inventario,conteo-fisico,productos}/**` |
| Clientes / CRM | `apps/web/src/features/customers/**`, `apps/web/src/app/(app)/clientes/**` |
| QA / Testing | `apps/web/tests/**`, `apps/web/src/**` (lectura), comandos `pnpm` |
| Seguridad / SaaS | `apps/web/src/middleware.ts`, `apps/web/src/server/auth/**`, `supabase/migrations/**`, `.env.example` |
| Documentación | `README.md`, `AGENTS.md`, `docs/**` |
| Imágenes de Productos | `apps/web/public/mock/products/**`, `apps/web/src/lib/mock-data/products.ts`, `data/product-image-import-report.json` |
| Corrector | el archivo donde explota el error + sus tests |

## Cuándo SÍ preguntar

Aún con autonomía, **siempre** preguntar antes de:

1. Borrar archivos de código fuente.
2. Eliminar datos reales (no mock).
3. Tocar credenciales, certificados, API keys, contraseñas.
4. Trabajar fuera de `C:\dev\dermaland`.
5. Desplegar a producción.
6. Modificar Google Drive (`H:\Mi unidad\PROYECTO DERMALAND\`).
7. Cualquier acción destructiva irreversible.
8. Cambiar una decisión de negocio ya aprobada.

## Estado

| Documento | Última revisión |
|---|---|
| `AGENTS.md` (este archivo) | 2026-05-07 |
| Per-agent docs en `docs/agents/` | 2026-05-07 |
| `docs/agents/workflow.md` | 2026-05-07 |
| `docs/agents/prompt-usar-agentes.md` | 2026-05-07 |
| `docs/agents/checklist-validacion-rapida.md` | 2026-05-07 |
| `docs/decisiones.md` / `docs/riesgos.md` | vivos |
