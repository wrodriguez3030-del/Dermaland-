# Decisiones técnicas

Registro de decisiones de arquitectura/implementación. Una entrada por
decisión, con fecha (YYYY-MM-DD), contexto y consecuencias.

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
