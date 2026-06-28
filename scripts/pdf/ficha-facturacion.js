"use strict";
/**
 * Genera la ficha tecnica COMPLETA del sistema de facturacion (DGII / e-CF)
 * de DermaLand en PDF, usando ./engine.js (PDFKit).
 *
 *   node scripts/pdf/ficha-facturacion.js
 *
 * Salida: docs/dgii/ficha-tecnica-sistema-facturacion.pdf
 */

const path = require("path");
const fs = require("fs");
const { Doc } = require("./engine");

const FECHA = process.env.DOC_DATE || "2026-06-12";
const VERSION = process.env.DOC_VERSION || "1.0";

const OUT =
  process.env.OUT_PDF ||
  path.resolve(__dirname, "../../docs/dgii/ficha-tecnica-sistema-facturacion.pdf");
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const doc = new Doc({
  runningTitle: "Ficha tecnica - Facturacion DGII",
  compress: process.env.DOC_COMPRESS !== "0",
  info: {
    Title: "DermaLand - Ficha tecnica del sistema de facturacion (DGII / e-CF)",
    Author: "DermaLand / Cibao Cloud",
    Subject: "Arquitectura tecnica del modulo de facturacion electronica DGII",
    Keywords: "DGII, e-CF, NCF, facturacion electronica, Republica Dominicana, Next.js, Supabase",
  },
});
doc.stream(OUT);

/* ============================ PORTADA ============================ */
doc.cover({
  title: "Sistema de Facturacion Electronica",
  subtitle:
    "Ficha tecnica integral del modulo DGII / e-CF de DermaLand: arquitectura, modelo de datos, " +
    "motor de comprobantes fiscales electronicos, firma digital, validacion XSD, flujo POS y " +
    "controles de seguridad.",
  badges: [
    "Next.js 15 App Router",
    "React 19",
    "Supabase / Postgres",
    "TypeScript",
    "e-CF 31/32/33/34",
    "XMLDSig RSA-SHA256",
    "RLS multi-tenant",
    "382 tests",
  ],
  meta: [
    ["Documento", "Ficha tecnica del sistema de facturacion (DGII / e-CF)"],
    ["Producto", "DermaLand — Plataforma SaaS de facturacion electronica"],
    ["Version doc.", VERSION],
    ["Fecha", FECHA],
    ["Ambito fiscal", "Republica Dominicana — Comprobante Fiscal Electronico (e-CF)"],
    ["Estado fiscal", "Fases 0-12 listas. Fase G (testecf) y produccion: BLOQUEADAS"],
  ],
});

/* ============================ INDICE ============================ */
doc.tocPage();

/* ===================== 1. RESUMEN EJECUTIVO ===================== */
doc.h1("1. Resumen ejecutivo");
doc.p(
  "DermaLand integra un modulo completo de facturacion electronica conforme al estandar de " +
    "Comprobante Fiscal Electronico (e-CF) de la Direccion General de Impuestos Internos (DGII) " +
    "de Republica Dominicana. El sistema cubre todo el ciclo: captura de venta en punto de venta " +
    "(POS) mediante proformas, conversion a comprobante fiscal, construccion del XML e-CF segun los " +
    "XSD oficiales, firma digital XMLDSig, validacion estructural, generacion de la representacion " +
    "impresa (PDF + QR) y la preparacion del envio a DGII."
);
doc.p(
  "La arquitectura es SaaS multi-tenant: cada negocio (business) queda aislado por Row Level " +
    "Security (RLS) a nivel de base de datos. El modulo fiscal esta tecnicamente listo hasta la " +
    "fase de pre-envio (dry-run), pero la emision fiscal real frente a DGII (Fase G / testecf y la " +
    "produccion fiscal) permanece BLOQUEADA por politica operativa y requiere autorizacion " +
    "explicita ademas de la postulacion del contribuyente ante la DGII."
);

doc.h2("1.1 Caracteristicas clave");
doc.list([
  { text: "Motor e-CF para los tipos 31, 32, 33 y 34, con XML en el orden exacto exigido por los XSD oficiales.", sub: "31 Credito Fiscal, 32 Consumo, 33 Nota de Debito, 34 Nota de Credito." },
  { text: "Firma digital XMLDSig enveloped (RSA-SHA256 / SHA256 / C14N) ejecutada exclusivamente en servidor." },
  { text: "Validacion estructural con xmllint-wasm contra los XSD oficiales de la DGII (libxml2 en WebAssembly, sin dependencias nativas)." },
  { text: "Gestion atomica de secuencias e-NCF (rangos autorizados) mediante funcion Postgres con bloqueo de fila." },
  { text: "Flujo POS proforma -> cierre de caja -> e-CF con porcentaje de conversion configurable y auditable." },
  { text: "Almacenamiento de certificados .p12 cifrado AES-256-GCM en Storage privado de Supabase." },
  { text: "Ocho (8) kill-switches independientes que deben coincidir para habilitar cualquier accion fiscal real." },
  { text: "Cobertura de pruebas automatizadas: 382 tests (Vitest) verdes." },
]);

doc.h2("1.2 Indicadores del modulo");
doc.table(
  [
    { header: "Metrica", width: 0.5 },
    { header: "Valor", width: 0.5, align: "left" },
  ],
  [
    ["Migraciones SQL aplicadas", "0001 - 0009 (10 archivos)"],
    ["Lineas de DDL/funciones/seeds", "~101,000"],
    ["Tablas del dominio fiscal/POS", "20+"],
    ["Tipos e-CF implementados", "31, 32, 33, 34"],
    ["Pantallas del modulo DGII", "11 (~3,036 LOC)"],
    ["Servicios/builders/validadores", "25 archivos"],
    ["XSD oficiales embebidos", "4 (~6,800 lineas)"],
    ["Documentacion DGII en repo", "~7,500 lineas (13+ documentos)"],
    ["Tests automatizados", "382 (Vitest) verdes"],
  ],
  { size: 9 }
);

/* ===================== 2. STACK Y ARQUITECTURA ===================== */
doc.h1("2. Stack tecnologico y arquitectura");

doc.h2("2.1 Plataforma");
doc.table(
  [
    { header: "Capa", width: 0.26 },
    { header: "Tecnologia", width: 0.34 },
    { header: "Detalle", width: 0.4 },
  ],
  [
    ["Framework", "Next.js 15.5.18", "App Router; Server Components, Route Handlers y Server Actions"],
    ["UI", "React 19.0.0", "Tailwind CSS, estado con Zustand"],
    ["Lenguaje", "TypeScript 5.7.3", "Estricto en todo el monorepo"],
    ["Gestor de paquetes", "pnpm 10.33.0", "Monorepo: raiz + apps/web"],
    ["Runtime", "Node + Vercel", "Edge + Node Functions; puerto local 3031"],
    ["Persistencia", "Supabase (Postgres)", "SQL directo + patron repositorios; sin ORM tradicional"],
    ["Auth", "JWT + cookie", "Claims: business_id, role, is_platform_admin"],
  ],
  { size: 9 }
);
doc.note(
  "Sin ORM tradicional",
  "El proyecto no usa Prisma ni Drizzle: la persistencia se maneja con @supabase/supabase-js y " +
    "@supabase/ssr sobre SQL directo, con migraciones versionadas en supabase/migrations y un patron " +
    "de repositorios (interfaces + implementacion mock) en apps/web/src/server/repositories.",
  "note"
);

doc.h2("2.2 Librerias criticas de facturacion");
doc.table(
  [
    { header: "Libreria", width: 0.28, mono: true },
    { header: "Version", width: 0.16 },
    { header: "Uso en el modulo fiscal", width: 0.56 },
  ],
  [
    ["node-forge", "1.3.1", "Parsing PKCS#12 (.p12) y operaciones RSA para la firma"],
    ["xml-crypto", "6.1.2", "Firma XMLDSig enveloped sobre el documento e-CF"],
    ["xmllint-wasm", "5.2.0", "Validacion XSD (libxml2 compilado a WebAssembly)"],
    ["xmlbuilder2", "4.0.3", "Construccion del XML respetando el orden exacto de los XSD"],
    ["@xmldom/xmldom", "0.9.10", "DOM parsing (dependencia de xml-crypto)"],
    ["pdfkit", "0.18.0", "Generacion de la representacion impresa (PDF)"],
    ["qrcode", "1.5.4", "Codigo QR de consulta en la representacion impresa"],
    ["@zxing/browser", "0.2.0", "Lectura de QR en cliente (movil)"],
  ],
  { size: 8.5 }
);
doc.p(
  "Estas dependencias se declaran como serverExternalPackages en next.config.ts (pdfkit, " +
    "xmllint-wasm, node-forge, xml-crypto) y el tracing de salida incluye los XSD para que esten " +
    "disponibles en el despliegue.",
  { size: 9, color: "#52606d" }
);

doc.h2("2.3 Variables de entorno relevantes");
doc.code(
  "# Conexion Supabase\n" +
    "NEXT_PUBLIC_SUPABASE_URL=...\n" +
    "NEXT_PUBLIC_SUPABASE_ANON_KEY=...\n" +
    "SUPABASE_SERVICE_ROLE_KEY=...        # server-side, bypass RLS\n" +
    "DATABASE_URL=...                     # conexion directa para migraciones\n" +
    "DATA_SOURCE=supabase                 # 'supabase' | 'mock'  (kill-switch #1)\n\n" +
    "# Sesion / auth\n" +
    "JWT_SECRET=...                       # 32+ chars\n" +
    "SESSION_COOKIE_NAME=dermaland-session\n\n" +
    "# DGII (ambientes)\n" +
    "DGII_ENVIRONMENT=cert                # 'cert' | 'prod'  (kill-switch #2)\n" +
    "DGII_CERTIFICATION_BASE_URL=https://ecf.dgii.gov.do/testecf\n" +
    "DGII_PRODUCTION_BASE_URL=https://ecf.dgii.gov.do/ecf\n" +
    "DGII_CERTIFICATE_PATH=               # ruta .p12 o key en Storage\n" +
    "DGII_CERTIFICATE_PASSWORD=           # deberia migrar a Vault"
);
doc.note(
  "Nota de seguridad",
  "Los nombres anteriores son ilustrativos; este documento NO contiene valores secretos. El " +
    "password del certificado deberia residir en Supabase Vault / variables de entorno cifradas, " +
    "nunca en texto plano ni versionado.",
  "warn"
);

/* ===================== 3. MODELO DE DATOS ===================== */
doc.h1("3. Modelo de datos de facturacion");
doc.p(
  "El dominio fiscal vive principalmente en la migracion 0003_dgii_pos.sql. Todas las tablas " +
    "incluyen business_id y estan protegidas por RLS con la funcion auth_business_id(). A " +
    "continuacion se describen las entidades centrales."
);

doc.h2("3.1 Mapa de entidades");
doc.table(
  [
    { header: "Tabla", width: 0.3, mono: true },
    { header: "Rol", width: 0.7 },
  ],
  [
    ["dgii_settings", "Configuracion fiscal por negocio (datos del emisor, ambiente, reglas de cierre)"],
    ["dgii_certificates", "Certificados digitales .p12 cifrados (uno activo por negocio)"],
    ["ecf_sequences", "Rangos de e-NCF autorizados y contador atomico next_number"],
    ["proformas", "Documento de venta POS (fiscal o no) previo al e-CF"],
    ["proforma_items", "Lineas de la proforma con ITBIS por linea"],
    ["electronic_invoices", "Comprobante Fiscal Electronico (e-CF) - tabla central"],
    ["electronic_invoice_items", "Lineas del e-CF con ITBIS granular"],
    ["payment_methods", "Formas de pago y si exigen e-CF inmediato"],
    ["cash_registers / cash_register_sessions", "Cajas y sesiones de caja del POS"],
    ["cash_closings", "Cierre de caja con % de conversion a e-CF"],
    ["cash_closing_percentage_logs", "Auditoria inmutable de cambios de %"],
    ["dgii_submissions", "Registro de cada intento de envio a DGII"],
    ["dgii_status_logs", "Historial de consultas de estado por TrackId"],
    ["dgii_received_ecf", "e-CF recibidos de terceros/proveedores"],
  ],
  { size: 8.5 }
);

doc.h2("3.2 electronic_invoices (e-CF) — tabla central");
doc.p("Migracion: supabase/migrations/0003_dgii_pos.sql (lineas ~523-596).", { size: 9, color: "#52606d" });
doc.table(
  [
    { header: "Campo", width: 0.3, mono: true },
    { header: "Tipo", width: 0.22, mono: true },
    { header: "Descripcion", width: 0.48 },
  ],
  [
    ["id", "uuid PK", "Identificador unico"],
    ["business_id", "uuid FK", "Tenant (RLS)"],
    ["branch_id", "uuid FK", "Sucursal"],
    ["proforma_id", "uuid FK", "Proforma de origen (si aplica)"],
    ["source_invoice_id", "uuid", "Para NC/ND: e-CF original referenciado"],
    ["tipo_ecf", "text", "31, 32, 33, 34 (y 41-47 planeados)"],
    ["e_ncf", "text", "e-NCF de 13 chars (ej. E310000000001)"],
    ["secuencia_id", "uuid FK", "Referencia al rango en ecf_sequences"],
    ["status", "text", "draft, generated, validated, signed, submitted, in_process, accepted, accepted_conditional, rejected, cancelled, error, voided"],
    ["customer_id / customer_name / customer_rnc", "uuid/text", "Datos del comprador"],
    ["subtotal_gravado", "numeric(14,2)", "Base gravada con ITBIS"],
    ["subtotal_exento", "numeric(14,2)", "Base exenta"],
    ["total_itbis", "numeric(14,2)", "Total ITBIS"],
    ["total_otros_impuestos", "numeric(14,2)", "Otros impuestos"],
    ["total", "numeric(14,2)", "Total del comprobante"],
    ["currency", "text", "DOP (por defecto)"],
    ["xml_generated_path / xml_signed_path / xml_response_path", "text", "Rutas en Storage del XML sin firma, firmado y respuesta DGII"],
    ["pdf_path", "text", "Ruta del PDF generado"],
    ["qr_code_payload / security_code / hash_sha256", "text", "QR de consulta, codigo de seguridad y hash del XML"],
    ["track_id / dgii_status_code / dgii_status_message", "text", "Identificador y estado devuelto por DGII"],
    ["ambiente", "text", "testecf, certecf, ecf"],
    ["generated_at / signed_at / sent_at / accepted_at / rejected_at / cancelled_at", "timestamptz", "Marcas de tiempo del ciclo de vida"],
    ["generated_by / sent_by", "uuid FK", "Usuarios que generaron/enviaron"],
  ],
  { size: 8 }
);
doc.p(
  "Indices: (business_id, status, created_at DESC); (business_id, track_id) donde track_id no es " +
    "nulo; (business_id, proforma_id). RLS: business_id = auth_business_id().",
  { size: 8.5, color: "#52606d" }
);

doc.h2("3.3 electronic_invoice_items");
doc.table(
  [
    { header: "Campo", width: 0.3, mono: true },
    { header: "Tipo", width: 0.22, mono: true },
    { header: "Descripcion", width: 0.48 },
  ],
  [
    ["line_no", "int", "Numero de linea (1..1000); unico por e-CF"],
    ["product_id / product_sku", "uuid/text", "Producto (opcional) y SKU"],
    ["name_item / description_item", "text", "Nombre y descripcion del item"],
    ["kind", "text", "bien | servicio"],
    ["quantity", "numeric(14,2)", "Cantidad"],
    ["unit_measure", "text", "Unidad de medida"],
    ["unit_price", "numeric(14,4)", "Precio unitario (4 decimales segun XSD)"],
    ["discount_amount", "numeric(14,2)", "Descuento de la linea"],
    ["itbis_rate", "numeric(5,2)", "Tasa ITBIS (18 / 16 / 0)"],
    ["indicador_facturacion", "text", "Codigo de facturacion DGII (0-4)"],
    ["monto_item", "numeric(14,2)", "Monto total de la linea"],
  ],
  { size: 8.5 }
);

doc.h2("3.4 ecf_sequences (rangos e-NCF)");
doc.p(
  "Almacena los rangos de e-NCF autorizados por la DGII por tipo de comprobante y ambiente. El " +
    "contador next_number se incrementa de forma atomica."
);
doc.table(
  [
    { header: "Campo", width: 0.28, mono: true },
    { header: "Tipo", width: 0.2, mono: true },
    { header: "Descripcion", width: 0.52 },
  ],
  [
    ["tipo_ecf", "text", "31, 32, 33, 34, ..."],
    ["prefix", "text", "Prefijo del e-NCF (ej. E31)"],
    ["range_start / range_end", "int", "Limites del rango autorizado"],
    ["next_number", "int", "Proximo numero a usar (reserva atomica)"],
    ["fecha_vencimiento", "date", "Vencimiento del rango"],
    ["ambiente", "text", "testecf | certecf | ecf"],
    ["status", "text", "active, expiring, exhausted, expired, cancelled"],
  ],
  { size: 8.5 }
);

doc.h2("3.5 dgii_settings (configuracion fiscal por negocio)");
doc.list([
  "Datos del emisor: rnc_emisor, razon_social_emisor, nombre_comercial, direccion, municipio, provincia, actividad_economica, telefono, correo, website.",
  "Ambiente: ambiente (testecf|certecf|ecf), dgii_enabled_real_send (flag de envio real), base_url_testecf / base_url_certecf / base_url_ecf.",
  "Reglas de cierre de caja: default_cash_closing_ecf_percentage, allow_user_change_closing_percentage, minimum/maximum_closing_ecf_percentage, require_admin_authorization_below_100_percent, auto_generate_ecf_on_cash_closing, applies_to_payment_methods.",
]);

doc.h2("3.6 dgii_certificates (certificado digital)");
doc.p(
  "Guarda el certificado .p12 cifrado (AES-256-GCM) en Storage privado de Supabase (con fallback a " +
    "columna bytea). Maximo un certificado activo por negocio."
);
doc.table(
  [
    { header: "Campo", width: 0.34, mono: true },
    { header: "Descripcion", width: 0.66 },
  ],
  [
    ["alias / subject_dn / issuer_dn / serial_number", "Metadatos X.509 del certificado"],
    ["valid_from / valid_to", "Vigencia del certificado"],
    ["pkcs12_storage_bucket / pkcs12_storage_path", "Ubicacion del blob cifrado (ej. certificates/<business_id>/<uuid>.p12.enc)"],
    ["pkcs12_encrypted_blob / kdf / iv / tag", "Fallback en BD: blob AES-256-GCM con su IV y auth tag"],
    ["password_secret_ref", "Referencia al secreto del password (Vault / env), nunca en claro"],
    ["is_active / revoked_at / uploaded_by", "Estado, revocacion y trazabilidad"],
  ],
  { size: 8.5 }
);

/* ===================== 4. MOTOR e-CF ===================== */
doc.h1("4. Motor de comprobante fiscal (e-CF)");
doc.p(
  "Los servicios viven en apps/web/src/server/services/dgii/ como funciones puras del lado " +
    "servidor (guard import 'server-only'). El pipeline canonico es: construir XML -> firmar -> " +
    "validar XSD -> codigo de seguridad + QR -> PDF."
);

doc.h2("4.1 Tipos de comprobante soportados");
doc.table(
  [
    { header: "Codigo", width: 0.12, align: "center" },
    { header: "Comprobante", width: 0.5 },
    { header: "Estado", width: 0.38 },
  ],
  [
    ["31", "Factura de Credito Fiscal Electronica", "[OK] Implementado"],
    ["32", "Factura de Consumo Electronica", "[OK] Implementado"],
    ["33", "Nota de Debito Electronica", "[OK] Implementado"],
    ["34", "Nota de Credito Electronica", "[OK] Implementado (con logica source-invoice -> NC)"],
    ["41-47", "Otros tipos (compras, gastos menores, regimenes especiales, etc.)", "[PLAN] Enum parcial en UI"],
  ],
  { size: 9 }
);

doc.h2("4.2 Construccion del XML (builder.ts)");
doc.list([
  "Respeta el orden exacto de los XSD (xmlbuilder2 preserva el orden de insercion).",
  "Formatos: decimales con punto y sin separador de miles; precios unitarios a 4 decimales; fechas dd-MM-yyyy; datetime dd-MM-yyyy HH:mm:ss.",
  "Validaciones de entrada: e-NCF de 13 chars; RNC de 9 u 11 digitos; entre 1 y 1000 items; cantidad de items >= 1.",
  "Campos opcionales omitidos cuando son undefined.",
  "31 casos de prueba en builder.test.ts cubriendo orden, formatos y validaciones.",
]);
doc.h3("Validacion de RNC (extracto)");
doc.code("const RNC_RE = /^(?:\\d{9}|\\d{11})$/;  // 9 u 11 digitos, sin guiones");

doc.h2("4.3 Firma digital XMLDSig (signer.ts)");
doc.table(
  [
    { header: "Parametro", width: 0.34 },
    { header: "Valor", width: 0.66, mono: true },
  ],
  [
    ["Algoritmo de firma", "RSA-SHA256 (xmldsig-more#rsa-sha256)"],
    ["Algoritmo de digest", "SHA256 (xmlenc#sha256)"],
    ["Canonicalizacion", "C14N 20010315"],
    ["Tipo de firma", "Enveloped (Signature como ultimo hijo de ECF)"],
    ["KeyInfo", "X509Data -> X509Certificate (base64 sin cabeceras)"],
    ["URI de referencia", "vacio (documento completo)"],
  ],
  { size: 9 }
);
doc.note(
  "Manejo del material sensible",
  "La clave privada (privateKeyPem) nunca se cachea ni persiste en memoria; el certificado se " +
    "descifra unicamente dentro de server actions / route handlers. Los errores (DgiiSignerError) " +
    "no incluyen material sensible. Todo el servicio esta marcado con import 'server-only'.",
  "ok"
);

doc.h2("4.4 Validacion XSD (validator.ts)");
doc.p(
  "Usa xmllint-wasm (libxml2 en WebAssembly, sin binarios nativos) contra los XSD oficiales " +
    "embebidos en docs/dgii/xsd/ (e-CF-31/32/33/34 v1.0, ~1,700 lineas cada uno). Se aplican dos " +
    "parches en memoria: (1) se elimina el BOM UTF-8 que traen los XSD; (2) se corrige un typo del " +
    "XSD 31 (espacio inicial en IndicadorServicioTodoIncluidoType)."
);
doc.note(
  "Regla critica de orden",
  "Un XML sin firma FALLA la validacion XSD porque el esquema exige <Signature> como ultimo " +
    "elemento. Por eso el orden correcto es construir -> firmar -> validar.",
  "warn"
);

doc.h2("4.5 Codigo de seguridad y QR");
doc.list([
  "qr.ts genera el QR con el payload de la URL de consulta DGII (configurable por ambiente).",
  { text: "security-code.ts calcula un codigo de seguridad de 8 chars alfanumericos derivado del SignatureValue.", sub: "El algoritmo oficial DGII esta pendiente de validacion (matriz D-06): la implementacion actual es heuristica." },
]);

doc.h2("4.6 Inventario de servicios DGII");
doc.table(
  [
    { header: "Archivo", width: 0.34, mono: true },
    { header: "Responsabilidad", width: 0.45 },
    { header: "Estado", width: 0.21 },
  ],
  [
    ["builder.ts", "Construye el XML e-CF", "[OK]"],
    ["signer.ts", "Firma XMLDSig", "[OK]"],
    ["validator.ts", "Valida contra XSD", "[OK]"],
    ["qr.ts", "QR de consulta", "[OK]"],
    ["security-code.ts", "Codigo de seguridad", "[OK] heuristica"],
    ["pdf.ts", "Representacion impresa", "[OK]"],
    ["proforma-to-input.ts", "Mapea proforma -> input del builder", "[OK]"],
    ["source-invoice-to-nc.ts", "Logica de Nota de Credito (34)", "[OK]"],
    ["testecf-preflight.ts", "Preparacion de envio (dry-run)", "[OK]"],
    ["testecf-client.ts", "Cliente HTTP a testecf", "[STUB]"],
    ["service.ts", "Orquestador DgiiService", "[PARCIAL]"],
    ["demo-cert.ts / demo-renderer.ts", "Certificado y render de demostracion", "[OK]"],
  ],
  { size: 8.5 }
);

/* ===================== 5. LOGICA DE NEGOCIO ===================== */
doc.h1("5. Logica de negocio");

doc.h2("5.1 Calculo de impuestos (ITBIS)");
doc.p("Tasa estandar 18%; tasas reducidas 16% y 0%; exento 0%. Calculo por linea y agregacion por comprobante:");
doc.code(
  "// Por linea\n" +
    "subtotal_linea = quantity * unit_price\n" +
    "monto_gravado  = subtotal_linea - discount\n" +
    "itbis_linea    = monto_gravado * itbis_rate   // 18% | 16% | 0%\n" +
    "total_linea    = monto_gravado + itbis_linea\n\n" +
    "// Por comprobante\n" +
    "subtotal_gravado      = SUM(monto_gravado WHERE itbis_rate > 0)\n" +
    "subtotal_exento       = SUM(monto_gravado WHERE itbis_rate = 0)\n" +
    "total_itbis           = SUM(itbis_linea)\n" +
    "total = subtotal_gravado + subtotal_exento + total_itbis + total_otros_impuestos"
);
doc.h3("Indicador de facturacion DGII (por linea)");
doc.table(
  [
    { header: "Codigo", width: 0.16, align: "center" },
    { header: "Significado", width: 0.84 },
  ],
  [
    ["0", "No facturable"],
    ["1", "ITBIS tasa 1 (18%)"],
    ["2", "ITBIS tasa 2 (16%)"],
    ["3", "ITBIS tasa 3 (0%)"],
    ["4", "Exento"],
  ],
  { size: 9 }
);

doc.h2("5.2 Secuencias e-NCF y reserva atomica");
doc.p(
  "El e-NCF tiene 13 caracteres: prefijo de 3 (ej. E31) + 10 digitos de secuencia. La reserva del " +
    "siguiente numero se hace con una funcion Postgres que bloquea la fila (FOR UPDATE), evitando " +
    "duplicados bajo concurrencia y marcando el rango como 'exhausted' al agotarse."
);
doc.code(
  "create or replace function public.reserve_ecf_sequence_number(\n" +
    "  p_business_id uuid, p_tipo_ecf text, p_ambiente text\n" +
    ") returns int language plpgsql as $$\n" +
    "declare v_seq_id uuid; v_next int; v_range_end int;\n" +
    "begin\n" +
    "  select id, next_number, range_end into v_seq_id, v_next, v_range_end\n" +
    "  from ecf_sequences\n" +
    "  where business_id = p_business_id and tipo_ecf = p_tipo_ecf\n" +
    "    and ambiente = p_ambiente and status = 'active'\n" +
    "    and next_number <= range_end\n" +
    "  order by created_at asc limit 1\n" +
    "  for update;                       -- lock de concurrencia\n" +
    "  if v_seq_id is null then return null; end if;\n" +
    "  update ecf_sequences\n" +
    "     set next_number = v_next + 1,\n" +
    "         status = case when v_next + 1 > v_range_end then 'exhausted' else status end,\n" +
    "         updated_at = now()\n" +
    "   where id = v_seq_id;\n" +
    "  return v_next;\n" +
    "end; $$;"
);

doc.h2("5.3 Flujo POS: proforma -> e-CF");
doc.p(
  "El resolutor de documento (features/sales/document-resolver.ts) decide, segun la forma de pago, " +
    "si la venta genera una proforma fiscal o un e-CF inmediato:"
);
doc.list([
  { text: "Efectivo / Transferencia: document_kind = proforma (no consume e-NCF). Espera el cierre de caja y se convierte a e-CF segun el porcentaje configurado." },
  { text: "Tarjeta / POS bancario: document_kind = invoice + ecf_type = 31 (e-CF inmediato). Consume e-NCF en tiempo real." },
]);
doc.p(
  "La tabla payment_methods define requires_immediate_ecf y default_ecf_type por forma de pago.",
  { size: 9, color: "#52606d" }
);

doc.h2("5.4 Cierre de caja con porcentaje configurable");
doc.list([
  "Se suman los totales por metodo (efectivo, transferencia, tarjeta, otros) y se listan las proformas pendientes.",
  "El operador/contador introduce un % (0-100); se valida contra minimum/maximum y, si es menor a 100% y la regla lo exige, requiere autorizacion de un administrador.",
  "El sistema selecciona proformas hasta alcanzar target_amount = total_pendiente * % / 100 y genera los e-CF correspondientes.",
  "Cada cambio de % queda en cash_closing_percentage_logs (auditoria inmutable); el cierre se registra en cash_closings.",
]);

doc.h2("5.5 Estados (ciclo de vida)");
doc.h3("Proforma");
doc.code(
  "draft -> issued -> { paid | partially_paid | pending_ecf | pending_cash_closing }\n" +
    "      -> { selected_for_ecf -> ecf_generation_pending -> converted_to_ecf\n" +
    "           | closed_without_ecf }\n" +
    "      -> { cancelled | expired | voided }"
);
doc.h3("e-CF (electronic_invoices)");
doc.code(
  "draft -> generated -> validated -> signed -> submitted\n" +
    "      -> in_process -> { accepted | accepted_conditional | rejected }\n" +
    "      -> { cancelled | error | voided }"
);

/* ===================== 6. API Y UI ===================== */
doc.h1("6. API, servicios y pantallas");

doc.h2("6.1 Route Handlers (app/api/dgii)");
doc.table(
  [
    { header: "Endpoint", width: 0.46, mono: true },
    { header: "Metodo", width: 0.14, align: "center" },
    { header: "Estado / proposito", width: 0.4 },
  ],
  [
    ["/api/dgii/certificacion/run-test", "POST", "[MOCK] Pipeline completo build->sign->QR->PDF con fixtures"],
    ["/api/dgii/certificate/current", "GET", "[OK] Certificado activo (sin material sensible)"],
    ["/api/dgii/certificate/test-local", "POST", "[OK] Sube .p12 y prueba descifrado + firma local"],
    ["/api/dgii/facturas/[id]/pdf", "GET", "[DEMO] PDF de la representacion impresa"],
    ["/api/dgii/facturas/[id]/xml-signed", "GET", "[DEMO] XML firmado"],
    ["/api/dgii/facturas/[id]/xml-unsigned", "GET", "[DEMO] XML sin firmar"],
    ["/api/dgii/invoices/testecf-send", "POST", "[DRY-RUN] Prepara el payload SIN llamar a DGII"],
    ["/api/dgii/notas-credito/create", "POST", "[PEND.] Crear NC (tipo 34)"],
    ["/api/dgii/preview/pdf", "POST", "[DEMO] PDF de previsualizacion"],
    ["/api/dgii/preview/xml-signed", "POST", "[DEMO] XML firmado de preview"],
    ["/api/dgii/preview/xml-unsigned", "POST", "[DEMO] XML sin firmar de preview"],
  ],
  { size: 8.5 }
);

doc.h2("6.2 Pantallas del modulo (app/(app)/dgii)");
doc.table(
  [
    { header: "Ruta", width: 0.34, mono: true },
    { header: "Funcion", width: 0.5 },
    { header: "LOC", width: 0.16, align: "right" },
  ],
  [
    ["/dgii", "Overview general del modulo", "91"],
    ["/dgii/habilitacion", "Wizard de habilitacion (10 pasos con evidencia)", "607"],
    ["/dgii/certificado", "Carga del certificado .p12", "59"],
    ["/dgii/configuracion", "Datos fiscales del emisor", "255"],
    ["/dgii/secuencias", "Gestion de rangos e-NCF", "95"],
    ["/dgii/certificacion", "Pruebas pre-certificacion (tipos 31-34)", "501"],
    ["/dgii/facturas", "Listado de e-CF", "128"],
    ["/dgii/facturas/[id]", "Detalle del e-CF + Nota de Credito", "220"],
    ["/dgii/preview/[id]", "Previsualizacion XML + PDF", "356"],
    ["/dgii/envios", "Historial de envios a DGII", "97"],
    ["/dgii/reportes", "Reportes fiscales", "627"],
  ],
  { size: 8.5 }
);
doc.p(
  "El estado de cliente se maneja con stores Zustand en features/dgii/ (certificado, habilitacion, " +
    "certificacion, nota de credito, prueba local), con cobertura de pruebas en 8 archivos .test.ts.",
  { size: 9, color: "#52606d" }
);

doc.h2("6.3 Representacion impresa (pdf.ts)");
doc.p("Generada con PDFKit. Estructura del documento fiscal impreso:");
doc.list([
  "Encabezado: logo, razon social, RNC y direccion del emisor.",
  "Bloque del comprador: nombre, RNC y fecha/hora.",
  "Tabla de items: SKU, descripcion, cantidad, precio unitario, descuento, ITBIS y total.",
  "Totales: subtotal gravado, subtotal exento, ITBIS, otros impuestos y total.",
  "Codigo QR de consulta DGII y codigo de seguridad (8 chars).",
  "Pie: estado, ambiente, TrackId (si existe) y leyenda legal.",
]);

/* ===================== 7. SEGURIDAD ===================== */
doc.h1("7. Seguridad y controles");

doc.h2("7.1 Aislamiento multi-tenant (RLS)");
doc.p(
  "Todas las tablas del dominio fiscal estan protegidas por Row Level Security filtrando por la " +
    "funcion auth_business_id(), que lee el business_id desde los claims del JWT. Las migraciones " +
    "0008 y 0009 cerraron advertencias del Security Advisor de Supabase y politicas RLS pendientes."
);

doc.h2("7.2 Kill-switches (capas independientes)");
doc.p("Ninguna accion fiscal real se asume: TODOS los gates deben coincidir.");
doc.table(
  [
    { header: "#", width: 0.07, align: "center" },
    { header: "Gate", width: 0.4, mono: true },
    { header: "Proposito", width: 0.53 },
  ],
  [
    ["1", "DATA_SOURCE = 'supabase'", "Activa BD real frente a datos mock"],
    ["2", "DGII_ENVIRONMENT = 'cert'", "Selecciona el ambiente DGII"],
    ["3", "businesses.dgii_enabled", "Habilita DGII por negocio"],
    ["4", "dgii_settings.dgii_enabled_real_send", "Autoriza el envio real"],
    ["5", "isTestecfSendDisabled() (lib/env.ts)", "Feature flag de Fase G"],
    ["6", "isCertificateUploadEnabled()", "Feature flag de carga de certificado"],
    ["7", "RLS auth_business_id()", "Aislamiento de tenant en toda tabla"],
    ["8", "role_permissions", "Control de acceso por rol/permiso"],
  ],
  { size: 8.5 }
);

doc.h2("7.3 Proteccion del material criptografico");
doc.list([
  "Certificados .p12 cifrados con AES-256-GCM en Storage privado de Supabase (IV + auth tag).",
  "Password del certificado por referencia a Vault / variable de entorno, nunca en claro.",
  "Firma ejecutada solo en servidor (server-only); la clave privada no se cachea ni persiste.",
  "Auditoria inmutable en audit_logs (business_id + user_id + timestamp).",
]);

/* ===================== 8. FASES Y ESTADO ===================== */
doc.h1("8. Fases del proyecto y estado");
doc.p(
  "El roadmap (docs/dgii/roadmap-fases-saas-dgii.md) define las fases del SaaS de facturacion. El " +
    "modulo esta tecnicamente listo hasta el dry-run de Fase G; el envio real y la produccion " +
    "permanecen bloqueados."
);
doc.table(
  [
    { header: "Fase", width: 0.1, align: "center" },
    { header: "Objetivo", width: 0.62 },
    { header: "Estado", width: 0.28 },
  ],
  [
    ["0-1", "Diagnostico + base SaaS multi-tenant (auth, RLS)", "[OK] Completo"],
    ["2-3", "Modelo de datos DGII/e-CF + UI", "[OK] Completo"],
    ["4-5", "Builder XML + validacion XSD", "[OK] Completo"],
    ["6-7", "Firma digital + Supabase real (migraciones 0001-0009)", "[OK] Completo"],
    ["8-9", "Wizard de habilitacion + certificado real en preview", "[OK] Completo"],
    ["10-11", "Validacion local del certificado + checklist pre-Fase G", "[OK] Completo"],
    ["12", "Dry-run de Fase G (prepara envio, sin HTTP)", "[OK] Completo"],
    ["13", "Postulacion + carga de secuencias ante DGII", "[EXTERNO] Cliente"],
    ["14 (G)", "Envio real a testecf", "[BLOQUEADA]"],
    ["15 (H)", "Polling de TrackId / estado", "[BLOQUEADA]"],
    ["16-17", "Certificacion formal DGII + produccion fiscal (ecf)", "[BLOQUEADA]"],
    ["18-19", "Operacion/soporte + reutilizacion del paquete", "[PENDIENTE]"],
  ],
  { size: 8.5 }
);
doc.note(
  "Politica operativa (importante)",
  "La Fase G (testecf), el ambiente de produccion fiscal (ecf) y cualquier emision fiscal real NO " +
    "se ejecutan ni se habilitan sin autorizacion explicita y por turno. El pre-Fase G fue aprobado, " +
    "pero la Fase G sigue bloqueada por decision operativa. Ademas requiere la postulacion del " +
    "contribuyente ante la DGII (tramite externo del cliente).",
  "warn"
);

/* ===================== 9. PENDIENTES ===================== */
doc.h1("9. Brechas y pendientes");
doc.h2("9.1 Validaciones DGII por confirmar (matriz D)");
doc.table(
  [
    { header: "ID", width: 0.1, align: "center" },
    { header: "Tema", width: 0.62 },
    { header: "Estado", width: 0.28 },
  ],
  [
    ["D-03", "Formato de fecha TZ-aware (America/Santo_Domingo)", "Parcial"],
    ["D-04", "Logica RFCE tipo 32 (umbral de monto a consumidor)", "Pendiente"],
    ["D-06", "Formato de QR + codigo de seguridad oficial", "Heuristica"],
    ["D-08", "Set de pruebas oficial DGII", "Pendiente"],
    ["D-11", "XMLDSig vs XAdES-BES (verificacion)", "Por verificar"],
    ["D-12", "Typo del XSD e-CF 31", "Patch activo"],
    ["D-13", "Codigos de modificacion de NC (1-5)", "Por validar"],
  ],
  { size: 9 }
);

doc.h2("9.2 Funcionalidad pendiente (fases G+)");
doc.list([
  "Autenticacion DGII (semilla -> firma -> token) y cache de token: aun no implementada.",
  "Cliente HTTP real a testecf/ecf y recepcion multipart: hoy son stubs.",
  "Polling de TrackId con reintentos (Fase H).",
  "Recepcion de e-CF de terceros con aprobacion comercial (schema listo, logica pendiente).",
  "Observabilidad/alertas del modulo fiscal y documentacion de rollback de migraciones.",
]);

doc.h2("9.3 No aplica / fuera de alcance");
doc.list([
  "NCF legales pre-2019: el sistema opera solo con e-CF.",
  "Automatizacion de la postulacion ante DGII: requiere el portal del cliente.",
  "Contabilidad de doble entrada y asesoria fiscal personalizada (responsabilidad del contador).",
]);

/* ===================== 10. REFERENCIAS ===================== */
doc.h1("10. Referencias del repositorio");
doc.h2("10.1 Codigo");
doc.table(
  [
    { header: "Area", width: 0.3 },
    { header: "Ruta", width: 0.7, mono: true },
  ],
  [
    ["Servicios DGII", "apps/web/src/server/services/dgii/"],
    ["Route handlers", "apps/web/src/app/api/dgii/"],
    ["Pantallas", "apps/web/src/app/(app)/dgii/"],
    ["Stores / features", "apps/web/src/features/dgii/"],
    ["Resolutor de venta", "apps/web/src/features/sales/document-resolver.ts"],
    ["Migracion fiscal", "supabase/migrations/0003_dgii_pos.sql"],
    ["XSD oficiales", "docs/dgii/xsd/e-CF-31..34-v1.0.xsd"],
  ],
  { size: 8.5 }
);
doc.h2("10.2 Documentacion DGII (docs/dgii)");
doc.list([
  "plan-maestro-saas-dgii.md — vision, alcance, arquitectura y principios.",
  "prd-saas-facturacion-electronica-dgii.md — requisitos de producto.",
  "roadmap-fases-saas-dgii.md — fases con criterios de salida.",
  "checklist-implementacion-saas-dgii.md — checklists con responsables.",
  "requisitos-facturacion-electronica-dgii.md y matriz-requisitos-dgii.md — requisitos y gap matrix.",
  "runbook-fase-f-g-h.md — runbook de firma, envio y consulta de estado.",
  "qa-saas-pre-fase-g.md — QA previo a Fase G.",
]);

doc.spacer(1);
doc.note(
  "Cierre",
  "Este documento describe la arquitectura y el estado del modulo de facturacion a la fecha " +
    "indicada en la portada. Para cualquier accion que implique emision fiscal real frente a la " +
    "DGII se requiere autorizacion operativa explicita y la postulacion del contribuyente.",
  "note"
);

doc.end();
console.log("PDF generado en:", OUT);
