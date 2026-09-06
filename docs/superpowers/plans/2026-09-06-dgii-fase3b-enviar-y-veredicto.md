# DGII Fase 3B — Enviar el comprobante y recoger el veredicto

> **Para quien ejecute esto:** usa `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para ir tarea por tarea. Los pasos llevan casilla (`- [ ]`).

**Objetivo:** que DermaLand pueda enviar un comprobante ya firmado a la DGII, guardar la
evidencia de ese envío, y consultar después el veredicto — con el envío real **apagado por
defecto** y detrás de una llave que solo enciende el dueño.

**Arquitectura:** se porta la capa de envío de agendapp cambiando solo el almacén (Prisma → los
repositorios y funciones de la fase 2) y el transporte, que se inyecta. El circuito fiscal —el
orden de la semilla, la firma de la semilla, el token, la recepción y la consulta— no se toca.
Todas las pruebas corren contra el servidor de mentira que la fase 1 ya portó: **ninguna abre
una conexión a dgii.gov.do**.

**Stack:** Next 15.5, TypeScript estricto, Supabase (PostgREST + Storage), vitest.

## Restricciones globales

- 🔴 **Nada de esta fase puede enviar a la DGII sin que el dueño encienda la llave.** Los
  killswitches (`DGII_TESTECF_SEND_ENABLED`, `DGII_CERTECF_SEND_ENABLED`,
  `DGII_PROD_SEND_ENABLED`) valen `false` salvo que el entorno diga exactamente `"true"`. Hay
  una prueba que lo vigila en cada tarea que toque el envío.
- 🔴 **Ninguna prueba abre una conexión de red.** El transporte se inyecta siempre; el de verdad
  solo se construye dentro de la ruta que el dueño habilita. Cada tarea que toque el cliente
  lleva un espía sobre `fetch` que falla si alguien lo llama.
- **`~/Projects/agendapp` es SOLO LECTURA.** Al cerrar, `git -C ~/Projects/agendapp
  status --porcelain src/lib/dgii docs/dgii prisma` debe dar cero.
- **La lógica fiscal no se toca.** El orden de los pasos, los gates y qué se persiste vienen de
  agendapp. Cualquier desviación se documenta en `docs/decisiones.md` con su motivo.
- **`business_id` lo pone siempre el servidor**, nunca quien llama.
- **Las funciones de la base tienen `revoke` a `anon` y `authenticated`**: se llaman con
  `createServiceRoleClient()`, nunca con el cliente de la sesión.
- **Ningún certificado real entra al repositorio.** Las pruebas usan el autofirmado en memoria
  de `core/__port__/dgii-test-cert.ts`.
- **El módulo viejo se queda donde está y funcionando.** Se retira en la fase 8.
- `noUncheckedIndexedAccess: true`: aserciones `!` justificadas, nunca relajar el `tsconfig`.
- Comentarios y mensajes en español.

---

## Contexto que hace falta entender antes de empezar

### Qué hay ya, y de qué se parte

La **fase 1** portó el núcleo puro, y en él está todo lo que habla con la DGII, sin cablear:

- `core/dgii-client.ts` — el circuito: pedir semilla, firmarla, cambiarla por un token, enviar
  el comprobante, consultar el estado. **No abre red por su cuenta**: recibe el transporte.
- `core/dgii-http-transport.ts` — el transporte real. Se construye solo cuando alguien lo pide.
- `core/dgii-mock-server.ts` — el servidor de mentira contra el que corren todas las pruebas.
- `core/dgii-endpoints.ts` — las URL de cada ambiente.
- `core/seed-signer.ts` — la firma de la semilla, que es distinta de la del comprobante.
- `core/killswitches.ts` — `evaluateDgiiPreflightGates` y `assertDgiiSendAllowed`, los gates
  duros, más `realSendAllowedFor` y `envFlagForAmbiente`.
- `core/submission-state-machine.ts` y `core/estado-tras-envio.ts` — qué transición vale y qué
  estado deja cada respuesta.
- `core/dgii-response-normalizer.ts` — convierte cualquier respuesta en
  `{status, trackId, httpStatus, message}`.

La **fase 2** dejó en la base, ya aplicada: `dgii_submissions` (cada intento con su evidencia),
`dgii_status_logs` (cada consulta), y `electronic_invoices` con sus estados.

La **fase 3A** dejó el comprobante **firmado, validado y guardado**, con su número consumido y
la factura en `signed`. Ahí se detiene. Esta fase lo recoge desde ese punto.

### El circuito de envío, y por qué el orden importa

agendapp lo hace así, y no se cambia:

1. **Gates duros primero**, antes de tocar el transporte o el almacenamiento. Si el ambiente no
   tiene su llave encendida, se devuelve `blocked` y no se abre ninguna conexión.
2. Se **lee el XML firmado** del bucket. El que se transmite es el de la submission, no uno
   reconstruido: reconstruirlo sería firmar otra vez y dejar de saber qué se envió.
3. **Semilla → firma de la semilla → token.** La DGII entrega una semilla, se firma con el
   certificado, y a cambio da un token de sesión.
4. **Recepción**: se envía el comprobante con ese token. La respuesta trae un `trackId`.
5. Se **guarda la evidencia**: el intento, la respuesta cruda recortada, el `trackId`.

Y el veredicto va aparte, porque la DGII no lo da en el momento: se consulta después con el
`trackId`, y de ahí sale `aceptado`, `aceptado condicional` o `rechazado`.

### Los tres apagados, y qué apaga cada uno

Esto es lo que impide un envío accidental, y conviene tenerlo claro porque son cosas distintas:

| Apagado | Dónde | Qué impide |
|---|---|---|
| `DGII_*_SEND_ENABLED` | variable de entorno, por ambiente | Que se abra la conexión, aunque todo lo demás esté bien |
| `dgii_enabled_real_send` | columna de `dgii_settings`, por negocio | Que un negocio configurado emita de verdad |
| El ambiente (`testecf`/`certecf`/`ecf`) | columna de `dgii_settings` | A qué DGII se habla |

Los tres tienen que estar alineados para que salga algo. `realSendAllowedFor` del núcleo ya
compone esa decisión: **no la recalcules**, llámala.

### El hueco de la fase 2 que esta fase cierra

`docs/riesgos.md` → **`R-FIS-04`**. El comentario de `finalize_ecf_invoice` promete guardar
`xml_sha256` y `security_code`, y la función no persiste ninguno. La columna que existe se
llama **`hash_sha256`**; `security_code` **no existe** en `electronic_invoices` (el único de esa
migración pertenece a `dgii_certification_cases`, otra tabla).

Hoy eso deja cada comprobante firmado sin la huella que ata la fila de la base al fichero del
bucket. La fase 3A ya calcula el hash y lo envía; Postgres lo descarta. **La tarea 1 de esta
fase lo cierra con una migración.**

### Lo que esta fase deja fuera, a propósito

- **No hay pantalla ni ruta.** Nada de esto se puede disparar desde el navegador: eso es la
  fase 6. Aquí se construyen los servicios y se prueban con transporte inyectado.
- **No se cablea el punto de venta.** Fase 4.
- **No se envía nada de verdad.** Ni siquiera al ambiente de pruebas de la DGII: para eso hace
  falta que el dueño encienda la llave y haga el trámite, y eso es la fase 9 y el trámite de 15
  pasos.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `supabase/migrations/20260907090000_dgii_finalize_persiste_hash.sql` | Cierra `R-FIS-04`: que `finalize_ecf_invoice` guarde el hash. |
| `apps/web/src/features/dgii/services/preflight.ts` | Los gates duros del envío: qué falta y por qué. |
| `apps/web/src/features/dgii/services/preflight.test.ts` | Que un ambiente sin llave nunca pase. |
| `apps/web/src/features/dgii/services/submission.ts` | El circuito: semilla, token, recepción, evidencia. |
| `apps/web/src/features/dgii/services/submission.test.ts` | El circuito completo contra el servidor de mentira. |
| `apps/web/src/features/dgii/services/verdict.ts` | Consultar el estado y resolver el veredicto. |
| `apps/web/src/features/dgii/services/verdict.test.ts` | Los tres veredictos y el «todavía no hay». |
| `apps/web/src/server/repositories/supabase/dgii-submissions.ts` | `dgii_submissions` y `dgii_status_logs`. |
| `apps/web/src/features/dgii/services/dry-run.ts` | El circuito entero sin enviar: la prueba de que todo encaja. |
| `apps/web/src/features/dgii/services/dry-run.test.ts` | Que el ensayo no envía **nada**. |

---

## Tarea 1: que el hash se guarde de verdad

Cierra `R-FIS-04`. Es lo primero porque todo lo que viene guarda evidencia, y sin esto la
evidencia empieza coja.

**Ficheros:**
- Crear: `supabase/migrations/20260907090000_dgii_finalize_persiste_hash.sql`
- Modificar: `apps/web/src/features/dgii/db/migracion-fase2.test.ts` (añadir un `describe`)
- Modificar: `apps/web/src/server/repositories/supabase/dgii-sequences.ts` (el tipo de `finalizarFactura`)

**Interfaces:**
- Produce: `finalize_ecf_invoice` guardando `hash_sha256`; el tipo de `finalizarFactura` acepta
  `{ xml_signed_path: string; xml_sha256?: string }` y lo documenta.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// añadir a apps/web/src/features/dgii/db/migracion-fase2.test.ts
describe("fase 3b — finalize guarda la huella del XML firmado", () => {
  const codigo = leer("20260907090000_dgii_finalize_persiste_hash.sql").replace(/--.*$/gm, "");

  it("escribe hash_sha256, que es como se llama la columna de verdad", () => {
    // El comentario de la fase 2 prometía `xml_sha256`, un nombre que no existe
    // en esta tabla. La columna real la trajo la reincorporación de 0045.
    expect(codigo).toMatch(/hash_sha256\s*=/);
    expect(codigo).not.toMatch(/\bxml_sha256\s*=/);
  });

  it("lo toma del jsonb que ya recibe, sin cambiar la firma de la función", () => {
    expect(codigo).toMatch(/p_datos\s*->>\s*'xml_sha256'/);
    expect(codigo).toMatch(/create or replace function public\.finalize_ecf_invoice\(\s*p_business_id uuid,\s*p_invoice_id\s+uuid,\s*p_datos\s+jsonb\s*\)/);
  });

  it("no guarda security_code: esa columna no existe en electronic_invoices", () => {
    // El único `security_code` de la fase 2 pertenece a dgii_certification_cases.
    expect(codigo).not.toMatch(/security_code\s*=/);
  });

  it("sigue avanzando solo desde draft, y sigue diciendo que no si ya no lo estaba", () => {
    expect(codigo).toMatch(/status\s*=\s*'signed'/);
    expect(codigo).toMatch(/and status = 'draft'/);
    expect(codigo).toMatch(/NO_ESTABA_EN_DRAFT/);
  });

  it("conserva el revoke y el grant: seguir siendo inllamable desde el navegador", () => {
    expect(codigo).toMatch(/revoke execute on function public\.finalize_ecf_invoice\(uuid, uuid, jsonb\) from public, anon, authenticated/i);
    expect(codigo).toMatch(/grant execute on function public\.finalize_ecf_invoice\(uuid, uuid, jsonb\) to service_role/i);
  });

  it("no es destructiva", () => {
    expect(codigo).not.toMatch(/drop (table|column)|truncate|delete from/i);
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/features/dgii/db/migracion-fase2.test.ts
```
Esperado: FAIL — `ENOENT ... 20260907090000_dgii_finalize_persiste_hash.sql`.

- [ ] **Paso 3: escribir la migración**

Copia el cuerpo actual de `finalize_ecf_invoice` desde
`supabase/migrations/20260906090200_dgii_fase2_funciones.sql` y añade **una** columna al
`update`: `hash_sha256 = nullif(p_datos->>'xml_sha256', '')`. Nada más. El comentario de
cabecera tiene que decir la verdad esta vez: qué campos del `p_datos` se usan y cuáles se
ignoran, y por qué `security_code` no está.

Repite el `revoke` y el `grant`: un `create or replace` no los conserva por sí solo si la
función se recrea con otra firma, y aunque aquí la firma no cambia, dejarlos escritos hace la
migración autocontenida.

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/features/dgii/db/migracion-fase2.test.ts
```
Esperado: PASS.

- [ ] **Paso 5: ensanchar el tipo del repositorio**

En `apps/web/src/server/repositories/supabase/dgii-sequences.ts`, `finalizarFactura` recibe hoy
`datos: { xml_signed_path: string }` pero la fase 3A ya le pasa también `xml_sha256`. Declara el
campo, opcional, con un comentario que diga que lo consume la función de la base.

- [ ] **Paso 6: dry-run, sin `--apply`**

```bash
node scripts/db/apply-migration.mjs supabase/migrations/20260907090000_dgii_finalize_persiste_hash.sql
```
Esperado: imprime el fichero y no ejecuta. **No pasar `--apply`**: la aplica el dueño.

- [ ] **Paso 7: commit**

```bash
git add supabase/migrations/20260907090000_dgii_finalize_persiste_hash.sql apps/web/src/features/dgii/db/migracion-fase2.test.ts apps/web/src/server/repositories/supabase/dgii-sequences.ts
git commit -m "dgii fase 3b: finalize guarda la huella del XML firmado (cierra R-FIS-04)"
```

---

## Tarea 2: los gates del envío

Qué impide enviar, y por qué. Se comprueba **antes** de abrir ninguna conexión.

**Ficheros:**
- Crear: `apps/web/src/features/dgii/services/preflight.ts`
- Crear: `apps/web/src/features/dgii/services/preflight.test.ts`

**Interfaces:**
- Consume: `evaluateDgiiPreflightGates`, `assertDgiiSendAllowed`, `realSendAllowedFor`,
  `envFlagForAmbiente`, `getDgiiSendEnvironmentFlags` de `core/killswitches.ts`; y
  `obtenerConfiguracion` y `evaluarHabilitacion` de la fase 3A.
- Produce: `evaluarEnvio(businessId): Promise<EstadoEnvio>` con
  `{ ambiente, llaveDelAmbiente, envioRealDelNegocio, permitido, bloqueos: string[] }`;
  `puedeEnviar(estado): boolean`.

**Referencia de origen:** `~/Projects/agendapp/src/lib/dgii/preflight.ts`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// apps/web/src/features/dgii/services/preflight.test.ts
import { describe, it, expect } from "vitest";
import { puedeEnviar, type EstadoEnvio } from "./preflight";

const listo: EstadoEnvio = {
  ambiente: "testecf",
  llaveDelAmbiente: true,
  envioRealDelNegocio: true,
  permitido: true,
  bloqueos: [],
};

describe("gates del envío a la DGII", () => {
  it("con todo alineado, se puede enviar", () => {
    expect(puedeEnviar(listo)).toBe(true);
  });

  it("sin la llave del ambiente, NO — aunque el negocio lo tenga activado", () => {
    // La llave de entorno es lo último que impide un envío accidental.
    expect(puedeEnviar({ ...listo, llaveDelAmbiente: false, permitido: false, bloqueos: ["El envío a testecf está apagado."] })).toBe(false);
  });

  it("sin el permiso del negocio, NO — aunque la llave esté puesta", () => {
    expect(puedeEnviar({ ...listo, envioRealDelNegocio: false, permitido: false, bloqueos: ["El negocio no tiene el envío real activado."] })).toBe(false);
  });

  it("cualquier bloqueo manda, aunque el resto esté bien", () => {
    expect(puedeEnviar({ ...listo, bloqueos: ["motivo cualquiera"] })).toBe(false);
  });

  it("por defecto no se envía: sin variables de entorno, todo apagado", () => {
    // Un valor por defecto que envíe convierte un despliegue mal configurado
    // en comprobantes reales ante el Estado.
    expect(puedeEnviar({ ...listo, llaveDelAmbiente: false, permitido: false, bloqueos: ["apagado"] })).toBe(false);
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/features/dgii/services/preflight.test.ts
```
Esperado: FAIL — `Cannot find module './preflight'`.

- [ ] **Paso 3: escribir el módulo**

`evaluarEnvio` reúne la configuración, el estado de habilitación de la fase 3A, la llave del
ambiente (`envFlagForAmbiente` sobre `getDgiiSendEnvironmentFlags()`) y el permiso del negocio
(`dgii_enabled_real_send`), y **llama a `realSendAllowedFor` del núcleo** para componer
`permitido`. No recalcules esa decisión.

`puedeEnviar` devuelve `true` solo si `bloqueos` está vacío, igual que `puedeEmitir` de la
fase 3A: una sola fuente para lo que la pantalla enseña y lo que el servidor aplica.

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/features/dgii/services/preflight.test.ts
```
Esperado: PASS, 5 pruebas.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/features/dgii/services/preflight.ts apps/web/src/features/dgii/services/preflight.test.ts
git commit -m "dgii fase 3b: gates del envío"
```

---

## Tarea 3: el repositorio de envíos

**Ficheros:**
- Crear: `apps/web/src/server/repositories/supabase/dgii-submissions.ts`
- Crear: `apps/web/src/server/repositories/supabase/dgii-submissions.test.ts`

**Interfaces:**
- Produce: `crearRepositorioEnvios(cliente, businessId)` con `registrarIntento(datos)`,
  `listarIntentos(invoiceId)`, `registrarConsultaEstado(datos)`, `marcarTrackId(invoiceId, trackId)`,
  `listarEsperandoVeredicto(limite)`.
- Lo consumen las tareas 4 y 5.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// apps/web/src/server/repositories/supabase/dgii-submissions.test.ts
import { describe, it, expect, vi } from "vitest";
import { crearRepositorioEnvios } from "./dgii-submissions";

function clienteFalso() {
  const llamadas: Array<{ tabla: string; fila: unknown }> = [];
  const from = vi.fn((tabla: string) => ({
    insert: vi.fn(async (fila: unknown) => { llamadas.push({ tabla, fila }); return { data: [{ id: "s-1" }], error: null }; }),
    select: vi.fn(() => ({ eq: vi.fn(() => ({ eq: vi.fn(() => ({ order: vi.fn(async () => ({ data: [], error: null })) })) })) })),
  }));
  return { llamadas, from };
}

describe("repositorio de envíos fiscales", () => {
  it("el business_id lo pone el repositorio, nunca quien llama", async () => {
    const c = clienteFalso();
    const repo = crearRepositorioEnvios(c as never, "biz-1");
    await repo.registrarIntento({ invoiceId: "f-1", ambiente: "testecf", httpStatus: 200, business_id: "OTRA" } as never);
    expect((c.llamadas[0]!.fila as { business_id: string }).business_id).toBe("biz-1");
  });

  it("escribe en dgii_submissions, no en la tabla retirada", async () => {
    const c = clienteFalso();
    await crearRepositorioEnvios(c as never, "biz-1").registrarIntento({ invoiceId: "f-1", ambiente: "testecf", httpStatus: 200 } as never);
    expect(c.llamadas[0]!.tabla).toBe("dgii_submissions");
    expect(c.llamadas[0]!.tabla).not.toMatch(/legacy/);
  });

  it("la evidencia guardada NUNCA lleva el token ni la cabecera de autorización", async () => {
    // Un token en una tabla de auditoría es una credencial guardada en claro.
    const c = clienteFalso();
    await crearRepositorioEnvios(c as never, "biz-1").registrarIntento({
      invoiceId: "f-1", ambiente: "testecf", httpStatus: 200,
      requestHeaders: { Authorization: "Bearer SECRETO", "Content-Type": "application/xml" },
    } as never);
    const json = JSON.stringify(c.llamadas[0]!.fila);
    expect(json).not.toContain("SECRETO");
    expect(json.toLowerCase()).not.toContain("authorization");
  });

  it("la consulta de estado va a su propia tabla", async () => {
    const c = clienteFalso();
    await crearRepositorioEnvios(c as never, "biz-1").registrarConsultaEstado({ invoiceId: "f-1", trackId: "TRK-1", estado: "aceptado" } as never);
    expect(c.llamadas[0]!.tabla).toBe("dgii_status_logs");
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/server/repositories/supabase/dgii-submissions.test.ts
```
Esperado: FAIL — `Cannot find module './dgii-submissions'`.

- [ ] **Paso 3: escribir el repositorio**

Mismo patrón que `dgii-sequences.ts` y `dgii-settings.ts`: cliente de service-role, `business_id`
del closure, errores de la base como excepción. **Recorta las cabeceras antes de guardarlas**:
la columna `request_headers` de `dgii_submissions` no puede llevar `Authorization` ni ningún
token, y el propio comentario de la migración de la fase 2 lo dice.

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/server/repositories/supabase/dgii-submissions.test.ts
```
Esperado: PASS, 4 pruebas.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/server/repositories/supabase/dgii-submissions.ts apps/web/src/server/repositories/supabase/dgii-submissions.test.ts
git commit -m "dgii fase 3b: repositorio de envíos y consultas de estado"
```

---

## Tarea 4: el envío

La pieza que habla con la DGII. Es la de más riesgo de la fase, porque es la única que puede
abrir una conexión al Estado.

**Ficheros:**
- Crear: `apps/web/src/features/dgii/services/submission.ts`
- Crear: `apps/web/src/features/dgii/services/submission.test.ts`

**Interfaces:**
- Consume: todo lo anterior, más `core/dgii-client.ts`, `core/dgii-endpoints.ts`,
  `core/seed-signer.ts`, `core/dgii-response-normalizer.ts`, `core/estado-tras-envio.ts` y
  `core/dgii-mock-server.ts` (en pruebas).
- Produce: `enviarComprobante(ctx, invoiceId, dependencias?): Promise<ResultadoEnvio>` con
  `ResultadoEnvio = { ok: true; trackId: string; estado: string }
   | { ok: false; motivo: string; bloqueos?: string[] }`.

**Referencia de origen:** `~/Projects/agendapp/src/lib/dgii/submission-service.ts`, la función
`sendInvoiceToTestecf` (líneas 415 en adelante). El orden de sus pasos no se toca.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// apps/web/src/features/dgii/services/submission.test.ts
import { describe, it, expect, vi } from "vitest";
import { enviarComprobante } from "./submission";

function dobles(over: Record<string, unknown> = {}) {
  const llamadas: string[] = [];
  return {
    llamadas,
    envio: { bloqueos: [], permitido: true, ambiente: "testecf", llaveDelAmbiente: true, envioRealDelNegocio: true },
    almacenamiento: { leerXml: vi.fn(async () => { llamadas.push("leer"); return "<ECF/>"; }) },
    certificado: { p12: Buffer.from("x"), password: "y" },
    cliente: {
      requestSemilla: vi.fn(async () => { llamadas.push("semilla"); return { seedXml: "<Semilla/>" }; }),
      validarSemilla: vi.fn(async () => { llamadas.push("token"); return { token: "TOK" }; }),
      recepcionEcf: vi.fn(async () => { llamadas.push("recepcion"); return { status: "submitted", trackId: "TRK-1", httpStatus: 200 }; }),
    },
    envios: {
      registrarIntento: vi.fn(async () => { llamadas.push("evidencia"); return { id: "s-1" }; }),
      marcarTrackId: vi.fn(async () => { llamadas.push("trackid"); }),
    },
    ...over,
  };
}

describe("enviar un comprobante a la DGII", () => {
  it("con un gate cerrado NO se abre ninguna conexión, ni se lee el XML", async () => {
    const d = dobles({ envio: { bloqueos: ["El envío a testecf está apagado."], permitido: false } });
    const r = await enviarComprobante({ businessId: "b1", userId: "u1" }, "f-1", d as never);
    expect(r.ok).toBe(false);
    expect(d.cliente.requestSemilla).not.toHaveBeenCalled();
    expect(d.almacenamiento.leerXml).not.toHaveBeenCalled();
  });

  it("el orden es semilla → token → recepción, y no otro", async () => {
    const d = dobles();
    await enviarComprobante({ businessId: "b1", userId: "u1" }, "f-1", d as never);
    const i = (s: string) => d.llamadas.indexOf(s);
    expect(i("semilla")).toBeLessThan(i("token"));
    expect(i("token")).toBeLessThan(i("recepcion"));
  });

  it("transmite el XML guardado, no uno reconstruido", async () => {
    // Reconstruirlo sería firmar otra vez y dejar de saber qué se envió.
    const d = dobles();
    await enviarComprobante({ businessId: "b1", userId: "u1" }, "f-1", d as never);
    expect(d.almacenamiento.leerXml).toHaveBeenCalled();
    expect(d.cliente.recepcionEcf).toHaveBeenCalledWith(expect.objectContaining({ signedXml: "<ECF/>" }));
  });

  it("guarda la evidencia del intento aunque la DGII rechace", async () => {
    const d = dobles();
    d.cliente.recepcionEcf = vi.fn(async () => ({ status: "rejected", trackId: "TRK-2", httpStatus: 400, message: "no" }));
    const r = await enviarComprobante({ businessId: "b1", userId: "u1" }, "f-1", d as never);
    expect(d.envios.registrarIntento).toHaveBeenCalled();
    expect(r.ok).toBe(false);
  });

  it("si el transporte revienta, queda constancia del intento", async () => {
    const d = dobles();
    d.cliente.recepcionEcf = vi.fn(async () => { throw new Error("se cayó la red"); });
    const r = await enviarComprobante({ businessId: "b1", userId: "u1" }, "f-1", d as never);
    expect(r.ok).toBe(false);
    expect(d.envios.registrarIntento).toHaveBeenCalled();
  });

  it("no llama a fetch por su cuenta: el transporte se inyecta siempre", async () => {
    const original = globalThis.fetch;
    const espia = vi.fn(async () => { throw new Error("no debió tocar la red"); });
    globalThis.fetch = espia as never;
    try {
      await enviarComprobante({ businessId: "b1", userId: "u1" }, "f-1", dobles() as never);
      expect(espia).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/features/dgii/services/submission.test.ts
```
Esperado: FAIL — `Cannot find module './submission'`.

- [ ] **Paso 3: escribir el servicio**

Recibe sus dependencias por parámetro, con valores por defecto que son los reales, igual que
`prepare.ts` de la fase 3A. El orden es el de agendapp:

1. `evaluarEnvio`; si hay bloqueos, devolver sin tocar nada.
2. Leer el XML firmado del bucket.
3. `requestSemilla` → firmar la semilla con `core/seed-signer.ts` → `validarSemilla` para el token.
4. `recepcionEcf` con ese token.
5. Normalizar la respuesta y **guardar la evidencia siempre**, salga bien o mal.
6. Aplicar la transición con `core/estado-tras-envio.ts`: el estado nuevo lo decide el núcleo,
   no este servicio.

**El token no se guarda ni se registra en ningún sitio**, y las cabeceras se recortan antes de
persistirlas.

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/features/dgii/services/submission.test.ts
```
Esperado: PASS, 6 pruebas.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/features/dgii/services/submission.ts apps/web/src/features/dgii/services/submission.test.ts
git commit -m "dgii fase 3b: envío del comprobante a la DGII"
```

---

## Tarea 5: el veredicto

**Ficheros:**
- Crear: `apps/web/src/features/dgii/services/verdict.ts`
- Crear: `apps/web/src/features/dgii/services/verdict.test.ts`

**Interfaces:**
- Produce: `resolverVeredicto(ctx, invoiceId, dependencias?): Promise<Veredicto>` y
  `resolverPendientes(ctx, limite?, dependencias?): Promise<ResumenPendientes>`.

**Referencia de origen:** `~/Projects/agendapp/src/lib/dgii/estado-veredicto.ts`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// apps/web/src/features/dgii/services/verdict.test.ts
import { describe, it, expect, vi } from "vitest";
import { resolverVeredicto } from "./verdict";

function dobles(estado: string, over: Record<string, unknown> = {}) {
  return {
    factura: { id: "f-1", e_ncf: "E320000000007", status: "submitted", track_id: "TRK-1", ambiente: "testecf" },
    cliente: { consultaEstado: vi.fn(async () => ({ status: estado, trackId: "TRK-1", httpStatus: 200 })) },
    envios: { registrarConsultaEstado: vi.fn(async () => {}) },
    ...over,
  };
}

describe("resolver el veredicto de la DGII", () => {
  it("aceptado deja el comprobante aceptado", async () => {
    const r = await resolverVeredicto({ businessId: "b1" }, "f-1", dobles("accepted") as never);
    expect(r.estado).toBe("accepted");
  });

  it("rechazado deja el motivo escrito, no solo el estado", async () => {
    const d = dobles("rejected");
    d.cliente.consultaEstado = vi.fn(async () => ({ status: "rejected", trackId: "TRK-1", httpStatus: 200, message: "Firma inválida" }));
    const r = await resolverVeredicto({ businessId: "b1" }, "f-1", d as never);
    expect(r.estado).toBe("rejected");
    expect(r.motivo).toContain("Firma");
  });

  it("«en proceso» NO es un veredicto: no se marca nada", async () => {
    // Cerrar un comprobante como aceptado porque la DGII dijo «en proceso»
    // es declarar ante el Estado algo que no ha ocurrido.
    const r = await resolverVeredicto({ businessId: "b1" }, "f-1", dobles("in_process") as never);
    expect(r.estado).toBe("in_process");
    expect(r.resuelto).toBe(false);
  });

  it("sin trackId no se consulta: no hay nada que preguntar", async () => {
    const d = dobles("accepted", { factura: { id: "f-1", e_ncf: "E32", status: "signed", track_id: null, ambiente: "testecf" } });
    const r = await resolverVeredicto({ businessId: "b1" }, "f-1", d as never);
    expect(r.resuelto).toBe(false);
    expect(d.cliente.consultaEstado).not.toHaveBeenCalled();
  });

  it("cada consulta queda registrada, resuelva o no", async () => {
    const d = dobles("in_process");
    await resolverVeredicto({ businessId: "b1" }, "f-1", d as never);
    expect(d.envios.registrarConsultaEstado).toHaveBeenCalled();
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/features/dgii/services/verdict.test.ts
```
Esperado: FAIL — `Cannot find module './verdict'`.

- [ ] **Paso 3: escribir el servicio**

Sigue el orden de agendapp: si la factura no está en un estado que espere veredicto, no se
consulta. Si no hay `trackId`, tampoco. La transición la decide `core/submission-state-machine.ts`:
**ninguna transición puede llegar a `accepted` sin `trackId` y sin respuesta de la DGII**, y eso
ya lo vigila el núcleo. Cada consulta se registra en `dgii_status_logs`, resuelva o no.

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/features/dgii/services/verdict.test.ts
```
Esperado: PASS, 5 pruebas.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/features/dgii/services/verdict.ts apps/web/src/features/dgii/services/verdict.test.ts
git commit -m "dgii fase 3b: consulta de estado y veredicto"
```

---

## Tarea 6: el ensayo sin enviar

Recorre el circuito entero —preparar, firmar, guardar, y **hasta el borde del envío**— sin
mandar nada. Es lo que el dueño podrá correr antes de encender ninguna llave.

**Ficheros:**
- Crear: `apps/web/src/features/dgii/services/dry-run.ts`
- Crear: `apps/web/src/features/dgii/services/dry-run.test.ts`

**Interfaces:**
- Produce: `ensayoCompleto(businessId, entrada): Promise<ResultadoEnsayo>` con
  `{ pasos: Array<{ nombre: string; ok: boolean; detalle?: string }>; ok: boolean }`.

**Referencia de origen:** `~/Projects/agendapp/src/lib/dgii/dry-run.ts`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// apps/web/src/features/dgii/services/dry-run.test.ts
import { describe, it, expect, vi } from "vitest";
import { ensayoCompleto } from "./dry-run";

describe("ensayo del circuito fiscal", () => {
  it("NO envía nada, pase lo que pase", async () => {
    // Es la razón de existir de este módulo: comprobar que todo encaja
    // sin declarar nada ante el Estado.
    const original = globalThis.fetch;
    const espia = vi.fn(async () => { throw new Error("el ensayo NO puede tocar la red"); });
    globalThis.fetch = espia as never;
    try {
      await ensayoCompleto("b1", { tipoEcf: "32" } as never);
      expect(espia).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = original;
    }
  });

  it("informa paso a paso, y dice cuál falló", async () => {
    const r = await ensayoCompleto("b1", { tipoEcf: "32" } as never);
    expect(Array.isArray(r.pasos)).toBe(true);
    expect(r.pasos.length).toBeGreaterThan(0);
    for (const p of r.pasos) expect(typeof p.nombre).toBe("string");
  });

  it("no consume ningún número fiscal", async () => {
    // Un ensayo que gasta un e-NCF deja de ser un ensayo.
    const r = await ensayoCompleto("b1", { tipoEcf: "32" } as never);
    expect(JSON.stringify(r)).not.toMatch(/E3\d{11}/);
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/features/dgii/services/dry-run.test.ts
```
Esperado: FAIL — `Cannot find module './dry-run'`.

- [ ] **Paso 3: escribir el módulo**

Comprueba, en orden y sin detenerse en el primer fallo: configuración fiscal completa,
certificado activo y vigente, secuencia disponible, construcción del XML de muestra, validación
contra el XSD, firma, y los gates del envío. **Usa `peekNextEncf`, nunca `prepararFactura`**: el
ensayo mira el número, no lo consume.

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/features/dgii/services/dry-run.test.ts
```
Esperado: PASS, 3 pruebas.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/features/dgii/services/dry-run.ts apps/web/src/features/dgii/services/dry-run.test.ts
git commit -m "dgii fase 3b: ensayo del circuito sin enviar"
```

---

## Tarea 7: cierre

**Ficheros:**
- Modificar: `CHANGELOG.md`, `docs/estado-actual.md`, `docs/decisiones.md`, `docs/riesgos.md`,
  `package.json`

- [ ] **Paso 1: todo en verde**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json && npx vitest run
cd /Users/willianrodriguez/Projects/dermaland && pnpm --filter web build
```

- [ ] **Paso 2: revivir las pruebas que esperaban a esta fase**

```bash
cd apps/web && grep -rn "PENDIENTE fase 3" src/features/dgii/core/*.test.ts | head -40
```

Las que apunten a ficheros que esta fase acaba de crear se reviven: quitar el `.skip` y el
comentario, y correr. Si alguna falla, es que el fichero nuevo no cumple la invariante que
agendapp sí cumplía — para eso están.

- [ ] **Paso 3: comprobar que ninguna prueba toca la red**

```bash
cd apps/web && npx vitest run src/features/dgii 2>&1 | grep -i "dgii.gov.do" || echo "ninguna prueba tocó la DGII ✓"
```

- [ ] **Paso 4: comprobar que agendapp sigue intacto**

```bash
git -C ~/Projects/agendapp status --porcelain src/lib/dgii docs/dgii prisma | wc -l
```
Esperado: `0`.

- [ ] **Paso 5: documentar**

- `CHANGELOG.md`: entrada `[0.146.0]`.
- `docs/estado-actual.md`: bloque nuevo al principio.
- `docs/riesgos.md`: cerrar `R-FIS-04` cuando el dueño aplique la migración de la tarea 1; dejar
  `R-FIS-05` abierto, que es de la fase 4.
- `docs/decisiones.md`: por qué el transporte se inyecta siempre y el real solo se construye
  detrás de la llave.
- `package.json`: versión a `0.146.0`.

- [ ] **Paso 6: commit y push a Gitea**

```bash
git add -A
git commit -m "v0.146.0 — DGII fase 3B: enviar y recoger el veredicto"
git push gitea main
```

**No** se hace `git push origin main`.

---

## Verificación de la fase

- `cd apps/web && npx vitest run` — todo en verde, incluidas las 23 nuevas.
- `npx tsc --noEmit -p tsconfig.json` — sin errores.
- `pnpm --filter web build` — compila.
- **Ninguna prueba abre una conexión a dgii.gov.do** (lo vigilan las tareas 4 y 6).
- `git -C ~/Projects/agendapp status --porcelain src/lib/dgii docs/dgii prisma` — cero líneas.

## Lo que esta fase NO hace

- **No envía nada de verdad.** Ni al ambiente de pruebas: hace falta que el dueño encienda
  `DGII_TESTECF_SEND_ENABLED` y que exista el trámite.
- No tiene pantalla ni ruta: no se puede disparar desde el navegador. Fase 6.
- No cablea el punto de venta. Fase 4.
- No arregla que los comprobantes de crédito fiscal (tipo 31) fallen por falta de la fecha de
  vencimiento de la secuencia (`R-FIS-05`). Fase 4.
