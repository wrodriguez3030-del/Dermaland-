# Workflow de agentes — DermaLand

Cómo se mueve un pedido a través de los agentes definidos en
[`AGENTS.md`](../../AGENTS.md). Léelo cuando: (a) recibas un pedido nuevo,
(b) un agente quiera “pasar la pelota” a otro, (c) algo no esté claro.

## Flujo canónico (7 pasos)

```
[USUARIO]  → pedido en lenguaje natural
   │
   ▼
1. ARQUITECTO          revisa alcance, identifica módulo, decide agente
   │                   abre entrada en docs/decisiones.md si hay decisión
   ▼
2. AGENTE DEL MÓDULO   ejecuta el cambio
   │                   (Frontend/UI · POS · Inventario · Clientes ·
   │                    Seguridad · Imágenes)
   ▼
3. QA                  typecheck + build + test + smoke + hydration
   │
   ├── ¿errores?
   │     SÍ ──► 4. CORRECTOR    fix mínimo, sin tocar más de lo necesario
   │            └─► volver a 3. QA
   │     NO  ──► seguir
   │
   ▼
5. DOCUMENTACIÓN       actualiza decisiones.md / riesgos.md / README
   │
   ▼
6. QA                  vuelve a validar (post-docs, sólo regresiones rápidas)
   │
   ▼
7. RESUMEN al usuario  qué cambió · cómo probar · pendientes
```

## Quién entra cuándo

| Paso | Agente | Entrada | Salida |
|---|---|---|---|
| 1 | Arquitecto | pedido + estado del repo | módulo identificado · agente asignado · decisión documentada (si aplica) |
| 2 | Módulo (Frontend / POS / Inventario / Clientes / Seguridad / Imágenes) | tarea + alcance | código nuevo / modificado |
| 3 | QA | tarea “lista para validar” | ✅ o lista de fallos |
| 4 | Corrector | reporte de fallo | fix mínimo y verificado |
| 5 | Documentación | cambio confirmado | entradas en `docs/` |
| 6 | QA | docs aplicados | ✅ final |
| 7 | (cualquiera) | todo lo anterior | resumen al usuario |

## Reglas de handoff

1. **Un agente no salta pasos.** Si el módulo termina y QA falla, vuelve
   al Corrector — no se cierra hasta que QA da ✅.
2. **Cambio de agente declarado.** En la conversación, marca
   `# Cambio a agente: <nombre>` cada vez que un nuevo rol toma la pelota.
3. **No mezcles módulos sin pasar por Arquitecto.** Si el pedido toca dos
   verticales (p. ej. POS + Inventario), el Arquitecto trocea en
   subtareas y el flujo se ejecuta por subtarea.
4. **Reversibilidad sobre velocidad.** Borrar `.next`, reiniciar dev
   server, mover archivos: sí. Borrar fuente, datos reales, credenciales:
   pregunta.

## Cuándo SÍ preguntar

Siempre, sin importar qué agente esté activo:

1. Borrar archivos de código fuente.
2. Eliminar datos reales.
3. Tocar credenciales, certificados, API keys, contraseñas.
4. Trabajar fuera de `C:\dev\dermaland`.
5. Desplegar a producción.
6. Modificar Google Drive (`H:\Mi unidad\PROYECTO DERMALAND\`).
7. Cualquier acción destructiva irreversible.
8. Cambiar una decisión de negocio ya aprobada (revisar
   `docs/decisiones.md` antes).

Para todo lo demás: decide, ejecuta, valida, corrige, continúa.

## Patrones específicos (recordatorios)

### Hidratación
Cualquier página de cliente que lea `localStorage`, `window`, `Date.now`,
`Math.random` o formatos locales: patrón `mounted`. Ejemplo de referencia:
`apps/web/src/app/(app)/proformas/[id]/print/page.tsx`. Server y primer
render cliente devuelven el mismo HTML.

### Repositorios
Toda lectura/escritura de datos cruza `src/server/repositories/`. Cada
repo tiene gemelo `mock` y `supabase`. La factory decide por
`DATA_SOURCE`. Las páginas no cambian al hacer el switch.

### Multiempresa
Todo dato de tenant usa `business_id`. Las queries filtran por él. Las
RLS en Supabase también. Sin agendamiento / citas — DermaLand no es app
de clínica.

### POS / impresión
`Receipt80mm` recibe la proforma por props. No toca `window`,
`localStorage`, `Date.now`, `Math.random`. Las páginas de impresión usan
`mounted` mientras los datos vivan en `localStorage`.

### Scanner / offline
`BarcodeDetector` → fallback ZXing → Bluetooth si está. Toda mutación
cruza la cola IndexedDB; la UI muestra `OfflineStatusPill` cuando hay
items pendientes.

## Ejemplo aplicado (real)

**Pedido:** “arregla el hydration error de la página de impresión de
proformas”.

```
1. Arquitecto    → módulo: POS y Ventas. Decisión: usar patrón mounted
                   mientras proformas vivan en localStorage. Entrada en
                   docs/decisiones.md.
2. POS y Ventas  → reescribe apps/web/src/app/(app)/proformas/[id]/print/
                   page.tsx con mounted state, lee store con
                   getProformaByIdFromStore en useEffect.
3. QA            → pnpm --filter web typecheck ✅
                   pnpm --filter web build ✅
                   curl smoke /proformas/<id>/print, /proformas/zzz/print:
                     ambos devuelven el mismo SSR ("Cargando proforma...")
                   Playwright headless: 0 hydration issues en ambas URLs.
5. Documentación → docs/decisiones.md (entrada 2026-05-07)
                   docs/riesgos.md (proformas en localStorage)
6. QA            → smoke final ✅
7. Resumen al usuario.
```

## Glosario corto

- **e-CF / NCF:** comprobantes fiscales electrónicos (DGII).
- **POS:** Punto de Venta.
- **PWA:** Progressive Web App.
- **RLS:** Row-Level Security (Postgres / Supabase).
- **FEFO:** First Expired First Out (rotación por vencimiento).
- **DATA_SOURCE:** env var (`mock` | `supabase`) para la factory de repos.
