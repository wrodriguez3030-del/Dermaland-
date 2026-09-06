import "server-only";

/**
 * Orquestación de "preparar un comprobante" (fase 3A, tarea 5). La pieza que
 * junta todo — gates, número fiscal, XML, firma, subida, persistencia — y la
 * única de la fase que puede quemar un e-NCF si se hace mal.
 *
 * Portado de `~/Projects/agendapp/src/lib/dgii/invoice-prepare.ts` (líneas
 * 79-628, SOLO LECTURA). El orden de los gates y qué se persiste NO cambian.
 * Lo que cambia es el límite de la transacción: agendapp reserva el e-NCF
 * DENTRO de la transacción de Prisma que también firma; DermaLand no abre
 * transacciones desde el servidor web (habla con la base por PostgREST), así
 * que aquí el número se MIRA sin consumir, se firma FUERA de cualquier
 * transacción, y se consume comprobando bajo bloqueo que sigue siendo el
 * nuestro. Decisión completa, con el porqué y lo que costó no hacerlo así en
 * agendapp (6-10 números quemados, v550): `docs/decisiones.md`, entrada
 * "Firmar antes de reservar el e-NCF, no dentro de una transacción como
 * agendapp".
 *
 * El baile (no se puede alterar el orden):
 *   1. `evaluarHabilitacion` — si hay bloqueos, ni se mira el primer número.
 *   2. `peekNextEncf` — qué número tocaría, SIN consumir.
 *   3. `buildEcfXml` con ese número → `signEcfXml` con el certificado activo
 *      → `validateEcfXml` contra el XSD oficial (con la firma ya puesta).
 *   4. `guardarXmlFirmado` en el bucket privado.
 *   5. `prepararFactura(eNcfEsperado, …)`:
 *      - `ENCF_TOMADO` → volver al paso 3 con `e_ncf_actual`. Máximo 3 intentos.
 *      - `IDEMPOTENT_PROFORMA_YA_FACTURADA` → devolver ESA factura, no emitir otra.
 *   6. `finalizarFactura` — de `draft` a `signed`, con la ruta del XML.
 *   7. Si 6 falla: `marcarFallo` con el motivo, y borrar el XML subido.
 *
 * CORRECCIÓN DE ORDEN respecto al resumen de una frase del pliego ("build →
 * validar → firmar"): aquí se firma ANTES de validar contra el XSD, no
 * después. Los XSD oficiales exigen `<Signature>` como `xs:any minOccurs="1"`
 * al final de `<ECF>` (ver `core/xsd/e-CF-32-v1.0.xsd:424`): un XML SIN firma
 * falla la validación SIEMPRE, por diseño — lo prueba el propio
 * `core/builder.test.ts` ("el XML SIN firma falla el XSD solo por el
 * <Signature> requerido"). Validar antes de firmar habría hecho que TODO
 * comprobante fallara la validación. agendapp valida el firmado
 * (`invoice-prepare.ts:428-433`); aquí se hace exactamente igual.
 *
 * Certificado y configuración fiscal se resuelven ANTES de mirar el primer
 * número (son, en la práctica, dos gates más: un certificado que no
 * descifra o una configuración incompleta impiden emitir tanto como un
 * bloqueo de `evaluarHabilitacion`).
 */
import { randomUUID, createHash } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  crearRepositorioSecuencias,
  type RepositorioSecuencias,
  type FacturaAPreparar,
  type LineaAPreparar,
  type ResultadoPreparar as ResultadoPrepararFactura,
} from "@/server/repositories/supabase/dgii-sequences";
import {
  crearRepositorioFacturas,
  type RepositorioFacturas,
  type ResumenFactura,
} from "@/server/repositories/supabase/dgii-invoices";
import { evaluarHabilitacion, puedeEmitir, type EstadoHabilitacion } from "./enablement";
import {
  obtenerConfiguracion,
  estaConfigurado,
  modoFiscal,
  type ConfiguracionFiscal,
} from "./settings";
import { obtenerCertificadoActivo } from "./certificates";
import {
  guardarXmlFirmado as guardarXmlFirmadoReal,
  borrarXml as borrarXmlReal,
  type ContextoAlmacenamientoDgii,
} from "./storage";
import { buildEcfXml } from "../core/builder";
import type { BuildEcfXmlInput, EcfTipoBuilder } from "../core/builder-types";
import { signEcfXml } from "../core/signer";
import { validateEcfXml } from "../core/validator";
import { loadXsdForTipo } from "../core/xsd-loader";
import { itbisPercentFromDecimal } from "../core/itbis-rate";
import { money2 } from "../core/xml-utils";
import { parsePkcs12Certificate } from "../core/certificate-parser";

/** Máximo de reintentos ante `ENCF_TOMADO`: se reintenta, no se rinde a la primera ni entra en bucle. */
const MAX_INTENTOS = 3;

// ── Contrato público ─────────────────────────────────────────────────────

/** Quién pide preparar el comprobante. `businessId` decide todo lo demás; `userId` viaja para auditoría futura. */
export interface ContextoPreparar {
  businessId: string;
  userId: string;
}

/** Cliente del comprobante, tal como lo conoce quien llama (POS/proforma). Todo opcional salvo lo que ya se sabe. */
export interface ClientePreparar {
  nombre?: string | null;
  rncOCedula?: string | null;
  customerId?: string | null;
  correo?: string | null;
  direccion?: string | null;
}

/** Línea del comprobante. */
export interface ItemPreparar {
  nombre: string;
  cantidad: number;
  precioUnitario: number;
  /**
   * FRACCIÓN, no porcentaje — igual que `LineaAPreparar.itbis_rate` (fase 2):
   * el 18 % se escribe `0.18`. Este módulo la convierte a porcentaje entero
   * (`itbisPercentFromDecimal`) solo para el builder del núcleo, que la
   * exige así (0, 16 o 18).
   */
  itbisRate: number;
  descuento?: number | null;
}

/** Lo que hace falta para preparar un comprobante. Nada de esto es XML ni e-NCF: eso lo decide esta función. */
export interface EntradaPrepararComprobante {
  tipoEcf: EcfTipoBuilder;
  proformaId?: string | null;
  customer?: ClientePreparar | null;
  items: ItemPreparar[];
}

/** Certificado ya descifrado y listo para `signEcfXml` (PEM, no `.p12`). */
export interface CertificadoParaFirmar {
  certificatePem: string;
  privateKeyPem: string;
}

/** Lo que `prepararComprobante` necesita para guardar/borrar el XML, sin acoplarse al `ctx` de `storage.ts`. */
export interface AlmacenamientoParaPreparar {
  guardarXmlFirmado(entrada: { invoiceId: string; xml: string }): Promise<string>;
  borrarXml(ruta: string): Promise<void>;
}

/**
 * Dependencias inyectables, con valores por defecto que son los reales
 * (Supabase + núcleo). Así se prueba sin base, sin bucket y sin red — es la
 * razón de ser de este parámetro, no un añadido cosmético.
 *
 * `habilitacion`, `configuracion` y `certificado` son VALORES ya resueltos
 * (no funciones): en producción los resuelve esta misma función llamando a
 * los servicios reales; en pruebas se pasan directamente, sin necesidad de
 * simular Supabase. `secuencias` y `almacenamiento` sí son funciones,
 * porque el baile necesita observar CUÁNTAS veces y en qué ORDEN se llaman.
 */
export interface DependenciasPreparar {
  habilitacion?: EstadoHabilitacion;
  /** `null` es un valor válido (sin configuración guardada); por eso se distingue de "no lo pasaron". */
  configuracion?: ConfiguracionFiscal | null;
  certificado?: CertificadoParaFirmar;
  secuencias?: Pick<RepositorioSecuencias, "peekNextEncf" | "prepararFactura" | "finalizarFactura" | "marcarFallo">;
  /** Solo para enriquecer el caso idempotente con `eNcf`/`rutaXml` de la factura ya existente. `null` = no se pudo/no hace falta. */
  facturas?: Pick<RepositorioFacturas, "leerResumen"> | null;
  almacenamiento?: AlmacenamientoParaPreparar;
  /** Reloj inyectable (determinismo en pruebas); por defecto, el real. */
  ahora?: () => Date;
  // Núcleo puro (fase 1). Nunca hace falta sustituirlos en pruebas —son
  // deterministas y sin red— pero viven aquí por la misma razón que el resto:
  // "recibe sus dependencias por parámetro" no es solo para lo que toca la base.
  construir?: typeof buildEcfXml;
  firmar?: typeof signEcfXml;
  validar?: typeof validateEcfXml;
  cargarXsd?: typeof loadXsdForTipo;
}

/** Resultado de preparar un comprobante. `bloqueos` solo aparece cuando el motivo es un gate cerrado. */
export type ResultadoPreparar =
  | { ok: true; invoiceId: string; eNcf: string; rutaXml: string }
  | { ok: false; motivo: string; bloqueos?: string[] };

// ── Helpers privados ─────────────────────────────────────────────────────

function mensajeDeError(e: unknown): string {
  return e instanceof Error ? e.message : "Error desconocido al preparar el comprobante.";
}

function secuenciasPorDefecto(businessId: string) {
  const cliente = createServiceRoleClient();
  if (!cliente) throw new Error("Supabase no está configurado.");
  return crearRepositorioSecuencias(cliente, businessId);
}

function repositorioFacturasPorDefecto(businessId: string): Pick<RepositorioFacturas, "leerResumen"> | null {
  const cliente = createServiceRoleClient();
  if (!cliente) return null;
  return crearRepositorioFacturas(cliente, businessId);
}

function almacenamientoPorDefecto(businessId: string): AlmacenamientoParaPreparar {
  const ctxAlmacenamiento: ContextoAlmacenamientoDgii = { businessId };
  return {
    guardarXmlFirmado: (entrada) =>
      guardarXmlFirmadoReal(ctxAlmacenamiento, { tipo: "signed_xml", invoiceId: entrada.invoiceId, xml: entrada.xml }),
    borrarXml: (ruta) => borrarXmlReal(ctxAlmacenamiento, ruta),
  };
}

/**
 * Certificado activo del negocio, ya descifrado (`certificates.ts`) y
 * convertido de `.p12` a PEM (`certificate-parser.ts` del núcleo). Dos
 * pasos porque `obtenerCertificadoActivo` devuelve el `.p12` completo, no
 * sus partes — ver `certificates.ts`, nota 2 de su cabecera.
 */
async function certificadoPorDefecto(businessId: string): Promise<CertificadoParaFirmar> {
  const activo = await obtenerCertificadoActivo(businessId);
  if (!activo) {
    throw new Error("No hay certificado activo para firmar.");
  }
  const parsed = parsePkcs12Certificate({ pkcs12Bytes: activo.p12, password: activo.password });
  return { certificatePem: parsed.certificatePem, privateKeyPem: parsed.privateKeyPem };
}

/**
 * Compensación cuando algo falla DESPUÉS de consumir el número (paso 7 del
 * baile): marca el motivo y borra el objeto subido. Las dos operaciones son
 * de mejor esfuerzo — un fallo de limpieza no debe tapar el error original,
 * que ya se conoce y ya se va a devolver.
 */
async function compensarFallo(
  secuencias: Pick<RepositorioSecuencias, "marcarFallo">,
  almacenamiento: Pick<AlmacenamientoParaPreparar, "borrarXml">,
  invoiceId: string,
  rutaXml: string,
  motivo: string,
): Promise<void> {
  try {
    await secuencias.marcarFallo(invoiceId, motivo);
  } catch {
    // Best-effort: ver comentario de la función.
  }
  try {
    await almacenamiento.borrarXml(rutaXml);
  } catch {
    // Idem.
  }
}

/**
 * `eNcf` y `rutaXml` de una factura idempotente. `prepare_ecf_invoice` solo
 * devuelve `invoice_id` en ese caso (ver `dgii-invoices.ts`); esto es un
 * enriquecimiento de mejor esfuerzo — si no se puede leer, igual se responde
 * `ok:true` con esas dos cadenas vacías en vez de inventar un dato fiscal.
 */
async function leerResumenDeMejorEsfuerzo(
  facturasOverride: Pick<RepositorioFacturas, "leerResumen"> | null | undefined,
  businessId: string,
  invoiceId: string,
): Promise<ResumenFactura | null> {
  try {
    const repo = facturasOverride !== undefined ? facturasOverride : repositorioFacturasPorDefecto(businessId);
    if (!repo) return null;
    return await repo.leerResumen(invoiceId);
  } catch {
    return null;
  }
}

// ── Orquestación ─────────────────────────────────────────────────────────

export async function prepararComprobante(
  ctx: ContextoPreparar,
  entrada: EntradaPrepararComprobante,
  opciones: DependenciasPreparar = {},
): Promise<ResultadoPreparar> {
  try {
    // 1) Gate. Antes de mirar ningún número.
    const habilitacion = opciones.habilitacion ?? (await evaluarHabilitacion(ctx.businessId));
    if (!puedeEmitir(habilitacion)) {
      return {
        ok: false,
        motivo: "No se puede emitir: habilitación fiscal incompleta.",
        bloqueos: habilitacion.bloqueos,
      };
    }

    // Configuración del emisor: hace falta para el XML, no solo para el gate.
    // `!== undefined` porque `null` ("sin configuración guardada") es un valor
    // real y distinto de "no me lo pasaron" (que sí dispara la llamada real).
    const configuracion =
      opciones.configuracion !== undefined ? opciones.configuracion : await obtenerConfiguracion(ctx.businessId);
    if (!configuracion || !estaConfigurado(configuracion)) {
      return { ok: false, motivo: "Falta la configuración fiscal del emisor." };
    }
    const ambiente = modoFiscal(configuracion);

    // Certificado listo para firmar. Un certificado que no descifra, venció,
    // o no existe, es tan bloqueante como cualquier bloqueo de arriba.
    const certificado = opciones.certificado ?? (await certificadoPorDefecto(ctx.businessId));

    const secuencias = opciones.secuencias ?? secuenciasPorDefecto(ctx.businessId);
    const almacenamiento = opciones.almacenamiento ?? almacenamientoPorDefecto(ctx.businessId);
    const ahora = opciones.ahora ?? (() => new Date());

    const construir = opciones.construir ?? buildEcfXml;
    const firmar = opciones.firmar ?? signEcfXml;
    const validar = opciones.validar ?? validateEcfXml;
    const cargarXsd = opciones.cargarXsd ?? loadXsdForTipo;

    // El XSD no depende del e-NCF: se carga una sola vez, no en cada reintento.
    const xsd = await cargarXsd(entrada.tipoEcf);

    // 2) Mirar el número, SIN consumir.
    let candidato = await secuencias.peekNextEncf(entrada.tipoEcf, ambiente);

    const emisor: BuildEcfXmlInput["emisor"] = {
      // `estaConfigurado` ya garantizó los tres no vacíos: el `!` es ese chequeo, no una suposición.
      rnc: configuracion.rncEmisor!,
      razonSocial: configuracion.razonSocialEmisor!,
      direccion: configuracion.direccionEmisor!,
      provinciaCodigo: configuracion.provinciaCodigo,
      municipioCodigo: configuracion.municipioCodigo,
      correo: configuracion.correoEmisor,
      telefono: configuracion.telefonoEmisor,
    };
    const comprador: BuildEcfXmlInput["comprador"] = entrada.customer
      ? {
          rncOCedula: entrada.customer.rncOCedula ?? null,
          razonSocial: entrada.customer.nombre ?? null,
          correo: entrada.customer.correo ?? null,
          direccion: entrada.customer.direccion ?? null,
        }
      : null;

    for (let intento = 1; intento <= MAX_INTENTOS; intento++) {
      // 3) Construir → firmar → validar. Firmar es lo que "gasta" CPU local en
      //    cada reintento; el número todavía no se ha tocado.
      let signedXml: string;
      // Totales que salen del builder (fuera del `try`: hacen falta después
      // para `factura`). Se REUSAN, no se recalculan aparte: el builder
      // redondea por tramo (I1/I2/I3) antes de sumar, así que una suma
      // ingenua por línea podría diferir en centavos de lo que el XML firmado
      // ya dice. Un solo cálculo evita ese drift cabecera↔persistencia.
      let totalesBuilder!: { montoGravado: number; totalItbis: number; total: number };
      try {
        const built = construir({
          tipoEcf: entrada.tipoEcf,
          eNcf: candidato,
          fechaEmision: ahora().toISOString(),
          ambiente,
          emisor,
          comprador,
          items: entrada.items.map((it) => ({
            nombre: it.nombre,
            cantidad: it.cantidad,
            precioUnitario: it.precioUnitario,
            itbisRate: itbisPercentFromDecimal(it.itbisRate),
            descuento: it.descuento ?? undefined,
          })),
        });
        totalesBuilder = built.totals;
        const firmado = firmar({
          xml: built.xml,
          certificatePem: certificado.certificatePem,
          privateKeyPem: certificado.privateKeyPem,
        });
        signedXml = firmado.signedXml;

        const validado = await validar({ xml: signedXml, xsd, schemaName: `e-CF-${entrada.tipoEcf}` });
        if (!validado.ok) {
          const detalle = validado.errors[0]?.message ?? "no cumple el XSD oficial.";
          return { ok: false, motivo: `El comprobante firmado no validó contra el XSD: ${detalle}` };
        }
      } catch (e) {
        // Firmar/construir/validar falló: el número TODAVÍA no se consumió.
        return { ok: false, motivo: mensajeDeError(e) };
      }

      // 4) Subir el firmado al bucket. Sigue sin haberse consumido nada.
      let rutaXml: string;
      try {
        rutaXml = await almacenamiento.guardarXmlFirmado({ invoiceId: randomUUID(), xml: signedXml });
      } catch (e) {
        return { ok: false, motivo: mensajeDeError(e) };
      }

      const factura: FacturaAPreparar = {
        tipo_ecf: entrada.tipoEcf,
        ambiente,
        proforma_id: entrada.proformaId ?? null,
        customer_id: entrada.customer?.customerId ?? null,
        customer_rnc: entrada.customer?.rncOCedula ?? null,
        subtotal_gravado: totalesBuilder.montoGravado,
        total_itbis: totalesBuilder.totalItbis,
        total: totalesBuilder.total,
        xml_generated_path: null,
      };
      const lineas: LineaAPreparar[] = entrada.items.map((it, i) => ({
        line_no: i + 1,
        name_item: it.nombre,
        quantity: it.cantidad,
        unit_price: it.precioUnitario,
        itbis_rate: it.itbisRate,
        monto_item: money2(it.cantidad * it.precioUnitario - (it.descuento ?? 0)),
      }));

      // 5) Consumir el número e insertar en `draft`.
      let resultado: ResultadoPrepararFactura;
      try {
        resultado = await secuencias.prepararFactura(candidato, factura, lineas);
      } catch (e) {
        return { ok: false, motivo: mensajeDeError(e) };
      }

      if (!resultado.ok) {
        // La unión de `ResultadoPreparar` (dgii-sequences.ts) solo tiene dos
        // motivos posibles aquí: hay que comprobar `resultado.ok` ANTES de
        // leer `motivo` para que TypeScript discrimine cuál es cuál (la
        // variante `ok: true` no tiene `motivo`).
        if (resultado.motivo === "IDEMPOTENT_PROFORMA_YA_FACTURADA") {
          // La proforma ya tenía comprobante: se devuelve ÉSE. No se llega a
          // `finalizarFactura` porque no se preparó ninguno nuevo.
          const resumen = await leerResumenDeMejorEsfuerzo(opciones.facturas, ctx.businessId, resultado.invoice_id);
          return {
            ok: true,
            invoiceId: resultado.invoice_id,
            eNcf: resumen?.eNcf ?? "",
            rutaXml: resumen?.rutaXmlFirmado ?? "",
          };
        }

        // Solo queda ENCF_TOMADO: otro cobro se adelantó. No se consumió
        // nada — se reintenta con el número real, no se abandona ni se
        // queda en bucle (máximo `MAX_INTENTOS`).
        if (intento >= MAX_INTENTOS) {
          return { ok: false, motivo: "ENCF_TOMADO" };
        }
        candidato = resultado.e_ncf_actual;
        continue;
      }

      // 6) De `draft` a `signed`, con la ruta ya subida. El sha256 lo calcula
      // ESTE módulo (no `storage.ts`, decidido en la ronda 3 de la tarea 1):
      // se envía junto a la ruta aunque `finalize_ecf_invoice` (fase 2)
      // todavía no lo persista (su comentario ya documenta `xml_sha256` en
      // `p_datos` — ver docs/decisiones.md). Cuando la columna exista, no
      // hace falta tocar este módulo.
      const invoiceId = resultado.invoice_id;
      const eNcfFinal = resultado.e_ncf;
      const xmlSha256 = createHash("sha256").update(signedXml, "utf8").digest("hex");
      const datosFinalizar: { xml_signed_path: string; xml_sha256: string } = {
        xml_signed_path: rutaXml,
        xml_sha256: xmlSha256,
      };

      try {
        const finalizado = await secuencias.finalizarFactura(invoiceId, datosFinalizar);
        if (!finalizado.ok) {
          await compensarFallo(secuencias, almacenamiento, invoiceId, rutaXml, `No se pudo finalizar: ${finalizado.motivo}.`);
          return { ok: false, motivo: finalizado.motivo };
        }
      } catch (e) {
        // 7) Falló después de consumir: motivo escrito + limpieza del bucket.
        await compensarFallo(secuencias, almacenamiento, invoiceId, rutaXml, mensajeDeError(e));
        return { ok: false, motivo: mensajeDeError(e) };
      }

      return { ok: true, invoiceId, eNcf: eNcfFinal, rutaXml };
    }

    // Inalcanzable: el `for` siempre devuelve dentro del cuerpo (éxito,
    // idempotente, o el `ENCF_TOMADO` del último intento). Queda como red de
    // seguridad para que TypeScript vea todos los caminos cubiertos.
    return { ok: false, motivo: "ENCF_TOMADO" };
  } catch (e) {
    return { ok: false, motivo: mensajeDeError(e) };
  }
}
