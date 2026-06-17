import { NextResponse, type NextRequest } from "next/server";
import type { Proforma } from "@/types";
import {
  mapProformaToEcfInput,
  buildEcfXml,
  signEcfXml,
  generateEcfPdf,
  DgiiPdfError,
} from "@/server/services/dgii/service";
import { getDgiiDemoKeyPair } from "@/server/services/dgii/demo-cert";

/**
 * POST /api/dgii/preview/pdf
 *
 * DEMOSTRACIÓN — recibe una proforma en el body y devuelve el PDF generado
 * en runtime con cert dummy. NO es un comprobante fiscal válido. NO se
 * envía a DGII.
 *
 * Body: `{ proforma: Proforma }`
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let proforma: Proforma;
  try {
    const body = (await req.json()) as { proforma?: Proforma };
    if (!body?.proforma) {
      return NextResponse.json(
        { error: "Body inválido: falta 'proforma'" },
        { status: 400 },
      );
    }
    proforma = body.proforma;
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  try {
    const ecfInput = mapProformaToEcfInput(proforma);
    const unsignedXml = buildEcfXml(ecfInput);
    const { certificatePem, privateKeyPem } = getDgiiDemoKeyPair();
    const { xml: signedXml } = signEcfXml({
      xml: unsignedXml,
      certificatePem,
      privateKeyPem,
    });
    const pdfBuffer = await generateEcfPdf({
      ecf: ecfInput,
      signedXml,
      ambiente: "testecf",
      estadoDgii: "signed",
      demo: true,
    });
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="preview-${ecfInput.eNcf}.pdf"`,
        "Cache-Control": "no-store",
        "X-Dgii-Demo": "1",
      },
    });
  } catch (err) {
    if (err instanceof DgiiPdfError || err instanceof Error) {
      return NextResponse.json(
        { error: err.message },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
