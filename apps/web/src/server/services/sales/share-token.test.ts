import { describe, it, expect, beforeAll } from "vitest";
import {
  signDocumentShareToken,
  verifyDocumentShareToken,
} from "./share-token";

// SEC-003: la firma exige `DOCUMENT_SHARE_SECRET` fuerte (≥24). Sin él, la
// función de compartir queda deshabilitada (fail-closed). Los tests configuran
// un secreto de prueba fuerte.
const TEST_SECRET = "test-share-secret-0123456789abcdef";

describe("document share token", () => {
  const biz = "biz-uuid-1";
  const id = "doc-uuid-1";

  beforeAll(() => {
    process.env.DOCUMENT_SHARE_SECRET = TEST_SECRET;
  });

  it("SEC-003: sin DOCUMENT_SHARE_SECRET fuerte, la firma FALLA (fail-closed)", () => {
    const prev = process.env.DOCUMENT_SHARE_SECRET;
    process.env.DOCUMENT_SHARE_SECRET = ""; // no configurado
    expect(() => signDocumentShareToken(biz, id)).toThrow(/DOCUMENT_SHARE_SECRET/);
    process.env.DOCUMENT_SHARE_SECRET = "corto"; // < 24 chars
    expect(() => signDocumentShareToken(biz, id)).toThrow();
    process.env.DOCUMENT_SHARE_SECRET = prev;
  });

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
