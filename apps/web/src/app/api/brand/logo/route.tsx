import { ImageResponse } from "next/og";

/**
 * Logo de DermaLand como PNG hospedado, para usar en correos (los clientes de
 * correo no renderizan SVG ni data-URIs). Público — el crawler/proxy de imágenes
 * del correo lo carga sin sesión (cubierto por el bypass de `/api/brand` en el
 * middleware). Cacheable.
 */
export const dynamic = "force-static";

const BRAND = "#7E8A6E";
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path fill="${BRAND}" fill-rule="evenodd" d="M256 60 C256 60 120 220 120 330 A136 136 0 1 0 392 330 C392 220 256 60 256 60 Z M190 210 H270 C330 210 360 255 360 305 C360 355 330 400 270 400 H190 Z M218 240 H268 C305 240 325 270 325 305 C325 340 305 370 268 370 H218 Z"/></svg>`;
const LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "#ffffff",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={LOGO_DATA_URI} width={180} height={180} alt="" />
      </div>
    ),
    { width: 200, height: 200 },
  );
}
