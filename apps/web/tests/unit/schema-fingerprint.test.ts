import { describe, it, expect } from "vitest";
import {
  FINGERPRINT_SQL,
  diffFingerprints,
} from "../../../../scripts/backup/lib/schema-fingerprint.mjs";

// Tipo local (no el `SchemaFingerprint` exportado): ese usa arreglos
// `readonly` en su firma porque diffFingerprints no los muta, pero esta
// prueba SI necesita `.push()` e inferencia de indice para `delete`. Los
// campos `rls`/`definiciones`/`restricciones` son la corrección de la
// ronda 2 de revisión — ver schema-fingerprint.mjs.
type Huella = {
  filas: Record<string, number>;
  funciones: string[];
  politicas: Record<string, number>;
  rls: Record<string, boolean>;
  definiciones: Record<string, string>;
  indices: string[];
  restricciones: string[];
};

const huella = (): Huella => ({
  filas: { products: 627, sales: 120, "storage.objects": 642 },
  funciones: ["emit_sale_atomic()", "transfer_stock_atomic(uuid)"],
  politicas: { products: 4, sales: 3, "storage.objects": 5 },
  rls: { products: true, sales: true, "storage.objects": true },
  definiciones: {
    "products:products_all": "hash-products-all",
    "sales:sales_all": "hash-sales-all",
    "storage.objects:product_images_public_read": "hash-storage-read",
  },
  indices: ["idx_products_barcode"],
  restricciones: ["products_business_id_fkey", "sales_client_id_fkey"],
});

describe("FINGERPRINT_SQL", () => {
  it("consulta las dimensiones que exige el diseño", () => {
    expect(FINGERPRINT_SQL).toContain("pg_policies");
    expect(FINGERPRINT_SQL).toContain("pg_indexes");
    expect(FINGERPRINT_SQL).toContain("pg_proc");
    expect(FINGERPRINT_SQL).toContain("query_to_xml");
    // Ronda 2: RLS encendido/apagado, hash de USING/WITH CHECK, FK/CHECK.
    expect(FINGERPRINT_SQL).toContain("relrowsecurity");
    expect(FINGERPRINT_SQL).toContain("md5");
    expect(FINGERPRINT_SQL).toContain("pg_constraint");
    // Ronda 2: storage.objects (5 políticas de fotos de producto) y
    // auth.users no pueden desaparecer del radar en silencio.
    expect(FINGERPRINT_SQL).toContain("storage");
    expect(FINGERPRINT_SQL).toContain("auth");
  });

  /**
   * Ronda 3 de revisión: la huella solo rastreaba `auth.users` e ignoraba las
   * otras 22 tablas de `auth`. Si el respaldo perdiera entera
   * `auth.mfa_factors`, el simulacro habría impreso PASA — y de esa tabla
   * depende el 2FA obligatorio (B-04). Estas pruebas clavan la lista para que
   * nadie la recorte sin darse cuenta.
   */
  it("rastrea las tablas DURABLES de auth, no solo auth.users", () => {
    for (const tabla of [
      "users",
      "identities",
      "mfa_factors",
      "webauthn_credentials",
      "sso_providers",
      "sso_domains",
      "saml_providers",
      "oauth_clients",
      "oauth_consents",
      "custom_oauth_providers",
    ]) {
      expect(FINGERPRINT_SQL).toContain(`n.nspname = 'auth' and c.relname = '${tabla}'`);
    }
  });

  it("rastrea las tablas DURABLES de storage", () => {
    for (const tabla of ["buckets", "objects", "buckets_analytics", "buckets_vectors", "vector_indexes"]) {
      expect(FINGERPRINT_SQL).toContain(`n.nspname = 'storage' and c.relname = '${tabla}'`);
    }
  });

  it("NO rastrea el estado efímero: incluirlo haría fallar el simulacro siempre", () => {
    // sessions y refresh_tokens cambian cada vez que alguien entra; exigir que
    // su conteo coincida entre producción "ahora" y una copia restaurada
    // después es pedir que el comparador grite siempre, y un comparador que
    // siempre grita se termina ignorando.
    for (const tabla of [
      "sessions",
      "refresh_tokens",
      "mfa_challenges",
      "mfa_amr_claims",
      "flow_state",
      "one_time_tokens",
      "audit_log_entries",
      "s3_multipart_uploads",
    ]) {
      expect(FINGERPRINT_SQL).not.toContain(`c.relname = '${tabla}'`);
    }
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
    copia.rls["tabla_extra_de_la_imagen"] = true;
    copia.definiciones["tabla_extra:policy_extra"] = "hash-lo-que-sea";
    copia.restricciones.push("constraint_extra_de_la_imagen");
    expect(diffFingerprints(huella(), copia).ok).toBe(true);
  });

  // --- Ronda 2 de revisión: RLS encendido/apagado no es lo mismo que un
  // conteo de políticas, y un conteo puede coincidir con una definición
  // completamente distinta por debajo (HALLAZGO 3). ---

  it("falla si la copia tiene RLS apagado aunque las políticas sigan listadas", () => {
    // Simula `ALTER TABLE products DISABLE ROW LEVEL SECURITY`: las
    // políticas siguen existiendo en pg_policies (copia.politicas y
    // copia.definiciones quedan intactos), pero dejan de aplicarse.
    const copia = huella();
    copia.rls.products = false;
    const r = diffFingerprints(huella(), copia);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toMatch(/RLS deshabilitado.*products/);
  });

  it("falla si la definición de una política cambió aunque el conteo coincida", () => {
    // Mismo número de políticas (4 y 4), pero el USING/WITH CHECK de
    // 'products_all' ya no es el mismo — por ejemplo `USING (true)` en vez
    // de `USING (business_id = auth_business_id())`. Fuga total entre
    // inquilinos con una huella que, por conteo, se ve idéntica.
    const copia = huella();
    copia.definiciones["products:products_all"] = "hash-distinto-porque-cambio-el-using";
    const r = diffFingerprints(huella(), copia);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toMatch(/products:products_all/);
  });

  it("falla si falta una política con nombre en la copia aunque el conteo alcance", () => {
    // La copia trae 4 políticas para 'products' (el conteo pasa), pero una
    // de ellas no es 'products_all' sino otra distinta con otro nombre.
    const copia = huella();
    delete copia.definiciones["products:products_all"];
    copia.definiciones["products:otra_policy_cualquiera"] = "hash-cualquiera";
    const r = diffFingerprints(huella(), copia);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toMatch(/products:products_all/);
  });

  it("falla si falta una restricción FK/CHECK", () => {
    const copia = huella();
    copia.restricciones = copia.restricciones.filter((r) => r !== "products_business_id_fkey");
    const r = diffFingerprints(huella(), copia);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toMatch(/products_business_id_fkey/);
  });

  it("cubre storage.objects con el mismo mecanismo que las tablas de public", () => {
    // Las 5 políticas de storage.objects (fotos de producto) no pueden
    // desaparecer en silencio solo por vivir fuera de `public`.
    const copia = huella();
    copia.politicas["storage.objects"] = 4;
    const r = diffFingerprints(huella(), copia);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toMatch(/storage\.objects/);
  });

  it("detecta que la copia perdió auth.mfa_factors ENTERA, aunque esté vacía en producción", () => {
    // El agujero exacto de la ronda 3: `auth.mfa_factors` tiene 0 filas hoy, y
    // una tabla vacía "que falta" es justo la que se cuela sin ruido. De ella
    // depende B-04, así que perderla en el respaldo y enterarse después sería
    // quedarse sin los factores 2FA de los dos únicos admins.
    const prod = huella();
    prod.filas["auth.mfa_factors"] = 0;
    const copia = huella();
    const r = diffFingerprints(prod, copia);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toMatch(/auth\.mfa_factors/);
  });

  it("detecta que la copia perdió filas de auth.identities", () => {
    // Sin `identities` nadie puede volver a entrar con su proveedor, aunque
    // `auth.users` esté intacta.
    const prod = huella();
    prod.filas["auth.identities"] = 3;
    const copia = huella();
    copia.filas["auth.identities"] = 0;
    const r = diffFingerprints(prod, copia);
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toMatch(/auth\.identities/);
  });
});

describe("diffFingerprints — huella de producción degenerada (HALLAZGO 1, CRITICAL)", () => {
  // Una huella de PRODUCCION vacía, mal formada o sin parsear se leía como
  // "no falta nada" (cero elementos esperados, cero problemas). Eso pasa
  // justo cuando la consulta apuntó al DSN equivocado o `public` vino
  // vacío — el modo de falla más peligroso de todo el comparador, porque
  // aprueba un simulacro que nunca comparó nada de verdad.

  it("rechaza un objeto vacío como huella de producción", () => {
    const r = diffFingerprints({}, huella());
    expect(r.ok).toBe(false);
    expect(r.problemas.length).toBeGreaterThan(0);
  });

  it("rechaza una huella con las dimensiones presentes pero todas vacías", () => {
    const prodVacia = { filas: {}, funciones: [], politicas: {}, indices: [] };
    const r = diffFingerprints(prodVacia, huella());
    expect(r.ok).toBe(false);
    expect(r.problemas.length).toBeGreaterThan(0);
  });

  it("rechaza una huella que llega como cadena JSON sin parsear", () => {
    const crudo = JSON.stringify(huella());
    const r = diffFingerprints(crudo, huella());
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toMatch(/no es un objeto/);
  });

  it("rechaza una huella a la que le falta la dimensión 'politicas' entera", () => {
    const { politicas, ...prodSinPoliticas } = huella();
    const r = diffFingerprints(prodSinPoliticas, huella());
    expect(r.ok).toBe(false);
    expect(r.problemas.join(" ")).toMatch(/politicas/);
  });

  it("rechaza una huella con null en las cuatro dimensiones originales", () => {
    const prod = { filas: null, funciones: null, politicas: null, indices: null };
    const r = diffFingerprints(prod, huella());
    expect(r.ok).toBe(false);
    expect(r.problemas.length).toBeGreaterThan(0);
  });

  it("con una huella de producción real y una copia realmente idéntica, sigue aprobando", () => {
    // La guarda contra huellas degeneradas no debe volverse falso positivo
    // contra una huella real y completa.
    expect(diffFingerprints(huella(), huella())).toEqual({ ok: true, problemas: [] });
  });

  it("no lanza excepción si la copia es null o no es un objeto; la reporta como incompleta", () => {
    expect(() => diffFingerprints(huella(), null)).not.toThrow();
    expect(diffFingerprints(huella(), null).ok).toBe(false);
    expect(() => diffFingerprints(huella(), "no soy un objeto")).not.toThrow();
    expect(diffFingerprints(huella(), "no soy un objeto").ok).toBe(false);
  });
});
