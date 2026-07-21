import { describe, it, expect, beforeAll } from "vitest";
import {
  signDocumentShareToken,
  verifyDocumentShareToken,
} from "./share-token";

// SEC-003: la firma exige `DOCUMENT_SHARE_SECRET` fuerte (≥24). Sin él, la
// función de compartir queda deshabilitada (fail-closed). Los tests configuran
// un secreto de prueba fuerte.
const TEST_SECRET = "test-share-secret-0123456789abcdef";

// businessId e id son UUID (como en la BD real).
const biz = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";

describe("document share token", () => {
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
    expect(verifyDocumentShareToken(token)).toEqual({ businessId: biz, id });
  });

  it("el token es corto (URL profesional)", () => {
    const token = signDocumentShareToken(biz, id);
    // 42 bytes en base64url ≈ 56 caracteres.
    expect(token.length).toBeLessThanOrEqual(60);
    expect(token).not.toContain("."); // codificación binaria, sin separador
  });

  it("exige UUID en businessId e id", () => {
    expect(() => signDocumentShareToken("biz-1", id)).toThrow();
    expect(() => signDocumentShareToken(biz, "doc-1")).toThrow();
  });

  it("rechaza un token manipulado", () => {
    const token = signDocumentShareToken(biz, id);
    const tampered = token.slice(0, -2) + (token.endsWith("aa") ? "bb" : "aa");
    expect(verifyDocumentShareToken(tampered)).toBeNull();
  });

  it("rechaza tokens vacíos o mal formados", () => {
    expect(verifyDocumentShareToken("")).toBeNull();
    expect(verifyDocumentShareToken(undefined)).toBeNull();
    expect(verifyDocumentShareToken("no-es-un-token")).toBeNull();
  });

  it("un token de otro negocio conserva su businessId e id", () => {
    const bizA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const docA = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const claims = verifyDocumentShareToken(signDocumentShareToken(bizA, docA));
    expect(claims?.businessId).toBe(bizA);
    expect(claims?.id).toBe(docA);
  });
});
