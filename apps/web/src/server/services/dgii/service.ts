import "server-only";
import { env, isDgiiConfigured } from "@/lib/env";
import type { ElectronicInvoice, Proforma } from "@/types";

/**
 * DGII e-CF Service.
 *
 * Capa de abstracción sobre la API DGII (RD). Implementación XAdES-BES con
 * `node-forge` (sin SDK oficial). Por ahora todos los métodos son stubs que
 * lanzan `DgiiNotConfigured` si falta el certificado o `DgiiNotImplemented`
 * si la lógica real aún no está escrita.
 *
 * Activación:
 *  1. Súper admin sube `.p12` desde /super-admin → branding/dgii.
 *  2. Cliente confirma RNC, secuencias, ambiente.
 *  3. `dgii_enabled = true` en la fila del business.
 *  4. POS empieza a llamar `convertProformaToEcf()`.
 *
 * Documentado en `H:\Mi unidad\PROYECTO DERMALAND\plan-maestro.md` Fase 5.
 * Riesgos asociados: R-DGII-01 a R-DGII-04.
 */

export class DgiiNotConfigured extends Error {
  constructor(reason: string) {
    super(`DGII no configurada: ${reason}. dgii_enabled=false hasta cargar .p12.`);
    this.name = "DgiiNotConfigured";
  }
}

export class DgiiNotImplemented extends Error {
  constructor(method: string) {
    super(`DgiiService.${method}() no implementado. Pendiente Fase 5.`);
    this.name = "DgiiNotImplemented";
  }
}

export type EcfType = "31" | "32" | "33" | "34" | "41" | "43" | "44" | "45";

export interface SignedXmlResult {
  xml: string;
  digest: string;
  signedAt: string;
}

export interface DgiiSubmitResult {
  trackId: string;
  acceptedAt?: string;
  rejectedAt?: string;
  errors?: { code: string; message: string }[];
}

export interface DgiiService {
  /** Genera el XML sin firmar para una proforma + tipo e-CF. */
  generateXml(proforma: Proforma, ecfType: EcfType): Promise<string>;

  /** Firma el XML con XAdES-BES usando el certificado del business. */
  signXml(unsignedXml: string, businessId: string): Promise<SignedXmlResult>;

  /** Envía el XML firmado al endpoint DGII (cert o prod según env). */
  submitToDgii(signedXml: string): Promise<DgiiSubmitResult>;

  /** Consulta el TrackID — DGII responde async. */
  getTrackStatus(trackId: string): Promise<DgiiSubmitResult>;

  /** Anula un e-CF previamente aceptado. */
  cancelInvoice(invoiceId: string, reason: string): Promise<void>;

  /** Crea Nota de Crédito (e-CF tipo 34) asociada a una factura origen. */
  createCreditNote(
    sourceInvoice: ElectronicInvoice,
    amount: number,
    reason: string,
  ): Promise<ElectronicInvoice>;
}

class DgiiServiceImpl implements DgiiService {
  private get baseUrl() {
    return env.DGII_ENVIRONMENT === "prod"
      ? "https://ecf.dgii.gov.do/ecf"
      : "https://ecf.dgii.gov.do/testecf";
  }

  async generateXml(proforma: Proforma, ecfType: EcfType): Promise<string> {
    // Estructura real ~150 líneas siguiendo XSD oficial DGII.
    // Por ahora un placeholder que muestra el shape esperado.
    const lines = proforma.items
      .map(
        (it, ix) => `
    <DetallesItems>
      <NumeroLinea>${ix + 1}</NumeroLinea>
      <NombreItem>${escapeXml(it.productName)}</NombreItem>
      <CantidadItem>${it.quantity}</CantidadItem>
      <PrecioUnitarioItem>${(it.unitPrice).toFixed(2)}</PrecioUnitarioItem>
      <MontoItem>${it.total.toFixed(2)}</MontoItem>
    </DetallesItems>`,
      )
      .join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc>
      <TipoeCF>${ecfType}</TipoeCF>
      <eNCF>__PENDING__</eNCF>
      <FechaVencimientoSecuencia>__PENDING__</FechaVencimientoSecuencia>
    </IdDoc>
    <Emisor>
      <RNCEmisor>__PENDING__</RNCEmisor>
      <RazonSocialEmisor>__PENDING__</RazonSocialEmisor>
    </Emisor>
    <Comprador>
      <RNCComprador>__PENDING__</RNCComprador>
      <RazonSocialComprador>${escapeXml(proforma.customerName)}</RazonSocialComprador>
    </Comprador>
    <Totales>
      <MontoTotal>${proforma.total.toFixed(2)}</MontoTotal>
      <TotalITBIS>${proforma.itbis.toFixed(2)}</TotalITBIS>
    </Totales>
  </Encabezado>
  <DetallesItems>${lines}
  </DetallesItems>
</ECF>`;
  }

  async signXml(unsignedXml: string, _businessId: string): Promise<SignedXmlResult> {
    if (!isDgiiConfigured()) {
      throw new DgiiNotConfigured("certificado .p12 no cargado");
    }
    // Implementación real: cargar .p12 desde Supabase Storage cifrado,
    // descifrar contraseña con KMS, firmar con node-forge XAdES-BES.
    throw new DgiiNotImplemented("signXml");
  }

  async submitToDgii(_signedXml: string): Promise<DgiiSubmitResult> {
    if (!isDgiiConfigured()) {
      throw new DgiiNotConfigured("ambiente no inicializado");
    }
    // POST multipart al `${this.baseUrl}/Recepcion/...`
    throw new DgiiNotImplemented(`submitToDgii (base ${this.baseUrl})`);
  }

  async getTrackStatus(_trackId: string): Promise<DgiiSubmitResult> {
    if (!isDgiiConfigured()) throw new DgiiNotConfigured("sin certificado");
    throw new DgiiNotImplemented("getTrackStatus");
  }

  async cancelInvoice(_invoiceId: string, _reason: string): Promise<void> {
    throw new DgiiNotImplemented("cancelInvoice");
  }

  async createCreditNote(
    _sourceInvoice: ElectronicInvoice,
    _amount: number,
    _reason: string,
  ): Promise<ElectronicInvoice> {
    throw new DgiiNotImplemented("createCreditNote");
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export const dgiiService: DgiiService = new DgiiServiceImpl();
