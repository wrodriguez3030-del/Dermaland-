import { describe, it, expect } from "vitest";
import {
  FINGERPRINT_SQL,
  diffFingerprints,
} from "../../../../scripts/backup/lib/schema-fingerprint.mjs";

// Tipo local (no el `SchemaFingerprint` exportado): ese usa arreglos
// `readonly` en su firma porque diffFingerprints no los muta, pero esta
// prueba SI necesita `.push()` e inferencia de indice para `delete`.
type Huella = {
  filas: Record<string, number>;
  funciones: string[];
  politicas: Record<string, number>;
  indices: string[];
};

const huella = (): Huella => ({
  filas: { products: 627, sales: 120 },
  funciones: ["emit_sale_atomic()", "transfer_stock_atomic(uuid)"],
  politicas: { products: 4, sales: 3 },
  indices: ["idx_products_barcode"],
});

describe("FINGERPRINT_SQL", () => {
  it("consulta las cuatro dimensiones que exige el diseño", () => {
    expect(FINGERPRINT_SQL).toContain("pg_policies");
    expect(FINGERPRINT_SQL).toContain("pg_indexes");
    expect(FINGERPRINT_SQL).toContain("pg_proc");
    expect(FINGERPRINT_SQL).toContain("query_to_xml");
  });
});

describe("diffFingerprints", () => {
  it("aprueba cuando la copia es idéntica", () => {
    expect(diffFingerprints(huella(), huella())).toEqual({ ok: true, problemas: [] });
  });

  it("falla si una tabla llega con menos filas", () => {
    const copia = huella();
    copia.filas.products = 626;
    const r = diffFingerprints(huella(), copia);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toMatch(/products.*627.*626/);
  });

  it("falla si falta una tabla entera", () => {
    const copia = huella();
    delete copia.filas.sales;
    expect(diffFingerprints(huella(), copia).ok).toBe(false);
  });

  it("falla si falta una función", () => {
    const copia = huella();
    copia.funciones = ["emit_sale_atomic()"];
    const r = diffFingerprints(huella(), copia);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toMatch(/transfer_stock_atomic/);
  });

  it("falla si la copia perdió políticas RLS", () => {
    // Una copia sin RLS es una fuga de datos esperando ocurrir.
    const copia = huella();
    copia.politicas.products = 0;
    expect(diffFingerprints(huella(), copia).ok).toBe(false);
  });

  it("falla si falta un índice", () => {
    const copia = huella();
    copia.indices = [];
    expect(diffFingerprints(huella(), copia).ok).toBe(false);
  });

  it("no se queja de objetos EXTRA en la copia", () => {
    // El destino puede traer objetos propios de la imagen base. Lo que
    // importa es que no FALTE nada de produccion.
    const copia = huella();
    copia.indices.push("idx_extra_de_la_imagen");
    expect(diffFingerprints(huella(), copia).ok).toBe(true);
  });
});
