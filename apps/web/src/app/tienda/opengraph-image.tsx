import { ImageResponse } from "next/og";
import { dermalandLogoDataUri } from "@/features/brand/logo";
import { storefrontShareDescription } from "@/features/storefront/share-copy";
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
//
// Sale del módulo de marca, no de un path copiado aquí. Estaba copiado, y con
// el teal de la interfaz en vez del verde salvia de la marca: el enlace de la
// tienda se compartía con un logo que no era el suyo.
const LOGO_DATA_URI = dermalandLogoDataUri();

export default async function OgImage() {
  const tenant = await resolveStorefrontTenant();
  const nombre = tenant?.siteName ?? "DermaLand";
  // Mismo texto que la etiqueta `og:description`: la tarjeta y la vista previa
  // que la acompaña tienen que decir lo mismo.
  const frase = storefrontShareDescription({
    seoDescription: tenant?.seoDescription,
    tagline: tenant?.tagline,
    city: tenant?.branches?.[0]?.city,
  });
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
            <div style={{ fontSize: 28, color: PRIMARY, maxWidth: 780 }}>
              {frase}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 46, fontWeight: 700, color: FG }}>
            Tienda en línea
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
