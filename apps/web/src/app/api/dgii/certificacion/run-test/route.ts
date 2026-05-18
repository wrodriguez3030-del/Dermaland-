import { NextResponse, type NextRequest } from "next/server";
import {
  buildEcfXml,
  buildDgiiConsultaUrl,
  computeSecurityCode,
  generateEcfPdf,
  signEcfXml,
} from "@/server/services/dgii/service";
import { getDgiiDemoKeyPair } from "@/server/services/dgii/demo-cert";
import { getCertificationFixture } from "@/server/services/dgii/certification-fixtures";

/**
 * POST /api/dgii/certificacion/run-test
 *
 * DEMOSTRACIÓN — ejecuta el pipeline completo (build → sign → security
 * code → URL QR → PDF) con un fixture de pre-certificación para un tipo
 * e-CF dado. Devuelve los artefactos como JSON (incluido el PDF en
 * base64) para que el panel `/dgii/certificacion` los muestre y permita
 * descargarlos.
 *
 * NO envía nada a DGII. Firma con el cert dummy in-memory. La validación
 * XSD oficial se ejecuta en CI tests para los 4 tipos (ver
 * `validator.test.ts`); aquí se omite por costo de carga del schema en
 * cada request.
 *
 * Body: `{ tipoEcf: '31' | '32' | '33' | '34' }`
 */

const TIPOS_SOPORTADOS = new Set(["31", "32", "33", "34"]);

export async function POST(req: NextRequest): Promise<NextResponse> {
  let tipo: string;
  try {
    const body = (await req.json()) as { tipoEcf?: string };
    tipo = String(body?.tipoEcf ?? "");
    if (!TIPOS_SOPORTADOS.has(tipo)) {
      return NextResponse.json(
        {
          error:
            "tipoEcf inválido: solo se soportan '31'|'32'|'33'|'34' en pre-certificación demo",
        },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const tipoEcf = tipo as "31" | "32" | "33" | "34";

  try {
    const ecfInput = getCertificationFixture(tipoEcf);
    const unsignedXml = buildEcfXml(ecfInput);

    const { certificatePem, privateKeyPem } = getDgiiDemoKeyPair();
    const { xml: signedXml, signedAt } = signEcfXml({
      xml: unsignedXml,
      certificatePem,
      privateKeyPem,
    });

    const securityCode = computeSecurityCode(signedXml);
    const qrUrl = buildDgiiConsultaUrl({
      ambiente: "testecf",
      rncEmisor: ecfInput.emisor.rncEmisor,
      rncComprador: ecfInput.comprador.rncComprador,
      eNcf: ecfInput.eNcf,
      fechaEmision: ecfInput.emisor.fechaEmision,
      montoTotal: ecfInput.totales.montoTotal,
      codigoSeguridad: securityCode,
    });

    const pdfBuffer = await generateEcfPdf({
      ecf: ecfInput,
      signedXml,
      ambiente: "testecf",
      estadoDgii: "signed",
    });

    return NextResponse.json(
      {
        tipoEcf,
        eNcf: ecfInput.eNcf,
        unsignedXml,
        signedXml,
        signedAt,
        securityCode,
        qrUrl,
        pdfBase64: pdfBuffer.toString("base64"),
        ambiente: "testecf",
        warning:
          "Demo / mock. Firmado con cert dummy in-memory. NO enviado a DGII.",
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-Dgii-Demo": "1",
        },
      },
    );
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Error inesperado",
      },
      { status: 500 },
    );
  }
}
