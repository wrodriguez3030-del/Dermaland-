import { ImageResponse } from "next/og";
import { verifyDocumentShareToken } from "@/server/services/sales/share-token";
import { readSharedProforma } from "@/server/services/sales/shared-document";
import { getDocumentDisplayInfo } from "@/features/sales/document-label";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import { formatCurrency } from "@/lib/utils/format";
import {
  DERMALAND_LOGO_COLOR,
  dermalandLogoDataUri,
} from "@/features/brand/logo";

/**
 * Imagen Open Graph del comprobante público (`/factura/[token]`).
 *
 * Es la tarjeta que WhatsApp/redes muestran al pegar el enlace: fondo de marca,
 * **logo de DermaLand**, y el número + total del comprobante. Next la sirve como
 * el `og:image` de la página automáticamente. Debe ser pública (el crawler no
 * tiene sesión) — cubierto por el bypass de `/factura` en el middleware.
 */
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND = DERMALAND_LOGO_COLOR;

// Logo DermaLand (hoja/gota con "D" calada) embebido como data URI para que el
// rasterizador de OG lo dibuje sin depender de un asset externo.
// El trazo sale del módulo de marca, no de una copia local: seis copias a mano
// ya habían divergido en el color sin que nadie se enterara.
const LOGO_DATA_URI = dermalandLogoDataUri();

export default async function OgImage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const claims = verifyDocumentShareToken(token);
  const proforma = claims ? await readSharedProforma(claims.businessId, claims.id) : null;
  const doc = proforma ? getDocumentDisplayInfo(proforma) : null;

  const line1 = doc ? `${doc.title} ${doc.number}` : mockBusiness.commercialName;
  const line2 = proforma
    ? `Total ${formatCurrency(proforma.total)}`
    : mockBusiness.slogan;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f6f7f4",
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_DATA_URI} width={140} height={140} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 68, fontWeight: 800, color: "#2b2f26" }}>
              {mockBusiness.commercialName}
            </div>
            <div style={{ fontSize: 30, color: BRAND }}>
              {mockBusiness.slogan}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 52, fontWeight: 700, color: "#2b2f26" }}>
            {line1}
          </div>
          <div style={{ fontSize: 40, color: "#4b5140" }}>{line2}</div>
        </div>

        <div
          style={{
            display: "flex",
            height: 16,
            borderRadius: 8,
            background: BRAND,
          }}
        />
      </div>
    ),
    { ...size },
  );
}
