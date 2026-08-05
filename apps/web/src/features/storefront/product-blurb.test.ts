import { describe, expect, it } from "vitest";
import { deriveProductBlurb, productBlurb } from "./product-blurb";
import type { PublicProduct } from "./types";

/** Nombres REALES del catálogo, copiados tal cual. */
const d = (title: string, categoryName?: string) =>
  deriveProductBlurb({ title, categoryName });

describe("deriveProductBlurb — qué es", () => {
  it("junta la forma y la función", () => {
    expect(d("Bioderma Sensibio GEL Moussant 100 ML").summary).toBe(
      "Espuma limpiadora calmante",
    );
    expect(d("Cerave Serum Hidratante CON Acido Hialuronico 30 ML").summary).toBe(
      "Sérum hidratante",
    );
    expect(d("Filorga Sleep & Lift Crema DE Noche 50 ML").summary).toBe(
      "Crema antiedad",
    );
    expect(d("Pilopeptan Champu Anticaida Woman 250 ML").summary).toBe(
      "Champú anticaída",
    );
  });

  it("reconoce el protector solar por SPF, que es lo que dice la caja", () => {
    expect(d("Martiderm Proteos Screen Fluid Cream SPF 50 40 ML").summary).toBe(
      "Fluido protector solar",
    );
    // "Barra" es femenino: el adjetivo concuerda.
    expect(d("Colorescience Sunforgettable Sport Stick SPF 50").summary).toBe(
      "Barra protectora solar",
    );
  });

  it("la categoría rellena lo que el nombre calla", () => {
    // "ACM Medisun 40ML" no dice "solar" por ningún lado.
    expect(d("ACM Medisun 40 ML", "Protección solar").summary).toBe(
      "Protector solar",
    );
  });

  it("el agua micelar no es 'agua' a secas, ni tartamudea", () => {
    // "Agua micelar limpiador" es decir lo mismo dos veces: cuando la forma ya
    // dice que limpia, se busca qué MÁS aporta el nombre.
    expect(d("Bioderma Sebium H2O 500 ML").summary).toBe("Agua micelar");
    // Un gel SÍ necesita que le digan para qué es: "Gel" a secas no dice nada,
    // y ahí "limpiador" no repite nada.
    expect(
      d("Vichy Purete Thermale GEL Fresh Cleansing GEL 200 ML").summary,
    ).toBe("Gel limpiador");
  });

  it("con la forma sola, dice la forma", () => {
    expect(d("Babe Desodorante Roll-on 50 ML").summary).toBe("Roll-on desodorante");
    expect(d("Akun 5 Barra").summary).toBe("Barra");
  });

  it("si el nombre no dice nada, NO se inventa nada", () => {
    // Un "producto de cuidado dermatológico" debajo de cada ficha es ruido que
    // enseña a no leer.
    expect(d("Avexa 30 MG").summary).toBe("");
    expect(d("Alucal").summary).toBe("");
    expect(d("").summary).toBe("");
  });

  it("nunca promete resultados", () => {
    // Son afirmaciones sanitarias. El fabricante no las hace en el nombre y una
    // función que adivina tampoco puede hacerlas.
    const prohibidas = /elimina|cura|borra|garantiz|desaparec|adelgaz|reduce/i;
    for (const n of [
      "LA Roche-posay Effaclar Salicylic Acid Acne Treatment",
      "Vichy Liftactiv Specialist B3 Dark Spot & Wrinkles 30 ML",
      "Neostrata Control DE Pigmento 50ML",
      "Isdin Acniben Body Spray 150 ML",
    ]) {
      expect(d(n).summary).not.toMatch(prohibidas);
    }
  });
});

describe("deriveProductBlurb — para qué piel", () => {
  it("saca el tipo de piel de la propia marca comercial", () => {
    expect(d("Bioderma Sebium H2O 500 ML").skinTypes).toContain("Piel grasa");
    expect(d("Bioderma Sensibio GEL Moussant 100 ML").skinTypes).toContain(
      "Piel sensible",
    );
    expect(
      d("LA Roche-posay Lipikar Ap+m Triple Repair Moisturizing Cream 400 ML")
        .skinTypes,
    ).toContain("Piel seca");
    expect(d("Isispharma Secalia DS Crema Nutritiva 40 ML").skinTypes).toContain(
      "Piel seca",
    );
  });

  it("la categoría también declara tipo de piel", () => {
    expect(d("Producto X", "Acné y piel grasa").skinTypes).toEqual(["Piel grasa"]);
    expect(d("Producto Y", "Piel atópica / sensible").skinTypes).toEqual([
      "Piel atópica",
      "Piel sensible",
    ]);
  });

  it("no repite el mismo tipo por venir del nombre y de la categoría", () => {
    const r = d("Eucerin Dermopure OIL Control GEL Limp. Facial 200ML", "Acné y piel grasa");
    expect(r.skinTypes.filter((s) => s === "Piel grasa")).toHaveLength(1);
  });

  it("un producto puede servir a más de un tipo", () => {
    const r = d("A-derma Exomega Control Crema Atopica Sensible");
    expect(r.skinTypes).toContain("Piel atópica");
    expect(r.skinTypes).toContain("Piel sensible");
  });

  it("lo que se traga no se describe por tipo de piel", () => {
    expect(d("Perfectil Triple Active Skin, Hair & Nails Tabletas").skinTypes).toEqual([]);
    expect(d("Abravia Jarabe 60 ML").skinTypes).toEqual([]);
  });

  it("cuando el nombre no lo dice, no se supone", () => {
    expect(d("Thrombocid Crema 60 Gramos").skinTypes).toEqual([]);
  });
});

describe("productBlurb", () => {
  const base: PublicProduct = {
    slug: "x",
    title: "Bioderma Sebium H2O 500 ML",
    benefits: [],
    price: 100,
    imageUrl: null,
    availability: { status: "in_stock", label: "En existencia" },
    featured: false,
    isNew: false,
  };

  it("lo que escribió el negocio MANDA sobre lo derivado", () => {
    // Ver tu texto sustituido por uno automático es la forma segura de que
    // nadie vuelva a escribir ninguno.
    const r = productBlurb({ ...base, summary: "  El limpiador de siempre.  " });
    expect(r.summary).toBe("El limpiador de siempre.");
  });

  it("sin texto escrito, cae en el derivado", () => {
    expect(productBlurb(base).summary).toBe("Agua micelar");
  });

  it("el tipo de piel se sigue enseñando aunque el texto sea del negocio", () => {
    const r = productBlurb({ ...base, summary: "Texto propio" });
    expect(r.skinTypes).toContain("Piel grasa");
  });

  it("un resumen en blanco no cuenta como escrito", () => {
    expect(productBlurb({ ...base, summary: "   " }).summary).toBe("Agua micelar");
  });
});

describe("deriveProductBlurb — que suene a español", () => {
  it("el adjetivo concuerda con la forma", () => {
    // "Crema reparador" es lo que salía antes, y se lee como una traducción
    // automática. En una tienda eso resta confianza.
    expect(d("LA Roche-posay Cicaplast Crema DE Manos 50 ML").summary).toBe(
      "Crema reparadora",
    );
    expect(d("Isispharma Secalia DS Crema Nutritiva 40 ML").summary).toBe(
      "Crema nutritiva",
    );
    // Los invariables no se tocan.
    expect(d("Medihealth Glicolic Crema Hidratante 60 G").summary).toBe(
      "Crema hidratante",
    );
  });

  it("sin forma, el adjetivo va solo y no precedido de 'Producto'", () => {
    expect(d("ACM Duolys Legere Piel Hidratante 40 ML.").summary).toBe(
      "Hidratante",
    );
    expect(d("LA Roche-posay Clarifying Solution 200 ML").summary).toBe(
      "Despigmentante",
    );
  });

  it("cuando solo se sabe la forma, la categoría dice de qué es", () => {
    expect(d("Cutivate Crema 15MG", "Cuidado facial").summary).toBe("Crema facial");
    expect(d("Cutivate Crema 15MG").summary).toBe("Crema");
  });

  it("no le dice 'facial' a algo que puede ser corporal", () => {
    // En "Piel atópica / sensible" hay tanto cara como cuerpo.
    expect(d("Uriage Bariederm Cica Spray 100 ML", "Piel atópica / sensible").summary)
      .toBe("Espray");
  });
});
