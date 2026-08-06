import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { authorizeDgii } from "@/server/auth/require-role";
import type { Proforma } from "@/types";
import {
  mapProformaToEcfInput,
  buildEcfXml,
  signEcfXml,
} from "@/server/services/dgii/service";
import { getDgiiDemoKeyPair } from "@/server/services/dgii/demo-cert";

/**
 * POST /api/dgii/preview/xml-signed
 * DEMOSTRACIÓN — XML firmado en runtime con cert dummy.
 * Body: `{ proforma: Proforma }`
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  // La RLS valida el `business_id`, no el rol (DL-01): sin esto,
  // cualquier usuario con sesión del negocio entraba aquí.
  const auth = await authorizeDgii("dgii.download_xml");
  if (!auth.ok) return auth.res;

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
    return new NextResponse(signedXml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="preview-${ecfInput.eNcf}-signed.xml"`,
        "Cache-Control": "no-store",
        "X-Dgii-Demo": "1",
      },
    });
  } catch (err) {
    if (err instanceof Error) {
      return NextResponse.json({ error: toUserFacingMessage(err, "No se pudo completar la operación. Intenta nuevamente.") }, { status: 400 });
    }
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 });
  }
}
