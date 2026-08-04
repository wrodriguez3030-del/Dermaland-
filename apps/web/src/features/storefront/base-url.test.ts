import { describe, expect, it } from "vitest";
import { resolveBaseUrl } from "./base-url";

describe("resolveBaseUrl", () => {
  it("NUNCA devuelve localhost si la plataforma conoce el dominio", () => {
    // El caso real: `NEXT_PUBLIC_APP_URL` no está definida en Vercel, así que
    // el esquema aplicaba su valor por defecto y robots.txt salió a producción
    // apuntando el sitemap a `http://localhost:3031`.
    expect(
      resolveBaseUrl({
        appUrl: "http://localhost:3031",
        vercelProductionUrl: "dermaland.vercel.app",
      }),
    ).toBe("https://dermaland.vercel.app");
  });

  it("una base configurada de verdad manda sobre el dominio de Vercel", () => {
    // Es la única forma de servir la tienda desde un dominio propio.
    expect(
      resolveBaseUrl({
        appUrl: "https://dermaland.com.do",
        vercelProductionUrl: "dermaland.vercel.app",
      }),
    ).toBe("https://dermaland.com.do");
  });

  it("en un Preview apunta al dominio de PRODUCCIÓN, no al del despliegue", () => {
    // Una canónica hacia una URL efímera que mañana da 404 es peor que ninguna.
    expect(
      resolveBaseUrl({
        appUrl: "http://localhost:3031",
        vercelProductionUrl: "dermaland.vercel.app",
        vercelUrl: "dermaland-git-rama-x.vercel.app",
      }),
    ).toBe("https://dermaland.vercel.app");
  });

  it("cae al dominio del despliegue si no hay dominio de producción", () => {
    expect(resolveBaseUrl({ vercelUrl: "dermaland-abc123.vercel.app" })).toBe(
      "https://dermaland-abc123.vercel.app",
    );
  });

  it("en local sigue siendo localhost", () => {
    expect(resolveBaseUrl({ appUrl: "http://localhost:3031" })).toBe(
      "http://localhost:3031",
    );
    expect(resolveBaseUrl({})).toBe("http://localhost:3031");
  });

  it("quita la barra final para no generar URLs con doble barra", () => {
    expect(resolveBaseUrl({ appUrl: "https://dermaland.com.do/" })).toBe(
      "https://dermaland.com.do",
    );
    expect(resolveBaseUrl({ vercelProductionUrl: "dermaland.vercel.app/" })).toBe(
      "https://dermaland.vercel.app",
    );
  });
});
