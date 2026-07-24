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

  // DL-06: codificaciones alternativas de IPv4 que saltaban el guard.
  it("rechaza codificaciones no punteadas de 169.254.169.254 (metadata)", () => {
    expect(validateProviderBaseUrl("https://2852039166/latest/meta-data")).toBeTruthy(); // decimal
    expect(validateProviderBaseUrl("https://0xA9FEA9FE/")).toBeTruthy(); // hex empaquetado
    expect(validateProviderBaseUrl("https://[::ffff:a9fe:a9fe]/")).toBeTruthy(); // IPv4-mapped IPv6 hex
    expect(validateProviderBaseUrl("https://[::ffff:169.254.169.254]/")).toBeTruthy(); // IPv4-mapped IPv6 punteada
  });

  it("rechaza loopback en codificaciones no punteadas (127.0.0.1)", () => {
    expect(validateProviderBaseUrl("https://2130706433/")).toBeTruthy(); // decimal de 127.0.0.1
    expect(validateProviderBaseUrl("https://0x7f000001/")).toBeTruthy(); // hex de 127.0.0.1
    expect(validateProviderBaseUrl("https://0177.0.0.1/")).toBeTruthy(); // octeto octal de 127
  });

  it("sigue aceptando una IP pública en decimal", () => {
    // 8.8.8.8 = 134744072 → pública, debe pasar.
    expect(validateProviderBaseUrl("https://134744072/")).toBeNull();
  });
});
