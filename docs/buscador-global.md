# Buscador global del sistema (barra superior)

**Versión:** 0.47.0 · **Fecha:** 2026-07-09 · No toca DGII real.

## Por qué no funcionaba

La barra superior del header era un `<input type="search">` **estático**: sin
estado, sin `onChange`, sin consulta, sin dropdown y sin navegación — pura
decoración. Además estaba `hidden lg:block` (invisible en móvil/tablet).

## Arquitectura

```
Header (GlobalSearch / GlobalSearchMobile)
  → useGlobalSearch (debounce 300ms + AbortController)
  → GET /api/search?q=…            (business_id del JWT, nunca del query string)
  → getRepositories().search.global(ctx, q)
      ├─ Supabase: consultas acotadas, en paralelo, columnas mínimas (search.ts)
      └─ Mock: matchers en memoria (search-match.ts) sobre mock-data
  → GlobalSearchResults (tipado, agrupado)  → dropdown / panel móvil / /buscar
```

- **Núcleo puro** `features/search/search-core.ts` — normalización, patrón ILIKE
  tolerante a separadores, clasificación, rutas, agrupación/límite.
- **`features/search/search-match.ts`** — coincidencia en memoria + **constructores
  de item compartidos** con el repo Supabase (el display probado == producción).
- **`server/repositories/supabase/search.ts`** — impl Supabase.
- **`app/api/search/route.ts`** — endpoint.
- **`features/search/global-search.tsx`** — UI (escritorio + móvil).
- **`app/(app)/buscar/page.tsx`** — "Ver todos los resultados".

## Entidades y campos

| Grupo | Busca por | Ruta al abrir |
|---|---|---|
| Productos | nombre, SKU, código de barra, marca, categoría, laboratorio | `/productos/[id]` |
| Clientes | nombre, teléfono, WhatsApp, cédula, RNC, email, código | `/clientes/[id]` |
| Facturas | NCF (B01/B02), e-NCF (E31/E32/E34), cliente | `/ventas/[id]` |
| Proformas | número (PROF-…), cliente | `/proformas/[id]` |
| Lotes | número de lote, producto asociado | `/productos/[id]` (detalle lista sus lotes) |

## Normalización teléfono/documento

Se comparan **por dígitos**, tolerando separadores, sin columnas normalizadas ni
DDL:

- Query → solo dígitos (`normalizeDigits`).
- Patrón ILIKE `%8%2%9%7%1%4%1%9%7%5%` (`digitsIlikePattern`) que casa
  `829-714-1975` y `8297141975` en la columna cruda.
- `031-0327428-2` ≡ `03103274282`; `829-714-1975` ≡ `8297141975`.

## Rendimiento

- Solo columnas necesarias (nunca `select *`, ni historial, ni items, ni imágenes).
- Consultas en paralelo (`Promise.all`), acotadas por `limit`.
- Stock por producto en **una** consulta agregada (sin N+1).
- Catálogo (marca/categoría/laboratorio) solo para texto libre — se salta en SKU /
  código de barra / documento.
- Cada sub-consulta degrada a vacío si falla → una entidad nunca rompe el buscador.

## Seguridad (RLS)

`business_id` sale de `getRepoContext()` (JWT verificado server-side), **nunca del
query string**. Cliente Supabase con anon-key + cookies del usuario → RLS activa;
además cada consulta filtra explícitamente por `business_id` (defensa en
profundidad, riesgo R-SEC-01). Test de aislamiento por negocio en
`server/repositories/mock/search.test.ts`.

## UI / UX

- Escritorio: input inline + dropdown agrupado.
- Móvil/tablet: icono lupa → panel a pantalla completa (input grande, una mano).
- Teclado: ↑/↓ mueven, Enter abre el activo, Escape cierra.
- Estados: vacío (no dropdown), buscando (spinner), sin resultados (con el término),
  error ("No se pudo realizar la búsqueda. Intenta nuevamente."). Nunca se muestran
  UUID, SQL, códigos PGRST ni stack traces.
- Debounce 300 ms + cancelación del fetch anterior (nada de resultados viejos).
