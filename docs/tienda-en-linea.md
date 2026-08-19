# Tienda en línea — decisiones y estado

> Documento vivo del módulo `/tienda`. Complementa
> [`DERMALAND_BRAND_AUDIT.md`](./DERMALAND_BRAND_AUDIT.md) (identidad visual y voz
> de marca), que **se conserva tal cual**: las correcciones a su contenido se
> registran aquí, no editándolo.

**Estado:** Fases 1 y 2 completas (E0–E7). **Fase 3 en marcha**: F3.0 entregada
(portada, categorías navegables y recomendados) — su diseño está en
[`specs/2026-08-04-tienda-fase-3-carrito-cuentas-pedidos-design.md`](./superpowers/specs/2026-08-04-tienda-fase-3-carrito-cuentas-pedidos-design.md).
**638 fichas publicadas** y la tienda **apagada**: encenderla es una decisión del
dueño, desde *Productos → Catálogo web*. El procedimiento está en
[`tienda-lanzamiento.md`](./tienda-lanzamiento.md).
**Última actualización:** 2026-08-04

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
| Facturación | ~~Un pedido web genera **proforma**~~. **CORREGIDO 2026-08-04 al implementar F3.3: el pedido NO genera proforma.** Con retiro y pago al recoger, la venta se cobra en el POS cuando el cliente llega, y ahí nace el documento con su caja y su cajero; generarla al confirmar dejaría dos documentos por una venta. Sigue sin tocar e-CF, secuencias fiscales ni la Fase G. |
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

### 2.6 La URL de la foto SÍ contiene el `business_id` y el id del producto

Corrige lo que promete §3.4 más abajo. La lista blanca gobierna los **campos**
del objeto público; la **ruta de la foto** es otra cosa:
`/storage/v1/object/public/product-images/businesses/{business_id}/products/{product_id}/image.webp`.
Esos dos UUID aparecen en el HTML del catálogo (79 veces en una página de 24
productos) y no hay forma de evitarlo sin dejar de servir las fotos directamente
desde el CDN de Supabase.

**Decisión (2026-08-03, autorizada por el dueño): se acepta.** Son
identificadores opacos y aleatorios que no dan acceso a nada: `anon` no tiene
`SELECT` sobre ninguna de estas tablas, la RLS es deny-by-default y todas las
rutas de la API están tras sesión. Las alternativas —servir cada foto por una
función propia o redirigir desde ella— cuestan una invocación por imagen y
empeoran el LCP con 24 fotos por página, a cambio de ocultar un dato que no es
secreto.

Lo que sigue siendo cierto y está probado: **no salen** el costo, el margen, el
SKU, el código de barras, el stock exacto ni nada de `product_lots`.

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

### 3.6 Una sola definición de "publicable"

La regla (activo, vendible, sin borrar, con precio, sin receta, no controlado,
con foto en el bucket propio) llegó a estar escrita **tres veces**: en el script
de sembrado, en los filtros `WHERE` de la lectura pública y en la cabeza de quien
mirara la lista. Hoy vive **solo** en `features/storefront/publishability.ts`,
como función pura probada, y tanto la tienda como el admin la llaman.

Consecuencia deliberada: la lectura pública ya **no** filtra en SQL. Trae las
filas de los productos marcados visibles y aplica la regla en TypeScript. Cuesta
unas pocas filas más por consulta y evita que un día la tienda y el admin
discrepen sobre qué es publicable.

La misma función devuelve los **motivos en lenguaje llano**, que es lo que el
admin enseña: "No tiene precio", "No tiene foto propia". Un interruptor que no se
deja encender sin decir por qué es la peor forma de dar una noticia.

### 3.7 La caché vive en la capa de datos, no en la ruta

La página del catálogo depende de la barra de dirección (`?q=`, `?marca=`,
`?pagina=`), así que se renderiza siempre en caliente y un `revalidate` de ruta
no serviría de nada. La caché entre peticiones la pone `unstable_cache` sobre el
cargador del catálogo y sobre el resolutor del tenant, con etiquetas
(`storefront-catalog`, `storefront-tenant`) que el admin invalida en **cada**
escritura. Sin esa invalidación, quien publica un producto no lo vería en la
tienda hasta cinco minutos después y concluiría que el botón no funciona.

### 3.8 Lo agotado se muestra, pero nunca primero

Un producto sin existencias sigue siendo útil (informa, posiciona, se puede
consultar por WhatsApp), así que aparece en el catálogo; pero la relevancia lo
hunde al final. Enseñar primero lo que no se puede comprar es la forma más rápida
de perder una venta.

---

## 4. Estado de ejecución

| # | Incremento | Estado |
|---|---|---|
| E0 | Núcleo puro (`types`, `slug`, `availability`, `catalog-query`) + pruebas + este documento | **Hecho** |
| E1 | Migración `0036_storefront_web_catalog` | **Hecho** (aplicada y verificada por objeto) |
| E2 | Sembrado idempotente + `show_on_website` | **Hecho** (638 fichas, 2 sucursales) |
| E3 | Capa de lectura pública (`tenant`, `catalog`, `public-product`) | **Hecho** |
| E4 | Middleware + rutas públicas | **Hecho** |
| E5 | Interfaz del catálogo y ficha de producto | **Hecho** |
| E6 | SEO: sitemap, JSON-LD, canónicas, `noindex` de búsquedas | **Hecho** |
| E7 | Admin "Catálogo web" (`/tienda-web`) | **Hecho** |
| F3.0 | Portada con estantes, `/tienda/catalogo`, categorías navegables y recomendados | **Hecho** |
| F3.1 | Carrito con precios de servidor y retiro en sucursal | **Hecho** |
| F3.2 | Cuentas de cliente (portero + `client_auth_links`) | **Hecho** — el registro necesita SMTP en Supabase para poder usarse |
| F3.3 | Pedidos: checkout, consulta por token y pantalla en el ERP | **Hecho** |
| F3.6 | Envío a domicilio con costo por provincia + panel de tarifas | **Hecho** — apagado hasta que se configuren provincias |
| F3.7 | Pago por transferencia con comprobante | **Hecho** — apagado hasta que se carguen cuentas bancarias |
| F3.5 | Cobro con tarjeta **preparado** (contrato + fail-closed + runbook) | **Hecho** — la pasarela con API sigue apagada hasta que haya afiliación bancaria; ver [`pagos-en-linea.md`](./pagos-en-linea.md) |
| F3.8 | Pago con tarjeta por **enlace de Azul** (confirmación manual por comprobante) | **Hecho (2026-08-19)** — se enciende pegando el enlace en la configuración de la tienda; ver [`pagos-en-linea.md`](./pagos-en-linea.md) §0 |

**La tienda no se enciende hasta después de E7**, y encenderla es una decisión
del dueño, no un paso del plan. Hoy sigue **apagada**, con 638 fichas sembradas
y **ninguna publicada**.

### 4.1 Lo que enseñó ejecutarlo

Tres cosas que solo aparecieron al probar, y que no se habrían visto leyendo el
código:

- **`/robots.txt` respondía 307 a `/login`.** El `matcher` del middleware no
  excluye `.txt`, así que ningún rastreador llegaba a leer las reglas — y sin
  reglas, un rastreador asume que puede rastrear todo. Justo lo contrario de lo
  que necesita R-WEB-03. `/robots.txt` y `/sitemap.xml` están ahora en
  `PUBLIC_PATHS`.
- **Next fijaba `/tienda` como ruta estática.** Con la tienda apagada,
  `notFound()` se ejecutaba antes de leer `searchParams`, así que el build
  concluía que la página no dependía de la URL y prerrenderizaba el 404: al
  encender la tienda habría seguido sirviendo ese 404 congelado. `searchParams`
  se lee ahora en la primera línea, y hay un comentario que explica por qué.
- **La trampa de la ruta estática muerde dos veces.** `/tienda/carrito` volvió a
  caer en ella al construirla (F3.1): no lee `searchParams`, así que Next
  concluyó que no depende de la petición y la prerrenderizó. Cualquier ruta nueva
  de la tienda que **no** lea `searchParams` necesita `dynamic = "force-dynamic"`.
- **La caché guarda también el "no hay tienda".** Encender la tienda no se ve
  hasta que se invalida `storefront-tenant`; por eso el admin lo hace en cada
  guardado.

---

## 4.2 Qué falta antes de encender

1. ~~Confirmar que el 809-226-5252 tiene WhatsApp.~~ **Confirmado por el dueño
   el 2026-08-03.** Es el número configurado en `business_web_settings` y al que
   lleva el botón de cada ficha, con el producto y su enlace ya escritos en el
   mensaje. Sin carrito, ese botón **es** la venta.
2. **Redactar contenido.** Las 638 fichas se publican hoy con el nombre del ERP
   (en MAYÚSCULAS) y sin resumen, descripción ni beneficios: los campos
   comerciales nunca existieron en la base (§2.1). Se escriben desde
   *Productos → Catálogo web*.
3. **Decidir con cuántos productos se lanza.** 638 de 1 355; el resto no puede
   publicarse, casi siempre por falta de foto (R-WEB-05).
4. **Revisar el `og:image`** de la tienda: hoy no hay ninguno configurado, así
   que al compartir el enlace no se ve tarjeta con imagen.

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
| R-WEB-07 | Catálogo publicado incompleto al lanzar | Es decisión de negocio: se lanza con 638 o se completan fotos antes |
| ~~R-WEB-08~~ | ~~El botón de WhatsApp apunta a una línea sin WhatsApp~~ | **CERRADO 2026-08-03**: el dueño confirma que el 809-226-5252 tiene WhatsApp. `whatsappLink` sigue devolviendo `null` —y ocultando el botón— si algún día el número deja de ser marcable |
| R-WEB-09 | Las fichas salen con el nombre en MAYÚSCULAS y sin contenido | El admin permite redactarlas; el título comercial cae al nombre del ERP solo mientras nadie lo escriba |
| ~~R-WEB-10~~ | ~~**El registro de clientes no se puede usar**~~ **MITIGADO 2026-08-04**: las cuentas quedan APAGADAS con `STOREFRONT_ACCOUNTS_ENABLED` (por defecto `false`), así que el cliente no ve una puerta que no abre. Se puede comprar sin cuenta. Para encenderlas hace falta primero SMTP propio en Supabase. Original: Supabase exige confirmar el correo y su emisor propio se agota en unos pocos envíos por hora (`over_email_send_rate_limit`) | Configurar un SMTP propio en Supabase. **No** desactivar la confirmación: permitiría registrarse con el correo de otra persona. Es configuración de la cuenta, no código |
| R-WEB-12 | **La tienda ofrece retirar en una sucursal que no tiene inventario** — `Dermaland Cutis` ("Cutis") está publicada con `show_on_website = true` y **cero lotes**; los 700 lotes vivos están todos en `DermaLand Principal` ("E. León Jiménez"). El pedido real WEB-000015 se hizo así | Mitigado en pantalla, no resuelto: el detalle del pedido dice en qué sucursal está cada línea, y el POS factura desde la que sí puede despachar avisando del cambio. **La decisión de fondo es del negocio**: o se surte Cutis, o se le quita `show_on_website` mientras no tenga existencia |
| R-WEB-11 | El registro público es superficie de spam en `auth.users` | Supabase limita por IP de serie; con SMTP propio + confirmación obligatoria, una cuenta sin confirmar no sirve de nada |

---

## 7. El pedido y el ERP (2026-08-04)

Cuatro cosas que faltaban para que un pedido web fuera un pedido de verdad y no
un aviso por correo.

### 7.1 El pedido mira la existencia

Antes no la miraba **en ningún momento**: se podían encargar 50 unidades de algo
que tenía 1. El fallo aparecía cuando alguien del negocio abría el pedido y
tenía que llamar a deshacerlo.

```
disponible = existencia vendible − apalabrado en pedidos web abiertos sin facturar
```

Restar lo apalabrado es lo que impide vender el último frasco a cinco personas.
Se deja de contar en cuanto el pedido se factura: ahí el POS descuenta el
inventario de verdad, y seguir restándolo escondería existencia que sí está.

La lectura es **sin caché** a propósito (`server/services/storefront/stock.ts`).
El catálogo sí la tiene —cinco minutos, y ahí un "En existencia" viejo no hace
daño—, pero esto decide si un pedido se acepta.

Si la lectura falla, el mapa vuelve vacío y todo cuenta como agotado. Parar es
recuperable; vender a ciegas no.

**El pedido sigue sin reservar inventario.** Queda una carrera abierta: dos
pedidos simultáneos pueden pasar los dos. Por eso el detalle del ERP enseña la
disponibilidad viva de cada línea antes de confirmar.

### 7.2 Facturar desde el pedido

`Facturar en el POS` abre `/pos?pedido=<id>` con el carrito, el cliente y la
sucursal del pedido puestos.

Los **precios no se copian** del pedido: salen del catálogo de hoy y pasan por
las mismas reglas de ITBIS, descuento y FEFO que cualquier venta. Una factura
con cifras heredadas de hace días no se puede comprobar contra nada.

Al emitir, el documento queda enlazado (`web_orders.proforma_id`). El enlace se
escribe **después** de emitir: el pedido no puede quedar marcado como facturado
por una venta que luego falló.

**Limitación conocida:** el flete NO se factura como línea. El POS factura
productos con lote, y un "Envío" sin lote rompería FEFO y el descuento de
inventario. El POS lo dice en pantalla con el importe para que se cobre aparte.
Resolverlo bien pide un producto de servicio sin inventario, que hoy no existe
en `products`.

### 7.3 Cambiar el tipo de entrega

Retiro ↔ envío sin rehacer el pedido. Antes la única salida era cancelar y
volver a pedir: se perdía el número y el historial.

El flete lo recalcula el servidor con las tarifas de **hoy** —el envío se está
decidiendo ahora—, y en la petición viaja el destino, nunca el precio. Al pasar
a retiro se **borra** la dirección.

Bloqueado si el pedido está cerrado o ya facturado: la proforma lleva el flete
dentro.

### 7.4 El cliente no se duplica

**Esto ya había fallado en producción.** El ERP guarda `829-714-1975` y la
tienda mandaba `8297141975`; la búsqueda previa al alta usaba un `=` literal y
no casaba nunca. `CLI-420678` y `CLI-573912` son la misma persona.

- Migración `0042`: columnas generadas `phone_digits`, `whatsapp_digits` y
  `email_normalized` en `clients`, con la misma regla que
  `customer-normalization.ts`, más índices parciales.
- `features/customers/identity-match.ts` decide quién es quién. El **correo
  manda** sobre el teléfono: una bandeja de entrada no se comparte. Por teléfono
  hace falta además que el nombre encaje, porque en esta base hay dos personas
  distintas con el mismo número.
- Ante la duda, ficha nueva. Una ficha de más se fusiona; una compra en la ficha
  de otro no se ve.
- **Sin índice único** a propósito: una familia comparte número.
- La ficha que nace en la tienda guarda el teléfono con guiones, como las demás.

Queda por decidir qué hacer con `CLI-573912`, el duplicado que ya existe.
Fusionarlo es tocar datos reales de un cliente real.
