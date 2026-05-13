# Riesgos conocidos

Riesgos vivos del proyecto, con mitigación y dueño cuando aplica. Cuando un
riesgo se cierra, mover la entrada al final con `[CERRADO YYYY-MM-DD]`.

---

## R-FIS-01 · Reglas documentales POS sin política fiscal final confirmada

**Fecha:** 2026-05-07
**Severidad:** Alta para producción · Aceptable para MVP
**Archivos:** `apps/web/src/features/sales/document-resolver.ts`,
`apps/web/src/features/pos/pos-terminal.tsx`

La función `resolveDocumentToIssue` cristaliza las reglas:

| billingType       | paymentMethod                          | resultado          |
|-------------------|----------------------------------------|--------------------|
| consumo           | cash · transfer · paypal · manual · other | Proforma         |
| consumo           | card · azul · cardnet · visanet        | Factura e-CF 32   |
| credito_fiscal    | cualquiera                             | Factura e-CF 31   |

Las reglas son las acordadas en el pedido del 2026-05-07, pero **no han
sido validadas contra la política fiscal definitiva del negocio ni
contra la normativa DGII vigente al 100%**. Hay zonas grises:

- `consumo + transfer` → ¿siempre proforma o algunos negocios prefieren
  factura e-CF 32?
- `credito_fiscal + cash` → ¿factura siempre, o sólo cuando el cliente
  pide explícitamente comprobante fiscal?
- Procesadores específicos (Azul, CardNET, VisaNet) tratados como `card`
  para la decisión documental. Verificar si el reporte de cierre debe
  diferenciarlos.

### Mitigación / plan de salida

1. Antes de producción: revisión con la dueña del negocio + contador, y
   ajuste de reglas en `document-resolver.ts`.
2. La función es pura y testeada (`document-resolver.test.ts`); cualquier
   cambio se cubre añadiendo casos al test.
3. Cuando DGII se conecte de verdad, validar que la `sequenceType`
   devuelta cuadra con las secuencias configuradas en
   `apps/web/src/server/services/dgii/`.
4. Mientras tanto: el comprobante imprime "FACTURA e-CF 31/32" pero
   **sin número fiscal real** — el campo `ecfNumber` permanece vacío
   hasta que DGII esté activo.

---

## R-FIS-02 · Secuencia DGII / e-CF aún no integrada

**Fecha:** 2026-05-07
**Severidad:** Alta para go-live · Aceptable para MVP

El POS hoy persiste el `documentKind`, `ecfType` y `sequenceType`
indicados por el resolver, pero **no consume ninguna secuencia real de
e-CF** porque el módulo DGII está en stubs. Las "facturas" emitidas
desde POS son visualmente facturas pero sin número fiscal.

### Mitigación / plan de salida

- Materializar `sequenceType` en el repositorio de secuencias
  (`apps/web/src/server/services/dgii/`) — incrementar y persistir el
  número antes de cerrar la venta.
- Sincronizar con la tabla `dgii_sequences` (Supabase) cuando esté
  activa.
- Hasta entonces, comunicar a usuarios: "los documentos marcados como
  FACTURA en pantalla aún no son fiscalmente válidos — ver
  `docs/dgii-setup.md`".

---

## Proformas en `localStorage` (MVP)

**Fecha:** 2026-05-07
**Severidad:** Alta para producción · Aceptable para MVP

Las proformas se persisten en `localStorage` bajo la key
`dermaland.proformas`. Mientras eso siga así:

- Las páginas de impresión (`/proformas/[id]/print`) **dependen del
  navegador local**: una proforma emitida en un dispositivo no se puede
  imprimir desde otro, ni desde otro perfil del mismo navegador.
- El servidor no puede pre-renderizar el ticket — la página debe diferir
  el render al cliente con el patrón `mounted` (ver
  [decisiones.md](./decisiones.md)) para evitar hydration mismatch.
- Vaciar caché / cambiar de navegador / modo incógnito = pérdida de datos.
- No hay aislamiento por `business_id`: cualquier proforma local es
  visible para cualquier sesión en ese navegador.

### Mitigación / plan de salida

En producción las proformas deben cargarse desde Supabase, filtradas por
`business_id` (y `branch_id` cuando corresponda), con RLS para que cada
negocio sólo vea las suyas. La ruta de impresión pasará a:

1. Consultar `proformas` en un Server Component o Route Handler usando el
   cliente Supabase server-side.
2. Renderizar el ticket directamente en SSR (sin patrón `mounted`).
3. Mantener `localStorage` sólo como caché optimista para el POS offline.

Mientras tanto, comunicar a usuarios que **el ticket sólo se puede imprimir
desde el navegador donde se emitió la proforma**.
