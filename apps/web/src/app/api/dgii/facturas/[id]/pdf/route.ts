import { NextResponse, type NextRequest } from "next/server";
import { mockElectronicInvoices } from "@/lib/mock-data/integrations";
import { renderEcfFromMock, DgiiDemoRendererError } from "@/server/services/dgii/demo-renderer";

/**
 * GET /api/dgii/facturas/[id]/pdf
 *
 * DEMOSTRACIÓN — devuelve el PDF generado en runtime para una factura mock.
 * Firmado con cert dummy. NO es un comprobante fiscal válido.
 *
 * Cuando llegue Fase C (DB persistida + DgiiCertificateService real), este
 * endpoint debe migrar a:
 *  - cargar la factura desde Supabase
 *  - firmar con el cert DGII real (cargado del Vault)
 *  - retornar el PDF persistido si ya existe, o regenerar
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
    const { pdfBuffer } = await renderEcfFromMock(invoice);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="ecf-${invoice.ecfNumber}.pdf"`,
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
          : "Error inesperado generando PDF",
      },
      { status: isUserError ? 400 : 500 },
    );
  }
}
