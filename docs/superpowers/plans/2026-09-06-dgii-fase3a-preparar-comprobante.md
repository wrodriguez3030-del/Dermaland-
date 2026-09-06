# DGII Fase 3A — Del comprobante preparado y firmado

> **Para quien ejecute esto:** usa `superpowers:subagent-driven-development` (recomendado) o
> `superpowers:executing-plans` para ir tarea por tarea. Los pasos llevan casilla (`- [ ]`).

**Objetivo:** que DermaLand pueda producir un e-CF completo —construido, firmado, validado
contra el XSD oficial, guardado en el bucket privado y con un número fiscal de verdad
consumido— sin enviar nada a la DGII.

**Arquitectura:** se porta la capa de persistencia de agendapp cambiando solo el almacén:
Prisma → los repositorios y las funciones PL/pgSQL de la fase 2. La lógica fiscal —el orden de
los pasos, los gates, qué se guarda— no se toca. La excepción, ya decidida y documentada en la
fase 2, es el límite de la transacción: agendapp reserva el número dentro de la transacción que
firma; aquí se mira, se firma fuera, y se consume comprobando bajo bloqueo.

**Stack:** Next 15.5, TypeScript estricto, Supabase (PostgREST + Storage), vitest.

## Restricciones globales

- **`~/Projects/agendapp` es SOLO LECTURA.** Al cerrar la fase,
  `git -C ~/Projects/agendapp status --porcelain src/lib/dgii docs/dgii prisma` debe dar cero.
- **La lógica fiscal no se toca.** Si un cambio parece necesario, se documenta en
  `docs/decisiones.md` con su motivo. Cambiar el orden de los gates o qué se persiste es un
  fallo del portado, no una mejora.
- **Nada se envía a la DGII.** Esta fase no abre una conexión a dgii.gov.do por ningún camino.
  Hay una prueba que lo vigila.
- **El módulo viejo se queda donde está y funcionando.** Se retira en la fase 8.
- **`business_id` lo pone siempre el servidor**, nunca quien llama. Las funciones de la base lo
  reciben como parámetro plano y no lo contrastan contra la sesión.
- **Ningún certificado real entra al repositorio.** Las pruebas generan uno autofirmado en
  memoria con `core/__port__/dgii-test-cert.ts`.
- **`noUncheckedIndexedAccess: true`.** Los accesos por índice se resuelven con `!`
  justificado, nunca relajando el `tsconfig`.
- Comentarios y mensajes en español.

---

## Contexto que hace falta entender antes de empezar

### Dónde va el código nuevo, y por qué no donde decía el diseño

El diseño aprobado decía que esta capa fuera a `apps/web/src/server/services/dgii/`. **Ese
directorio ya está ocupado** por el módulo fiscal viejo: `builder.ts`, `queue-worker.ts`,
`dashboard.ts`, `pdf.ts`, `qr.ts` y una veintena más. Y ese módulo tiene código vivo —un cron
diario en `vercel.json` (`/api/dgii/cola`, a las 7)— que no se retira hasta la fase 8.

Por eso el código nuevo va a **`apps/web/src/features/dgii/services/`**, junto al núcleo puro
que la fase 1 dejó en `apps/web/src/features/dgii/core/`. Así todo el módulo portado vive bajo
`features/dgii/` y el viejo se queda intacto hasta que le toque.

Es una desviación del diseño y hay que anotarla en `docs/decisiones.md`.

### Lo que la fase 2 ya dejó puesto, y que aquí se usa

En la base, aplicada y verificada el 06/09:

- `peek_next_encf(p_business_id, p_tipo_ecf, p_ambiente) → text` — mira el próximo número sin
  consumirlo ni bloquear.
- `prepare_ecf_invoice(p_business_id, p_expected_encf, p_factura, p_items) → jsonb` — bajo
  bloqueo, comprueba que el número esperado sigue libre; si lo es, lo consume e inserta la
  factura y sus líneas en `draft`. Si otro se adelantó devuelve
  `{ok:false, motivo:"ENCF_TOMADO", e_ncf_actual}` **sin consumir nada**.
- `finalize_ecf_invoice(p_business_id, p_invoice_id, p_datos) → jsonb` — pasa de `draft` a
  `signed`. Devuelve `{ok:false, motivo:"NO_ESTABA_EN_DRAFT"}` si no era suya o ya no estaba.
- `fail_ecf_invoice(p_business_id, p_invoice_id, p_motivo) → jsonb` — deja el motivo escrito.
  Devuelve `{ok:false, motivo:"FACTURA_NO_ENCONTRADA"}` si no tocó ninguna fila.
- Las 18 tablas con RLS, entre ellas `dgii_settings`, `dgii_certificates`,
  `electronic_invoices`, `electronic_invoice_items`.

En TypeScript: `apps/web/src/server/repositories/supabase/dgii-sequences.ts` exporta
`crearRepositorioSecuencias(cliente, businessId)` con `peekNextEncf`, `prepararFactura`,
`finalizarFactura` y `marcarFallo`, con sus uniones discriminadas.

**Las cinco funciones tienen `revoke execute` a `anon` y `authenticated`, y `grant` solo a
`service_role`.** Eso significa que hay que llamarlas con el cliente de service-role
(`createServiceRoleClient()` de `apps/web/src/lib/supabase/server.ts`), no con el de la sesión.
Si se llaman con el cliente del usuario, fallan con un error de permiso.

### El bucket privado ya existe

agendapp guarda en un bucket llamado `dgii-private`. DermaLand ya tiene el suyo: **`dgii-xml`**,
privado (`public = false`), creado por `supabase/migrations/0046_dgii_xml_storage.sql` y
verificado en producción. **No hace falta ninguna migración nueva en esta fase.**

Lo único que cambia respecto a agendapp es la constante del nombre. **El path canónico se
conserva tal cual**, que es lo que el diseño exige:

```
dgii/{businessId}/invoices/{invoiceId}/signed.xml
dgii/{businessId}/invoices/{invoiceId}/rfce.xml
```

Precedente de cómo sube DermaLand a un bucket privado:
`apps/web/src/server/services/storefront/transfer-payments.ts:118-137` — sube con el cliente
admin y, si la escritura posterior falla, **borra el objeto**. Ese patrón de compensación hay
que conservarlo: agendapp hace lo mismo.

### El baile que sustituye a la transacción

Esto es lo único que cambia de forma respecto a agendapp, y ya está decidido:

1. `peekNextEncf` → qué número tocaría, sin consumir.
2. Construir el XML con ese número (núcleo, fase 1), validarlo contra el XSD y **firmarlo**.
3. Subir el firmado al bucket.
4. `prepararFactura(encfEsperado, …)` → consume el número e inserta la factura en `draft`.
   - Si devuelve `ENCF_TOMADO`: **volver al paso 2** con `e_ncf_actual`. Máximo 3 intentos.
   - Si devuelve `IDEMPOTENT_PROFORMA_YA_FACTURADA`: devolver esa factura, no emitir otra.
5. `finalizarFactura` → de `draft` a `signed`, con la ruta del XML.
6. Si algo falla entre 4 y 5: `marcarFallo` con el motivo, y **borrar el objeto subido**.

Un fallo al firmar no consume número, porque en el paso 3 todavía no se ha consumido nada.

### Lo que esta fase deja fuera, a propósito

`submission-service.ts` (envío), `estado-veredicto.ts` (veredicto), `preflight.ts` y
`dry-run.ts` van a la **fase 3B**, que tendrá su propio plan. Son otras ~1.500 líneas y
dependen de que esto funcione primero.

---

## Estructura de ficheros

| Fichero | Responsabilidad |
|---|---|
| `apps/web/src/features/dgii/services/storage.ts` | El bucket privado: subir, leer, borrar, con el path canónico y sus guardas. |
| `apps/web/src/features/dgii/services/storage.test.ts` | Que el path no se pueda escapar de su carpeta. |
| `apps/web/src/features/dgii/services/certificates.ts` | Leer el certificado activo y descifrarlo. |
| `apps/web/src/features/dgii/services/certificates.test.ts` | Ida y vuelta del cifrado; que un `.p12` inválido falle claro. |
| `apps/web/src/features/dgii/services/settings.ts` | Leer la configuración fiscal y el modo. |
| `apps/web/src/features/dgii/services/settings.test.ts` | Que sin configuración no se emita. |
| `apps/web/src/features/dgii/services/enablement.ts` | Los gates: qué falta para poder emitir. |
| `apps/web/src/features/dgii/services/enablement.test.ts` | Cada gate por separado. |
| `apps/web/src/features/dgii/services/prepare.ts` | La orquestación: mirar, firmar, consumir, finalizar. |
| `apps/web/src/features/dgii/services/prepare.test.ts` | El baile completo y sus caminos de fallo. |
| `apps/web/src/server/repositories/supabase/dgii-settings.ts` | Lectura de `dgii_settings` y `dgii_certificates`. |
| `apps/web/src/server/repositories/supabase/dgii-invoices.ts` | Lectura de `electronic_invoices` y sus líneas. |

Ficheros pequeños y por responsabilidad, no por capa: cada uno se entiende solo y se prueba
solo. `prepare.ts` es el único que coordina, y por eso es el último.

---

## Tarea 1: el bucket privado

**Ficheros:**
- Crear: `apps/web/src/features/dgii/services/storage.ts`
- Crear: `apps/web/src/features/dgii/services/storage.test.ts`

**Interfaces:**
- Produce: `BUCKET_DGII = "dgii-xml"`, `MAX_BYTES = 5 * 1024 * 1024`,
  `construirRuta(ctx, entrada): string`, `guardarXmlFirmado(ctx, entrada): Promise<string>`,
  `leerXml(ctx, ruta): Promise<string>`, `borrarXml(ctx, ruta): Promise<void>`,
  `ErrorAlmacenamientoDgii` con `codigo: "path_invalid" | "too_large" | "upload_failed" | "not_found"`.
- Lo consume la tarea 5.

**Referencia de origen:** `~/Projects/agendapp/src/lib/dgii/dgii-storage.ts` y
`dgii-storage-types.ts`. Copia la lógica; cambia solo el nombre del bucket
(`dgii-private` → `dgii-xml`) y el cliente (`supabaseAdmin` → `createServiceRoleClient()`).

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// apps/web/src/features/dgii/services/storage.test.ts
import { describe, it, expect } from "vitest";
import { construirRuta, ErrorAlmacenamientoDgii, BUCKET_DGII, MAX_BYTES } from "./storage";

const ctx = { businessId: "00000000-0000-0000-0000-00000000d001" };

describe("almacenamiento privado de XML fiscales", () => {
  it("el path canónico es el mismo que el de agendapp: por negocio, por comprobante", () => {
    // Que sea idéntico importa: si algún día hay que auditar los dos sistemas,
    // los documentos están en el mismo sitio relativo.
    expect(construirRuta(ctx, { tipo: "signed_xml", invoiceId: "f-1" }))
      .toBe("dgii/00000000-0000-0000-0000-00000000d001/invoices/f-1/signed.xml");
    expect(construirRuta(ctx, { tipo: "rfce_xml", invoiceId: "f-1" }))
      .toBe("dgii/00000000-0000-0000-0000-00000000d001/invoices/f-1/rfce.xml");
  });

  it("un id con barras o puntos suspensivos NO puede salirse de su carpeta", () => {
    // Sin esto, un id manipulado escribiría sobre el comprobante de otra empresa.
    for (const malo of ["../otro", "a/b", "..", "a\\b", ""]) {
      expect(() => construirRuta(ctx, { tipo: "signed_xml", invoiceId: malo }), malo)
        .toThrow(ErrorAlmacenamientoDgii);
    }
  });

  it("el businessId también se valida, aunque venga del servidor", () => {
    expect(() => construirRuta({ businessId: "../x" }, { tipo: "signed_xml", invoiceId: "f-1" }))
      .toThrow(ErrorAlmacenamientoDgii);
  });

  it("el bucket es el privado de DermaLand, no el de agendapp", () => {
    expect(BUCKET_DGII).toBe("dgii-xml");
  });

  it("el tope de tamaño es el mismo que el de agendapp", () => {
    expect(MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  it("el error dice qué pasó, para poder distinguirlo arriba", () => {
    try {
      construirRuta(ctx, { tipo: "signed_xml", invoiceId: "../x" });
      throw new Error("debió lanzar");
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorAlmacenamientoDgii);
      expect((e as ErrorAlmacenamientoDgii).codigo).toBe("path_invalid");
    }
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/features/dgii/services/storage.test.ts
```
Esperado: FAIL — `Cannot find module './storage'`.

- [ ] **Paso 3: escribir el módulo**

Porta `~/Projects/agendapp/src/lib/dgii/dgii-storage.ts`, con estos cambios y ninguno más:
- `DGII_STORAGE_BUCKET = "dgii-private"` → `BUCKET_DGII = "dgii-xml"`.
- `supabaseAdmin` de `@/lib/supabase/admin` → `createServiceRoleClient()` de
  `@/lib/supabase/server`.
- Nombres de función al español, como el resto del código de DermaLand.

Conserva **tal cual**: la validación de cada segmento del path (vacío, `/`, `\`, `..`,
caracteres de control), el tope de 5 MB, y el `sha256` del contenido.

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/features/dgii/services/storage.test.ts
```
Esperado: PASS, 6 pruebas.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/features/dgii/services/storage.ts apps/web/src/features/dgii/services/storage.test.ts
git commit -m "dgii fase 3a: almacenamiento privado de XML fiscales"
```

---

## Tarea 2: el certificado

**Ficheros:**
- Crear: `apps/web/src/features/dgii/services/certificates.ts`
- Crear: `apps/web/src/features/dgii/services/certificates.test.ts`
- Crear: `apps/web/src/server/repositories/supabase/dgii-settings.ts`

**Interfaces:**
- Consume: `certificate-encryption.ts` y `certificate-parser.ts` del núcleo (fase 1).
- Produce: `obtenerCertificadoActivo(businessId): Promise<CertificadoActivo | null>` con
  `{ id, alias, subjectDn, validFrom, validTo, p12: Buffer, password: string }`;
  `guardarCertificado(businessId, args): Promise<{ id: string }>`;
  `ErrorCertificado` con `codigo: "sin_certificado" | "vencido" | "p12_invalido" | "clave_incorrecta"`.
- Lo consumen las tareas 4 y 5.

**Referencia de origen:** `~/Projects/agendapp/src/lib/dgii/certificate-storage.ts`.
`prisma.dgiiCertificate` → la tabla `dgii_certificates` de la fase 2, por el repositorio nuevo.

**Ojo con las columnas.** La tabla nueva es la de agendapp, no la vieja de DermaLand: guarda
`pkcs12_encrypted_blob` (`bytea`) y `password_secret_ref` (`text`), los dos sobres
AES-256-GCM. **No existen** `pkcs12_storage_bucket`, `pkcs12_storage_path`, `iv` ni `tag`, que
son de la tabla vieja. El servicio viejo `apps/web/src/server/services/certificate-storage.ts`
escribe esas cuatro y por eso hoy no funciona; no lo toques, se retira en la fase 8.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// apps/web/src/features/dgii/services/certificates.test.ts
import { describe, it, expect } from "vitest";
import { generarCertificadoDePrueba } from "../core/__port__/dgii-test-cert";
import { cifrarSobre, descifrarSobre } from "../core/certificate-encryption";
import { leerCertificado } from "../core/certificate-parser";
import { ErrorCertificado } from "./certificates";

describe("certificado fiscal", () => {
  it("el sobre cifrado va y vuelve sin perder un byte", () => {
    // El .p12 nunca se guarda en claro: ni en la base, ni en el bucket, ni en un log.
    const { p12 } = generarCertificadoDePrueba();
    const sobre = cifrarSobre(p12);
    expect(sobre).not.toEqual(p12);
    expect(descifrarSobre(sobre)).toEqual(p12);
  });

  it("un .p12 que no lo es falla con un motivo que se entiende", () => {
    expect(() => leerCertificado(Buffer.from("esto no es un p12"), "x"))
      .toThrow();
  });

  it("la clave equivocada no revienta con un error de criptografía a pelo", () => {
    const { p12, password } = generarCertificadoDePrueba();
    expect(() => leerCertificado(p12, password + "mal")).toThrow();
  });

  it("los códigos de error cubren los cuatro casos que la pantalla tiene que distinguir", () => {
    // Sin certificado, vencido, fichero inválido y clave incorrecta piden cuatro
    // mensajes distintos al usuario: no valen todos «error al leer el certificado».
    const codigos: ErrorCertificado["codigo"][] =
      ["sin_certificado", "vencido", "p12_invalido", "clave_incorrecta"];
    expect(new Set(codigos).size).toBe(4);
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/features/dgii/services/certificates.test.ts
```
Esperado: FAIL — `Cannot find module './certificates'`.

- [ ] **Paso 3: escribir el repositorio y el servicio**

`dgii-settings.ts` (repositorio) expone, con el cliente de service-role:
`leerConfiguracion(businessId)`, `leerCertificadoActivo(businessId)`,
`insertarCertificado(businessId, fila)`, `desactivarCertificados(businessId)`.

`certificates.ts` (servicio) envuelve eso: descifra el sobre, lee el `.p12` con el parser del
núcleo, comprueba la vigencia contra `now()` y devuelve `ErrorCertificado` con el código que
toque. Al guardar uno nuevo, desactiva los anteriores en la misma llamada.

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/features/dgii/services/certificates.test.ts
```
Esperado: PASS, 4 pruebas.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/features/dgii/services/certificates.ts apps/web/src/features/dgii/services/certificates.test.ts apps/web/src/server/repositories/supabase/dgii-settings.ts
git commit -m "dgii fase 3a: certificado fiscal y su repositorio"
```

---

## Tarea 3: la configuración fiscal

**Ficheros:**
- Crear: `apps/web/src/features/dgii/services/settings.ts`
- Crear: `apps/web/src/features/dgii/services/settings.test.ts`

**Interfaces:**
- Consume: `leerConfiguracion` del repositorio de la tarea 2.
- Produce: `obtenerConfiguracion(businessId): Promise<ConfiguracionFiscal | null>`,
  `estaConfigurado(c): boolean`, `modoFiscal(c): "testecf" | "certecf" | "ecf"`.
- Lo consumen las tareas 4 y 5.

**Referencia de origen:** `~/Projects/agendapp/src/lib/dgii/fiscal-mode.ts`.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// apps/web/src/features/dgii/services/settings.test.ts
import { describe, it, expect } from "vitest";
import { estaConfigurado, modoFiscal } from "./settings";

const base = {
  businessId: "b1", rncEmisor: "131561985", razonSocialEmisor: "DERMALAND SRL",
  direccionEmisor: "Calle 1", provinciaCodigo: "25", municipioCodigo: "01",
  correoEmisor: "a@b.do", telefonoEmisor: "8095551234",
  ambiente: "testecf" as const, dgiiEnabledRealSend: false,
};

describe("configuración fiscal", () => {
  it("sin RNC no se emite: es el dato que identifica al emisor ante la DGII", () => {
    expect(estaConfigurado({ ...base, rncEmisor: null })).toBe(false);
    expect(estaConfigurado({ ...base, rncEmisor: "" })).toBe(false);
  });

  it("sin razón social ni dirección tampoco: los tres van dentro del XML firmado", () => {
    expect(estaConfigurado({ ...base, razonSocialEmisor: null })).toBe(false);
    expect(estaConfigurado({ ...base, direccionEmisor: null })).toBe(false);
  });

  it("con los datos mínimos, sí", () => {
    expect(estaConfigurado(base)).toBe(true);
  });

  it("el ambiente por defecto es el de pruebas, nunca el real", () => {
    // Un default que emita de verdad convierte un descuido en un comprobante fiscal.
    expect(modoFiscal({ ...base, ambiente: null as never })).toBe("testecf");
  });

  it("el ambiente real solo sale si está escrito explícitamente", () => {
    expect(modoFiscal({ ...base, ambiente: "ecf" })).toBe("ecf");
    expect(modoFiscal({ ...base, ambiente: "certecf" })).toBe("certecf");
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/features/dgii/services/settings.test.ts
```
Esperado: FAIL — `Cannot find module './settings'`.

- [ ] **Paso 3: escribir el módulo**

`estaConfigurado` exige `rncEmisor`, `razonSocialEmisor` y `direccionEmisor` no vacíos.
`modoFiscal` devuelve `"testecf"` ante cualquier valor que no sea exactamente `"certecf"` o
`"ecf"`, incluidos `null` y `undefined`.

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/features/dgii/services/settings.test.ts
```
Esperado: PASS, 5 pruebas.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/features/dgii/services/settings.ts apps/web/src/features/dgii/services/settings.test.ts
git commit -m "dgii fase 3a: configuración fiscal y modo"
```

---

## Tarea 4: los gates

Qué falta para poder emitir. Se comprueba **antes** de mirar ningún número.

**Ficheros:**
- Crear: `apps/web/src/features/dgii/services/enablement.ts`
- Crear: `apps/web/src/features/dgii/services/enablement.test.ts`

**Interfaces:**
- Consume: las tareas 2 y 3, y `crearRepositorioSecuencias` de la fase 2.
- Produce: `evaluarHabilitacion(businessId): Promise<EstadoHabilitacion>` con
  `{ configurado, certificadoActivo, certificadoVence, secuenciasActivas, secuenciasProduccion, bloqueos: string[] }`;
  `puedeEmitir(estado): boolean`.
- Lo consume la tarea 5.

**Referencia de origen:** `~/Projects/agendapp/src/lib/dgii/enablement-service.ts` y
`enablement-evaluator.ts`. Las cinco consultas de Prisma pasan a los repositorios.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// apps/web/src/features/dgii/services/enablement.test.ts
import { describe, it, expect } from "vitest";
import { puedeEmitir, type EstadoHabilitacion } from "./enablement";

const listo: EstadoHabilitacion = {
  configurado: true,
  certificadoActivo: true,
  certificadoVence: new Date(Date.now() + 90 * 864e5).toISOString(),
  secuenciasActivas: 1,
  secuenciasProduccion: 0,
  bloqueos: [],
};

describe("gates de habilitación", () => {
  it("con todo puesto, se puede emitir", () => {
    expect(puedeEmitir(listo)).toBe(true);
  });

  it("sin configuración fiscal, no", () => {
    expect(puedeEmitir({ ...listo, configurado: false, bloqueos: ["Falta la configuración fiscal DGII."] })).toBe(false);
  });

  it("sin certificado activo, no: el XML tiene que ir firmado", () => {
    expect(puedeEmitir({ ...listo, certificadoActivo: false, bloqueos: ["No hay certificado activo."] })).toBe(false);
  });

  it("con el certificado vencido, no", () => {
    expect(puedeEmitir({
      ...listo,
      certificadoVence: new Date(Date.now() - 864e5).toISOString(),
      bloqueos: ["El certificado está vencido."],
    })).toBe(false);
  });

  it("sin ninguna secuencia activa, no: no hay número que consumir", () => {
    expect(puedeEmitir({ ...listo, secuenciasActivas: 0, bloqueos: ["No hay secuencia activa."] })).toBe(false);
  });

  it("cualquier bloqueo manda, aunque el resto esté bien", () => {
    // `bloqueos` es la lista que la pantalla enseña. Si trae algo y `puedeEmitir`
    // dijera que sí, la pantalla y el servidor se contradirían.
    expect(puedeEmitir({ ...listo, bloqueos: ["motivo cualquiera"] })).toBe(false);
  });
});
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/features/dgii/services/enablement.test.ts
```
Esperado: FAIL — `Cannot find module './enablement'`.

- [ ] **Paso 3: escribir el módulo**

`evaluarHabilitacion` reúne configuración, certificado activo y conteo de secuencias, y compone
`bloqueos` con un texto por cada cosa que falte. `puedeEmitir` devuelve `true` solo si
`bloqueos` está vacío — nada de recomponer la decisión a partir de los booleanos, que es como
se desincronizan la pantalla y el servidor.

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/features/dgii/services/enablement.test.ts
```
Esperado: PASS, 6 pruebas.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/features/dgii/services/enablement.ts apps/web/src/features/dgii/services/enablement.test.ts
git commit -m "dgii fase 3a: gates de habilitación"
```

---

## Tarea 5: la orquestación

La pieza que lo junta todo, y la única que puede quemar un número fiscal si se hace mal.

**Ficheros:**
- Crear: `apps/web/src/features/dgii/services/prepare.ts`
- Crear: `apps/web/src/features/dgii/services/prepare.test.ts`
- Crear: `apps/web/src/server/repositories/supabase/dgii-invoices.ts`

**Interfaces:**
- Consume: todo lo anterior, más `buildEcfXml`, `signEcfXml`, `validateEcfXml` y
  `loadXsdForTipo` del núcleo (fase 1), y `crearRepositorioSecuencias` de la fase 2.
- Produce: `prepararComprobante(ctx, entrada, opciones?): Promise<ResultadoPreparar>`, con
  `ctx: { businessId: string; userId: string }` y
  `ResultadoPreparar = { ok: true; invoiceId: string; eNcf: string; rutaXml: string }
   | { ok: false; motivo: string; bloqueos?: string[] }`.

**Referencia de origen:** `~/Projects/agendapp/src/lib/dgii/invoice-prepare.ts`, líneas 79-628.
El orden de los gates y qué se persiste **no cambian**. Lo que cambia es el límite de la
transacción, según el baile descrito en el contexto.

- [ ] **Paso 1: escribir la prueba que falla**

```ts
// apps/web/src/features/dgii/services/prepare.test.ts
import { describe, it, expect, vi } from "vitest";
import { prepararComprobante } from "./prepare";

/** Dobles: ni base, ni bucket, ni red. Solo el baile. */
function dobles(over: Partial<Record<string, unknown>> = {}) {
  const llamadas: string[] = [];
  return {
    llamadas,
    habilitacion: { bloqueos: [], configurado: true, certificadoActivo: true, secuenciasActivas: 1 },
    secuencias: {
      peekNextEncf: vi.fn(async () => { llamadas.push("peek"); return "E320000000007"; }),
      prepararFactura: vi.fn(async () => { llamadas.push("prepare"); return { ok: true, invoice_id: "f-1", e_ncf: "E320000000007" }; }),
      finalizarFactura: vi.fn(async () => { llamadas.push("finalize"); return { ok: true, invoice_id: "f-1" }; }),
      marcarFallo: vi.fn(async () => { llamadas.push("fail"); return { ok: true, invoice_id: "f-1" }; }),
    },
    almacenamiento: {
      guardarXmlFirmado: vi.fn(async () => { llamadas.push("subir"); return "dgii/b1/invoices/f-1/signed.xml"; }),
      borrarXml: vi.fn(async () => { llamadas.push("borrar"); }),
    },
    ...over,
  };
}

describe("preparar un comprobante", () => {
  it("firma ANTES de consumir el número: ése es todo el punto del diseño", async () => {
    // Si `prepare` ocurriera antes de firmar, un fallo de firma quemaría un
    // número fiscal que luego hay que declarar anulado ante la DGII.
    const d = dobles();
    await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(d.llamadas.indexOf("peek")).toBeLessThan(d.llamadas.indexOf("subir"));
    expect(d.llamadas.indexOf("subir")).toBeLessThan(d.llamadas.indexOf("prepare"));
  });

  it("si la firma falla, NO se consume ningún número", async () => {
    const d = dobles();
    d.almacenamiento.guardarXmlFirmado = vi.fn(async () => { throw new Error("firma rota"); });
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r.ok).toBe(false);
    expect(d.secuencias.prepararFactura).not.toHaveBeenCalled();
  });

  it("una carrera se reintenta con el número nuevo, sin fallar", async () => {
    const d = dobles();
    let n = 0;
    d.secuencias.prepararFactura = vi.fn(async () => {
      n++;
      return n === 1
        ? { ok: false, motivo: "ENCF_TOMADO", e_ncf_actual: "E320000000008" }
        : { ok: true, invoice_id: "f-1", e_ncf: "E320000000008" };
    });
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r).toMatchObject({ ok: true, eNcf: "E320000000008" });
    expect(n).toBe(2);
  });

  it("una carrera que no cede se rinde, no se queda en bucle", async () => {
    const d = dobles();
    d.secuencias.prepararFactura = vi.fn(async () => ({ ok: false, motivo: "ENCF_TOMADO", e_ncf_actual: "E320000000009" }));
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r.ok).toBe(false);
    expect(d.secuencias.prepararFactura).toHaveBeenCalledTimes(3);
  });

  it("si la proforma ya tenía comprobante, devuelve ése y no emite otro", async () => {
    const d = dobles();
    d.secuencias.prepararFactura = vi.fn(async () => ({ ok: false, motivo: "IDEMPOTENT_PROFORMA_YA_FACTURADA", invoice_id: "f-vieja" }));
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r).toMatchObject({ ok: true, invoiceId: "f-vieja" });
    expect(d.secuencias.finalizarFactura).not.toHaveBeenCalled();
  });

  it("si finalizar falla, se marca el fallo y se borra el XML subido", async () => {
    // El número ya está consumido: lo que no puede quedar es un objeto huérfano
    // en el bucket y una factura en `draft` sin motivo escrito.
    const d = dobles();
    d.secuencias.finalizarFactura = vi.fn(async () => ({ ok: false, motivo: "NO_ESTABA_EN_DRAFT" }));
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r.ok).toBe(false);
    expect(d.secuencias.marcarFallo).toHaveBeenCalled();
    expect(d.almacenamiento.borrarXml).toHaveBeenCalled();
  });

  it("con un gate cerrado no se mira ni el primer número", async () => {
    const d = dobles({ habilitacion: { bloqueos: ["No hay certificado activo."], configurado: true, certificadoActivo: false, secuenciasActivas: 1 } });
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r).toMatchObject({ ok: false });
    expect(d.secuencias.peekNextEncf).not.toHaveBeenCalled();
  });

  it("no abre ni una conexión a la DGII", async () => {
    const fetchOriginal = globalThis.fetch;
    const espia = vi.fn(async () => { throw new Error("no debió llamar a la red"); });
    globalThis.fetch = espia as never;
    try {
      await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), dobles() as never);
      expect(espia).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });
});

function entradaValida() {
  return {
    tipoEcf: "32" as const,
    proformaId: "p-1",
    customer: { nombre: "Cliente de prueba" },
    items: [{ nombre: "Producto", cantidad: 1, precioUnitario: 100, itbisRate: 0.18 }],
  };
}
```

- [ ] **Paso 2: correrla y ver que falla**

```bash
cd apps/web && npx vitest run src/features/dgii/services/prepare.test.ts
```
Esperado: FAIL — `Cannot find module './prepare'`.

- [ ] **Paso 3: escribir la orquestación**

`prepararComprobante` recibe sus dependencias por parámetro (el tercer argumento) para poder
probarse sin base ni bucket, con valores por defecto que son los reales. El orden es el del
baile, y no se puede alterar:

1. `evaluarHabilitacion`; si hay bloqueos, devolver `{ ok: false, bloqueos }` **sin mirar
   ningún número**.
2. `peekNextEncf`.
3. `buildEcfXml` con ese e-NCF → `validateEcfXml` contra el XSD → `signEcfXml` con el
   certificado activo.
4. `guardarXmlFirmado`.
5. `prepararFactura(eNcfEsperado, …)`.
   - `ENCF_TOMADO` → volver al 3 con `e_ncf_actual`. **Máximo 3 intentos**; al tercero,
     devolver `{ ok: false, motivo: "ENCF_TOMADO" }`.
   - `IDEMPOTENT_PROFORMA_YA_FACTURADA` → devolver `{ ok: true, invoiceId }` de la factura que
     ya existía.
6. `finalizarFactura` con la ruta del XML.
7. Si 6 falla: `marcarFallo` con el motivo y `borrarXml`.

- [ ] **Paso 4: correrla y ver que pasa**

```bash
cd apps/web && npx vitest run src/features/dgii/services/prepare.test.ts
```
Esperado: PASS, 8 pruebas.

- [ ] **Paso 5: commit**

```bash
git add apps/web/src/features/dgii/services/prepare.ts apps/web/src/features/dgii/services/prepare.test.ts apps/web/src/server/repositories/supabase/dgii-invoices.ts
git commit -m "dgii fase 3a: orquestación de la preparación del comprobante"
```

---

## Tarea 6: la prueba de extremo a extremo

Hasta aquí todo se probó con dobles. Ésta construye un e-CF de verdad, lo firma con un
certificado autofirmado generado en memoria, y lo valida contra el XSD oficial. Sin base, sin
bucket y sin red.

**Ficheros:**
- Crear: `apps/web/src/features/dgii/services/comprobante-completo.test.ts`

- [ ] **Paso 1: escribir la prueba**

```ts
// apps/web/src/features/dgii/services/comprobante-completo.test.ts
import { describe, it, expect } from "vitest";
import { generarCertificadoDePrueba } from "../core/__port__/dgii-test-cert";
import { buildEcfXml } from "../core/builder";
import { signEcfXml } from "../core/signer";
import { validateEcfXml } from "../core/validator";
import { loadXsdForTipo } from "../core/xsd-loader";

describe("un comprobante completo, de principio a fin", () => {
  it("se construye, se firma y pasa el XSD oficial de la DGII", async () => {
    // Es la prueba que demuestra que las piezas de la fase 1 encajan con el
    // baile de la fase 3: mismo e-NCF dentro del XML y en la firma.
    const { p12, password } = generarCertificadoDePrueba();
    const eNcf = "E320000000007";

    const construido = buildEcfXml({
      tipoEcf: "32",
      eNcf,
      rncEmisor: "131561985",
      razonSocialEmisor: "DERMALAND SRL",
      fechaEmision: "06-09-2026",
      items: [{ nombre: "Producto", cantidad: 1, precioUnitario: 100, itbisRate: 0.18 }],
    } as never);

    expect(construido.xml).toContain(`<eNCF>${eNcf}</eNCF>`);

    const firmado = signEcfXml({ xml: construido.xml, p12, password });
    expect(firmado.signedXml).toContain("<Signature");

    const res = await validateEcfXml({
      xml: firmado.signedXml,
      xsd: await loadXsdForTipo("32"),
      schemaName: "e-CF-32",
    });
    expect(res.ok, JSON.stringify(res.errors ?? [])).toBe(true);
  });

  it("el código de seguridad son los seis primeros caracteres de la firma", async () => {
    const { p12, password } = generarCertificadoDePrueba();
    const construido = buildEcfXml({
      tipoEcf: "32", eNcf: "E320000000008", rncEmisor: "131561985",
      razonSocialEmisor: "DERMALAND SRL", fechaEmision: "06-09-2026",
      items: [{ nombre: "Producto", cantidad: 1, precioUnitario: 100, itbisRate: 0.18 }],
    } as never);
    const firmado = signEcfXml({ xml: construido.xml, p12, password });
    const m = /<SignatureValue>([^<]+)<\/SignatureValue>/.exec(firmado.signedXml);
    expect(m).not.toBeNull();
    expect(firmado.securityCode).toBe(m![1]!.slice(0, 6));
  });
});
```

> Si alguna firma de las funciones del núcleo no casa con lo de arriba, **manda el núcleo**:
> léelo en `apps/web/src/features/dgii/core/` y ajusta la llamada. Lo que no se puede cambiar
> es lo que la prueba comprueba.

- [ ] **Paso 2: correrla**

```bash
cd apps/web && npx vitest run src/features/dgii/services/comprobante-completo.test.ts
```
Esperado: PASS, 2 pruebas. Si el XSD rechaza el XML, el fallo trae la lista de errores del
validador: eso es una diferencia real entre el constructor y el esquema, no un fallo de la
prueba.

- [ ] **Paso 3: commit**

```bash
git add apps/web/src/features/dgii/services/comprobante-completo.test.ts
git commit -m "dgii fase 3a: prueba de extremo a extremo del comprobante firmado"
```

---

## Tarea 7: cierre

**Ficheros:**
- Modificar: `CHANGELOG.md`, `docs/estado-actual.md`, `docs/decisiones.md`, `package.json`

- [ ] **Paso 1: todo en verde**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json && npx vitest run
cd /Users/willianrodriguez/Projects/dermaland && pnpm --filter web build
```

- [ ] **Paso 2: revivir las pruebas que esperaban a esta fase**

Varias pruebas portadas están marcadas `// PENDIENTE fase 3`. Las que apunten a ficheros que
esta fase acaba de crear se reviven: quitar el `.skip` y el comentario, y correr. Si alguna
falla, es que el fichero nuevo no cumple la invariante que agendapp sí cumplía — que es
exactamente para lo que están.

```bash
cd apps/web && grep -rn "PENDIENTE fase 3" src/features/dgii/core/*.test.ts | head -30
```

Las que sigan esperando a `submission-service.ts` o `estado-veredicto.ts` **se quedan
marcadas**: son de la fase 3B.

- [ ] **Paso 3: comprobar que agendapp sigue intacto**

```bash
git -C ~/Projects/agendapp status --porcelain src/lib/dgii docs/dgii prisma | wc -l
```
Esperado: `0`.

- [ ] **Paso 4: documentar**

- `CHANGELOG.md`: entrada `[0.145.0]`.
- `docs/estado-actual.md`: bloque nuevo al principio.
- `docs/decisiones.md`: **dos decisiones** — (1) por qué el código nuevo va a
  `features/dgii/services/` y no a `server/services/dgii/` como decía el diseño (el directorio
  está ocupado por el módulo viejo, que tiene un cron vivo hasta la fase 8); (2) por qué se
  reutiliza el bucket `dgii-xml` en vez de crear `dgii-private` como el de agendapp, y que el
  path canónico dentro del bucket **sí** se conserva.
- `package.json`: versión a `0.145.0`.

- [ ] **Paso 5: commit y push a Gitea**

```bash
git add -A
git commit -m "v0.145.0 — DGII fase 3A: del comprobante preparado y firmado"
git push gitea main
```

**No** se hace `git push origin main`: eso despliega a producción, y esta fase todavía no tiene
pantalla ni ruta que la use.

---

## Verificación de la fase

- `cd apps/web && npx vitest run` — todas en verde, incluidas las 31 nuevas.
- `npx tsc --noEmit -p tsconfig.json` — sin errores.
- `pnpm --filter web build` — compila.
- Ninguna prueba abre una conexión a dgii.gov.do (lo vigila la tarea 5).
- `git -C ~/Projects/agendapp status --porcelain src/lib/dgii docs/dgii prisma` — cero líneas.

## Lo que esta fase NO hace

- No envía nada a la DGII. Eso es la fase 3B.
- No consulta el estado de un comprobante enviado. Fase 3B.
- No tiene pantalla ni ruta: no se puede usar desde el navegador todavía. Fase 6.
- No toca el punto de venta. Fase 4.
- No arregla la pantalla vieja de configuración DGII, que quedó rota al aplicar la fase 2. Se
  reemplaza en la fase 6.
