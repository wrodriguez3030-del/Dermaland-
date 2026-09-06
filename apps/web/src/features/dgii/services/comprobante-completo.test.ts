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
import { prepararComprobante } from "./prepare";

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

describe("IndicadorMontoGravado llega al XML firmado (hallazgo Crítico C1, revisión final)", () => {
  // El XSD declara `IndicadorMontoGravado` `minOccurs="0"`
  // (`core/xsd/e-CF-32-v1.0.xsd:16`): un XML que lo omite pasa la
  // validación XSD igual, y así estuvo pasando `prepare.ts` hasta esta
  // corrección. La DGII sí lo exige para 31/32/33/34/41/45 y rechazó un
  // e-CF real por su ausencia (`core/indicador-monto-gravado.ts`, con el
  // mensaje literal del rechazo). Por eso esta prueba NO puede conformarse
  // con llamar a `buildEcfXml` directamente (eso ya lo hace la prueba de
  // arriba, y no se rompería si alguien quitara el campo solo de
  // `prepare.ts`): ejercita `prepararComprobante` de verdad -con dobles,
  // nada de base, bucket ni red- para que el hueco real -la llamada dentro
  // de `prepare.ts`- quede cubierto.
  it("el XML que prepararComprobante firma y sube lleva IndicadorMontoGravado", async () => {
    const cert = getDummyCert();
    let xmlSubido = "";

    const opciones = {
      habilitacion: { bloqueos: [], configurado: true, certificadoActivo: true, secuenciasActivas: 1 },
      // Mismos valores que `prepare.test.ts` (`dobles().configuracion`):
      // el emisor real que build/sign necesitan para no fallar antes de
      // llegar a "subir". Provincia/Municipio con el catálogo jerárquico
      // de 6 dígitos que exige el XSD oficial (Santiago = 25xxxx).
      configuracion: {
        businessId: "b1",
        rncEmisor: "131561985",
        razonSocialEmisor: "DermaLand SRL",
        direccionEmisor: "Calle Principal 123, Santiago",
        provinciaCodigo: "250000",
        municipioCodigo: "250101",
        correoEmisor: "fiscal@dermaland.test",
        telefonoEmisor: "809-555-1234",
        ambiente: "testecf",
        dgiiEnabledRealSend: false,
      },
      certificado: { certificatePem: cert.certificatePem, privateKeyPem: cert.privateKeyPem },
      secuencias: {
        peekNextEncf: async () => "E320000000009",
        prepararFactura: async () => ({ ok: true, invoice_id: "f-1", e_ncf: "E320000000009" }),
        finalizarFactura: async () => ({ ok: true, invoice_id: "f-1" }),
        marcarFallo: async () => ({ ok: true, invoice_id: "f-1" }),
      },
      almacenamiento: {
        // Captura el XML real que `prepare.ts` firma y manda a "subir" -es
        // el único punto de este doble por el que pasa el XML completo.
        guardarXmlFirmado: async (entrada: { invoiceId: string; xml: string }) => {
          xmlSubido = entrada.xml;
          return "dgii/b1/invoices/f-1/signed.xml";
        },
        borrarXml: async () => {},
      },
    };

    const resultado = await prepararComprobante(
      { businessId: "b1", userId: "u1" },
      {
        tipoEcf: "32",
        customer: { nombre: "Cliente de prueba", rncOCedula: "131245678" },
        items: [{ nombre: "Producto", cantidad: 1, precioUnitario: 100, itbisRate: 0.18 }],
      },
      opciones as never,
    );

    expect(resultado.ok).toBe(true);
    expect(xmlSubido).toContain("<IndicadorMontoGravado>0</IndicadorMontoGravado>");

    // No solo el substring: el comprobante con el nodo puesto sigue
    // pasando el XSD oficial (mismo espíritu que el resto de este archivo).
    const res = await validateEcfXml({ xml: xmlSubido, xsd: await loadXsdForTipo("32"), schemaName: "e-CF-32" });
    expect(res.ok, JSON.stringify(res.errors)).toBe(true);
  });
});
