import { NextResponse, type NextRequest } from "next/server";
import type { Proforma } from "@/types";
import {
  mapProformaToEcfInput,
  buildEcfXml,
} from "@/server/services/dgii/service";

/**
 * POST /api/dgii/preview/xml-unsigned
 * DEMOSTRACIÓN — XML sin firmar (output del builder).
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
    const xml = buildEcfXml(ecfInput);
    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="preview-${ecfInput.eNcf}-unsigned.xml"`,
        "Cache-Control": "no-store",
        "X-Dgii-Demo": "1",
      },
    });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
