# Checklist de validación rápida — DermaLand

Lo mínimo a correr **antes de cerrar** cualquier tarea. Si todo pasa,
estás bien. Si algo falla, devuelve al Corrector de Errores.

> Tiempo estimado: 60–120 segundos en una PC normal con caché caliente.
> Más lento la primera vez por compilación.

## 1 · Typecheck

```powershell
pnpm --filter web typecheck
```

- ✅ termina sin errores de `tsc`.
- ❌ cualquier error → Corrector.

## 2 · Build

```powershell
pnpm --filter web build
```

- ✅ `✓ Compiled successfully` y todas las páginas estáticas
  generadas.
- ❌ error de compilación, página que falle al generar, runtime error en
  SSG → Corrector.

## 3 · Tests unitarios

```powershell
pnpm --filter web test
```

- ✅ todos los specs en verde.
- ❌ cualquier test rojo → Corrector (NO bajar la barra de tests).

## 4 · Smoke routes (HTTP)

Levanta el dev server (si no está):

```powershell
pnpm --filter web dev
```

Luego pega este bloque en otra terminal:

```powershell
$urls = @(
  "/",
  "/clientes",
  "/clientes/nuevo",
  "/productos",
  "/productos/nuevo",
  "/inventario",
  "/conteo-fisico",
  "/pos",
  "/proformas",
  "/super-admin",
  "/api/health"
)
foreach ($u in $urls) {
  $code = (Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3031$u" -SkipHttpErrorCheck).StatusCode
  "$code  $u"
}
```

Equivalente bash:

```bash
for u in / /clientes /clientes/nuevo /productos /productos/nuevo \
         /inventario /conteo-fisico /pos /proformas /super-admin \
         /api/health; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:3031$u")
  echo "$code  $u"
done
```

- ✅ todas devuelven `200` (o `204` para `/api/health`).
- ❌ cualquier `4xx`/`5xx` → Corrector.

## 5 · Consola del navegador

Abre `http://localhost:3031` en Chrome (DevTools → Console) y navega por
las rutas tocadas en la tarea + las del smoke.

- ✅ ningún error rojo.
- ⚠️ warnings de React / Next aceptables sólo si están documentados como
  conocidos.
- ❌ `Hydration failed`, `Cannot read properties of undefined`, errores
  de fetch → Corrector.

## 6 · Hidratación (cuando se tocó código de cliente)

Si la tarea tocó algún `"use client"` o algo que lea `localStorage` /
`window` / `Date.now`:

```powershell
node apps/web/tests/hydration-proforma-print.mjs
```

Y/o crea un script equivalente para tu ruta. Salida esperada:

```
✅ No hydration mismatch detected.
```

- ❌ cualquier issue → Corrector. No usar `suppressHydrationWarning`
  como parche; aplicar el patrón `mounted`.

## 7 · Responsive

Para cambios de UI, en DevTools toggle device toolbar y revisa al
menos:

- iPhone 14 (390 × 844)
- iPad mini (768 × 1024)
- Desktop (1280 × 800 ó superior)

- ✅ no hay overflow horizontal, los botones siguen visibles, los
  formularios se centran.
- ❌ texto cortado, overflow, botones fuera del viewport → Frontend/UI.

## 8 · Rutas nuevas

Si la tarea creó rutas:

- ✅ están listadas en el `pnpm --filter web build` output.
- ✅ funcionan vía smoke + navegando con el sidebar.
- ✅ están enlazadas desde donde corresponde (sidebar / botones /
  flujos).
- ❌ ruta huérfana (no enlazada) → Frontend/UI documenta o agrega enlace.

## 9 · Documentación

- ✅ `docs/decisiones.md` tiene una entrada nueva si la tarea introdujo
  una decisión técnica.
- ✅ `docs/riesgos.md` tiene una entrada nueva si abrió un riesgo
  conocido.
- ✅ README.md actualizado si la superficie pública cambió (rutas
  visibles, comandos, env vars, estructura).
- ❌ falta documentación → Documentación.

---

## Reporte final

Al cerrar la tarea, devuelve algo así al usuario:

```
✅ Cambio aplicado: <una línea>

Validación:
  typecheck   ✅
  build       ✅  (78 páginas generadas)
  test        ✅  (34 unit pasando)
  smoke       ✅  (11/11 rutas en 200)
  hydration   ✅  (0 issues)
  responsive  ✅  (390 / 768 / 1280)

Archivos tocados:
  - apps/web/src/app/.../page.tsx
  - docs/decisiones.md
  - docs/riesgos.md

Cómo probarlo:
  1. http://localhost:3031/<ruta>
  2. <pasos>

Pendientes / regresiones:
  - <ninguna>  ó  <lista>
```
