import { ImageResponse } from "next/og";
import {
  DERMALAND_LOGO_COLOR,
  dermalandLogoDataUri,
} from "@/features/brand/logo";

/**
 * Logo de DermaLand como PNG hospedado, para usar en correos (los clientes de
 * correo no renderizan SVG ni data-URIs). Público — el crawler/proxy de imágenes
 * del correo lo carga sin sesión (cubierto por el bypass de `/api/brand` en el
 * middleware). Cacheable.
 */
export const dynamic = "force-static";

const BRAND = DERMALAND_LOGO_COLOR;
// El trazo sale del módulo de marca, no de una copia local: seis copias a mano
// ya habían divergido en el color sin que nadie se enterara.
const LOGO_DATA_URI = dermalandLogoDataUri();

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
