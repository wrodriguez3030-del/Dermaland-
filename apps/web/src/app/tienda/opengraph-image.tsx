import { ImageResponse } from "next/og";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";

/**
 * Imagen Open Graph de la tienda (`/tienda`).
 *
 * Es la tarjeta que se ve al pegar el enlace en WhatsApp, que es por donde se
 * va a compartir esta tienda. Sin ella, el enlace aparece como texto pelado
 * junto al favicon: la diferencia entre parecer una tienda y parecer un enlace
 * sospechoso.
 *
 * Usa la paleta que está en producción (`DERMALAND_BRAND_AUDIT.md` §2), no la
 * verde de la tarjeta del comprobante: quien abra el enlace verá esta misma
 * pantalla un segundo después.
 *
 * Se genera en caliente porque el nombre y la frase salen de la configuración
 * de la tienda, que el administrador puede cambiar.
 */
export const dynamic = "force-dynamic";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Tienda en línea de DermaLand";

const PRIMARY = "#00685f";
const FG = "#0b1c30";
const BG = "#f8f9ff";

// Logo embebido como data URI: el rasterizador de OG no puede ir a buscar un
// asset externo.
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="${PRIMARY}" fill-rule="evenodd" d="M256 60 C256 60 120 220 120 330 A136 136 0 1 0 392 330 C392 220 256 60 256 60 Z M190 210 H270 C330 210 360 255 360 305 C360 355 330 400 270 400 H190 Z M218 240 H268 C305 240 325 270 325 305 C325 340 305 370 268 370 H218 Z"/></svg>`;
const LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;

export default async function OgImage() {
  const tenant = await resolveStorefrontTenant();
  const nombre = tenant?.siteName ?? "DermaLand";
  const frase =
    tenant?.tagline ?? "Dermocosmética y cuidado de la piel";
  // Las sucursales, con su nombre comercial: es la prueba de que hay tiendas
  // físicas detrás, que es justo lo que decide una compra por WhatsApp.
  const sucursales = (tenant?.branches ?? []).map((s) => s.name).join("  ·  ");

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BG,
          padding: 80,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO_DATA_URI} width={132} height={132} alt="" />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 72, fontWeight: 800, color: FG }}>{nombre}</div>
            <div style={{ fontSize: 32, color: PRIMARY }}>{frase}</div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 46, fontWeight: 700, color: FG }}>
            Catálogo en línea
          </div>
          {sucursales ? (
            <div style={{ fontSize: 30, color: "#4b5563" }}>{sucursales}</div>
          ) : null}
        </div>

        <div style={{ display: "flex", height: 16, borderRadius: 8, background: PRIMARY }} />
      </div>
    ),
    { ...size },
  );
}
