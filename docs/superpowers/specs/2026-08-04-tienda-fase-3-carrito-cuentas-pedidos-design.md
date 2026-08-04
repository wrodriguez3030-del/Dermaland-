# Tienda Fase 3 — carrito, cuentas de cliente y pedidos

> Continúa [`tienda-en-linea.md`](../../tienda-en-linea.md), que cierra las fases
> 1 y 2 (E0–E7). Aquí se diseña lo que aquel documento dejó **previsto y no
> implementado**: carrito, checkout, envíos, pagos y cuentas de cliente.

**Fecha:** 2026-08-04 · **Estado:** diseño aprobado por el dueño

---

## 1. Qué pidió el negocio

Textualmente: *"una web tipo Amazon con su carrito, productos recomendados por
categoría, poder hacer pago en línea, pedir registro de cliente y demás — está
muy básica esa tienda, no me gusta"*.

Eso son **dos cosas distintas** que conviene no mezclar, porque tienen plazos
muy diferentes:

- **Cómo se ve.** No depende de ningún tercero. Es lo que provoca el "no me
  gusta" y se puede enseñar en días.
- **Qué hace.** Carrito, cuenta, cobro y el pedido cayendo dentro del ERP.
  Depende de decisiones de negocio y, en el caso del cobro, de una afiliación
  bancaria cuyo plazo no controla el equipo técnico.

El diseño las separa para que lo primero no espere por lo segundo.

### Lo que NO entra en esta fase

- **Chatbot.** Sigue previsto y sin implementar.
- **Cobro real con tarjeta.** Ver §2.
- **Multi-vendedor, reseñas, listas de deseos, cupones.** No los pidió el
  negocio y cada uno arrastra su propio módulo. YAGNI.
- **Tocar el POS.** Ni `emit_sale_atomic`, ni `cart-line.ts`, ni `pricing.ts`.

---

## 2. Decisiones heredadas — no se reabren

Están tomadas y registradas en `tienda-en-linea.md` §1. Se repiten aquí porque
gobiernan el diseño:

| Tema | Decisión | Consecuencia en este diseño |
|---|---|---|
| **Pagos** | No hay credenciales de Azul ni VisaNet. Adaptadores con **proveedor simulado** y variables documentadas. **Nada se declarará apto para cobrar de verdad.** | El cobro es una **interfaz**, no una integración. Ver §4.6. |
| **Facturación** | Un pedido web genera **proforma**, igual que el POS. No toca e-CF, secuencias fiscales ni la Fase G de DGII. | El pedido NO es un documento fiscal. Ver §4.4. |
| **Cuentas de cliente** | Tabla puente `client_auth_links`. **Nunca relajando `auth-claims.ts`.** | Ver §3 y §4.3. |
| **Fuente única** | DermaLand es la única verdad de productos, precios, inventario, clientes y ventas. La tienda no duplica nada. | Descarta instalar una plataforma de comercio de terceros. Ver §9. |

---

## 3. El hallazgo que reordena la fase

**El portero de la aplicación pregunta una sola cosa: "¿hay un usuario?"**

`middleware.ts:95`:

```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) { /* → /login */ }
```

Hoy eso alcanza, porque **la única forma de existir como usuario es que un
administrador te cree**. Abrir el registro público invierte esa premisa: a
partir de ese día cualquiera puede fabricarse un usuario válido desde la tienda
y **pasar ese portón** hacia `/inventario`, `/ventas`, `/reportes`, `/compras`.

Lo único que hoy lo frena está mucho más adentro:

```ts
// server/auth/context.ts:55
if (!claims.businessId) return null;
```

Eso no es un portón: es la red por si algo se cae. Que cada página aguante bien
un `getSession()` en `null` no está probado página por página, y no es una
garantía que se quiera estrenar el mismo día que se abre el registro público.

Agrava el cuadro que `readAuthClaims` asigna **`role: "cashier"` por defecto**
cuando el usuario no trae rol — exactamente el caso de un cliente recién
registrado:

```ts
role: (m.role as User["role"]) ?? "cashier",
```

### La regla que sale de aquí

> **El registro público no se abre hasta que el portero exija `business_id`
> para las rutas del ERP.** Es la primera tarea de F3.2, no la última.

Y se arregla **en el portero**, no en `auth-claims.ts`: el valor por defecto
`cashier` se queda donde está, tal como manda `tienda-en-linea.md` §5. Un
usuario sin `business_id` en `app_metadata` es un cliente de la tienda; el
middleware lo manda a `/tienda`, no a `/login` (mandarlo a `/login` estando
autenticado produce un bucle).

---

## 4. Arquitectura, pieza por pieza

Cada pieza se entrega y se prueba sola. El orden es el de la tabla.

### 4.1 F3.0 — La cara de la tienda

No depende de ninguna decisión de negocio ni de ningún tercero. Es la respuesta
directa a "está muy básica".

- **Portada** (`/tienda`) por secciones en vez de una rejilla plana: destacados,
  novedades, y una fila por categoría con enlace a "ver todo".
- **Categorías navegables de verdad** — `/tienda/categoria/[slug]`, con URL
  propia, título propio y su canónica. Hoy la categoría solo existe como filtro
  en la barra lateral, invisible para Google.
- **Tarjetas con foto grande**, precio legible y disponibilidad; la foto deja de
  ser una miniatura.
- **Buscador arriba y visible**, no escondido entre los filtros.
- **Recomendados automáticos** — ver §4.2.

Se construye sobre `components/ui/` existente, que se **consume y no se
modifica** (`tienda-en-linea.md` §5). El contraste sigue la regla ya fijada:
`--brand-primary` para texto pequeño, nunca `--brand-accent` (3,7:1) ni
`--brand-success` (3,3:1).

### 4.2 Recomendados por categoría

Función pura, `features/storefront/recommendations.ts`, con esta prelación:

1. `product_web_meta.related_product_ids` — lo que el negocio escogió a mano.
   **Ya existe en la base**; hoy solo se llena manualmente.
2. Si no llena el cupo: misma **categoría**, luego misma **marca**.
3. Filtros duros: publicable (§3.6 del documento madre), con foto, excluyendo el
   producto actual y los ya escogidos a mano.
4. Orden determinista y **lo agotado nunca primero** (§3.8 del documento madre).

Sin historial de navegación ni "quien compró esto compró aquello": no hay
volumen de pedidos para que eso signifique nada, y arrastraría seguimiento del
visitante que nadie pidió.

### 4.3 F3.1 — Carrito

- Vive en el **navegador** (`localStorage`), con el patrón `mounted` que exige
  `CLAUDE.md` regla 6: servidor y primer render de cliente devuelven el mismo
  HTML.
- Guarda **solo `product_id` y cantidad**. Nada más.
- **El precio lo pone el servidor, siempre.** Al abrir el carrito y otra vez al
  confirmar, el servidor recalcula contra `products` y devuelve el detalle. Si
  un precio cambió entre que el cliente agregó y pagó, se le dice y se le pide
  que confirme de nuevo. Nunca se cobra lo que diga el navegador.
- Motor de cálculo en función pura y probada, **separado** del de POS: el POS
  tiene descuento global, sesión de caja y reglas documentales que la web no
  tiene. Compartir el motor acoplaría dos cosas que evolucionan distinto.

### 4.4 F3.2 — Cuentas de cliente

**Orden obligatorio dentro de la pieza:**

1. Arreglar el portero (§3). Con su prueba.
2. Tabla puente `client_auth_links`.
3. Registro, entrada, recuperación.
4. "Mis pedidos" y "Mis direcciones".

Un cliente web es un usuario de Supabase Auth **sin `business_id`** en
`app_metadata`. Eso es lo que lo distingue del personal, y es lo que el portero
mira. El vínculo con la ficha comercial vive en la tabla puente, no en el token.

Al registrarse se busca coincidencia contra `clients` por documento, teléfono o
correo usando el dedup que **ya existe** (`/api/customers/check-duplicate`,
server-side, barre toda la base). Si coincide, se enlaza; si no, se crea la
ficha. Así el cliente que ya compró en el mostrador no aparece dos veces.

### 4.5 F3.3 — El pedido dentro del ERP

**Por qué el pedido no es una proforma directamente:** `proformas` exige
`cash_register_session_id` y un cajero. A las once de la noche no hay caja
abierta ni cajero. Forzar una proforma ahí obligaría a inventar sesiones de caja
falsas o a relajar la tabla — las dos cosas ensucian el cierre de caja y los
informes de venta.

El pedido es **su propio documento**, con su propio ciclo:

```
recibido → confirmado → preparando → listo / enviado → entregado
     └──────────────── cancelado ────────────────┘
```

**La proforma nace al confirmar**, por el camino que ya existe, con la caja y el
usuario reales de quien confirma. `web_orders.proforma_id` guarda el vínculo.

**El pedido no mueve inventario.** El inventario se mueve cuando se emite la
venta, con el motor de siempre. La disponibilidad que ve el visitante es
informativa; quien confirma valida existencia real y puede cancelar líneas. Es
la única forma honesta de no tocar `emit_sale_atomic` ni FEFO.

Pantalla nueva *Pedidos web* dentro del ERP, con `RowActions` de iconos como el
resto (nunca texto), etiquetas legibles (nunca claves ni UUID) y paginación
server-side con `.range()` — el tope silencioso de 1000 filas de PostgREST
aplica igual aquí.

### 4.6 F3.4 — Entrega y F3.5 — Cobro

**Entrega** queda pendiente de una decisión de negocio (retiro en sucursal,
envío, o ambos). El modelo de datos la contempla desde ya con
`fulfillment: 'pickup' | 'delivery'` para no tener que migrar después.

**Cobro:** una interfaz y nada más.

```ts
interface PaymentProvider {
  readonly id: string;            // 'simulated' | 'azul' | ...
  createIntent(order): Promise<PaymentIntent>;
  verify(reference): Promise<PaymentResult>;
}
```

Se entrega `SimulatedProvider` y se documentan las variables exactas que pedirá
Azul. **Ningún texto de la interfaz le dirá al visitante que se está cobrando de
verdad** mientras el proveedor activo sea el simulado. El checkout termina en
"pedido recibido, te contactamos para el pago", que es la verdad hasta que
exista la afiliación.

---

## 5. Modelo de datos

Tres tablas nuevas. Ninguna columna nueva en `products`, `product_lots`,
`clients` ni `proformas`.

**`client_auth_links`** — el puente entre la cuenta web y la ficha comercial.

| Columna | Notas |
|---|---|
| `auth_user_id` | PK. Referencia a `auth.users`. Una cuenta = un cliente. |
| `client_id` | Referencia a `clients`. Único junto con `business_id`. |
| `business_id` | Para RLS directa, sin salto. |
| `created_at` | |

**`web_orders`** — el pedido.

Identidad y destino: `business_id`, `branch_id`, `number` (secuencia propia
`WEB-000001`, **separada de la fiscal**), `client_id`, `auth_user_id`.
Contacto en **instantánea** (`contact_name`, `contact_phone`, `contact_email`):
el pedido debe recordar a quién se le vendió aunque el cliente cambie de
teléfono después.
Entrega: `fulfillment`, `delivery_address`, `delivery_city`, `delivery_province`,
`delivery_notes`.
Dinero: `subtotal`, `discount`, `itbis`, `shipping`, `total`.
Estado: `status`, `payment_status`, `payment_provider`, `payment_reference`.
Enlaces: `proforma_id`, `cancelled_reason`, `idempotency_key`.

**`web_order_items`** — las líneas, **todas en instantánea**.

`order_id`, `business_id`, `product_id`, y copiados en el momento de la compra:
`product_name`, `unit_price`, `qty`, `itbis_rate`, `line_total`. Los precios
cambian; el pedido tiene que recordar lo que se cobró. Es el mismo criterio de
instantánea que ya usan las comisiones (`sales_incentives`).

**Historial de estados:** se usa `audit_logs`, que ya existe. No se crea tabla.

---

## 6. Seguridad

Las tres reglas, aplicadas:

1. **Secretos sin `NEXT_PUBLIC`.** Las claves de pasarela y el `service_role`
   nunca llegan al navegador. El carrito es del cliente; **el precio es del
   servidor** (§4.3). El `idempotency_key` lo genera el servidor.
2. **SQL parametrizado.** Todo por el cliente de Supabase. Cero concatenación,
   cero `select("*")` en la capa pública — sigue vigente la lista blanca de
   `toPublicProduct`.
3. **RLS deny-by-default.** Las tres tablas nacen con RLS activo:
   - Un cliente ve **solo sus** pedidos (`auth_user_id = auth.uid()`).
   - El personal ve los de **su** `business_id`.
   - Nadie escribe `status` ni `payment_status` desde el navegador: se cambian
     por ruta de servidor con rol comprobado.

Además, propias de esta fase:

- **El portero exige `business_id`** para el ERP (§3). Con prueba que falla si
  alguien lo relaja.
- **Enumeración de pedidos:** el número `WEB-000001` es correlativo y adivinable,
  así que la consulta pública de un pedido va por token, como ya hace
  `/factura/[token]` (HMAC, sin sesión). Nunca por número.
- **Límite de intentos** en registro y entrada.
- Toda ruta pública nueva entra en `PUBLIC_PATHS` de `middleware.ts` — el
  tropiezo del `robots.txt` que devolvía 307 ya enseñó lo que cuesta olvidarlo.

---

## 7. Qué NO se toca

Se mantiene íntegro lo de `tienda-en-linea.md` §5, y en particular:

- **`auth-claims.ts`** — el `?? "cashier"` se queda. El arreglo va en el portero.
- **El POS** y sus motores: `emit_sale_atomic`, `cart-line.ts`, `pricing.ts`.
- **El killswitch de DGII** en sus cuatro capas. Un pedido web no emite e-CF.
- **`components/ui/`** — se consume, no se modifica.
- `public.products` y `public.product_lots`: cero columnas nuevas.

---

## 8. Riesgos

| ID | Riesgo | Mitigación |
|---|---|---|
| R-F3-01 | El registro público abre el ERP a cualquiera | El portero exige `business_id` **antes** de abrir el registro (§3), con prueba |
| R-F3-02 | Se vende en línea lo que ya se vendió en el mostrador | El pedido no reserva; quien confirma valida existencia y puede cancelar líneas (§4.5) |
| R-F3-03 | El cliente manipula el precio en el navegador | El servidor recalcula al abrir el carrito y otra vez al confirmar (§4.3) |
| R-F3-04 | Un cliente ve el pedido de otro adivinando el número | Consulta por token con HMAC, nunca por número (§6) |
| R-F3-05 | El visitante cree que pagó cuando el proveedor es simulado | El checkout dice "pedido recibido, te contactamos para el pago" mientras no haya afiliación (§4.6) |
| R-F3-06 | Cliente duplicado: ya existía en `clients` del mostrador | Se reutiliza el dedup server-side existente al registrarse (§4.4) |
| R-F3-07 | El pedido pierde el precio con que se vendió | Instantánea en `web_order_items` (§5) |

---

## 9. Alternativa descartada: instalar una plataforma de terceros

Se evaluó a petición del dueño (Shuup, Velstore, Bagisto, plantillas MERN y
similares). **Se descarta**, y no por calidad del código:

Cada una trae **su propia base** de productos, precios, existencias, clientes y
pedidos. DermaLand ya tiene la suya, con 1 355 productos, lotes con vencimiento,
existencia separada por sucursal y almacén, y facturación electrónica con la
DGII. Ponerla al lado significa **dos verdades sobre el mismo inventario** — el
día que el mostrador venda la última unidad, la web la sigue vendiendo — y
ninguna de esas plataformas sabe qué es un NCF ni un e-CF.

Lo que sí se aprovecha de ellas es **la referencia visual**: cómo se ve una
tienda de verdad. Eso alimenta F3.0.

---

## 10. Orden de entrega

| | Pieza | Bloqueada por |
|---|---|---|
| **F3.0** | La cara + recomendados | Nada |
| **F3.1** | Carrito | F3.0 |
| **F3.2** | Cuentas (portero primero) | — |
| **F3.3** | Pedidos en el ERP | F3.1 |
| **F3.4** | Entrega | **Decisión de negocio pendiente** |
| **F3.5** | Cobro simulado | F3.3 |

La tienda **sigue apagada** durante toda la fase. Encenderla es, como siempre,
una decisión del dueño.
