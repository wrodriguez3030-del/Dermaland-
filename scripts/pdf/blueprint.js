"use strict";
/**
 * BLUEPRINT DE RECONSTRUCCION del sistema de facturacion (DGII / e-CF) de DermaLand.
 * Documento exhaustivo pensado para poder reconstruir el sistema desde cero:
 * stack, setup, modelo de datos (DDL completo), seguridad/RLS/roles, motor e-CF,
 * API, UI + design system, logica de negocio, fases y guia de reconstruccion.
 *
 *   node scripts/pdf/blueprint.js   (con NODE_PATH a apps/web/node_modules)
 *
 * Salida: docs/dgii/blueprint-reconstruccion-sistema-facturacion.pdf
 */

const path = require("path");
const fs = require("fs");
const { Doc } = require("./engine");

const FECHA = process.env.DOC_DATE || "2026-06-12";
const VERSION = process.env.DOC_VERSION || "1.0";
const OUT =
  process.env.OUT_PDF ||
  path.resolve(__dirname, "../../docs/dgii/blueprint-reconstruccion-sistema-facturacion.pdf");
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const readSrc = (name) => {
  try {
    return fs.readFileSync(path.resolve(__dirname, "sources", name), "utf8");
  } catch {
    return "_(fuente no disponible)_";
  }
};

const doc = new Doc({
  runningTitle: "Blueprint reconstruccion - Facturacion DGII",
  footerLabel: "DermaLand — Blueprint de reconstruccion del sistema de facturacion (DGII / e-CF)",
  compress: process.env.DOC_COMPRESS !== "0",
  info: {
    Title: "DermaLand - Blueprint de reconstruccion del sistema de facturacion (DGII / e-CF)",
    Author: "DermaLand / Cibao Cloud",
    Subject: "Especificacion completa para reconstruir el sistema de facturacion electronica DGII",
    Keywords: "DGII, e-CF, NCF, blueprint, reconstruccion, Next.js, Supabase, RLS, XMLDSig",
  },
});
doc.stream(OUT);

/* ======================= PORTADA ======================= */
doc.cover({
  title: "Blueprint de Reconstruccion",
  subtitle:
    "Especificacion tecnica COMPLETA del sistema de facturacion electronica (DGII / e-CF) de " +
    "DermaLand. Contiene todo lo necesario para reconstruir el sistema desde cero con la misma " +
    "funcionalidad y una interfaz equivalente: stack, setup, modelo de datos (DDL), seguridad y " +
    "RLS, motor e-CF, API, UI + design system, logica de negocio y guia de reconstruccion.",
  badges: [
    "Next.js 15 / React 19",
    "Supabase / Postgres",
    "TypeScript 5.7",
    "Tailwind 4",
    "e-CF 31/32/33/34",
    "XMLDSig RSA-SHA256",
    "RLS multi-tenant",
    "7 roles / 18 permisos",
  ],
  meta: [
    ["Documento", "Blueprint de reconstruccion - sistema de facturacion (DGII / e-CF)"],
    ["Producto", "DermaLand - Plataforma SaaS de facturacion electronica"],
    ["Version doc.", VERSION],
    ["Fecha", FECHA],
    ["Nivel", "Reconstruccion (build-from-scratch)"],
    ["Estado fiscal", "Fases 0-12 listas. Fase G / produccion: BLOQUEADAS por politica"],
  ],
});

doc.tocPage();

/* ======================= 0. COMO USAR ======================= */
doc.h1("0. Como usar este documento");
doc.md(`
Este blueprint esta organizado en partes que, en conjunto, permiten reconstruir el sistema:

- **Parte 1 - Arquitectura y stack:** vision general, monorepo y tecnologias.
- **Parte 2 - Setup y despliegue:** como levantar el proyecto desde cero (local + Vercel).
- **Parte 3 - Modelo de datos:** DDL completo de todas las tablas, constraints, indices y seeds.
- **Parte 4 - Seguridad:** funciones SQL de auth, RLS por tabla, roles, permisos y JWT.
- **Parte 5 - Motor e-CF:** estructura XML por tipo, firma, validacion, QR, codigo de seguridad, PDF y mapeos.
- **Parte 6 - API y contratos:** endpoints, server actions, errores y killswitches.
- **Parte 7 - UI y design system:** shell de navegacion, pantallas, componentes y tokens de marca.
- **Parte 8 - Logica de negocio:** POS, cierre de caja, secuencias y maquinas de estado.
- **Parte 9 - Fases, gaps y guia de reconstruccion:** orden de construccion recomendado.

> Politica operativa: la emision fiscal real frente a la DGII (Fase G / testecf y produccion
> ambiente "ecf") esta BLOQUEADA y requiere autorizacion explicita por turno ademas de la
> postulacion del contribuyente ante la DGII. Reconstruir el sistema NO implica habilitarla.
`);

/* ======================= 1. ARQUITECTURA Y STACK ======================= */
doc.h1("1. Arquitectura y stack");
doc.md(`
## 1.1 Vision general

DermaLand es una aplicacion **SaaS multi-tenant** (un negocio = un \`business\`) construida como un
**monorepo pnpm**. La app web es **Next.js 15 (App Router)** con **React 19** y **TypeScript**. La
persistencia es **Supabase (Postgres)** accedida por SQL directo y un patron de repositorios; no hay
ORM tradicional (Prisma/Drizzle). El aislamiento entre negocios se garantiza con **Row Level Security
(RLS)** por \`business_id\`. El modulo fiscal (DGII / e-CF) cubre todo el ciclo del Comprobante Fiscal
Electronico de Republica Dominicana.

Hay un **interruptor global** \`DATA_SOURCE\` que alterna entre datos *mock* en memoria (modo demo) y
*supabase* (backend real). Esto permite levantar la app y navegar todas las pantallas sin backend.

## 1.2 Stack tecnologico

| Capa | Tecnologia | Version |
|------|-----------|---------|
| Framework | Next.js (App Router) | 15.5.18 |
| UI runtime | React | 19.0.0 |
| Lenguaje | TypeScript (strict, noUncheckedIndexedAccess) | 5.7.3 |
| Estilos | Tailwind CSS + @tailwindcss/postcss | 4.1.0 |
| Primitivos UI | Custom (NO shadcn/Radix) | - |
| Iconos | lucide-react | 1.14.0 |
| Validacion | Zod | 4.4.3 |
| Estado cliente | Zustand + clsx + tailwind-merge | - |
| Persistencia | Supabase JS + SSR | 2.105.3 / 0.10.2 |
| Offline | idb (IndexedDB) | 8.0.3 |
| PDF | pdfkit | 0.18.0 |
| QR | qrcode + @zxing/browser | 1.5.4 / 0.2.0 |
| XML | xmlbuilder2 / xml-crypto / xmllint-wasm | 4.0.3 / 6.1.2 / 5.2.0 |
| Cripto | node-forge | 1.3.1 |
| Tests | Vitest + Playwright | 4.1.x / 1.59.1 |
| Gestor paquetes | pnpm | 10.33.0 |

## 1.3 Estructura del monorepo

\`\`\`
dermaland/
  apps/web/                 # Next.js 15 (la app)
    src/
      app/                  # App Router
        (app)/              # shell de negocio (requiere auth)
        (super-admin)/      # admin de plataforma
        api/                # route handlers
        login/              # login
      components/
        layout/             # AppShell, Sidebar, Header
        ui/                 # Button, Card, Badge, Input, Table, Tabs, Toast...
      features/             # dgii, pos, sales, inventory, inventory-counts...
      lib/                  # env.ts, supabase/, mock-data/, utils/
      server/               # auth/, repositories/ (mock|supabase|factory), services/dgii/
      types/                # modelos de dominio
      middleware.ts         # auth + gating super-admin
    next.config.ts, vitest.config.ts, playwright.config.ts, postcss.config.mjs
  supabase/migrations/      # 0001..0009 (SQL versionado)
  docs/dgii/                # plan maestro, XSD oficiales, runbooks, matriz
  package.json, pnpm-workspace.yaml, .env.example
\`\`\`

El workspace declara \`apps/*\` y \`packages/*\` (este ultimo aun vacio: lugar previsto para librerias
compartidas).
`);

/* ======================= 2. SETUP Y DESPLIEGUE ======================= */
doc.h1("2. Setup y despliegue");
doc.md(`
## 2.1 Requisitos

- Node.js 22 LTS (la app corre tambien en Node 24).
- pnpm 10.33.0+.
- Git. Cuenta Supabase (si \`DATA_SOURCE=supabase\`). Cuenta Vercel (despliegue).

## 2.2 Scripts

Raiz (\`package.json\`): \`dev\`, \`build\`, \`start\`, \`typecheck\` (todos \`pnpm --filter web ...\`).

App (\`apps/web/package.json\`):

| Comando | Accion |
|---------|--------|
| \`next dev -p 3031\` | Dev server en http://localhost:3031 (hot reload) |
| \`next build\` | Build de produccion |
| \`next start -p 3031\` | Servidor de produccion |
| \`tsc --noEmit\` | Typecheck |
| \`vitest run\` / \`vitest\` | Unit tests (una vez / watch) |
| \`playwright test\` | E2E (requiere dev server) |
| \`playwright install --with-deps chromium\` | Instala navegador para E2E |

## 2.3 Levantar local desde cero

1. \`git clone <repo> dermaland && cd dermaland\`
2. \`cp .env.example .env\` y completar valores (ver 2.4). Para arranque rapido: \`DATA_SOURCE=mock\`.
3. \`pnpm install\`
4. \`pnpm dev\`  ->  http://localhost:3031
5. (Opcional, backend real) configurar Supabase: aplicar migraciones \`supabase/migrations/0001..0009\`
   (en orden), correr seeds, generar tipos (\`supabase gen types typescript\`) y poner \`DATA_SOURCE=supabase\`.
6. Validar: \`GET /api/health\` debe responder 200.

## 2.4 Variables de entorno

Fuente: \`.env.example\`; validacion con Zod en \`src/lib/env.ts\` (permisivo en dev, estricto en prod).

| Variable | Requerida | Para que |
|----------|-----------|----------|
| NODE_ENV | siempre | development / test / production |
| NEXT_PUBLIC_APP_URL / APP_URL | siempre | URL base (http://localhost:3031 dev) |
| DATA_SOURCE | siempre | "mock" o "supabase" (killswitch #1) |
| NEXT_PUBLIC_SUPABASE_URL | si supabase | URL del proyecto |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | si supabase | anon key (RLS es el limite de seguridad) |
| SUPABASE_SERVICE_ROLE_KEY | si supabase | bypass RLS - solo server, nunca commitear |
| DATABASE_URL | si migraciones | conexion directa Postgres |
| JWT_SECRET | recomendado | 32+ chars para cookies internas |
| SESSION_COOKIE_NAME | opcional | default "dermaland-session" |
| DGII_ENVIRONMENT | Fase 5+ | testecf / certecf / ecf (legacy cert/prod) |
| DGII_CERTIFICATE_PATH / _PASSWORD | Fase 5+ | ubicacion y clave del .p12 |
| DGII_CERT_ENCRYPTION_KEY | Fase F | 32+ chars para cifrar el blob del certificado |
| DGII_BASE_URL_TESTECF/_CERTECF/_ECF | opcional | override de URLs DGII |
| DGII_TESTECF_SEND_ENABLED | opcional | killswitch envio real (default false) |
| WHATSAPP_* / OPENAI_* / RESEND_* / SENTRY_* / UPSTASH_* | por modulo | integraciones opcionales |

## 2.5 Configuracion Next.js / Vercel

\`\`\`ts
// next.config.ts
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["pdfkit", "xmllint-wasm", "node-forge", "xml-crypto"],
  outputFileTracingIncludes: {
    "/api/dgii/certificate/**": ["../../docs/dgii/xsd/*.xsd"],
  },
};
\`\`\`

- **Root directory** en Vercel: \`apps/web\`. Framework: Next.js. Produccion: https://dermaland.vercel.app.
- \`serverExternalPackages\` evita bundlear paquetes con binarios/wasm/fs.
- \`outputFileTracingIncludes\` embebe los XSD oficiales en la lambda de validacion.

## 2.6 Testing y CI

- **Vitest** (entorno node, alias \`@\`->\`src\`, stub de \`server-only\`): \`src/**/*.test.ts\` + \`tests/unit/**\`.
- **Playwright** (Chromium + mobile Pixel 7, baseURL :3031, retries 2 en CI).
- **GitHub Actions** (\`.github/workflows/ci.yml\`): job \`validate\` (typecheck + unit + build) y job \`e2e\`
  (con \`continue-on-error\` por ahora). Variables CI: \`DATA_SOURCE=mock\`.
`);

/* ======================= 3. MODELO DE DATOS (desde fuente) ======================= */
doc.h1("3. Modelo de datos (DDL completo)");
doc.md(`
Esta parte transcribe el esquema completo extraido de las migraciones \`supabase/migrations/0001..0009\`:
todas las tablas por dominio, sus columnas (tipo, default, not null), constraints (PK/FK/UNIQUE/CHECK),
indices, enums y seeds. Todas las tablas de negocio incluyen \`business_id\` y estan protegidas por RLS
(ver Parte 4).
`);
doc.md(readSrc("db-schema.md"));

/* ======================= 4. SEGURIDAD / RLS / ROLES / AUTH ======================= */
doc.h1("4. Seguridad, RLS, roles y autenticacion");
doc.md(`
## 4.1 Funciones SQL de auth

Definidas en \`0001_phase1_core.sql\` y actualizadas en \`0006_auth_helpers_jwt_metadata.sql\`. Leen los
claims del JWT con una **cascada de prioridad**: raiz -> app_metadata -> user_metadata. En \`0008\` ambas
reciben \`set search_path = public, auth, extensions\` (anti path-injection).

\`\`\`sql
create or replace function public.auth_business_id()
  returns uuid language sql stable as $$
    select coalesce(
      nullif(current_setting('request.jwt.claims', true)::jsonb ->> 'business_id', ''),
      nullif(current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'business_id', ''),
      nullif(current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'business_id', '')
    )::uuid;
  $$;

create or replace function public.auth_is_platform_admin()
  returns boolean language sql stable as $$
    select coalesce(
      (current_setting('request.jwt.claims', true)::jsonb ->> 'is_platform_admin')::boolean,
      (current_setting('request.jwt.claims', true)::jsonb -> 'app_metadata' ->> 'is_platform_admin')::boolean,
      (current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'is_platform_admin')::boolean,
      false
    );
  $$;
\`\`\`

## 4.2 Patron RLS

Cada tabla de negocio tiene RLS habilitada. El patron dominante para tablas con \`business_id\` es una
politica \`FOR ALL\` a rol \`authenticated\`:

\`\`\`sql
create policy <tabla>_all on <tabla>
  for all to authenticated
  using      (business_id = (select public.auth_business_id()))
  with check (business_id = (select public.auth_business_id()));
\`\`\`

Tablas core (businesses, branches, users, clients, plans, audit_logs) usan policies separadas por
comando (SELECT/INSERT/UPDATE/DELETE) con variaciones para super admin. Catalogos globales
(\`permissions\`, \`roles\`, \`role_permissions\`) tienen \`*_read_all\` (SELECT: true). El envolver
\`auth_*()\` en \`(select ...)\` es la optimizacion "InitPlan" aplicada en 0008/0009 (evalua la funcion
una vez por query, no por fila). \`0007\` agrega INSERT a \`audit_logs\` con guardia de \`user_id\`.

## 4.3 Roles (7) y permisos (18)

Tablas: \`roles(code PK, label, description)\`, \`permissions(code PK, module, description, is_destructive)\`,
\`role_permissions(role_code, permission_code, PK compuesta)\`.

| Rol | Permisos | Resumen |
|-----|----------|---------|
| super_admin | 18 (todos) | dgii:* + cash:* |
| admin | 18 (todos) | dgii:* + cash:* |
| manager | 12 | e-CF (6) + NC + reports:view + cash open/close/change_pct |
| cashier | 4 | generate_xml, download_pdf, cash open/close |
| inventory | 0 | sin permisos DGII/cash |
| supervisor | 3 | reports:view, cash authorize_below_100, reverse_closing |
| auditor | 4 | reports:view + invoices check_status/download_xml/download_pdf |

Total: 59 asignaciones (role_code, permission_code). Los permisos se sincronizan con \`roleDefinitions\`
en TypeScript via el test \`role-permissions-sync.test.ts\`. Lista de permisos: \`dgii:configure\`,
\`dgii:certificate:upload\`, \`dgii:sequences:manage\`, \`dgii:invoices:{generate_xml,validate_xml,sign,
send,check_status,download_xml,download_pdf}\`, \`dgii:credit_notes:create\`, \`dgii:reports:view\`,
\`dgii:certification:run_tests\`, \`cash:{open,close,change_closing_percentage,authorize_below_100_percent,
reverse_closing}\`.

## 4.4 JWT, sesion y clientes Supabase

Claims usados: \`business_id\`, \`is_platform_admin\`, y en \`user_metadata\`: \`branch_id\`, \`role\`,
\`full_name\`, \`branch_ids\`. La sesion server-side se resuelve en \`src/server/auth/context.ts\`
(\`getSession()\`), que en modo mock devuelve un usuario hardcoded y en modo supabase lee el JWT de las
cookies via \`supabase.auth.getUser()\`. **No usa AsyncLocalStorage**: el contexto (\`RepoContext\` con
\`businessId/branchId/userId\`) se pasa explicitamente a los repositorios.

\`\`\`ts
// Tres clientes Supabase (src/lib/supabase/)
createServer()             // anon key + cookies  -> RLS activo (SC, server actions, route handlers)
createServiceRoleClient()  // service_role        -> BYPASSA RLS (solo backend, verificar business_id)
createClient()             // anon key (browser)  -> RLS como limite de seguridad
\`\`\`

**Middleware** (\`src/middleware.ts\`): refresca la sesion en cada request, redirige a \`/login\` si la
ruta protegida no tiene sesion, y bloquea \`/super-admin/*\` si \`is_platform_admin !== true\`. Rutas
publicas: \`/login\`, \`/auth/callback\`, \`/api/whatsapp/webhook\`, \`/api/health\`, assets.

**Auth actions** (\`src/server/auth/actions.ts\`): \`signIn(formData)\` (Zod email+password>=8; mock setea
cookie \`dl-mock-session\` 8h; supabase \`signInWithPassword\` + deteccion MFA), \`verifyMfa(code)\` (TOTP),
\`signOut()\`.
`);

/* ======================= 5. MOTOR e-CF ======================= */
doc.h1("5. Motor de comprobante fiscal (e-CF)");
doc.md(`
Servicios en \`apps/web/src/server/services/dgii/\` (funciones puras server-only). Pipeline canonico:
**build XML -> sign -> validate XSD -> security code + QR -> PDF**.

## 5.1 Estructura del XML por tipo (orden exacto del builder)

El builder (\`builder.ts\`) produce el XML en el orden que exige el XSD oficial. Esqueleto comun:

\`\`\`
<ECF>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc> ... </IdDoc>
    <Emisor> ... </Emisor>
    <Comprador> ... </Comprador>
    <Totales> ... </Totales>
  </Encabezado>
  <DetallesItems><Item> ... </Item> x N</DetallesItems>
  <InformacionReferencia> ... </InformacionReferencia>   <!-- obligatorio en 33/34 -->
  <FechaHoraFirma>dd-MM-yyyy HH:mm:ss</FechaHoraFirma>
  <Signature> ... </Signature>                            <!-- XMLDSig enveloped, tras firmar -->
</ECF>
\`\`\`

**Bifurcaciones por tipo** (seccion IdDoc):

| Tipo | Comprobante | Particularidad |
|------|-------------|----------------|
| 31 | Credito Fiscal | emite FechaVencimientoSecuencia; RNC+RazonSocial comprador OBLIGATORIOS |
| 32 | Consumo | OMITE FechaVencimientoSecuencia; comprador OPCIONAL (consumidor final) |
| 33 | Nota de Debito | emite FechaVencimientoSecuencia; InformacionReferencia OBLIGATORIA |
| 34 | Nota de Credito | reemplaza por IndicadorNotaCredito (0/1, OBLIGATORIO); InformacionReferencia OBLIGATORIA; TipoIngresos opcional |

**Totales** (orden estricto, todos opcionales menos MontoTotal): MontoGravadoTotal, MontoGravadoI1/I2/I3,
MontoExento, ITBIS1/2/3, TotalITBIS, TotalITBIS1/2/3, **MontoTotal** (obligatorio). I1=18%, I2=16%, I3=0%.

**Item**: NumeroLinea(1..1000), IndicadorFacturacion(0-4), NombreItem, IndicadorBienoServicio(1=bien,
2=servicio), DescripcionItem?, CantidadItem(>0), UnidadMedida?, PrecioUnitarioItem(.toFixed(4)),
DescuentoMonto?, MontoItem.

**InformacionReferencia** (33/34): NCFModificado(11..19), RNCOtroContribuyente(9/11), FechaNCFModificado,
CodigoModificacion(1=Anulacion,2=Cambios,3=Devolucion,4=Descuento,5=Correccion).

## 5.2 Tipo de entrada (TypeScript)

\`\`\`ts
interface EcfBuilderInput {
  tipoEcf: "31"|"32"|"33"|"34";   // 41+ lanzan EcfBuilderUnsupported
  eNcf: string;                    // 13 chars alfanumericos
  fechaVencimientoSecuencia: Date; // 31/33; omitido 32; reemplazado en 34
  indicadorNotaCredito?: 0|1;      // OBLIGATORIO si tipoEcf==="34"
  tipoIngresos: "01".."06";
  tipoPago: 1|2|3;                 // 1=contado, 2=credito, 3=gratuito
  indicadorMontoGravado?: 0|1;     // default 0 (lineas SIN ITBIS)
  formasPago?: { formaPago:1..8; montoPago:number }[];   // 1..7 items
  emisor: { rncEmisor; razonSocialEmisor; nombreComercial?; sucursal?; direccionEmisor;
            municipio?; provincia?; telefonosEmisor?: string[]; correoEmisor?; website?;
            actividadEconomica?; fechaEmision: Date };
  comprador: { rncComprador?; razonSocialComprador?; contactoComprador?; correoComprador?;
               direccionComprador?; municipioComprador?; provinciaComprador? };
  totales: { montoGravadoTotal?; montoGravadoI1?..I3?; montoExento?; itbis1?..3?;
             totalItbis?; totalItbis1?..3?; montoTotal };   // montoTotal obligatorio
  items: EcfItem[];                // 1..1000
  informacionReferencia?: { ncfModificado; rncOtroContribuyente; fechaNCFModificado;
                            codigoModificacion: 1..5 };       // obligatorio 33/34
  fechaHoraFirma: Date;
}
\`\`\`

## 5.3 Firma XMLDSig (signer.ts)

Libreria \`xml-crypto\` (\`SignedXml\`). Firma **enveloped** insertada como ultimo hijo de \`<ECF>\`.

| Parametro | Valor |
|-----------|-------|
| SignatureMethod | http://www.w3.org/2001/04/xmldsig-more#rsa-sha256 |
| DigestMethod | http://www.w3.org/2001/04/xmlenc#sha256 |
| Canonicalizacion | http://www.w3.org/TR/2001/REC-xml-c14n-20010315 |
| Transform | enveloped-signature + C14N |
| Reference URI | "" (isEmptyUri: true) - documento entero |
| KeyInfo | X509Data -> X509Certificate (base64 sin cabeceras) |
| XPath ancla | //*[local-name(.)='ECF'] ; location append |

La clave privada (\`privateKeyPem\`) nunca persiste ni se cachea; se descifra en memoria por el caller.
Errores genericos (\`DgiiSignerError\`) sin material sensible. \`verifyEcfSignature()\` para roundtrip/tests.

## 5.4 Validacion XSD (validator.ts)

\`xmllint-wasm\` (libxml2 en WebAssembly) contra los XSD oficiales en \`docs/dgii/xsd/\`. Parches en
memoria: (1) strip BOM UTF-8; (2) typo del XSD 31 \`name=" IndicadorServicioTodoIncluidoType"\`
(espacio inicial; 32/33/34 limpios). **Regla critica:** el XSD exige un \`xs:any\` final (la
\`<Signature>\`), por lo que un XML SIN firmar FALLA la validacion. Orden correcto: build -> sign -> validate.

## 5.5 Codigo de seguridad y QR

- \`security-code.ts\`: extrae \`<SignatureValue>\`, limpia a alfanumericos y toma los primeros 8.
  *(Heuristica; el algoritmo oficial DGII esta pendiente de validar - matriz D-06.)*
- \`qr.ts\`: URL \`https://ecf.dgii.gov.do/{testecf|certecf|}/ConsultaTimbre/api/Consulta\` con params
  \`RncEmisor, RncComprador?, ENCF, FechaEmision(dd-MM-yyyy), MontoTotal(.toFixed 2), CodigoSeguridadIeCF\`.
  \`qrcode\` genera PNG/SVG/dataURL.

## 5.6 PDF (pdf.ts)

PDFKit, tamano LETTER, margen 50, fuentes Helvetica. Secciones: encabezado (emisor, RNC, tipo, e-NCF,
fecha), comprador (o "Consumidor Final"), tabla de items, totales, footer (estado, ambiente, TrackId,
codigo de seguridad) y QR 100x100. Devuelve Buffer (no escribe a disco).

## 5.7 Mapeos y reglas fiscales

- \`proforma-to-input.ts\`: convierte una proforma POS en \`EcfBuilderInput\`. Deriva
  \`indicadorFacturacion\` de \`itbisRate\` (18->1, 16->2, 0->4), separa precio pre-ITBIS, sintetiza eNCF
  (demo). En produccion el eNCF viene de la reserva atomica de secuencias.
- \`source-invoice-to-nc.ts\`: genera la Nota de Credito (34) desde un e-CF origen.
  \`indicadorNotaCredito = (dias > 30 ? 1 : 0)\`; item unico con el motivo; InformacionReferencia apunta
  al e-NCF original con \`codigoModificacion\`.

| Regla | Valor |
|-------|-------|
| ITBIS | 18% / 16% / 0% (exento) |
| Indicador facturacion | 0 NoFacturable, 1 ITBIS18, 2 ITBIS16, 3 ITBIS0, 4 Exento |
| Decimales | montos .toFixed(2); precio unitario .toFixed(4) |
| Fechas | dd-MM-yyyy ; firma dd-MM-yyyy HH:mm:ss |
| RNC | /^(?:\\d{9}|\\d{11})$/ |
| eNCF | 13 chars alfanumericos |
| Items | 1..1000 ; cantidad > 0 |
| Formas de pago | 1..7 |
| Telefonos | ddd-ddd-dddd (max 3) |

## 5.8 Dry-run y estado del envio

\`testecf-client.ts\`: \`prepareTestecfSubmission()\` ejecuta build->sign->validate->verify LOCAL y
devuelve evidencia (endpoints que se invocarian, validacion XSD, firma verificada, tamanos, base64) SIN
hacer HTTP. \`executeTestecfSubmission()\` es un stub que SIEMPRE lanza \`TestecfSendDisabled\` con la lista
de gates pendientes (\`DGII_TESTECF_SEND_ENABLED\`, postulacion, rango, confirmacion del usuario). La
autenticacion DGII (semilla->firma->token), el cliente HTTP real y el polling de TrackId NO estan
implementados (Fases G/H).
`);

/* ======================= 6. API Y CONTRATOS ======================= */
doc.h1("6. API y contratos");
doc.md(`
## 6.1 Routing (App Router)

Route groups: \`(app)\` (negocio, requiere auth), \`(super-admin)\` (plataforma), \`api/\` (route handlers),
\`login/\`. Dentro de \`(app)\`: admin/*, caja, clientes, conteo-fisico, devoluciones, dgii, inventario,
notas-credito, pagos, pos, productos, proformas, reportes, ventas, whatsapp, ia.

## 6.2 Route handlers (endpoints)

| Endpoint | Metodo | Auth | Proposito |
|----------|--------|------|-----------|
| /api/health | GET | no | Liveness + estado de integraciones |
| /api/dgii/certificacion/run-test | POST | no (demo) | Pipeline build->sign->QR->PDF con cert dummy |
| /api/dgii/certificate/current | GET | si | Certificado activo (sin material sensible) |
| /api/dgii/certificate/test-local | POST | si | Descifra .p12 y prueba firma/validacion local |
| /api/dgii/facturas/[id]/pdf | GET | no (demo) | PDF de e-CF mock |
| /api/dgii/facturas/[id]/xml-signed | GET | no (demo) | XML firmado mock |
| /api/dgii/facturas/[id]/xml-unsigned | GET | no (demo) | XML sin firmar mock |
| /api/dgii/invoices/testecf-send | POST | si | Dry-run Fase G (NO envia a DGII) |
| /api/dgii/notas-credito/create | POST | no (demo) | Crea NC (34) desde factura origen |
| /api/dgii/preview/pdf|xml-signed|xml-unsigned | POST | no (demo) | Preview desde una proforma |
| /api/inventory-counts/sync | POST | si | Sync idempotente de escaneos offline |
| /api/whatsapp/webhook | GET/POST | no | Handshake + eventos Meta |

**Patron de respuesta de error:** 400 (json/parametros invalidos), 401 (\`unauthenticated\`), 403/503
(\`feature_disabled\`), 404 (no encontrado), 412 (precondicion: sin certificado/settings), 422
(\`test_failed\`), 500 (\`unknown_error\`). Endpoints de archivos devuelven \`Content-Type\` adecuado
(application/pdf, application/xml) y \`Cache-Control: no-store\`, \`X-Dgii-Demo: 1\` en los demo.

## 6.3 Ejemplos de contrato

\`\`\`
POST /api/dgii/notas-credito/create
body: { sourceInvoiceId: string, motivo: string, codigoModificacion: 1|2|3|4|5, rncComprador?: string }
200:  { ncEcf:"34", ncEncf, sourceEcfNumber, codigoModificacion, motivo, indicadorNotaCredito,
        unsignedXml, signedXml, signedAt, securityCode, qrUrl, pdfBase64, ambiente:"testecf", mockTrackId, warning }
400:  { error: "codigoModificacion invalido. Validos: 1, 2, 3, 4, 5" }    // o source 33/34 no permitido
404:  { error: "Factura mock '<id>' no encontrada" }

POST /api/dgii/invoices/testecf-send   (autenticado, dry-run)
body: { tipoEcf:"31"|"32"|"33"|"34" }
200:  { ok:true, mode:"dry-run", preflight:{ prepared:{ xmlUnsigned, xmlSigned, securityCode, qrUrl,
        ambiente:"testecf", xsdValidation:{status,errors}, signatureDigest }, emisor:{...}, mode:"dry-run" } }
503:  { ok:false, reason:"preflight_failed", code:"FEATURE_DISABLED", message:"Fase G deshabilitada." }
\`\`\`

## 6.4 Server actions

| Accion | Firma | Notas |
|--------|-------|-------|
| signIn(formData) | -> AuthResult | Zod email+password>=8; mock o Supabase; detecta MFA |
| verifyMfa(code) | -> AuthResult | TOTP via Supabase MFA |
| signOut() | -> void | limpia sesion, redirige /login |
| uploadCertificateAction(formData) | -> UploadResult | .p12/.pfx <=64KB; parse PKCS#12; cifra AES-256-GCM; persiste; desactiva anterior |
| loadActiveCertificateAction() | -> PublicCertificate \\| null | metadata publica del cert activo |

## 6.5 Killswitches / feature flags

\`DATA_SOURCE\`, \`isSupabaseConfigured()\`, \`isDgiiConfigured()\`, \`isCertificateUploadEnabled()\`
(requiere supabase + \`DGII_CERT_ENCRYPTION_KEY\`), \`DGII_TESTECF_SEND_ENABLED\` (Fase G, hoy bloqueado),
\`DGII_ENVIRONMENT\`. Ademas en BD: \`businesses.dgii_enabled\` y \`dgii_settings.dgii_enabled_real_send\`.
Filosofia: TODOS deben coincidir para una accion fiscal real.
`);

/* ======================= 7. UI Y DESIGN SYSTEM ======================= */
doc.h1("7. UI y design system");
doc.md(`
## 7.1 Shell de navegacion

Layout: **sidebar fijo** (w-64) + **header** sticky (h-16) + contenido fluido.

- **Header:** badge de empresa + selector de sucursal + direccion | buscador global | notificaciones +
  avatar de usuario con iniciales y rol.
- **Sidebar:** logo (icono HeartPulse) + grupos colapsables: General (Dashboard); Clientes; Ventas
  (POS, Ventas, Proformas, Pagos, Devoluciones, Notas credito, Caja); Productos; Inventario; Conteo
  fisico; Reportes; Comunicacion (WhatsApp); IA; Integraciones; **DGII** (Habilitacion, Configuracion,
  Secuencias, Facturas, Envios, Certificado); Administracion. Item activo: \`bg-primary/10 + text-accent\`.
  Link "Super Admin" abajo (acento violeta).

## 7.2 Design system (tokens)

Tailwind 4 via \`@tailwindcss/postcss\` (sin \`tailwind.config.ts\`). Tokens en \`globals.css\` (\`:root\`):

| Token | Valor | Uso |
|-------|-------|-----|
| --brand-primary | #2db4a8 | teal principal |
| --brand-accent | #1a7f8e | teal oscuro (hover/acentos) |
| --brand-fg | #0f2933 | texto principal |
| --brand-bg | #f7fbfb | fondo |
| --brand-success | #16a34a | OK / positivo |
| --brand-warn | #f59e0b | advertencia |
| --brand-danger | #dc2626 | error / destructivo |

Tipografia: stack del sistema (\`ui-sans-serif, system-ui, Segoe UI, Roboto\`), sin \`next/font\`;
\`font-feature-settings: "ss01","cv11"\`; antialiased. **Sin dark mode.** Bordes \`border-black/5\`,
radios \`rounded-lg\` (inputs/botones) y \`rounded-2xl\` (cards). Sombras \`shadow-sm\`/\`shadow-lg\`. Focus
\`ring-2 ring-primary/20\`; click \`active:scale-[0.98]\`. \`@media print\` para recibos 80mm. Iconos
\`lucide-react\`.

## 7.3 Componentes UI base (custom, en components/ui)

| Componente | Variantes / props |
|------------|-------------------|
| Button | variant primary/secondary/outline/ghost/danger; size sm/md/lg/icon |
| Card (+Header/Title/Content/Footer) | contenedor base |
| Badge | tone neutral/primary/success/warning/danger/info/purple; outlined |
| Input/Textarea/Select/Label/HelpText | formularios |
| Table (+THead/TBody/TR/TH/TD) | tablas de datos |
| Tabs (+List/Trigger/Content) | basado en contexto |
| Toast (useToast) | show/success/error |
| ConfirmDialog | open, title, message, destructive |
| EmptyState | icon, title, description, action |
| StatCard | label, value, hint, delta, icon, tone |
| RowActions | viewHref, editHref, onDelete, customActions, can* |
| PageHeader / SearchInput / FilterBar / SortableTH / ProductImage / BarChart/Spark | utilitarios |

Badges por estado: success \`emerald-50/700\`, warning \`amber-50/700\`, danger \`rose-50/700\`, info
\`sky-50/700\`, primary \`brand-primary/15 + accent\`.

## 7.4 Pantallas del modulo DGII (prioridad)

- **/dgii** (overview): alert de modulo inactivo; StatCards (aceptados, en proceso, rechazados,
  secuencias por vencer); badges de tipos e-CF habilitados.
- **/dgii/habilitacion** (wizard 10 pasos): panel de estado + progreso, "proximo paso recomendado",
  TestecfReadinessPanel (gaps + boton bloqueado), revision diagnostica por paso, tarjetas de paso
  expandibles con checklist y selector de estado, paso final auto-calculado, tabla de URLs planificadas,
  permisos y leyenda de estados.
- **/dgii/configuracion**: identidad comercial, contacto, ubicacion fiscal (provincia->municipio en
  cascada), actividad economica, radio de ambiente (testecf/certecf/ecf).
- **/dgii/certificado**: subir .p12/.pfx + password; tarjeta de estado del certificado.
- **/dgii/secuencias**: gestion de rangos e-NCF.
- **/dgii/certificacion**: pruebas pre-certificacion (31-34).
- **/dgii/facturas** y **/dgii/facturas/[id]**: listado de e-CF (e-NCF, tipo, cliente, totales, estado,
  TrackId, acciones) y detalle + Nota de Credito.
- **/dgii/preview/[id]**, **/dgii/envios**, **/dgii/reportes**.

### Wizard de habilitacion - los 10 pasos

| # | Paso | Ruta destino |
|---|------|--------------|
| 1 | Certificado digital (6 items) | /dgii/certificado |
| 2 | Configuracion fiscal (8 items) | /dgii/configuracion |
| 3 | Generacion postulacion (7 items) | /dgii/habilitacion |
| 4 | Pruebas simulacion e-CF (7 items) | /dgii/certificacion |
| 5 | Representaciones impresas (9 items) | /dgii/facturas |
| 6 | URLs servicios produccion (7 items) | /dgii/configuracion |
| 7 | Declaracion jurada (9 items) | /dgii/habilitacion |
| 8 | Autorizacion representante e-CF (9 items) | /dgii/habilitacion |
| 9 | Asignacion roles y NCF (9 items) | /admin/permisos |
| 10 | Estado final (auto-calculado) | /dgii/habilitacion |

## 7.5 Pantallas POS / Caja

- **/pos**: terminal 2 columnas. Izq: buscador + grid de productos + lineas de carrito (cantidad,
  descuento por linea). Der: selector de cliente, tipo de comprobante (Consumo->32 / Credito Fiscal->31,
  exige RNC), descuento global, resumen (subtotal, descuento, ITBIS, total), metodo de pago
  (efectivo/tarjeta/transferencia), monto recibido/vuelto, boton "Emitir proforma". FEFO automatico
  (lotes vencidos/cuarentena bloqueados).
- **/caja**: sin sesion (abrir caja) o sesion activa (StatCards de apertura/efectivo/tarjeta/
  transferencia; tabla de proformas seleccionables para e-CF; panel de cierre estimado con efectivo
  contado; sesiones cerradas recientes).

El resto de modulos (clientes, productos, inventario, conteo fisico, reportes, ventas, pagos,
proformas) siguen el patron PageHeader + FilterBar + Table + RowActions; varios estan en modo mock/
placeholder (devoluciones, notas-credito, stock por lote, movimientos, cuarentena, recall, whatsapp,
ia, varias de admin).
`);

/* ======================= 8. LOGICA DE NEGOCIO ======================= */
doc.h1("8. Logica de negocio y estados");
doc.md(`
## 8.1 ITBIS y totales

\`\`\`
// por linea
monto_gravado = quantity * unit_price - discount
itbis_linea   = monto_gravado * itbis_rate     // 18 | 16 | 0
total_linea   = monto_gravado + itbis_linea
// por comprobante
subtotal_gravado = SUM(monto_gravado where rate>0)
subtotal_exento  = SUM(monto_gravado where rate=0)
total_itbis      = SUM(itbis_linea)
total = subtotal_gravado + subtotal_exento + total_itbis + total_otros_impuestos
\`\`\`

## 8.2 Secuencias e-NCF (reserva atomica)

e-NCF = prefijo(3, ej. E31) + 10 digitos. Reserva con bloqueo de fila:

\`\`\`sql
create or replace function public.reserve_ecf_sequence_number(
  p_business_id uuid, p_tipo_ecf text, p_ambiente text) returns int language plpgsql as $$
declare v_seq_id uuid; v_next int; v_range_end int;
begin
  select id, next_number, range_end into v_seq_id, v_next, v_range_end
  from ecf_sequences
  where business_id=p_business_id and tipo_ecf=p_tipo_ecf and ambiente=p_ambiente
    and status='active' and next_number <= range_end
  order by created_at asc limit 1 for update;        -- lock de concurrencia
  if v_seq_id is null then return null; end if;
  update ecf_sequences
     set next_number = v_next + 1,
         status = case when v_next+1 > v_range_end then 'exhausted' else status end,
         updated_at = now()
   where id = v_seq_id;
  return v_next;
end; $$;
\`\`\`

## 8.3 Flujo POS -> e-CF

El resolutor (\`features/sales/document-resolver.ts\`) decide segun la forma de pago:

- **Efectivo / Transferencia** -> proforma fiscal (no consume e-NCF); espera el cierre de caja y se
  convierte a e-CF segun un porcentaje configurable.
- **Tarjeta / POS bancario** -> e-CF inmediato tipo 31 (consume e-NCF). \`payment_methods\` define
  \`requires_immediate_ecf\` y \`default_ecf_type\`.

## 8.4 Cierre de caja con porcentaje

Configurable en \`dgii_settings\`: porcentaje por defecto, min/max, si permite cambiarlo, si exige
autorizacion de admin bajo 100%, y si auto-genera e-CF al cerrar. El cierre suma por metodo de pago,
lista proformas pendientes, aplica el %, selecciona proformas hasta \`target = total_pendiente * % / 100\`
y genera los e-CF. Cada cambio de % queda en \`cash_closing_percentage_logs\` (auditoria inmutable);
el cierre en \`cash_closings\`.

## 8.5 Maquinas de estado

\`\`\`
Proforma:  draft -> issued -> { paid | partially_paid | pending_ecf | pending_cash_closing }
                 -> { selected_for_ecf -> ecf_generation_pending -> converted_to_ecf | closed_without_ecf }
                 -> { cancelled | expired | voided }

e-CF:      draft -> generated -> validated -> signed -> submitted
                 -> in_process -> { accepted | accepted_conditional | rejected }
                 -> { cancelled | error | voided }
\`\`\`
`);

/* ======================= 9. FASES, GAPS Y GUIA ======================= */
doc.h1("9. Fases, gaps y guia de reconstruccion");
doc.md(`
## 9.1 Estado por fase

| Fase | Objetivo | Estado |
|------|----------|--------|
| 0-1 | Diagnostico + base SaaS multi-tenant (auth, RLS) | [OK] |
| 2-3 | Modelo de datos DGII/e-CF + UI | [OK] |
| 4-5 | Builder XML + validacion XSD | [OK] |
| 6-7 | Firma digital + Supabase real (0001-0009) | [OK] |
| 8-9 | Wizard habilitacion + certificado real en preview | [OK] |
| 10-11 | Validacion local del certificado + checklist pre-Fase G | [OK] |
| 12 | Dry-run de Fase G (sin HTTP) | [OK] |
| 13 | Postulacion + carga de secuencias ante DGII | [EXTERNO cliente] |
| 14 (G) | Envio real a testecf | [BLOQUEADA] |
| 15 (H) | Polling de TrackId / estado | [BLOQUEADA] |
| 16-17 | Certificacion formal + produccion (ecf) | [BLOQUEADA] |

## 9.2 Gaps conocidos (para completar la reconstruccion)

- **Autenticacion DGII** (semilla -> firma -> token) y cache de token: no implementada.
- **Cliente HTTP real** a testecf/ecf y recepcion multipart: stubs (\`testecf-client.ts\`).
- **Polling de TrackId** con reintentos (Fase H): pendiente.
- **Persistencia de POS/cierre**: parte de los stores son localStorage (mock); falta cablear a BD.
- **DgiiSequenceService / settings persistidos**: el mapeo demo sintetiza eNCF y usa emisor hardcoded.
- **Algoritmo oficial del codigo de seguridad y formato del QR** (D-06): heuristica por validar.
- **Municipio/Provincia** como enum oficial DGII (D-15): hoy omitidos/strings.
- **Timezone** de fechas (D-03): formateo local sin forzar America/Santo_Domingo.
- **Observabilidad/alertas** del modulo fiscal y **rollback** de migraciones: documentar.
- **Lint**: no hay ESLint/Prettier configurado; **packages/** del monorepo esta vacio.

## 9.3 Orden de construccion recomendado

1. **Andamiaje:** monorepo pnpm + Next.js 15 + Tailwind 4 + componentes UI base + AppShell + \`DATA_SOURCE=mock\`.
2. **Dominio y tipos:** modelos TypeScript (Product, Proforma, e-CF...) + datos mock; navegar todas las pantallas.
3. **Base de datos:** migraciones 0001-0009 (core/tenancy -> inventario -> clientes -> DGII/POS ->
   permisos/roles -> helpers auth -> fixes RLS). Aplicar seeds.
4. **Auth + RLS:** funciones \`auth_*()\`, policies por tabla, middleware, clientes Supabase, sesion/JWT.
   Cambiar a \`DATA_SOURCE=supabase\` y validar aislamiento por tenant.
5. **Motor e-CF:** builder (orden XSD) -> signer (XMLDSig) -> validator (xmllint-wasm + parches) ->
   security-code + qr -> pdf. Cubrir con tests (fixtures por tipo).
6. **POS y caja:** terminal, resolutor de documento, secuencias atomicas, cierre con porcentaje, estados.
7. **Modulo DGII UI:** wizard de habilitacion, configuracion, certificado (upload cifrado), facturas,
   preview, secuencias, reportes.
8. **API:** route handlers (demo + autenticados) y server actions con sus contratos y killswitches.
9. **Endurecimiento:** permisos por rol, auditoria, observabilidad, CI (typecheck+unit+build+e2e).
10. **Fase G+ (solo con autorizacion):** autenticacion DGII, cliente HTTP, polling TrackId, certificacion.

> Recordatorio final: este blueprint describe el sistema a la fecha de portada. Cualquier emision
> fiscal real frente a la DGII requiere autorizacion operativa explicita y la postulacion del
> contribuyente. Reconstruir el sistema reproduce la funcionalidad, NO habilita la operacion fiscal.
`);

doc.end();
console.log("PDF generado en:", OUT);
