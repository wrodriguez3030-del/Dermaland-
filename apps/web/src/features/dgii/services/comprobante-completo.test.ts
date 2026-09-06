// apps/web/src/features/dgii/services/comprobante-completo.test.ts
//
// Prueba de extremo a extremo (Fase 3A, tarea 6): construye un e-CF de
// verdad, lo firma con un certificado autofirmado generado en memoria y lo
// valida contra el XSD OFICIAL de la DGII. Sin base de datos, sin bucket y
// sin red: es la prueba que demuestra que el núcleo portado en la fase 1
// (builder + signer + validator + xsd-loader) encaja entre sí, tal como lo
// usará `services/prepare.ts`.
//
// CORRECCIÓN DEL PLIEGO (task-6-brief.md, Tarea 6): los nombres de función
// del ejemplo existen todos (buildEcfXml/signEcfXml/validateEcfXml/
// loadXsdForTipo), pero varias FIRMAS se escribieron de memoria y no son las
// reales. Confirmado leyendo el código fuente y `core/signer.test.ts` (que
// ya ejercita build→sign→XSD oficial para 31/32/33/34):
//  - `generarCertificadoDePrueba` no existe: es `getDummyCert()`
//    (`core/__port__/dgii-test-cert.ts`) y devuelve
//    `{ certificatePem, privateKeyPem, fingerprintSha256 }`, no `{ p12, password }`.
//  - `signEcfXml` (`core/signer.ts`) recibe `{ xml, certificatePem, privateKeyPem, options? }`
//    — no `{ xml, p12, password }` — y su resultado (`SignEcfXmlResult`) NO
//    trae ningún `securityCode`.
//  - `buildEcfXml` (`core/builder.ts`) recibe `emisor: EcfEmisor` ANIDADO
//    (con `rnc`/`razonSocial`/`direccion`, esta última obligatoria por el
//    XSD), no `rncEmisor`/`razonSocialEmisor` sueltos; exige además
//    `ambiente` ("testecf"|"certecf"|"ecf", validado aunque no viaja en el
//    XML); y `fechaEmision` debe ser ISO `YYYY-MM-DD` — el propio builder la
//    convierte a `DD-MM-YYYY` con `isoToDgiiDate` (pasarle ya "06-09-2026"
//    la reinterpretaría como epoch y desplazaría el día).
//  - `itbisRate` es el porcentaje ENTERO del XSD (0, 16 o 18): 0.18 no está
//    en `ALLOWED_ITBIS_RATES` y `buildEcfXml` lo rechaza con
//    `EcfBuilderInvalidInput`.
//  - El "código de seguridad" (primeros 6 caracteres del `SignatureValue`)
//    no lo calcula el firmador: ya vive en `core/print-representation.ts`
//    como `securityCodeFromSignedXml`. OJO — no es una regla certificada:
//    es la interpretación que trajo el portado de agendapp del Informe
//    Técnico e-CF v1.0 §18, y el propio núcleo la marca "a CONFIRMAR en
//    TestECF" en el JSDoc de la función (`core/print-representation.ts:64-67`).
//    Esta prueba fija el comportamiento HOY IMPLEMENTADO, no una regla ya
//    verificada contra la DGII.
import { describe, expect, it } from "vitest";
import type { BuildEcfXmlInput } from "../core/builder-types";
import { buildEcfXml } from "../core/builder";
import { getDummyCert } from "../core/__port__/dgii-test-cert";
import { securityCodeFromSignedXml } from "../core/print-representation";
import { signEcfXml } from "../core/signer";
import { validateEcfXml } from "../core/validator";
import { loadXsdForTipo } from "../core/xsd-loader";

/**
 * Entrada válida de un e-CF tipo 32 (Factura de Consumo Electrónica). Misma
 * forma que ya prueba `core/signer.test.ts` contra el XSD oficial: emisor
 * con dirección (obligatoria en el XSD), comprador mínimo y un ítem gravado
 * al 18%.
 */
function comprobanteDePrueba(eNcf: string): BuildEcfXmlInput {
  return {
    tipoEcf: "32",
    eNcf,
    fechaEmision: "2026-09-06",
    ambiente: "testecf",
    emisor: {
      rnc: "131561985",
      razonSocial: "DERMALAND SRL",
      direccion: "Av. Winston Churchill 1245, Santo Domingo",
    },
    comprador: { rncOCedula: "131245678", razonSocial: "Cliente de Prueba SRL" },
    items: [{ nombre: "Producto", cantidad: 1, precioUnitario: 100, itbisRate: 18 }],
  };
}

describe("un comprobante completo, de principio a fin", () => {
  it("se construye, se firma y pasa el XSD oficial de la DGII", async () => {
    // Es la prueba que demuestra que las piezas de la fase 1 encajan con el
    // baile de la fase 3: mismo e-NCF dentro del XML y en la firma.
    const { certificatePem, privateKeyPem } = getDummyCert();
    const eNcf = "E320000000007";

    const construido = buildEcfXml(comprobanteDePrueba(eNcf));
    expect(construido.xml).toContain(`<eNCF>${eNcf}</eNCF>`);

    const firmado = signEcfXml({ xml: construido.xml, certificatePem, privateKeyPem });
    expect(firmado.signedXml).toContain("<Signature");

    const res = await validateEcfXml({
      xml: firmado.signedXml,
      xsd: await loadXsdForTipo("32"),
      schemaName: "e-CF-32",
    });
    // Si el XSD oficial rechaza el XML, el fallo trae la lista de errores
    // del validador -- eso sería una diferencia real entre el constructor
    // portado y el esquema oficial, no un fallo de la prueba. No se
    // ablanda con un `toBe(true)` pelado.
    expect(res.ok, JSON.stringify(res.errors)).toBe(true);
  });

  it("el código de seguridad son los seis primeros caracteres de la firma", () => {
    const { certificatePem, privateKeyPem } = getDummyCert();
    const construido = buildEcfXml(comprobanteDePrueba("E320000000008"));
    const firmado = signEcfXml({ xml: construido.xml, certificatePem, privateKeyPem });

    // Extracción independiente del SignatureValue (prefijo de namespace
    // opcional: el propio núcleo lo contempla así en
    // `print-representation.ts#extractSignatureValue`, porque xml-crypto no
    // siempre lo emite con prefijo).
    const m =
      /<(?:[A-Za-z0-9_]+:)?SignatureValue[^>]*>([^<]+)<\/(?:[A-Za-z0-9_]+:)?SignatureValue>/.exec(
        firmado.signedXml,
      );
    // `!` justificado: si no hubiera match, la aserción de arriba ya habría
    // fallado la prueba antes de llegar aquí.
    expect(
      m,
      "No se encontró <SignatureValue> dentro de firmado.signedXml -- " +
        "¿cambió cómo xml-crypto serializa la firma?",
    ).not.toBeNull();
    // `noUncheckedIndexedAccess`: el grupo 1 no es opcional en el patrón, así
    // que si `exec` matcheó, el grupo capturó algo -- `!` justificado.
    const valorFirma = m![1]!.replace(/\s+/g, "");

    expect(securityCodeFromSignedXml(firmado.signedXml)).toBe(valorFirma.slice(0, 6));
  });
});
