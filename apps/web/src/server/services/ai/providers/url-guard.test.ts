import { describe, it, expect } from "vitest";
import { validateProviderBaseUrl } from "./url-guard";

/** SEC-014 (regresión): el base_url de proveedor IA no puede apuntar a hosts internos. */
describe("validateProviderBaseUrl — SEC-014", () => {
  it("acepta URLs https públicas", () => {
    expect(validateProviderBaseUrl("https://api.openai.com/v1")).toBeNull();
    expect(validateProviderBaseUrl("https://mi-servicio.com/v1")).toBeNull();
  });

  it("rechaza http (no cifrado)", () => {
    expect(validateProviderBaseUrl("http://api.openai.com")).toMatch(/https/);
  });

  it("rechaza localhost y hosts internos", () => {
    expect(validateProviderBaseUrl("https://localhost/v1")).toBeTruthy();
    expect(validateProviderBaseUrl("https://foo.internal/v1")).toBeTruthy();
    expect(validateProviderBaseUrl("https://svc.local/v1")).toBeTruthy();
  });

  it("rechaza IPs privadas / metadata / loopback", () => {
    expect(validateProviderBaseUrl("https://169.254.169.254/latest/meta-data")).toBeTruthy(); // metadata cloud
    expect(validateProviderBaseUrl("https://127.0.0.1/v1")).toBeTruthy();
    expect(validateProviderBaseUrl("https://10.0.0.5/v1")).toBeTruthy();
    expect(validateProviderBaseUrl("https://192.168.1.10/v1")).toBeTruthy();
    expect(validateProviderBaseUrl("https://172.16.0.1/v1")).toBeTruthy();
  });

  it("rechaza URL malformada", () => {
    expect(validateProviderBaseUrl("no-es-una-url")).toBeTruthy();
  });
});
