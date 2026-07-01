// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { recordLabChange, readLabAudit } from "./laboratory-audit";

beforeEach(() => localStorage.clear());

describe("laboratory-audit", () => {
  it("11. registra el cambio de laboratorio con old/new y motivo", () => {
    recordLabChange({
      productId: "p1",
      oldLaboratoryId: "lab_old",
      newLaboratoryId: "lab_new",
      userName: "Admin",
      reason: "Corrección",
    });
    const audit = readLabAudit("p1");
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      productId: "p1",
      oldLaboratoryId: "lab_old",
      newLaboratoryId: "lab_new",
      userName: "Admin",
      reason: "Corrección",
    });
    expect(audit[0]!.createdAt).toBeTruthy();
  });

  it("filtra la auditoría por producto", () => {
    recordLabChange({ productId: "p1", oldLaboratoryId: "a", newLaboratoryId: "b" });
    recordLabChange({ productId: "p2", oldLaboratoryId: "c", newLaboratoryId: "d" });
    expect(readLabAudit("p1")).toHaveLength(1);
    expect(readLabAudit()).toHaveLength(2);
  });
});
