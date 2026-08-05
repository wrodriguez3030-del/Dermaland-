import "server-only";
import forge from "node-forge";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveSigningMaterial } from "@/server/services/certificate-storage";
import type { HandlerOutcome, QueueHandlers } from "./queue-worker";
import { signEcfXml, verifyEcfSignature } from "./signer";
import { validateEcfXml } from "./validator";
import { loadXml, saveXml } from "./xml-storage";
import { loadSchemaForEcfType } from "./xsd-registry";

/**
 * Lo que el trabajador sabe hacer sin hablar con la DGII.
 *
 * Validar contra el XSD y firmar ocurren **en casa**. Se pueden repetir mil
 * veces sin consecuencias, y por eso el trabajador los ejecuta aunque el envío
 * esté apagado: el día que se habilite, lo pendiente ya está firmado y sale de
 * inmediato en vez de empezar de cero.
 *
 * Enviar y consultar NO están aquí a propósito. Viven detrás de
 * `DGII_TESTECF_SEND_ENABLED` y de la política de Fase G, y el trabajador se
 * para antes de llamarlos.
 *
 * CÓMO SE REPORTA UN FALLO
 *
 * Estos manejadores **no lanzan**: devuelven `{ ok: false, error }` con la
 * pista de qué pasó, y quien clasifica es `error-classification.ts`. Mezclar
 * ambas cosas —fallar y decidir si se reintenta— es cómo se acaba reintentando
 * para siempre un XML que está mal.
 */

interface FilaComprobante {
  id: string;
  tipo_ecf: string;
  e_ncf: string;
  ambiente: string;
  xml_generated_path: string | null;
  xml_signed_path: string | null;
}

async function cargarComprobante(
  businessId: string,
  invoiceId: string,
): Promise<FilaComprobante | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data } = await admin
    .from("electronic_invoices")
    .select("id, tipo_ecf, e_ncf, ambiente, xml_generated_path, xml_signed_path")
    .eq("id", invoiceId)
    .eq("business_id", businessId)
    .maybeSingle();
  return (data as FilaComprobante | null) ?? null;
}

/**
 * Validar el XML contra el esquema oficial de su tipo.
 *
 * **Nunca se envía a la DGII un XML que no pase la validación local** (§14 del
 * pliego). Es la diferencia entre enterarse aquí, gratis, o enterarse cuando la
 * DGII rechaza el comprobante y el e-NCF ya está gastado.
 */
export async function validarHandler(
  invoiceId: string,
  businessId: string,
): Promise<HandlerOutcome> {
  const fila = await cargarComprobante(businessId, invoiceId);
  if (!fila) {
    return { ok: false, error: { missingConfig: true } };
  }
  if (!fila.xml_generated_path) {
    // No hay XML que validar. Es un problema de datos, no de red: no se
    // reintenta hasta que alguien lo genere.
    return { ok: false, error: { httpStatus: 422 } };
  }

  let xml: string;
  try {
    xml = await loadXml(fila.xml_generated_path);
  } catch {
    return { ok: false, error: { httpStatus: 422 } };
  }

  const xsd = await loadSchemaForEcfType(fila.tipo_ecf);
  const r = await validateEcfXml({ xml, xsd });

  // Un XML SIN FIRMAR siempre falla el esquema, porque la firma es obligatoria.
  // Aquí solo se comprueba que no falle por nada más; la firma la pone el paso
  // siguiente y después se vuelve a validar el resultado.
  const FALTA_LA_FIRMA = /Signature|Missing child element.*Expected is one of \( \{\*\}\*/i;
  const problemas = r.errors.filter((e) => !FALTA_LA_FIRMA.test(e.message));

  if (problemas.length > 0) {
    return { ok: false, error: { httpStatus: 400 } };
  }

  return { ok: true, to: "validated" };
}

/**
 * Firmar el XML con el certificado del negocio.
 *
 * Después de firmar se **verifica la firma en local** antes de dar el paso por
 * bueno: firmar y no comprobarlo es enviar a la DGII algo que igual no valida,
 * y descubrirlo allí cuesta un e-NCF.
 *
 * El material del certificado se descifra en memoria y no sale de aquí. No se
 * registra, no se devuelve y no llega al navegador.
 */
export async function firmarHandler(
  invoiceId: string,
  businessId: string,
): Promise<HandlerOutcome> {
  const fila = await cargarComprobante(businessId, invoiceId);
  if (!fila) return { ok: false, error: { missingConfig: true } };
  if (!fila.xml_generated_path) return { ok: false, error: { httpStatus: 422 } };

  let material: { p12Bytes: Uint8Array; password: string } | null;
  try {
    material = await resolveSigningMaterial({ businessId });
  } catch {
    // Falta la clave de cifrado o la función no está habilitada: es
    // configuración, no un fallo que se arregle reintentando.
    return { ok: false, error: { certificateProblem: true } };
  }
  if (!material) return { ok: false, error: { certificateProblem: true } };

  let certificatePem: string;
  let privateKeyPem: string;
  try {
    const p12 = forge.pkcs12.pkcs12FromAsn1(
      forge.asn1.fromDer(
        forge.util.createBuffer(Buffer.from(material.p12Bytes).toString("binary")),
      ),
      material.password,
    );
    const OID_CERT = forge.pki.oids.certBag!;
    const OID_KEY = forge.pki.oids.pkcs8ShroudedKeyBag!;
    const certBags = p12.getBags({ bagType: OID_CERT })[OID_CERT];
    const keyBags = p12.getBags({ bagType: OID_KEY })[OID_KEY];

    const cert = certBags?.[0]?.cert;
    const key = keyBags?.[0]?.key;
    if (!cert || !key) return { ok: false, error: { certificateProblem: true } };

    certificatePem = forge.pki.certificateToPem(cert);
    privateKeyPem = forge.pki.privateKeyToPem(key);
  } catch {
    // Contraseña equivocada o P12 ilegible.
    return { ok: false, error: { certificateProblem: true } };
  }

  let firmado: string;
  try {
    const xml = await loadXml(fila.xml_generated_path);
    firmado = signEcfXml({ xml, certificatePem, privateKeyPem }).xml;
  } catch {
    return { ok: false, error: { certificateProblem: true } };
  }

  // Comprobar la propia firma antes de darla por buena. Firmar y no
  // comprobarlo es enviar a la DGII algo que igual no valida, y descubrirlo
  // allí cuesta un e-NCF.
  try {
    if (!verifyEcfSignature(firmado, certificatePem)) {
      return { ok: false, error: { certificateProblem: true } };
    }
  } catch {
    return { ok: false, error: { certificateProblem: true } };
  }

  // Y que el resultado FIRMADO valide contra el esquema. Ahora sí, entero: si
  // falla aquí, no se envía nada.
  const xsd = await loadSchemaForEcfType(fila.tipo_ecf);
  const r = await validateEcfXml({ xml: firmado, xsd });
  if (!r.valid) return { ok: false, error: { httpStatus: 400 } };

  let guardado;
  try {
    guardado = await saveXml(businessId, fila.ambiente, fila.e_ncf, "signed", firmado);
  } catch {
    // El XML está firmado pero no se pudo guardar. Es transitorio: se
    // reintenta, y volver a firmar el mismo contenido no rompe nada.
    return { ok: false, error: { networkCode: "ECONNRESET" } };
  }

  return {
    ok: true,
    to: "signed",
    patch: {
      xml_signed_path: guardado.path,
      hash_sha256: guardado.hash,
    },
  };
}

/**
 * Los manejadores locales, listos para el trabajador.
 *
 * `enviar` y `consultar` **se dejan fuera a propósito**. Cuando el trabajador
 * no encuentra manejador para una acción, la cuenta como pendiente y sigue —
 * nunca finge que la hizo.
 */
export const LOCAL_HANDLERS: QueueHandlers = {
  validar: validarHandler,
  firmar: firmarHandler,
};
