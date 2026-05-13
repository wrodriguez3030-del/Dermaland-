import { describe, expect, it } from "vitest";
import { mockRepositories } from "./mock";
import type { RepoContext } from "./types";

const ctxA: RepoContext = { businessId: "biz_dermaland" };
const ctxB: RepoContext = { businessId: "biz_otro_unknown" };

describe("Cross-tenant isolation (R-SEC-01)", () => {
  it("repos rechazan ctx sin businessId", async () => {
    const bad = { businessId: "" } as RepoContext;
    await expect(mockRepositories.product.list(bad)).rejects.toThrow(
      /businessId/,
    );
    await expect(mockRepositories.customer.list(bad)).rejects.toThrow();
    await expect(mockRepositories.proforma.list(bad)).rejects.toThrow();
  });

  it("business A no ve rows de business B", async () => {
    const productsA = await mockRepositories.product.list(ctxA);
    const productsB = await mockRepositories.product.list(ctxB);
    expect(productsA.length).toBeGreaterThan(0);
    expect(productsB).toHaveLength(0);
  });

  it("byId con business B retorna null aunque exista en A", async () => {
    const knownInA = (await mockRepositories.product.list(ctxA))[0]!;
    const sameIdFromB = await mockRepositories.product.byId(ctxB, knownInA.id);
    expect(sameIdFromB).toBeNull();
  });

  it("clientes filtran por businessId", async () => {
    const customersA = await mockRepositories.customer.list(ctxA);
    const customersB = await mockRepositories.customer.list(ctxB);
    expect(customersA.length).toBeGreaterThan(0);
    expect(customersB).toHaveLength(0);
  });

  it("proformas filtran por businessId", async () => {
    const proformasA = await mockRepositories.proforma.list(ctxA);
    const proformasB = await mockRepositories.proforma.list(ctxB);
    expect(proformasA.length).toBeGreaterThan(0);
    expect(proformasB).toHaveLength(0);
  });

  it("audit logs filtran por businessId", async () => {
    const auditA = await mockRepositories.audit.list(ctxA);
    const auditB = await mockRepositories.audit.list(ctxB);
    expect(auditA.length).toBeGreaterThan(0);
    expect(auditB).toHaveLength(0);
  });
});

describe("FEFO via repositorio (R-INV-03)", () => {
  it("productLot.selectFefo respeta business scope y FEFO", async () => {
    const lot = await mockRepositories.productLot.selectFefo(
      ctxA,
      "prod_lrp_001",
    );
    expect(lot).toBeTruthy();
    expect(lot!.lotNumber).toBe("LRP24A"); // el más próximo a vencer
  });
});

describe("Stub Supabase falla limpio si DATA_SOURCE=supabase sin keys", async () => {
  const { supabaseRepositories } = await import("./supabase");
  it("product.list lanza NotImplementedError", async () => {
    await expect(
      supabaseRepositories.product.list({ businessId: "x" }),
    ).rejects.toThrow(/no implementado/i);
  });
});
