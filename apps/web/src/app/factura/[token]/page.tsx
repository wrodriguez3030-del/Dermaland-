import type { Metadata } from "next";
import { headers } from "next/headers";
import { verifyDocumentShareToken } from "@/server/services/sales/share-token";
import { readSharedProforma } from "@/server/services/sales/shared-document";
import { getDocumentDisplayInfo } from "@/features/sales/document-label";
import { PublicInvoiceView } from "@/features/sales/components/public-invoice-view";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import { formatCurrency } from "@/lib/utils/format";

/**
 * Página PÚBLICA del comprobante — la que abre el cliente desde el enlace de
 * WhatsApp/correo SIN iniciar sesión. La autorización es el token firmado
 * (`/factura/[token]`), no la sesión: por eso `/factura` está en el bypass del
 * middleware. Vive FUERA del grupo `(app)` para no heredar su layout privado.
 *
 * Meta Open Graph: cuando el enlace se pega en WhatsApp, la app muestra una
 * tarjeta con el logo de DermaLand + número/total del comprobante (ver
 * `opengraph-image.tsx` en esta misma carpeta). Se marca `noindex` porque son
 * enlaces privados por cliente.
 */
export const dynamic = "force-dynamic";

/** Base absoluta del sitio para resolver el og:image contra el host real. */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "https://dermaland.vercel.app")
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const claims = verifyDocumentShareToken(token);
  const proforma = claims ? await readSharedProforma(claims.businessId, claims.id) : null;

  const base = await siteOrigin();
  const brand = mockBusiness.commercialName;

  if (!proforma) {
    return {
      metadataBase: new URL(base),
      title: { absolute: `Comprobante — ${brand}` },
      robots: { index: false, follow: false },
    };
  }

  const doc = getDocumentDisplayInfo(proforma);
  const title = `${doc.title} ${doc.number} — ${brand}`;
  const description = `${brand} · ${proforma.customerName} · Total ${formatCurrency(
    proforma.total,
  )}. Toca para ver el comprobante y descargar el PDF.`;

  return {
    metadataBase: new URL(base),
    title: { absolute: title },
    description,
    robots: { index: false, follow: false },
    openGraph: {
      type: "website",
      title,
      description,
      siteName: brand,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function FacturaPublicaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const claims = verifyDocumentShareToken(token);
  const proforma = claims ? await readSharedProforma(claims.businessId, claims.id) : null;

  if (!proforma) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center p-6 text-center">
        {mockBusiness.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mockBusiness.logoUrl}
            alt={mockBusiness.commercialName}
            className="mb-4 h-16 w-16 object-contain"
          />
        )}
        <h1 className="text-lg font-semibold">Enlace no disponible</h1>
        <p className="mt-2 text-sm opacity-70">
          Este enlace no es válido o el comprobante ya no está disponible.
          Solicita a {mockBusiness.commercialName} un enlace nuevo.
        </p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-[color:var(--brand-bg,#f6f7f4)] py-6">
      <PublicInvoiceView proforma={proforma} token={token} />
    </div>
  );
}
