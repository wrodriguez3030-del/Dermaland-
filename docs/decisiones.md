# Decisiones técnicas

Registro de decisiones de arquitectura/implementación. Una entrada por
decisión, con fecha (YYYY-MM-DD), contexto y consecuencias.

---

## 2026-08-19 — Enlace de pago de Azul con confirmación manual, no adaptador de API

**Archivos:**
- `apps/web/src/features/storefront/azul-link.ts` (+ prueba)
- `apps/web/src/features/storefront/components/azul-pay-box.tsx`
- `supabase/migrations/20260819120000_web_settings_azul_payment_link.sql`

### Por qué

El comercio consiguió un **enlace de pago** en `pagos.azul.com.do` (el cliente
teclea el monto), no la afiliación de comercio electrónico con API. Un enlace
no tiene webhook ni verificación programática, así que **no encaja en el
contrato `PaymentProvider`** (crear intento + verificar) y se integró por el
riel que ya existía para la transferencia: el cliente paga fuera, sube
comprobante, y el admin lo acepta — que es lo ÚNICO que marca `pagado`. El
adaptador de Azul sigue sin escribirse (la regla de `pagos-en-linea.md` §1 no
cambia): esto es un método manual honesto, no una pasarela.

### Consecuencias

- Encender/apagar tarjeta es pegar/vaciar el enlace en la configuración de la
  tienda; sin despliegue. Fail-closed sin enlace, dominio validado en cliente
  y servidor.
- El monto correcto depende del cliente (Azul no permite fijarlo): se mitiga
  con el total copiable, el número de pedido como referencia y la revisión
  humana. Si algún día llega la afiliación con API, el enlace convive o se
  sustituye sin tocar pedidos ni base (el método sigue siendo `tarjeta`).

---

## 2026-08-05 — Arenero efímero en vez de base compartida para el simulacro de DR

**Archivos:**
- `scripts/backup/dr-drill.mjs`
- `scripts/backup/lib/dr-guards.mjs` (`assertOrigenDistinto`, `assertMagnitudCreible`, el contrato/lease)

### Por qué

B-01 exigía probar que un respaldo de producción **restaura de verdad**, no
solo que se genera. Eso necesita un destino donde restaurar. La alternativa
obvia — mantener un segundo proyecto Supabase (o una base persistente) como
"destino de pruebas" — se descartó a propósito: una base que sobrevive entre
corridas puede acumular residuos de una corrida anterior y aprobar un
simulacro que en realidad está comparando contra sí misma o contra un estado
viejo. Es exactamente el modo de falla que un simulacro de recuperación
existe para detectar, no para tener.

### Cómo

Cada corrida levanta un contenedor Docker desechable
(`supabase/postgres:17.6.1.132`) en el mismo servidor (`supabase-01`), sin
puertos publicados, restaura ahí el respaldo, compara, y lo destruye al
terminar. Dos guardas hacen que esto sea seguro y no un simulacro que se
autoaprueba:

1. **`assertOrigenDistinto`** — compara el `system_identifier` del clúster de
   origen contra el del destino (único por clúster, independiente del DSN).
   Sin esto, apuntar por error el destino a producción daría `diff.ok: true`
   trivialmente.
2. **Un contrato (*lease*) de 300 s, renovado en cada paso**, vigilado por un
   proceso `setsid` en el propio servidor. Si el proceso local muere de golpe
   (`SIGKILL`, corte de red, laptop suspendida), el vigilante destruye
   contenedor, volumen y respaldo temporal sin que nadie tenga que darse
   cuenta — verificado con un `SIGKILL` real: destruido en 35 s.

### Consecuencias

- Cada corrida es independiente y no puede "aprender" a pasar: el destino
  nace vacío y muere después de cada comparación.
- Complejidad extra (orquestación del contenedor + vigilante), pero a cambio
  no existe una segunda copia persistente de datos de producción en reposo
  en otro servidor — menos superficie de ataque, no más.
- El servidor aloja producción de otros clientes (`csl-app`, PalusaApp); el
  arenero nunca publica puertos y se verifica, corrida tras corrida, que los
  contenedores vecinos no se tocan (mismo uptime antes y después).

---

## 2026-08-06 — Break-glass en vez de códigos de recuperación para 2FA obligatorio

**Archivos:**
- `scripts/mfa-break-glass.mjs`
- `apps/web/src/lib/auth/mfa-gate.ts`
- `docs/security.md` (sección "Break-glass de 2FA")

### Por qué

Al volver obligatorio el 2FA para `admin`/`super_admin`/`is_platform_admin`
(B-04), hacía falta una vía de recuperación para quien pierda su dispositivo
TOTP — si no, un teléfono perdido significa quedar fuera del sistema para
siempre. La opción estándar son **códigos de recuperación** (un lote de
códigos de un solo uso generados al enrolar, que el usuario guarda aparte).
Se descartó: en una farmacia con dispositivos y turnos compartidos, esos
códigos son un secreto estático que hay que imprimir/guardar en algún sitio,
y ese sitio es exactamente donde se filtran — un código de recuperación
robado es un bypass permanente del 2FA que nadie audita hasta que ya se usó.

### Cómo

En vez de un secreto que el usuario custodia, la recuperación es una
**acción operativa auditada**: `scripts/mfa-break-glass.mjs`, corrido fuera de
la aplicación con la `service_role_key`, retira el segundo factor de **un**
usuario nombrado (nunca por patrón, nunca varios a la vez), pide confirmación
interactiva, y deja rastro en `audit_logs` — incluso si la operación se
corta a medias. Verificado 16/16 contra Supabase real con usuarios
desechables: el camino feliz retira el factor, la persona vuelve a entrar
solo con contraseña, y el rastro queda completo.

### Consecuencias

- No hay ningún secreto estático que un usuario pueda perder o que alguien
  pueda robar de un cajón. La recuperación exige poseer la
  `service_role_key`, que ya es el secreto más sensible del proyecto —no se
  añade una superficie nueva, se reutiliza la que ya existía.
- Eso convierte a la `service_role_key` en el punto único de fallo del 2FA
  entero (documentado como riesgo abierto `R-SEC-04` en `docs/riesgos.md`):
  quien la tenga puede retirar el factor de cualquiera. Es una decisión
  consciente, no un descuido — la alternativa (códigos de recuperación)
  tiene el mismo problema con un secreto peor custodiado.
- La recuperación es más lenta (requiere a alguien con la clave y presencia,
  no un código en un cajón), pero deja rastro siempre, cosa que un código de
  recuperación usado en secreto no garantiza.

---

## 2026-08-05 — El dump deja de ser destructivo por defecto

**Archivos:**
- `scripts/backup/lib/pg-dump-args.mjs`
- `scripts/backup/pg-dump-backup.mjs`

### Por qué

El script de respaldo generaba el dump con `--clean --if-exists`, así que el
archivo **empezaba con sentencias `DROP`**. Consecuencia real, no teórica: si
alguna vez el destino de una restauración se apunta por error (typo en el
DSN, variable de entorno equivocada), el respaldo no "ensucia" esa base con
datos viejos — **la vacía**, sin preguntar. Un script cuyo comportamiento por
defecto es destructivo es exactamente el tipo de herramienta que un día se
corre contra el sitio equivocado.

### Cómo

`--clean --if-exists` deja de ser el default. Hace falta pasar
`--with-drop` explícito para obtenerlo (lo que sí necesita el propio
`dr-drill.mjs`, porque el contenedor `supabase/postgres` trae objetos previos
que chocan sin el `DROP`). Sin ese flag, el dump es aditivo.

### Consecuencias

- El caso de uso normal (respaldo nocturno, guardado en el NAS) ya no puede
  destruir nada por definición, aunque alguien lo corra con el DSN
  equivocado.
- El caso que sí necesita `--clean` (restaurar sobre un destino con basura
  previa, como el arenero de DR) lo pide explícitamente, con un flag que deja
  constancia de la intención en el propio comando.

---

## 2026-08-05 — La huella de tablas se deriva de las migraciones, no se mantiene a mano

**Archivos:**
- `scripts/backup/lib/dermaland-footprint.mjs`
- `scripts/backup/lib/assert-safe-target.mjs`
- `scripts/lib/migration-objects.mjs` (reutilizado, ya existía para
  `scripts/audit-migrations.mjs`)

### Por qué

La guarda de destino (`assertSafeTarget`, que impide escribir en el proyecto
equivocado de `supabase-01` — que también aloja `csl-app` y PalusaApp)
comparaba contra una lista de tablas de DermaLand **escrita a mano**. Esa
lista tenía 16 de las 83 tablas reales, y **4 de esos 16 nombres ni siquiera
existían** (`sales`, `sale_items`, `categories`, `cash_sessions` — nunca
fueron los nombres reales; las tablas de verdad son `proformas`,
`product_categories`, `cash_register_sessions`). Con esa huella, un restore
real habría abortado **siempre** por "tablas desconocidas" — y una guarda que
estorba siempre termina desactivada por la primera persona con prisa, que es
el modo de falla que una guarda de seguridad no se puede permitir.

### Cómo

`dermaland-footprint.mjs` deriva la huella leyendo
`supabase/migrations/*.sql` en vivo con `extractObjects()` — el mismo
extractor que ya usa `scripts/audit-migrations.mjs` para B-07. La huella deja
de mantenerse en dos sitios (un archivo de migraciones y una lista aparte que
alguien tiene que recordar actualizar) y pasa a tener una sola fuente de
verdad. Verificado contra producción: las 83 tablas reales coinciden 1 a 1
con lo derivado del repo — 0 de más, 0 de menos.

### Consecuencias

- Agregar una migración nueva actualiza la huella automáticamente; nadie
  tiene que acordarse de tocar una lista aparte.
- La guarda (`assert-safe-target.mjs`) se mantiene pura y sin leer disco —
  recibe la huella ya construida como parámetro — para que sus pruebas
  unitarias sigan siendo deterministas e independientes del estado del repo.
- Reutiliza la misma auditoría por objeto que ya es la fuente de verdad para
  B-07, en vez de inventar un segundo mecanismo de "qué tablas son nuestras".

---

## 2026-05-07 — POS: layout responsivo + reglas documentales explícitas

**Archivos:**
- `apps/web/src/features/pos/pos-terminal.tsx`
- `apps/web/src/features/sales/document-resolver.ts` (nuevo)
- `apps/web/src/features/sales/document-resolver.test.ts` (nuevo)
- `apps/web/src/features/sales/components/receipt-80mm.tsx`
- `apps/web/src/types/index.ts` (campos opcionales `documentKind`, `ecfType`,
  `sequenceType` en `Proforma`)

### Por qué

El POS tenía tres problemas que se resolvieron en un solo pase:

1. **Layout no aprovechaba el ancho.** En desktop el panel derecho quedaba
   con un ancho fijo proporcional poco usable y los productos en una sola
   relación 1.4fr/1fr.
2. **No había regla clara de qué documento se emite.** Todo terminaba como
   "proforma" aunque la combinación de tipo de facturación + método de pago
   indicara que debía ser una factura e-CF.
3. **El selector de método de pago tenía un default implícito (`cash`)**
   que se veía resaltado desde el inicio y confundía: el operario podía
   creer que ya había elegido método cuando en realidad no lo había
   tocado.

### Cómo

1. **Layout fluido.** Wrapper cambia a
   `lg:grid-cols-[minmax(0,1.5fr)_minmax(380px,1fr)]
    xl:grid-cols-[minmax(0,2fr)_minmax(420px,1fr)]`. La grilla de productos
   sube a `sm:2 md:3 lg:3 xl:4 2xl:5`. Altura mínima en lugar de fija para
   no clipping en pantallas estrechas. Buscador y botones fluyen con
   `flex-wrap` y `min-w-[220px]`.

2. **Función pura `resolveDocumentToIssue({ billingType, paymentMethod })`.**
   Reglas:
   - `consumo` + (`cash` | `transfer` | `paypal` | `manual` | `other` | `null`)
     → **Proforma** (no fiscal).
   - `consumo` + (`card` | `azul` | `cardnet` | `visanet`)
     → **Factura e-CF 32 (Consumo)**.
   - `credito_fiscal` + cualquier método (incluido `null`)
     → **Factura e-CF 31 (Crédito Fiscal)**.

   Devuelve `{ documentKind, ecfType, sequenceType, label, buttonLabel }`.
   El POS lo usa para dibujar el indicador "Documento a emitir" y para la
   etiqueta del botón final ("Cobrar y emitir proforma" / "...factura").

3. **Selector explícito.** `paymentMethod` cambia de tipo a `PrimaryPaymentMethod
   | null` con default `null`. Botones con `role="radio"` y `aria-checked`,
   ningún botón resaltado al inicio. Submit deshabilitado mientras
   `paymentMethod === null` o el carrito está vacío. Aviso "selecciona uno"
   visible junto al título del selector.

4. **Validación de crédito fiscal.** Si `billingType === "credito_fiscal"` y
   el cliente no tiene `documentType === "rnc"` con `documentNumber`, se
   muestra un aviso ámbar y se bloquea el submit hasta que cambie cliente o
   tipo.

5. **Tipo `Proforma` extendido** con tres campos opcionales (`documentKind`,
   `ecfType`, `sequenceType`). Backward-compatible con proformas existentes.
   `Receipt80mm` los respeta para mostrar el rótulo correcto del
   comprobante (FACTURA e-CF 31/32 o PROFORMA).

### Consecuencias

- **Producción fiscal queda preparada sin costo de UI:** cuando se conecte
  DGII, sólo el repositorio tiene que materializar la secuencia indicada
  por `sequenceType`. El POS y el comprobante ya saben qué emitir.
- El selector de pago **obliga a un click consciente** — menos errores de
  "ay, pensé que era efectivo".
- El usuario ve **antes de cobrar** qué documento va a salir, lo que
  reduce reclamos de "esto debió ser factura, no proforma".

---

## 2026-05-07 — Página de impresión de proformas con render diferido

**Ruta:** `apps/web/src/app/(app)/proformas/[id]/print/page.tsx`

La página de impresión de proformas usa un componente cliente con un estado
`mounted` para evitar **hydration mismatch** al leer `localStorage`.

### Por qué

Mientras las proformas vivan en `localStorage` (transición a Supabase), el
servidor no puede saber si una proforma existe — sólo el navegador local
conoce el dato. Si el componente leyera `localStorage` durante el primer
render, el HTML del servidor (sin acceso a `window`) y el del cliente (que
sí lo tiene) divergirían y React lanzaría:

> Hydration failed because the server rendered HTML didn't match the client.

### Cómo

- El servidor y el primer render del cliente devuelven el mismo HTML
  estable: una tarjeta "Cargando proforma...".
- Tras `useEffect`, el componente marca `mounted = true` y llama
  `getProformaByIdFromStore(id)` para resolver el ticket.
- Si se encuentra → renderiza `Receipt80mm` con la proforma como prop.
- Si no existe → renderiza la card "Proforma no encontrada".
- `Receipt80mm` recibe los datos por props (no toca `window`,
  `localStorage`, `Date.now`, `Math.random`); las fechas se formatean a
  partir de `proforma.createdAt` que ya está persistido al emitir.

### Consecuencias

- Hay un parpadeo breve ("Cargando proforma...") antes de mostrar el
  ticket. Aceptable porque la página vive detrás de un click explícito en
  el POS / listado.
- Cuando la fuente de proformas pase de `localStorage` a Supabase, el
  patrón sigue siendo válido: bastará con sustituir
  `getProformaByIdFromStore` por la consulta server-side y el placeholder
  desaparecerá (o se mantendrá como skeleton durante el fetch).
