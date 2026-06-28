import { describe, it, expect } from "vitest";
import {
  signDocumentShareToken,
  verifyDocumentShareToken,
} from "./share-token";

describe("document share token", () => {
  const biz = "biz-uuid-1";
  const id = "doc-uuid-1";

  it("firma y verifica un token válido (round-trip)", () => {
    const token = signDocumentShareToken(biz, id);
    expect(token).toContain(".");
    expect(verifyDocumentShareToken(token)).toEqual({ businessId: biz, id });
  });

  it("rechaza un token manipulado", () => {
    const token = signDocumentShareToken(biz, id);
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(verifyDocumentShareToken(tampered)).toBeNull();
  });

  it("rechaza tokens vacíos o mal formados", () => {
    expect(verifyDocumentShareToken("")).toBeNull();
    expect(verifyDocumentShareToken(undefined)).toBeNull();
    expect(verifyDocumentShareToken("sin-punto")).toBeNull();
  });

  it("un token de otro negocio no se confunde con el id", () => {
    const t1 = signDocumentShareToken("biz-A", "doc-1");
    const claims = verifyDocumentShareToken(t1);
    expect(claims?.businessId).toBe("biz-A");
    expect(claims?.id).toBe("doc-1");
  });
});
