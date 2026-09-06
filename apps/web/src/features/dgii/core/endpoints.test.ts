// Portada de agendapp: tests/unit/dgii-endpoints.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect, afterEach } from "vitest";
import { resolveDgiiBaseUrl, assertTestecfOnly, dgiiHttpTimeoutMs, assertSafeBaseUrl } from "./dgii-endpoints";
import { DgiiSendDisabledError } from "./killswitches";
import { DGII_DEFAULT_BASE_URLS, DGII_PATHS } from "./dgii-client-types";

const ENV_KEYS = ["DGII_TESTECF_BASE_URL", "DGII_CERTECF_BASE_URL", "DGII_ECF_BASE_URL", "DGII_HTTP_TIMEOUT_MS"];
afterEach(() => ENV_KEYS.forEach((k) => delete process.env[k]));

describe("resolveDgiiBaseUrl", () => {
  it("usa la constante de preview si no hay env (sin barra final)", () => {
    expect(resolveDgiiBaseUrl("testecf")).toBe("https://ecf.dgii.gov.do/testecf");
  });
  it("usa el override de env cuando existe", () => {
    process.env.DGII_TESTECF_BASE_URL = "https://mock.local/testecf/";
    expect(resolveDgiiBaseUrl("testecf")).toBe("https://mock.local/testecf");
  });
});

describe("assertTestecfOnly", () => {
  it("permite testecf", () => {
    expect(() => assertTestecfOnly("testecf")).not.toThrow();
  });
  it("bloquea certecf y ecf (producción)", () => {
    expect(() => assertTestecfOnly("certecf")).toThrow(DgiiSendDisabledError);
    expect(() => assertTestecfOnly("ecf")).toThrow(DgiiSendDisabledError);
  });
});

describe("dgiiHttpTimeoutMs", () => {
  it("default 15000", () => {
    expect(dgiiHttpTimeoutMs()).toBe(15000);
  });
  it("usa el env si es válido", () => {
    process.env.DGII_HTTP_TIMEOUT_MS = "8000";
    expect(dgiiHttpTimeoutMs()).toBe(8000);
  });
  it("ignora valores inválidos", () => {
    process.env.DGII_HTTP_TIMEOUT_MS = "abc";
    expect(dgiiHttpTimeoutMs()).toBe(15000);
  });
});

describe("assertSafeBaseUrl", () => {
  it("acepta https sin query ni credenciales", () => {
    expect(assertSafeBaseUrl("https://ecf.dgii.gov.do/testecf/")).toBe("https://ecf.dgii.gov.do/testecf");
  });
  it("rechaza query/token/credenciales/http", () => {
    expect(() => assertSafeBaseUrl("https://ecf.dgii.gov.do/testecf?token=abc")).toThrow();
    expect(() => assertSafeBaseUrl("https://ecf.dgii.gov.do/Bearer/x")).toThrow();
    expect(() => assertSafeBaseUrl("https://user:pass@ecf.dgii.gov.do/testecf")).toThrow();
    expect(() => assertSafeBaseUrl("http://ecf.dgii.gov.do/testecf")).toThrow();
  });
});

describe("constantes de endpoints — sin secretos", () => {
  it("paths y base URLs no contienen tokens/keys", () => {
    const blob = JSON.stringify({ DGII_DEFAULT_BASE_URLS, DGII_PATHS });
    expect(/eyJ[A-Za-z0-9_-]{20,}|sk_live_|Bearer\s+\w|token=/.test(blob)).toBe(false);
    expect(DGII_PATHS.recepcion).toBe("recepcion/api/facturaselectronicas");
  });
});
