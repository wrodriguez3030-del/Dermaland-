/**
 * Catálogo declarativo de pasos de habilitación DGII.
 *
 * Define los 9 pasos del wizard `/dgii/habilitacion` con su título,
 * descripción, checklist sugerido y links a los módulos que el usuario
 * debe completar. Esto es 100% mock — no contacta DGII, no toca
 * Supabase, no envía nada.
 *
 * El progreso real del usuario (estado por paso, items marcados,
 * observaciones) se guarda aparte en
 * `@/features/dgii/enablement-store` (localStorage).
 */

import type {
  EnablementStatus,
  EnablementStepId,
} from "@/features/dgii/enablement-store";

export interface EnablementStepDef {
  id: EnablementStepId;
  order: number;
  title: string;
  shortLabel: string;
  description: string;
  /** Checklist sugerido (items con id estable + label). */
  checklist: { id: string; label: string }[];
  /** Ruta interna principal asociada al paso (para "Ir al módulo"). */
  route: string;
  /** Ruta del módulo de referencia adicional, si aplica. */
  relatedRoutes?: { label: string; href: string }[];
  /** Marcas semánticas. */
  requiresAccountant?: boolean;
  requiresDgii?: boolean;
  /** Estado inicial sugerido al usuario (cuando no hay progreso guardado). */
  defaultStatus: EnablementStatus;
  /** Si el paso está bloqueado por fase futura no autorizada. */
  blockedReason?: string;
  /**
   * Si el paso es informativo (read-only). Se usa para `estado_final`,
   * que muestra el resumen calculado en vez de un checklist accionable.
   */
  readOnly?: boolean;
  /** Dimensión global a la que aporta este paso (para el evaluador). */
  dimension?:
    | "certificate"
    | "fiscal_config"
    | "postulacion"
    | "tests_ecf"
    | "representaciones"
    | "urls"
    | "declaracion"
    | "roles_ncf"
    | "final";
}

export const dgiiEnablementSteps: EnablementStepDef[] = [
  {
    id: "certificado_digital",
    order: 1,
    title: "Certificado digital",
    shortLabel: "Certificado",
    description:
      "Subir el certificado `.p12` o `.pfx` emitido por una Autoridad Certificadora aprobada por DGII. Es el primer requisito: sin certificado no se puede firmar XAdES-BES los XML ni avanzar la habilitación.",
    checklist: [
      { id: "cert-archivo", label: "Archivo .p12 / .pfx disponible localmente" },
      { id: "cert-vigencia", label: "Vigencia del certificado verificada (no vencido)" },
      { id: "cert-titular", label: "Titular coincide con RNC del negocio" },
      { id: "cert-password", label: "Contraseña del certificado custodiada (KMS / Vault)" },
      { id: "cert-subida", label: "Certificado subido al módulo /dgii/certificado" },
      { id: "cert-activo", label: "Certificado marcado como activo en el sistema" },
    ],
    route: "/dgii/certificado",
    relatedRoutes: [{ label: "Configuración fiscal", href: "/dgii/configuracion" }],
    requiresAccountant: false,
    requiresDgii: true,
    defaultStatus: "pending",
    dimension: "certificate",
    blockedReason:
      "Subida real del .p12 + contraseña bloqueada hasta autorizar Fase F (Certificado real).",
  },
  {
    id: "configuracion_fiscal",
    order: 2,
    title: "Configuración fiscal",
    shortLabel: "Config fiscal",
    description:
      "Cargar los datos fiscales del emisor: RNC, razón social, dirección, municipio/provincia, contacto y ambiente DGII inicial (testecf por defecto). Estos datos viajan en cada XML emitido.",
    checklist: [
      { id: "rnc", label: "RNC del emisor validado (9 u 11 dígitos)" },
      { id: "razon-social", label: "Razón social declarada" },
      { id: "nombre-comercial", label: "Nombre comercial declarado" },
      { id: "direccion", label: "Dirección fiscal capturada" },
      { id: "provincia-municipio", label: "Provincia y municipio (códigos DGII)" },
      { id: "correo", label: "Correo fiscal de contacto" },
      { id: "telefono", label: "Teléfono fiscal" },
      { id: "ambiente", label: "Ambiente inicial: testecf o certecf" },
    ],
    route: "/dgii/configuracion",
    relatedRoutes: [{ label: "Certificado", href: "/dgii/certificado" }],
    requiresAccountant: false,
    requiresDgii: false,
    defaultStatus: "pending",
    dimension: "fiscal_config",
  },
  {
    id: "postulacion",
    order: 3,
    title: "Generación de la postulación",
    shortLabel: "Postulación DGII",
    description:
      "Generar el formulario y la documentación que se entrega a DGII para iniciar la habilitación como contribuyente electrónico (postulación al ambiente testecf y luego certecf).",
    checklist: [
      { id: "datos-completos", label: "Datos fiscales paso 2 verificados" },
      { id: "cert-listo", label: "Certificado del paso 1 listo y vigente" },
      { id: "responsable", label: "Representante / responsable designado" },
      { id: "formulario", label: "Formulario de postulación generado (mock PDF)" },
      { id: "anexos", label: "Anexos preparados (cert, identidad, RNC, contacto)" },
      { id: "envio-dgii", label: "Postulación entregada a DGII (offline / portal DGII)" },
      { id: "aprobacion-dgii", label: "Aprobación de postulación recibida" },
    ],
    route: "/dgii/habilitacion",
    relatedRoutes: [
      { label: "Configuración fiscal", href: "/dgii/configuracion" },
      { label: "Certificado", href: "/dgii/certificado" },
    ],
    requiresAccountant: true,
    requiresDgii: true,
    defaultStatus: "pending",
    dimension: "postulacion",
    blockedReason:
      "El envío real a DGII queda offline; el sistema solo guía el proceso.",
  },
  {
    id: "pruebas_ecf",
    order: 4,
    title: "Pruebas de simulación e-CF",
    shortLabel: "Simulación e-CF",
    description:
      "Ejecutar el panel de pre-certificación mock para los tipos 31, 32, 33 y 34. Validación XSD + firma dummy + PDF demo + QR demo. Simulación local — no enviada a DGII.",
    checklist: [
      { id: "ecf-31", label: "Prueba e-CF 31 (Crédito Fiscal) ejecutada" },
      { id: "ecf-32", label: "Prueba e-CF 32 (Consumo) ejecutada" },
      { id: "ecf-33", label: "Prueba e-CF 33 (Nota de Débito) ejecutada" },
      { id: "ecf-34", label: "Prueba e-CF 34 (Nota de Crédito) ejecutada" },
      { id: "xsd", label: "Validación XSD verde en todos los tipos" },
      { id: "firma", label: "Firma dummy aplicada (XAdES-BES)" },
      { id: "evidencias", label: "Evidencias mock generadas y revisadas" },
    ],
    route: "/dgii/certificacion",
    relatedRoutes: [
      { label: "Facturas electrónicas", href: "/dgii/facturas" },
    ],
    requiresAccountant: false,
    requiresDgii: false,
    defaultStatus: "pending",
    dimension: "tests_ecf",
  },
  {
    id: "representaciones",
    order: 5,
    title: "Representaciones impresas",
    shortLabel: "PDF / QR",
    description:
      "Validar que la representación impresa (PDF) muestre todos los campos requeridos: emisor, comprador, eNCF, totales, ITBIS, QR demo, código de seguridad y la advertencia NO FISCAL / DEMO.",
    checklist: [
      { id: "pdf", label: "PDF demo generado correctamente" },
      { id: "qr", label: "QR demo visible y escaneable" },
      { id: "security-code", label: "Código de seguridad demo presente" },
      { id: "emisor", label: "Datos del emisor (RNC, razón social, dirección)" },
      { id: "comprador", label: "Datos del comprador" },
      { id: "encf", label: "eNCF demo visible" },
      { id: "totales", label: "Totales e ITBIS calculados" },
      { id: "estado-dgii", label: "Sello de estado DGII mock visible" },
      { id: "no-fiscal", label: "Advertencia NO FISCAL / DEMO visible" },
    ],
    route: "/dgii/facturas",
    relatedRoutes: [
      { label: "Pre-certificación", href: "/dgii/certificacion" },
    ],
    requiresAccountant: false,
    requiresDgii: false,
    defaultStatus: "pending",
    dimension: "representaciones",
  },
  {
    id: "url_produccion",
    order: 6,
    title: "URL servicios de producción",
    shortLabel: "URLs de servicios",
    description:
      "Preparar los endpoints HTTP del contribuyente que DGII podría requerir para producción. Hoy son mock/stub; cuando se autorice Fase G/H se conectan a DGII real.",
    checklist: [
      { id: "base-vercel", label: "URL base producción Vercel revisada" },
      { id: "recepcion", label: "/api/dgii/recepcion mapeado (mock)" },
      { id: "aprobacion", label: "/api/dgii/aprobacion-comercial mapeado (mock)" },
      { id: "status", label: "/api/dgii/status mapeado (mock)" },
      { id: "health", label: "/api/dgii/health mapeado (mock)" },
      { id: "dns", label: "DNS final NO cambiado (intencional)" },
      { id: "registro-dgii", label: "URLs NO registradas en DGII todavía" },
    ],
    route: "/dgii/configuracion",
    relatedRoutes: [{ label: "Envíos", href: "/dgii/envios" }],
    requiresAccountant: false,
    requiresDgii: true,
    defaultStatus: "pending",
    dimension: "urls",
    blockedReason:
      "Conexión real DGII bloqueada hasta autorización Fase G (envío) / Fase H (status).",
  },
  {
    id: "declaracion_jurada",
    order: 7,
    title: "Declaración jurada",
    shortLabel: "Declaración jurada",
    description:
      "Revisar el checklist de responsabilidades fiscales y dejar constancia de que el contador validó las reglas. La declaración jurada final se valida con DGII y/o contador fuera del sistema.",
    checklist: [
      { id: "datos-fiscales", label: "Datos fiscales revisados con contador" },
      { id: "secuencias", label: "Secuencias e-NCF cargadas y revisadas" },
      { id: "cert", label: "Certificado digital configurado y activo" },
      { id: "pruebas", label: "Pruebas e-CF realizadas (paso 4)" },
      { id: "representaciones", label: "Representaciones impresas revisadas" },
      { id: "urls", label: "URLs de servicios revisadas" },
      { id: "contador", label: "Contador validó reglas fiscales" },
      { id: "admin", label: "Admin confirma entendimiento de responsabilidades" },
      { id: "omision", label: "DermaLand no permite omisión fiscal" },
    ],
    route: "/dgii/habilitacion",
    relatedRoutes: [
      { label: "Configuración fiscal", href: "/dgii/configuracion" },
    ],
    requiresAccountant: true,
    requiresDgii: true,
    defaultStatus: "pending",
    dimension: "declaracion",
  },
  {
    id: "roles_ncf",
    order: 8,
    title: "Asignación de roles y NCF",
    shortLabel: "Roles y NCF",
    description:
      "Asignar permisos DGII a roles del negocio y cargar secuencias e-NCF por tipo. Asignación de roles en modo mock hasta aplicar migraciones Supabase.",
    checklist: [
      { id: "permisos", label: "Permisos DGII revisados en /admin/permisos" },
      { id: "asignacion-roles", label: "Asignación rol → permiso validada con admin" },
      { id: "ncf-31", label: "Secuencia NCF 31 cargada" },
      { id: "ncf-32", label: "Secuencia NCF 32 cargada" },
      { id: "ncf-33", label: "Secuencia NCF 33 cargada (si aplica)" },
      { id: "ncf-34", label: "Secuencia NCF 34 cargada (si aplica)" },
      { id: "vencimiento", label: "Vencimiento de NCF revisado" },
      { id: "rango", label: "Rango disponible verificado" },
      { id: "permisos-criticos", label: "Permisos críticos revisados (sign/send)" },
    ],
    route: "/admin/permisos",
    relatedRoutes: [
      { label: "Secuencias e-NCF", href: "/dgii/secuencias" },
      { label: "Roles", href: "/admin/roles" },
    ],
    requiresAccountant: true,
    requiresDgii: false,
    defaultStatus: "pending",
    dimension: "roles_ncf",
    blockedReason:
      "Asignación efectiva por DB queda mock hasta aplicar migraciones 0003/0004/0005 (Fase C).",
  },
  {
    id: "estado_final",
    order: 9,
    title: "Estado final de habilitación",
    shortLabel: "Estado final",
    description:
      "Resumen automático del estado de habilitación DGII. Calculado a partir de los 8 pasos anteriores. Este paso no se marca manualmente; se actualiza cuando los otros pasos cambian.",
    checklist: [],
    route: "/dgii/habilitacion",
    relatedRoutes: [],
    requiresAccountant: false,
    requiresDgii: true,
    defaultStatus: "pending",
    dimension: "final",
    readOnly: true,
  },
];

/** Lista de permisos DGII/caja relevantes para mostrar en el paso de roles. */
export const dgiiEnablementRelevantPermissions = [
  "dgii:configure",
  "dgii:certificate:upload",
  "dgii:sequences:manage",
  "dgii:invoices:generate_xml",
  "dgii:invoices:validate_xml",
  "dgii:invoices:sign",
  "dgii:invoices:send",
  "dgii:invoices:check_status",
  "dgii:reports:view",
  "dgii:certification:run_tests",
  "dgii:credit_notes:create",
  "cash:close",
  "cash:change_closing_percentage",
] as const;

/** URLs de servicios planificadas (paso 6). */
export const dgiiEnablementServiceUrls = [
  {
    path: "/api/dgii/recepcion",
    purpose: "Recepción XML firmado",
    state: "mock" as const,
    blocked: "Fase G",
  },
  {
    path: "/api/dgii/aprobacion-comercial",
    purpose: "Aprobación comercial del receptor",
    state: "mock" as const,
    blocked: "Fase G",
  },
  {
    path: "/api/dgii/status",
    purpose: "Consulta de estado / TrackId",
    state: "mock" as const,
    blocked: "Fase H",
  },
  {
    path: "/api/dgii/health",
    purpose: "Healthcheck del servicio",
    state: "stub" as const,
    blocked: undefined,
  },
];

export const dgiiEnablementBaseUrl = "https://dermaland.vercel.app";
