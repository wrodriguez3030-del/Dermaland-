import { ImageResponse } from "next/og";
import { findWebOrderByToken } from "@/server/services/storefront/orders";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";
import { formatCurrency } from "@/lib/utils/format";
import {
  DERMALAND_LOGO_COLOR,
  dermalandLogoDataUri,
} from "@/features/brand/logo";

/**
 * Imagen Open Graph del pedido público (`/tienda/pedido/[token]`).
 *
 * Es la tarjeta que WhatsApp muestra al pegar el enlace del pedido — la que ve
 * el cliente cuando el negocio le manda "ya puedes pagar". Fondo de marca,
 * logo, y el número + total del pedido. Mismo patrón que
 * `/factura/[token]/opengraph-image.tsx`, con el nombre del negocio salido de
 * la configuración de la tienda, no de una constante.
 *
 * Debe ser pública: el rastreador de WhatsApp no tiene sesión. Con un token
 * inválido sale la tarjeta genérica del negocio — nunca un error.
 */
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const BRAND = DERMALAND_LOGO_COLOR;

// El trazo sale del módulo de marca, no de una copia local: seis copias a mano
// ya habían divergido en el color sin que nadie se enterara.
const LOGO_DATA_URI = dermalandLogoDataUri();

export default async function OgImage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [tenant, pedido] = await Promise.all([
    resolveStorefrontTenant(),
    findWebOrderByToken(token),
  ]);

  const siteName = tenant?.siteName ?? "DermaLand";
  const line1 = pedido ? `Pedido ${pedido.number}` : siteName;
  const line2 = pedido
    ? `Total ${formatCurrency(pedido.total)}`
    : (tenant?.tagline ?? "Tienda en línea");

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
              {siteName}
            </div>
            <div style={{ fontSize: 30, color: BRAND }}>
              Tienda en línea
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
