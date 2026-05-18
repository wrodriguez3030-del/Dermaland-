import { describe, it, expect } from "vitest";
import { mockRepositories } from "./index";

const CTX = { businessId: "biz_dermaland" } as const;

describe("mockRepositories.dgii.settings/saveSettings", () => {
  it("settings retorna el default para el business piloto", async () => {
    const s = await mockRepositories.dgii.settings(CTX);
    expect(s).not.toBeNull();
    expect(s?.rncEmisor).toBe("13259077503");
    expect(s?.ambiente).toBe("testecf");
    expect(s?.dgiiEnabledRealSend).toBe(false);
  });

  it("settings retorna null para un business desconocido", async () => {
    const s = await mockRepositories.dgii.settings({
      businessId: "biz_inexistente",
    });
    expect(s).toBeNull();
  });

  it("saveSettings persiste un patch en memoria (mock)", async () => {
    await mockRepositories.dgii.saveSettings(CTX, {
      nombreComercial: "DermaLand Test",
      ambiente: "certecf",
    });
    const s = await mockRepositories.dgii.settings(CTX);
    expect(s?.nombreComercial).toBe("DermaLand Test");
    expect(s?.ambiente).toBe("certecf");
  });

  it("saveSettings actualiza updatedAt", async () => {
    const before = await mockRepositories.dgii.settings(CTX);
    await new Promise((r) => setTimeout(r, 5));
    const after = await mockRepositories.dgii.saveSettings(CTX, {
      website: "https://dermaland.do",
    });
    expect(new Date(after.updatedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(before!.updatedAt).getTime(),
    );
  });

  it("guard rechaza ctx sin businessId", async () => {
    await expect(
      mockRepositories.dgii.settings({ businessId: "" }),
    ).rejects.toThrow();
  });

  it("dgiiEnabledRealSend default = false (no envía a producción)", async () => {
    const s = await mockRepositories.dgii.settings(CTX);
    expect(s?.dgiiEnabledRealSend).toBe(false);
  });

  it("requireAdminAuthorizationBelow100Percent default = true (conservador)", async () => {
    const s = await mockRepositories.dgii.settings(CTX);
    expect(s?.requireAdminAuthorizationBelow100Percent).toBe(true);
  });

  it("appliesToPaymentMethods incluye cash y transfer por default", async () => {
    const s = await mockRepositories.dgii.settings(CTX);
    expect(s?.appliesToPaymentMethods).toContain("cash");
    expect(s?.appliesToPaymentMethods).toContain("transfer");
  });
});
