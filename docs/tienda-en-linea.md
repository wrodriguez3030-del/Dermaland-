# Tienda en línea — decisiones y estado

> Documento vivo del módulo `/tienda`. Complementa
> [`DERMALAND_BRAND_AUDIT.md`](./DERMALAND_BRAND_AUDIT.md) (identidad visual y voz
> de marca), que **se conserva tal cual**: las correcciones a su contenido se
> registran aquí, no editándolo.

**Estado:** Fase 1 en curso · **Última actualización:** 2026-08-03

---

## 1. Qué se está construyendo

Una tienda pública en `dermaland.vercel.app/tienda`, **dentro del mismo
repositorio, dominio y base de datos** que el ERP. DermaLand sigue siendo la
fuente única de productos, precios, inventario, clientes y ventas: la tienda no
duplica nada.

Se entrega **por fases**. Esta es la 1 (auditoría, modelo de datos, migración) y
la 2 (tienda navegable + admin de catálogo web). Carrito, checkout, envíos,
pagos, cuentas de cliente y chatbot **quedan previstos en el diseño y no
implementados**.

Decisiones de negocio ya tomadas:

| Tema | Decisión |
|---|---|
| Pagos | No hay credenciales de Azul ni VisaNet. Los adaptadores se construyen con proveedor simulado y se documentan las variables exactas. **Nada se declarará apto para cobrar de verdad.** |
| Instagram | Carga manual supervisada. El adaptador de Graph API queda preparado, no conectado. **La tienda nunca depende de Instagram para funcionar.** |
| Facturación | Un pedido web genera **proforma**, igual que el POS. No toca e-CF, secuencias fiscales ni la Fase G de DGII. |
| Sucursales | Se publican las dos, con **nombre comercial de cara al público** ("E. León Jiménez", "Cutis"), distinto del nombre interno del sistema. |

---

## 2. Correcciones al diagnóstico previo

Cosas que parecían ciertas y no lo eran. Se registran para que nadie vuelva a
planificar sobre ellas.

### 2.1 Los campos comerciales del producto no existen en la base

`Product` en `src/types/index.ts:199-217` declara `shortName`, `content`,
`useType`, `skinType`, `benefits[]`, `modeOfUse`, `timeOfUse`, `salesTip` y
`keywords[]`. **Ninguno existe en `public.products`** (29 columnas, verificado
contra `information_schema`). No están en `database.types.ts`, ni en los mappers,
ni en `product.create/update`. Son campos muertos heredados del mock.

**Consecuencia:** el contenido de las fichas web **hay que redactarlo**. No se
hereda de nada. Es el motivo principal de que `product_web_meta` sea una tabla
propia y no un puñado de columnas nuevas en `products`.

### 2.2 Hay dos negocios en la base, no uno

`businesses` tiene `DermaLand` (`00000000-…-d001`) y `CNTTEST ct5jmp`
(`8be34957-…`), **ambos con productos**. Resolver el tenant por "el único
negocio" es ambiguo hoy, no solo frágil mañana. De ahí el índice único parcial
que garantiza **como máximo una tienda publicada** en toda la plataforma.

### 2.3 Ninguna sucursal estaba marcada como visible en web

`branches.show_on_website` existía desde la migración 0001, pero estaba en
`false` en las dos sucursales reales. No sirve para resolver el tenant (daría
cero) y hay que activarlo explícitamente.

### 2.4 El bloqueante de la auditoría de marca ya no aplica

`DERMALAND_BRAND_AUDIT.md` §9 dice que *"1 339 de 1 355 productos con `price = 0`
es el bloqueante número uno, anterior a cualquier diseño"*. **Ya se resolvió**:
hoy quedan **12 productos con precio 0**.

El bloqueante real es otro: **704 productos sin foto**. Se puede publicar con
**651** (los que tienen foto y precio), menos de la mitad del catálogo. Eso —no
el código— es lo que limita el lanzamiento.

### 2.5 Las fotos están mejor de lo que dice `product-images.md`

Ese documento describe la subida como comentada y las imágenes como base64 en
`localStorage`. Verificado contra la base: **639 imágenes ya están en Supabase
Storage**, bucket `product-images` **público**, en WebP, con ruta determinista
`businesses/{id}/products/{id}/image.webp`.

Excepciones a corregir antes de publicar: **12 URLs externas** apuntando a
`cdn1.costatic.com` (hotlink a un CDN ajeno) y **1 data-URL de 32 KB** guardada
dentro de la columna. Ninguna se publica: caen al marcador de posición.

---

## 3. Decisiones de arquitectura

### 3.1 Tabla separada, cero columnas en `products`

`products` es el núcleo operativo-fiscal: lo usan POS, DGII, inventario, compras
y la RPC atómica `emit_sale_atomic`. Añadirle campos editoriales obligaría a
tocar tipos, mappers, la lista blanca de `product.update` y los formularios, con
riesgo desproporcionado para contenido de marketing. Además `product.list` hace
`select("*")`: el ERP arrastraría descripciones largas en cada consulta.

**Ausencia de fila en `product_web_meta` = producto NO publicado** (fail-closed).
Publicar es un acto deliberado; ningún producto con precio o foto dudosa llega a
internet por omisión.

### 3.2 El slug es estable y su desempate es determinista

- Se calcula **una sola vez, al publicar**, y se guarda. **Renombrar el producto
  no lo regenera**: si lo hiciera, cada corrección de nombre rompería los enlaces
  compartidos por WhatsApp y la indexación en Google. Cambiarlo es una acción
  explícita del administrador, avisada en la interfaz.
- Ante colisión se añaden **6 hexadecimales del id del producto**, no un
  contador: un contador exige leer-y-escribir (carrera entre dos publicaciones
  simultáneas) y daría un resultado distinto en cada reejecución del sembrado,
  que debe ser idempotente.
- Implementación y pruebas: `features/storefront/slug.ts`.

Nota: hoy **no hay nombres de producto duplicados** en los 1 355, así que
prácticamente todos obtienen un slug limpio.

### 3.3 Lectura pública con service-role acotado, no con la clave anónima

La clave anónima **está en el navegador**. Si se abriera una política de `SELECT`
para `anon` sobre `products`, cualquiera podría pedir
`/rest/v1/products?select=cost,price` a PostgREST y **leer los costos y deducir
los márgenes** de todo el catálogo: RLS filtra filas, no columnas.

Se sigue el precedente ya vigente de `server/services/sales/shared-document.ts`
(la factura pública por token), en módulos `server-only`, con
`.eq("business_id", …)` en cada consulta y **nunca `select("*")`**.

**No se añade ninguna política nueva sobre `products` ni `product_lots`.**

### 3.4 Lista blanca de salida

`toPublicProduct` construye el objeto público campo a campo. **Nunca salen**:
costo, margen, `min_stock`/`max_stock`, **cantidad exacta de existencias**, nada
de `product_lots` (lote, vencimiento, costo unitario, proveedor, almacén),
`business_id`, UUID interno, SKU ni código de barras.

La disponibilidad se colapsa a un booleano **en el servidor**: la tienda dice "En
existencia" o "Agotado", nunca "quedan 3". Ver `features/storefront/availability.ts`.

### 3.5 Búsqueda en memoria, sin tocar la base

Con `ILIKE`, quien teclea "avene" **no encuentra "AVÈNE"** — y buena parte de la
clientela escribe sin acentos. Resolverlo en Postgres exige instalar `unaccent` y
`pg_trgm` (hoy **no instaladas**) y añadir una columna generada a `products`.

Como el catálogo publicado son cientos de filas, se carga cacheado y se consulta
en TypeScript puro (`features/storefront/catalog-query.ts`): insensible a
acentos y mayúsculas, sobre varios campos a la vez, tolerante a **una** errata
por palabra y solo cuando no hay ninguna coincidencia exacta, y comprobable
entero sin base de datos.

**Umbral de salida:** si el catálogo publicado supera ~5 000 productos o el
payload cacheado ~1 MB, se pasa a búsqueda en base con una migración `0037`
(`unaccent` + `pg_trgm` + columna generada + índice GIN). Diseñada, no
implementada.

### 3.6 Lo agotado se muestra, pero nunca primero

Un producto sin existencias sigue siendo útil (informa, posiciona, se puede
consultar por WhatsApp), así que aparece en el catálogo; pero la relevancia lo
hunde al final. Enseñar primero lo que no se puede comprar es la forma más rápida
de perder una venta.

---

## 4. Estado de ejecución

| # | Incremento | Estado |
|---|---|---|
| E0 | Núcleo puro (`types`, `slug`, `availability`, `catalog-query`) + pruebas + este documento | **Hecho** |
| E1 | Migración `0036_storefront_web_catalog` | Pendiente de autorización |
| E2 | Sembrado idempotente + `show_on_website` | Pendiente (autorizado por el dueño) |
| E3 | Capa de lectura pública (`tenant`, `catalog`, `public-product`) | Pendiente |
| E4 | Middleware + esqueleto de rutas | Pendiente |
| E5 | Interfaz del catálogo | Pendiente |
| E6 | Imágenes y SEO | Pendiente |
| E7 | Admin "Catálogo web" | Pendiente |

**La tienda no se enciende hasta después de E7**, y encenderla es una decisión
del dueño, no un paso del plan.

---

## 5. Qué NO se toca

- `server/auth/auth-claims.ts` — el rol por defecto `cashier` se queda. La tienda
  **no usa sesión**, así que el problema del "cliente tratado como cajero" no se
  materializa en estas fases; se resuelve en la fase de cuentas de cliente con
  una tabla puente `client_auth_links`, **nunca relajando este archivo**.
- `getSession()` / `getRepoContext()` — siguen devolviendo `null` / lanzando sin
  `business_id`.
- El middleware, salvo **añadir** entradas a `PUBLIC_PATHS`. No se toca `isPublic`,
  ni el enforcement de 2FA, ni el bloqueo de `/super-admin`, ni el `matcher`.
- El **killswitch de DGII** en sus cuatro capas.
- Las migraciones históricas `0001`-`0035`.
- `public.products` y `public.product_lots`: **cero columnas y cero políticas
  nuevas**.
- Los componentes de `components/ui/`: se consumen, no se modifican. Los ajustes
  de accesibilidad (44 px táctiles, contraste) se hacen en el llamador.
- El POS y sus motores de cálculo (`cart-line.ts`, `pricing.ts`, `emit_sale_atomic`).

---

## 6. Riesgos abiertos

| ID | Riesgo | Mitigación |
|---|---|---|
| R-WEB-01 | Fuga de costos o márgenes al público | Lista blanca en `toPublicProduct` + prueba que falla si `cost` aparece serializado + prohibición de `select("*")` en la capa pública |
| R-WEB-02 | Resolver el tenant equivocado (hay 2 negocios) | Índice único parcial en la base + resolutor **sin parámetros** + fail-closed si no hay exactamente uno |
| R-WEB-03 | Los Preview de Vercel se indexan en Google | Doble capa: `robots.ts` fuera de producción + cabecera `X-Robots-Tag: noindex` |
| R-WEB-04 | Deriva de migraciones (36 archivos locales / 26 registradas) | Verificar **por objeto**, no por historial; la 0036 es 100 % `if not exists` |
| R-WEB-05 | 704 productos sin foto | La publicación por lote filtra por foto; marcador digno cuando falte |
| R-WEB-06 | Hotlink a un CDN ajeno y data-URL en la base | No se publican; re-subida con los scripts existentes |
| R-WEB-07 | Catálogo publicado incompleto al lanzar | Es decisión de negocio: se lanza con 651 o se completan fotos antes |
