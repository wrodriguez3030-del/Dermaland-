import { describe, it, expect } from "vitest";
import { slugify, productSlug, SLUG_MAX_LENGTH } from "./slug";

describe("slugify", () => {
  it("quita acentos y pasa a minúsculas", () => {
    expect(slugify("AVÈNE Cleanance")).toBe("avene-cleanance");
    expect(slugify("Bebé Piel Atópica")).toBe("bebe-piel-atopica");
    expect(slugify("LA ROCHE-POSAY Effaclar")).toBe("la-roche-posay-effaclar");
  });

  it("colapsa símbolos, espacios y guiones sobrantes", () => {
    expect(slugify("  Heliocare 360º  Gel   Oil-Free ")).toBe(
      "heliocare-360-gel-oil-free",
    );
    expect(slugify("Crema 50% + Vitamina C (30 ml)")).toBe(
      "crema-50-vitamina-c-30-ml",
    );
    expect(slugify("---Sesderma---")).toBe("sesderma");
  });

  it("respeta la ñ como n y no deja caracteres fuera del alfabeto del slug", () => {
    expect(slugify("Niños y Mañana")).toBe("ninos-y-manana");
    expect(slugify("Protección Solar")).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("trunca por límite de palabra, no a mitad", () => {
    const largo =
      "Protector Solar Facial Con Color Para Piel Sensible Y Tendencia Acneica Alta Proteccion";
    const s = slugify(largo);
    expect(s.length).toBeLessThanOrEqual(SLUG_MAX_LENGTH);
    // No termina en guion ni corta una palabra por la mitad.
    expect(s.endsWith("-")).toBe(false);
    expect(largo.toLowerCase().split(/\s+/)).toContain(s.split("-").at(-1));
  });

  it("devuelve cadena vacía si no queda nada utilizable", () => {
    expect(slugify("")).toBe("");
    expect(slugify("   ")).toBe("");
    expect(slugify("%%%")).toBe("");
  });
});

describe("productSlug", () => {
  const ID = "a23fcf64-a9b7-43d7-92d2-a1d9e652ea03";
  const OTRO = "b71c0e2d-1111-2222-3333-444455556666";

  it("usa el nombre cuando no hay colisión", () => {
    expect(productSlug("Cleanance Comedomed", ID, new Set())).toBe(
      "cleanance-comedomed",
    );
  });

  it("ante colisión añade un sufijo DETERMINISTA derivado del id", () => {
    const usados = new Set(["cleanance-comedomed"]);
    const a = productSlug("Cleanance Comedomed", ID, usados);
    const b = productSlug("Cleanance Comedomed", ID, usados);
    expect(a).toBe(b); // mismo input → mismo output, siempre
    expect(a).toBe("cleanance-comedomed-a23fcf");
    expect(a).not.toBe("cleanance-comedomed-2"); // nunca un contador
  });

  it("dos productos distintos con el mismo nombre no chocan", () => {
    const usados = new Set(["crema-hidratante"]);
    const a = productSlug("Crema Hidratante", ID, usados);
    const b = productSlug("Crema Hidratante", OTRO, usados);
    expect(a).not.toBe(b);
  });

  it("cae al id cuando el nombre no produce nada utilizable", () => {
    expect(productSlug("%%%", ID, new Set())).toBe("producto-a23fcf");
  });

  it("el resultado siempre cumple el formato exigido por la base", () => {
    for (const nombre of ["AVÈNE", "50% + C", "   ", "Ñ"]) {
      const s = productSlug(nombre, ID, new Set(["avene"]));
      expect(s).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(s.length).toBeGreaterThanOrEqual(3);
      expect(s.length).toBeLessThanOrEqual(80);
    }
  });

  it("es estable: renombrar el producto no cambia un slug ya emitido", () => {
    // El slug se calcula UNA vez al publicar y se guarda. Esta prueba fija la
    // regla: quien ya tiene slug no vuelve a pasar por aquí.
    const emitido = productSlug("Nombre Viejo", ID, new Set());
    const recalculado = productSlug("Nombre Nuevo Distinto", ID, new Set());
    expect(emitido).not.toBe(recalculado);
    // Por eso `productSlug` NO se llama en el update de producto: ver
    // docs/tienda-en-linea.md § slug.
  });
});
