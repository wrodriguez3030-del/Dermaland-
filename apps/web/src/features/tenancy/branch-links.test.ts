import { describe, expect, it } from "vitest";
import {
  instagramHandle,
  normalizeInstagram,
  normalizeMapsUrl,
  normalizePublicUrl,
} from "./branch-links";

/** Atajo: la URL cuando salió bien, o el error si falló (para que el fallo se lea). */
function url(r: ReturnType<typeof normalizeMapsUrl>): string | undefined {
  if (!r.ok) throw new Error(`esperaba ok, dio: ${r.error}`);
  return r.url;
}

describe("normalizeMapsUrl", () => {
  it("acepta el enlace corto que genera «Compartir» en el móvil", () => {
    expect(url(normalizeMapsUrl("https://maps.app.goo.gl/aBcDeF123"))).toBe(
      "https://maps.app.goo.gl/aBcDeF123",
    );
  });

  it("acepta la URL larga de la barra del navegador", () => {
    const larga =
      "https://www.google.com/maps/place/DermaLand/@19.4517,-70.6970,17z/data=!3m1!4b1";
    expect(url(normalizeMapsUrl(larga))).toBe(larga);
  });

  it("acepta el dominio dominicano", () => {
    expect(url(normalizeMapsUrl("https://www.google.com.do/maps/place/X"))).toBe(
      "https://www.google.com.do/maps/place/X",
    );
  });

  it("rescata el enlace cuando pegan el texto completo de Android", () => {
    // Esto es literalmente lo que manda el botón compartir: nombre y enlace.
    expect(
      url(normalizeMapsUrl("DermaLand Principal https://maps.app.goo.gl/xyz789")),
    ).toBe("https://maps.app.goo.gl/xyz789");
  });

  it("le pone https a lo que se pegó sin protocolo", () => {
    expect(url(normalizeMapsUrl("maps.app.goo.gl/abc"))).toBe(
      "https://maps.app.goo.gl/abc",
    );
  });

  it("sube http a https: el enlace se publica", () => {
    expect(url(normalizeMapsUrl("http://maps.app.goo.gl/abc"))).toBe(
      "https://maps.app.goo.gl/abc",
    );
  });

  it("vacío es válido y significa «sin enlace»", () => {
    expect(url(normalizeMapsUrl(""))).toBeUndefined();
    expect(url(normalizeMapsUrl("   "))).toBeUndefined();
    expect(url(normalizeMapsUrl(null))).toBeUndefined();
  });

  it("rechaza un dominio que sólo TERMINA en google.com", () => {
    // El fallo clásico de validar con endsWith. Este dominio es de otro.
    const r = normalizeMapsUrl("https://evilgoogle.com/maps/place/X");
    expect(r.ok).toBe(false);
  });

  it("rechaza javascript: — esto acaba en un href público", () => {
    // eslint-disable-next-line no-script-url
    const r = normalizeMapsUrl("javascript:alert(document.cookie)");
    expect(r.ok).toBe(false);
  });

  it("rechaza data:", () => {
    const r = normalizeMapsUrl("data:text/html;base64,PHNjcmlwdD4=");
    expect(r.ok).toBe(false);
  });

  it("rechaza otro sitio y dice cuál recibió", () => {
    const r = normalizeMapsUrl("https://waze.com/ul?ll=19.45,-70.69");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("waze.com");
  });
});

describe("normalizePublicUrl", () => {
  it("acepta un Linktree", () => {
    expect(url(normalizePublicUrl("https://linktr.ee/dermaland"))).toBe(
      "https://linktr.ee/dermaland",
    );
  });

  it("acepta cualquier servicio: no es solo Linktree", () => {
    // El dueño puede usar Beacons, Carrd o su propia web. No hay lista blanca.
    expect(url(normalizePublicUrl("beacons.ai/dermaland"))).toBe(
      "https://beacons.ai/dermaland",
    );
  });

  it("vacío es válido", () => {
    expect(url(normalizePublicUrl(""))).toBeUndefined();
  });

  it("rechaza javascript: — acaba en un href público", () => {
    // eslint-disable-next-line no-script-url
    expect(normalizePublicUrl("javascript:alert(1)").ok).toBe(false);
  });

  it("rechaza un nombre sin dominio", () => {
    expect(normalizePublicUrl("https://algo").ok).toBe(false);
  });
});

describe("normalizeInstagram", () => {
  it("acepta el usuario con arroba", () => {
    expect(url(normalizeInstagram("@dermaland"))).toBe(
      "https://www.instagram.com/dermaland",
    );
  });

  it("acepta el usuario pelado", () => {
    expect(url(normalizeInstagram("dermaland"))).toBe(
      "https://www.instagram.com/dermaland",
    );
  });

  it("acepta la URL del perfil y descarta el rastreo de la app", () => {
    expect(
      url(normalizeInstagram("https://www.instagram.com/dermaland?igsh=MXY123")),
    ).toBe("https://www.instagram.com/dermaland");
  });

  it("acepta instagram.com sin protocolo", () => {
    expect(url(normalizeInstagram("instagram.com/dermaland/"))).toBe(
      "https://www.instagram.com/dermaland",
    );
  });

  it("acepta punto y guion bajo en el usuario", () => {
    expect(url(normalizeInstagram("@derma_land.rd"))).toBe(
      "https://www.instagram.com/derma_land.rd",
    );
  });

  it("vacío es válido", () => {
    expect(url(normalizeInstagram(""))).toBeUndefined();
  });

  it("rechaza el enlace de una publicación y explica qué copiar", () => {
    const r = normalizeInstagram("https://www.instagram.com/p/CxYz123/");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("perfil");
  });

  it("rechaza un dominio parecido", () => {
    const r = normalizeInstagram("https://instagram.com.phishing.io/dermaland");
    expect(r.ok).toBe(false);
  });

  it("rechaza un usuario con caracteres imposibles", () => {
    expect(normalizeInstagram("derma land").ok).toBe(false);
    expect(normalizeInstagram("@derma/land").ok).toBe(false);
  });
});

describe("instagramHandle", () => {
  it("saca el @usuario de la URL guardada", () => {
    expect(instagramHandle("https://www.instagram.com/dermaland")).toBe(
      "@dermaland",
    );
  });

  it("no revienta con basura", () => {
    expect(instagramHandle("no-es-una-url")).toBeUndefined();
    expect(instagramHandle(null)).toBeUndefined();
    expect(instagramHandle("https://www.instagram.com/")).toBeUndefined();
  });
});
