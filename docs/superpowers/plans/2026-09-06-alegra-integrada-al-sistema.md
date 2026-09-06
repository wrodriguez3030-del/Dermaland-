# Las ventas de Alegra, integradas al sistema

> **Para quien ejecute esto:** usa `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para ir tarea por tarea. Los pasos llevan casilla (`- [ ]`).

**Objetivo:** que las 14 965 facturas migradas de Alegra dejen de estar escondidas en sus
propias tablas y aparezcan donde el dueño las busca — el panel, los reportes de ventas, la
ficha del cliente y las cuentas por cobrar — marcadas como **migradas de Alegra**, sin copiar
ni duplicar una sola fila.

**Arquitectura:** **se cuenta en la base, no en el navegador.** Una capa de lectura que une las
dos fuentes (`proformas` y `alegra_invoices`) devolviendo *totales ya calculados* para el panel
y *páginas* para los listados. Nadie copia datos: las facturas se quedan donde están. Y de paso
se arregla lo que ya hacía lento el sistema antes de Alegra.

**Stack:** Next 15.5 (App Router), TypeScript estricto, Supabase por PostgREST, vitest.

## El rendimiento no es un extra de este plan: es la mitad del trabajo

Medido hoy contra la base de producción. **Al abrir el panel, el navegador se descarga y
procesa ~3 MB en 12 358 filas**:

| Tabla | Filas | Peso |
|---|---:|---:|
| `clients` | 6 525 | 1 334 KB |
| `inventory_movements` | 2 363 | 666 KB |
| `products` | 1 513 | 603 KB |
| `product_lots` | 1 957 | 357 KB |
| **Total** | **12 358** | **~2 961 KB** |

Tres de las cuatro rutas que sirven eso (`/api/proformas`, `/api/lots`, `/api/customers`) **no
tienen ningún límite**. El panel necesita cuatro números y una lista corta, y se está trayendo
la base entera para contar.

**Por eso el sistema se siente lento, y es anterior a Alegra.** Añadir las facturas en crudo
serían **+25 MB y +14 965 filas**: pasaría de lento a inusable.

La misma cuenta, resuelta en la base: **84 ms y ~40 bytes**. Los índices necesarios ya existen
desde la migración de Alegra (`alegra_invoices_business_date`, `_business_client`,
`_open_balance`).

**Regla de este plan:** ninguna pantalla recibe filas para contarlas. Si necesita un total, el
total llega hecho. Si necesita una lista, llega paginada.

## Restricciones globales

- 🔴 **No se copia ni se modifica ninguna factura de Alegra.** `alegra_invoices` y
  `alegra_invoice_items` son el historial tal como vino del sistema de origen: se leen y no se
  tocan. Alegra manda; DermaLand solo lee.
- 🔴 **No se inserta nada en `proformas`.** Es la tabla que usa el punto de venta en vivo. Una
  fila de más ahí es una venta fantasma en la caja.
- **Toda venta que se muestre lleva su origen visible.** Si viene de Alegra, se ve que viene de
  Alegra. Un número que mezcla dos fuentes sin decirlo es peor que dos números separados.
- **Las anuladas no suman.** `alegra_invoices.status = 'void'` queda fuera de todos los
  totales, igual que ya hace el módulo de reportes de Alegra.
- **`business_id` en toda consulta**, y RLS respetado: las tablas ya lo tienen.
- **El punto de venta no se toca.** Ni `proforma-store`, ni el POS, ni `emit_sale_atomic`.
- `noUncheckedIndexedAccess: true`: aserciones `!` justificadas, nunca relajar el `tsconfig`.
- 🔴 **Ninguna pantalla descarga filas para contarlas.** Los totales se calculan en la base y
  viajan hechos. Los listados van paginados, con tope duro en la ruta.
- 🔴 **Ninguna ruta nueva sin límite.** Y las tres existentes sin él se arreglan aquí.
- Comentarios en español.

---

## Contexto que hace falta entender antes de empezar

### Por qué el panel dice RD$0.00 teniendo 48 millones migrados

En la base, hoy:

| Tabla | Filas |
|---|---:|
| `proformas` (ventas propias del sistema) | **0** |
| `alegra_invoices` (migradas) | 14 965 |
| `alegra_invoice_items` | 31 213 |
| `clients` | 6 525 |
| `products` | 1 513 |

Las facturas no anuladas son **14 743**, de 2023-02-01 a 2026-09-05, por **RD$48 454 899,08**.

El panel (`app/(app)/page.tsx`) lee `useProformas()`, que se alimenta de `/api/proformas`.
Esa tabla está vacía porque DermaLand todavía no ha cobrado nada por su propio punto de venta:
todo el histórico está en Alegra. Los clientes y los productos sí se ven porque **esos** sí se
importaron a las tablas del sistema; las facturas se dejaron aparte a propósito.

Fue una decisión consciente al migrar —no mezclar el historial fiscal de un sistema con las
ventas del otro— y hoy se corrige el efecto, no la decisión: los datos siguen separados en la
base, y se unen **al leerlos**.

### Lo que ya existe y hay que reutilizar, no rehacer

- `features/alegra/sales-report.ts` — el motor de agregados de Alegra, ya probado (12 pruebas),
  que **excluye las anuladas de todos los totales**. Es la referencia de cómo se suman estas
  facturas.
- `features/alegra/client-purchases-tab.tsx` — la pestaña «Compras en Alegra» de la ficha del
  cliente.
- `app/(app)/reportes/alegra/page.tsx` y `app/(app)/cuentas-por-cobrar/alegra/page.tsx` — las
  pantallas separadas que hoy enseñan estos datos.
- `app/api/alegra/invoices/route.ts` — la API que sirve las facturas de un cliente.

**Esas pantallas separadas no se borran en este plan.** Siguen siendo útiles para mirar solo lo
de Alegra. Lo que se añade es que los sitios principales dejen de ignorarlas.

### El modelo unificado

Una venta, mirada desde el sistema, es lo mismo venga de donde venga: fecha, cliente, total,
forma de pago, y si está anulada. Lo que cambia es el origen y qué se puede hacer con ella.

```ts
export type OrigenVenta = "sistema" | "alegra";

export interface VentaUnificada {
  id: string;
  origen: OrigenVenta;
  /** Número visible: el de la proforma, o el NCF de Alegra. */
  numero: string;
  fecha: string;          // ISO
  clienteId: string | null;
  clienteNombre: string | null;
  total: number;
  itbis: number;
  subtotal: number;
  formaPago: string | null;
  vendedor: string | null;
  sucursalId: string | null;
  anulada: boolean;
  /** Solo las del sistema se pueden abrir, editar o anular. */
  editable: boolean;
}
```

`editable` es `false` para todo lo que venga de Alegra, y las pantallas lo respetan: una
factura migrada se ve, no se toca. Es historia, no una venta viva.

### Dónde tiene que aparecer

El dueño lo pidió en cuatro sitios, y en los cuatro entra:

1. **Panel principal** — que «Ventas del período» sume las dos fuentes.
2. **Reportes de ventas** — informes por vendedor, forma de pago y producto, con el histórico.
3. **Ficha del cliente** — sus compras de Alegra junto a las del sistema, no en otra pestaña.
4. **Cuentas por cobrar** — los saldos pendientes de Alegra dentro del total de lo que se debe.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `apps/web/src/features/ventas/venta-unificada.ts` | El tipo y los mapeadores de cada fuente al modelo común. |
| `apps/web/src/features/ventas/venta-unificada.test.ts` | Que el mapeo no pierda ni invente datos. |
| `apps/web/src/features/ventas/agregados.ts` | Sumar, agrupar y filtrar ventas unificadas. |
| `apps/web/src/features/ventas/agregados.test.ts` | Que las anuladas no sumen y que los totales cuadren. |
| `apps/web/src/server/repositories/supabase/ventas-unificadas.ts` | Lee las dos tablas y devuelve el modelo común. |
| `apps/web/src/app/api/ventas/route.ts` | La API que sirve las ventas unificadas. |
| `apps/web/src/features/ventas/etiqueta-origen.tsx` | La etiqueta «migrado de Alegra», en un solo sitio. |

---

## Tarea 1: el modelo unificado

**Ficheros:**
- Crear: `apps/web/src/features/ventas/venta-unificada.ts`
- Crear: `apps/web/src/features/ventas/venta-unificada.test.ts`

**Interfaces:**
- Produce: `OrigenVenta`, `VentaUnificada`, `desdeProforma(p): VentaUnificada`,
  `desdeFacturaAlegra(f): VentaUnificada`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// apps/web/src/features/ventas/venta-unificada.test.ts
import { describe, it, expect } from "vitest";
import { desdeProforma, desdeFacturaAlegra } from "./venta-unificada";

describe("modelo unificado de ventas", () => {
  it("una factura de Alegra nunca es editable: es historia, no una venta viva", () => {
    // Si fuera editable, alguien podría 'anular' desde DermaLand una factura
    // que en Alegra sigue viva, y los dos sistemas dejarían de cuadrar.
    const v = desdeFacturaAlegra({
      id: "a-1", ncf: "B0100000001", date: "2026-08-01", client_name: "Ana",
      client_id: "c-1", total: 1180, itbis: 180, subtotal: 1000,
      payment_method: "efectivo", seller_name: "María", branch_id: "s-1", status: "closed",
    } as never);
    expect(v.editable).toBe(false);
    expect(v.origen).toBe("alegra");
  });

  it("el número visible de una factura de Alegra es su NCF", () => {
    const v = desdeFacturaAlegra({ id: "a-1", ncf: "B0100000001", date: "2026-08-01", total: 0 } as never);
    expect(v.numero).toBe("B0100000001");
  });

  it("una factura anulada de Alegra se marca anulada", () => {
    const v = desdeFacturaAlegra({ id: "a-1", ncf: "B01", date: "2026-08-01", total: 100, status: "void" } as never);
    expect(v.anulada).toBe(true);
  });

  it("una proforma del sistema sí es editable y se marca como propia", () => {
    const v = desdeProforma({
      id: "p-1", number: "PRO-001", createdAt: "2026-09-01T10:00:00Z",
      customerName: "Luis", customerId: "c-2", total: 590, itbis: 90, subtotal: 500,
      paymentMethod: "card", branchId: "s-1", status: "completed",
    } as never);
    expect(v.editable).toBe(true);
    expect(v.origen).toBe("sistema");
  });

  it("no se inventa un cliente cuando la factura no lo trae", () => {
    // 40 contactos de Alegra llegaron sin nombre; poner "Cliente" ahí
    // convertiría un dato ausente en uno falso.
    const v = desdeFacturaAlegra({ id: "a-1", ncf: "B01", date: "2026-08-01", total: 100 } as never);
    expect(v.clienteNombre).toBeNull();
    expect(v.clienteId).toBeNull();
  });

  it("los importes son números, no cadenas: PostgREST devuelve numeric como texto", () => {
    const v = desdeFacturaAlegra({ id: "a-1", ncf: "B01", date: "2026-08-01", total: "1180.00", itbis: "180.00", subtotal: "1000.00" } as never);
    expect(v.total).toBe(1180);
    expect(v.itbis).toBe(180);
    expect(typeof v.total).toBe("number");
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/features/ventas/venta-unificada.test.ts
```
Esperado: FAIL — `Cannot find module './venta-unificada'`.

- [ ] **Paso 3: escribir el módulo**

Los dos mapeadores, sin lógica de negocio: traducen forma, no deciden nada. Lo único que hay
que resolver con cuidado es que PostgREST devuelve las columnas `numeric` como cadena, así que
los importes pasan por `Number()`; y que lo que no viene, no se inventa.

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/features/ventas/venta-unificada.test.ts
```
Esperado: PASS, 6 pruebas.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/features/ventas/venta-unificada.ts apps/web/src/features/ventas/venta-unificada.test.ts
git commit -m "ventas: modelo unificado de proformas y facturas de Alegra"
```

---

## Tarea 2: los agregados

**Ficheros:**
- Crear: `apps/web/src/features/ventas/agregados.ts`
- Crear: `apps/web/src/features/ventas/agregados.test.ts`

**Interfaces:**
- Consume: `VentaUnificada` de la tarea 1.
- Produce: `totalVendido(ventas)`, `contarVentas(ventas)`, `porOrigen(ventas)`,
  `porFormaPago(ventas)`, `porVendedor(ventas)`, `enRango(ventas, desde, hasta)`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// apps/web/src/features/ventas/agregados.test.ts
import { describe, it, expect } from "vitest";
import { totalVendido, contarVentas, porOrigen, enRango } from "./agregados";
import type { VentaUnificada } from "./venta-unificada";

const v = (over: Partial<VentaUnificada>): VentaUnificada => ({
  id: "x", origen: "alegra", numero: "B01", fecha: "2026-08-01T00:00:00Z",
  clienteId: null, clienteNombre: null, total: 100, itbis: 0, subtotal: 100,
  formaPago: null, vendedor: null, sucursalId: null, anulada: false, editable: false,
  ...over,
});

describe("agregados de ventas", () => {
  it("las anuladas NO suman", () => {
    // Es la regla que ya aplica el módulo de reportes de Alegra: una factura
    // anulada existe para auditarla, no para contarla como ingreso.
    const total = totalVendido([v({ total: 100 }), v({ total: 500, anulada: true })]);
    expect(total).toBe(100);
  });

  it("las anuladas tampoco cuentan como ventas", () => {
    expect(contarVentas([v({}), v({ anulada: true })])).toBe(1);
  });

  it("el desglose por origen deja ver de dónde sale cada peso", () => {
    // Sin esto, un total que mezcla dos fuentes no se puede auditar.
    const d = porOrigen([v({ total: 100 }), v({ total: 50, origen: "sistema" })]);
    expect(d.alegra.total).toBe(100);
    expect(d.sistema.total).toBe(50);
    expect(d.alegra.cantidad).toBe(1);
  });

  it("el rango de fechas incluye los extremos", () => {
    const ventas = [v({ fecha: "2026-08-01T00:00:00Z" }), v({ fecha: "2026-08-31T23:59:00Z" }), v({ fecha: "2026-09-01T00:00:00Z" })];
    expect(enRango(ventas, "2026-08-01", "2026-08-31")).toHaveLength(2);
  });

  it("el total de las dos fuentes es la suma de las dos, sin perder céntimos", () => {
    // Los importes vienen de numeric(14,2); sumarlos como flotantes acumula error.
    const ventas = Array.from({ length: 3 }, () => v({ total: 0.1 }));
    expect(totalVendido(ventas)).toBeCloseTo(0.3, 2);
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/features/ventas/agregados.test.ts
```
Esperado: FAIL — `Cannot find module './agregados'`.

- [ ] **Paso 3: escribir el módulo**

Funciones puras sobre arreglos. **Mira antes `features/alegra/sales-report.ts`**: ya resuelve
esto para una sola fuente y sus 12 pruebas fijan el criterio de las anuladas. Reutiliza el
criterio, no lo reinventes.

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/features/ventas/agregados.test.ts
```
Esperado: PASS, 5 pruebas.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/features/ventas/agregados.ts apps/web/src/features/ventas/agregados.test.ts
git commit -m "ventas: agregados sobre el modelo unificado"
```

---

## Tarea 3: el repositorio y la API

**Ficheros:**
- Crear: `apps/web/src/server/repositories/supabase/ventas-unificadas.ts`
- Crear: `apps/web/src/server/repositories/supabase/ventas-unificadas.test.ts`
- Crear: `apps/web/src/app/api/ventas/route.ts`

**Interfaces:**
- Produce **dos** funciones, y la distinción es el corazón del plan:
  - `resumenVentas(ctx, filtros): Promise<ResumenVentas>` — **totales calculados en la base**,
    con `{ total, cantidad, porOrigen: { sistema: {...}, alegra: {...} } }`. Es lo que usa el
    panel. Devuelve decenas de bytes, no megas.
  - `listarVentasUnificadas(ctx, filtros): Promise<{ ventas: VentaUnificada[]; hayMas: boolean }>`
    — **paginada**, con `limite` (tope duro 200) y `desplazamiento`. Es lo que usan los listados.
- `filtros: { desde?, hasta?, clienteId?, sucursalId?, incluirAlegra?, limite?, desplazamiento? }`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// apps/web/src/server/repositories/supabase/ventas-unificadas.test.ts
import { describe, it, expect, vi } from "vitest";
import { listarVentasUnificadas, resumenVentas } from "./ventas-unificadas";

function clienteFalso(proformas: unknown[], alegra: unknown[]) {
  const consultadas: string[] = [];
  const from = vi.fn((tabla: string) => {
    consultadas.push(tabla);
    const datos = tabla === "proformas" ? proformas : alegra;
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "lte", "order", "limit", "range"]) q[m] = vi.fn(() => q);
    q.then = (r: (v: unknown) => void) => r({ data: datos, error: null });
    return q;
  });
  return { consultadas, from };
}

describe("ventas unificadas", () => {
  it("lee las dos tablas y devuelve una sola lista", async () => {
    const c = clienteFalso([{ id: "p-1", total: 100 }], [{ id: "a-1", total: 200 }]);
    const r = await listarVentasUnificadas({ businessId: "b1", cliente: c } as never, {});
    expect(c.consultadas).toContain("proformas");
    expect(c.consultadas).toContain("alegra_invoices");
    expect(r).toHaveLength(2);
  });

  it("NUNCA escribe: las facturas de Alegra son historial, no datos vivos", async () => {
    const c = clienteFalso([], []);
    await listarVentasUnificadas({ businessId: "b1", cliente: c } as never, {});
    const q = c.from("alegra_invoices") as Record<string, unknown>;
    expect(q.insert).toBeUndefined();
    expect(q.update).toBeUndefined();
    expect(q.delete).toBeUndefined();
  });

  it("se puede pedir solo lo del sistema, sin Alegra", async () => {
    const c = clienteFalso([{ id: "p-1", total: 100 }], [{ id: "a-1", total: 200 }]);
    const r = await listarVentasUnificadas({ businessId: "b1", cliente: c } as never, { incluirAlegra: false });
    expect(c.consultadas).not.toContain("alegra_invoices");
    expect(r).toHaveLength(1);
  });

  it("el resumen NO descarga filas: cuenta en la base", async () => {
    // Es la regla del plan. Traer 14 965 facturas para sumarlas son 25 MB por
    // cada vez que alguien abre el panel.
    const c = clienteFalso([], []);
    const r = await resumenVentas({ businessId: "b1", cliente: c } as never, {});
    expect(r.total).toBeTypeOf("number");
    // La consulta pide cabecera de conteo, no el cuerpo.
    expect(JSON.stringify(c.consultadas)).not.toMatch(/select=\*/);
  });

  it("el listado tiene tope duro aunque pidan más", async () => {
    const c = clienteFalso([], []);
    await listarVentasUnificadas({ businessId: "b1", cliente: c } as never, { limite: 100000 });
    // El tope lo pone el servidor, no quien llama.
  });

  it("pagina las dos fuentes: PostgREST corta en 1000 filas EN SILENCIO", async () => {
    // Sin paginar, un negocio con 14 965 facturas vería 1 000 y creería que
    // son todas. Ya nos pasó al verificar la migración.
    const muchas = Array.from({ length: 1000 }, (_, i) => ({ id: `a-${i}`, total: 1 }));
    const c = clienteFalso([], muchas);
    await listarVentasUnificadas({ businessId: "b1", cliente: c } as never, {});
    const rangos = (c.from as unknown as { mock: { results: { value: Record<string, { mock: { calls: unknown[] } }> }[] } }).mock.results;
    expect(rangos.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/server/repositories/supabase/ventas-unificadas.test.ts
```
Esperado: FAIL — `Cannot find module './ventas-unificadas'`.

- [ ] **Paso 3: escribir el repositorio y la ruta**

**`resumenVentas` no trae filas.** Usa `count` y `sum` de PostgREST (`select=...` con
`head=true` y `Prefer: count=exact`, o una función en la base si sale más limpio) sobre las dos
tablas, y suma los dos resúmenes. Medido: 84 ms y ~40 bytes contra los 25 MB de traerlo todo.

**`listarVentasUnificadas` sí trae filas, pero acotadas.** Tope duro de 200 en la ruta, aunque
quien llame pida más: un cliente que pide 100 000 no puede tumbar el servidor. Ordena por fecha
descendente en la base, no en memoria.

La ruta `/api/ventas` expone las dos, respetando el rol como las demás rutas del proyecto.

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/server/repositories/supabase/ventas-unificadas.test.ts
```
Esperado: PASS, 6 pruebas.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/server/repositories/supabase/ventas-unificadas.ts apps/web/src/server/repositories/supabase/ventas-unificadas.test.ts apps/web/src/app/api/ventas/route.ts
git commit -m "ventas: repositorio y API de ventas unificadas"
```

---

## Tarea 4: la etiqueta de origen

Un solo componente para «migrado de Alegra», usado en los cuatro sitios. Si cada pantalla se
inventa su propia etiqueta, acaban diciendo cosas distintas.

**Ficheros:**
- Crear: `apps/web/src/features/ventas/etiqueta-origen.tsx`
- Crear: `apps/web/src/features/ventas/etiqueta-origen.test.tsx`

- [ ] **Paso 1: escribir la prueba que falla**

```tsx
// apps/web/src/features/ventas/etiqueta-origen.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EtiquetaOrigen } from "./etiqueta-origen";

describe("etiqueta de origen de una venta", () => {
  it("una venta de Alegra se ve marcada", () => {
    render(<EtiquetaOrigen origen="alegra" />);
    expect(screen.getByText(/Alegra/i)).toBeTruthy();
  });

  it("una venta del sistema no lleva etiqueta: es lo normal", () => {
    // Marcar lo normal convierte la etiqueta en ruido y deja de avisar.
    const { container } = render(<EtiquetaOrigen origen="sistema" />);
    expect(container.textContent?.trim()).toBe("");
  });

  it("la etiqueta dice que es histórico, no una venta del día", () => {
    render(<EtiquetaOrigen origen="alegra" />);
    expect(screen.getByTitle(/migrad/i)).toBeTruthy();
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/features/ventas/etiqueta-origen.test.tsx
```
Esperado: FAIL — `Cannot find module './etiqueta-origen'`.

- [ ] **Paso 3: escribir el componente**

Una etiqueta pequeña, con Tailwind 4 como el resto del proyecto, con `title` explicando que la
venta viene del sistema anterior y no se puede editar. Para `origen="sistema"` devuelve `null`.

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/features/ventas/etiqueta-origen.test.tsx
```
Esperado: PASS, 3 pruebas.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/features/ventas/etiqueta-origen.tsx apps/web/src/features/ventas/etiqueta-origen.test.tsx
git commit -m "ventas: etiqueta de origen, en un solo sitio"
```

---

## Tarea 5: el panel principal

**Ficheros:**
- Modificar: `apps/web/src/app/(app)/page.tsx`

**El riesgo de esta tarea:** el panel es la pantalla que el dueño mira todos los días, y el
punto de venta cuelga de ella (`Abrir POS`). **No se toca `useProformas` ni el almacén de
proformas.** Se añade una segunda fuente al lado, y las métricas suman las dos.

- [ ] **Paso 1: leer antes de tocar**

```bash
cd apps/web && sed -n '100,210p' "src/app/(app)/page.tsx"
```
Entiende cómo se calculan hoy `salesToday` y `transactionsToday`, y qué filtros ya aplica
(sucursal, mes, año). Los filtros existentes tienen que seguir funcionando sobre las dos
fuentes.

- [ ] **Paso 2: añadir la segunda fuente**

Un `useEffect` que pida **`/api/ventas?resumen=1`** con los mismos filtros. Llega el total ya
calculado, no las filas. Mientras carga, el panel enseña un indicador de carga: **nunca un cero
que parezca un dato** — un RD$0.00 mientras carga es exactamente lo que hizo pensar que los
datos no se habían migrado.

- [ ] **Paso 3: enseñar el desglose**

Bajo «Ventas del período», una línea con el desglose por origen —cuánto es del sistema y cuánto
migrado— porque un número que mezcla dos fuentes sin decirlo no se puede auditar. Ejemplo:
`— 14 743 ventas · todas migradas de Alegra`.

- [ ] **Paso 4: comprobarlo con los ojos**

```bash
pnpm --filter web dev
```
Abre http://localhost:3031 y comprueba: que «Ventas del período» ya no dice RD$0.00, que el
desglose cuadra con el total, que los filtros de sucursal, mes y año siguen funcionando, y que
el botón «Abrir POS» sigue abriendo el punto de venta.

- [ ] **Paso 5: commit**

```bash
git add "apps/web/src/app/(app)/page.tsx"
git commit -m "panel: las ventas del período incluyen el histórico de Alegra"
```

---

## Tarea 6: reportes, ficha del cliente y cuentas por cobrar

**Ficheros:**
- Modificar: `apps/web/src/app/(app)/reportes/` (los informes de ventas)
- Modificar: `apps/web/src/app/(app)/clientes/[id]/page.tsx`
- Modificar: `apps/web/src/app/(app)/cuentas-por-cobrar/page.tsx`

- [ ] **Paso 1: reportes de ventas**

Que los informes usen `/api/ventas` en vez de solo las proformas, con una casilla **«Incluir
facturas migradas de Alegra»**, marcada por defecto. Quien quiera ver solo lo del sistema la
desmarca. Cada fila lleva su etiqueta de origen.

- [ ] **Paso 2: ficha del cliente**

Hoy las compras de Alegra están en una pestaña aparte (`features/alegra/client-purchases-tab.tsx`).
Únelas al listado principal de compras del cliente, ordenadas por fecha, cada una con su
etiqueta. **La pestaña separada se queda**: sigue sirviendo para mirar solo lo de Alegra.

- [ ] **Paso 3: cuentas por cobrar**

Que el total de lo pendiente incluya los saldos de Alegra (`alegra_invoices.balance > 0`), con
su etiqueta y sin permitir aplicar pagos sobre ellas — **una factura de Alegra no se cobra desde
DermaLand**, porque el pago se registraría aquí y no allá, y los dos sistemas dejarían de
cuadrar. Si alguien lo intenta, el motivo tiene que verse.

- [ ] **Paso 4: comprobarlo con los ojos**

Con `pnpm --filter web dev`, recorre las tres pantallas y comprueba que los números cuadran con
los del panel y que las facturas migradas se ven pero no se pueden editar ni cobrar.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/app
git commit -m "reportes, ficha de cliente y cuentas por cobrar: incluyen el histórico de Alegra"
```

---

## Tarea 7: las tres rutas sin límite

Esto no es de Alegra: es lo que ya hacía lento el sistema. Se arregla aquí porque medirlo fue
parte de este trabajo y dejarlo sería saber dónde está el problema y no tocarlo.

**Ficheros:**
- Modificar: `apps/web/src/app/api/proformas/route.ts`
- Modificar: `apps/web/src/app/api/lots/route.ts`
- Modificar: `apps/web/src/app/api/customers/route.ts`
- Crear: `apps/web/src/app/api/rutas-con-limite.test.ts`

**El riesgo:** estas tres rutas alimentan el punto de venta y el inventario. Poner un límite
demasiado bajo rompe pantallas que hoy funcionan. **Antes de tocar nada, mira quién consume cada
una y con qué espera encontrarse.**

- [ ] **Paso 1: escribir la guarda que falla**

```ts
// apps/web/src/app/api/rutas-con-limite.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const lee = (r: string) => readFileSync(resolve(process.cwd(), "src/app/api", r), "utf8");

describe("ninguna ruta de listado devuelve la tabla entera", () => {
  // Medido el 06/09/2026: el panel descargaba ~3 MB en 12 358 filas porque
  // estas tres rutas no acotaban nada. El navegador contaba lo que la base
  // podía contar en milisegundos.
  const rutas = ["proformas/route.ts", "lots/route.ts", "customers/route.ts"];

  it.each(rutas)("%s acota el número de filas", (r) => {
    const src = lee(r).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(src, `${r} no limita nada`).toMatch(/\.limit\(|\.range\(/);
  });

  it.each(rutas)("%s tiene un tope que quien llama no puede superar", (r) => {
    const src = lee(r).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
    expect(src, `${r} deja que el cliente pida lo que quiera`).toMatch(/Math\.min|MAX_|TOPE_/);
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/app/api/rutas-con-limite.test.ts
```
Esperado: FAIL — las tres rutas sin límite.

- [ ] **Paso 3: ver quién las consume antes de tocarlas**

```bash
cd apps/web && grep -rn "/api/proformas\|/api/lots\|/api/customers" src --include=*.ts --include=*.tsx | grep -v "app/api"
```
Anota qué pantalla espera qué. Si alguna necesita el listado completo para funcionar, **dilo en
el informe en vez de romperla**: puede que necesite paginación propia, y eso es otro trabajo.

- [ ] **Paso 4: poner los límites**

Un tope por defecto razonable para lo que cada pantalla usa de verdad, y un tope duro que quien
llama no pueda superar (`Math.min(pedido, TOPE)`). Cada uno con un comentario que diga por qué
ese número y qué pantalla lo justifica.

- [ ] **Paso 5: comprobarlo con los ojos**

Con `pnpm --filter web dev`: que el punto de venta siga cobrando, que el inventario siga
listando lotes, y que el buscador de clientes siga encontrando. **Si alguna pantalla se queda
corta, el límite está mal puesto, no la pantalla.**

- [ ] **Paso 6: commit**

```bash
git add apps/web/src/app/api
git commit -m "api: acotar las tres rutas de listado que devolvían la tabla entera"
```

---

## Tarea 8: cierre

- [ ] **Paso 1: todo en verde**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json && npx vitest run
cd /Users/willianrodriguez/Projects/dermaland && pnpm --filter web build
```

- [ ] **Paso 2: que los números cuadren contra la base**

Comprueba que lo que enseña el panel es lo que hay en la base:

```sql
select count(*) filter (where status <> 'void') as ventas,
       sum(total) filter (where status <> 'void') as monto
from public.alegra_invoices;
```
Esperado hoy: **14 743 ventas, RD$48 454 899,08**. Si el panel dice otra cosa, hay un fallo de
agregación — no lo ajustes a mano, encuéntralo.

- [ ] **Paso 3: documentar**

- `CHANGELOG.md`: entrada nueva.
- `docs/estado-actual.md`: bloque nuevo.
- `docs/decisiones.md`: por qué se unen al leer y no copiando filas — las facturas de Alegra son
  historial de otro sistema, y copiarlas a `proformas` las metería en la tabla que usa el punto
  de venta en vivo.
- `package.json`: subir la versión.

- [ ] **Paso 4: commit y push a Gitea**

```bash
git add -A
git commit -m "las ventas de Alegra, integradas al sistema"
git push gitea main
```

---

## Verificación

- `npx vitest run` — todo en verde, incluidas las 24 nuevas.
- `npx tsc --noEmit -p tsconfig.json` — sin errores.
- `pnpm --filter web build` — compila.
- **El panel abre sin descargar la base**: el resumen llega calculado, no en filas.
- El panel muestra **14 743 ventas y RD$48 454 899,08**, y cuadra con la consulta de arriba.
- Los filtros de sucursal, mes y año siguen funcionando.
- El punto de venta sigue cobrando, y `proformas` sigue con las filas que tenía.
- Ninguna factura de Alegra se puede editar, anular ni cobrar desde DermaLand.

## Lo que este plan NO hace

- **No copia ni modifica ninguna factura de Alegra.** Se leen donde están.
- **No inserta nada en `proformas`.**
- No borra las pantallas separadas de Alegra: siguen sirviendo para mirar solo ese origen.
- No toca el punto de venta ni el sincronizador diario.
