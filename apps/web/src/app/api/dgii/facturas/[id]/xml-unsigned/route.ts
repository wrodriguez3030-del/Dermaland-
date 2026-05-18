import { NextResponse, type NextRequest } from "next/server";
import { mockElectronicInvoices } from "@/lib/mock-data/integrations";
import { renderEcfFromMock, DgiiDemoRendererError } from "@/server/services/dgii/demo-renderer";

/**
 * GET /api/dgii/facturas/[id]/xml-unsigned
 *
 * DEMOSTRACIÓN — XML sin firmar (output del builder).
 */
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await ctx.params;
  const invoice = mockElectronicInvoices.find((i) => i.id === id);
  if (!invoice) {
    return NextResponse.json(
      { error: `Factura mock '${id}' no encontrada` },
      { status: 404 },
    );
  }

  try {
    const { unsignedXml } = await renderEcfFromMock(invoice);
    return new NextResponse(unsignedXml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="ecf-${invoice.ecfNumber}-unsigned.xml"`,
        "Cache-Control": "no-store",
        "X-Dgii-Demo": "1",
      },
    });
  } catch (err) {
    const isUserError = err instanceof DgiiDemoRendererError;
    return NextResponse.json(
      {
        error: isUserError
          ? (err as Error).message
          : "Error inesperado generando XML",
      },
      { status: isUserError ? 400 : 500 },
    );
  }
}
