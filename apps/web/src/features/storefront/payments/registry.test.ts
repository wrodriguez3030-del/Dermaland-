import { describe, expect, it } from "vitest";
import { missingAzulKeys, resolvePaymentProvider } from "./registry";

const AZUL_COMPLETO = {
  PAYMENTS_PROVIDER: "azul",
  AZUL_MERCHANT_ID: "39038540035",
  AZUL_AUTH1: "usuario",
  AZUL_AUTH2: "clave",
  AZUL_AUTH_KEY: "llave-de-hash",
  AZUL_CERT_PATH: "/certs/azul.pem",
  AZUL_KEY_PATH: "/certs/azul.key",
  AZUL_BASE_URL: "https://pagos.azul.com.do/webservices/JSON/Default.aspx",
};

describe("resolvePaymentProvider", () => {
  it("sin configurar, NO hay cobro: fail-closed", () => {
    expect(resolvePaymentProvider({}, "production")).toBeNull();
    expect(resolvePaymentProvider({}, "development")).toBeNull();
  });

  it("el proveedor SIMULADO jamás se activa en producción", () => {
    // Es la regla que impide que un checkout de mentira llegue a un cliente
    // real. Si algún día alguien pone PAYMENTS_PROVIDER=simulated en Vercel por
    // error, el resultado tiene que ser "no se cobra", no "se finge que sí".
    expect(
      resolvePaymentProvider({ PAYMENTS_PROVIDER: "simulated" }, "production"),
    ).toBeNull();
  });

  it("el simulado sí funciona fuera de producción", () => {
    const p = resolvePaymentProvider(
      { PAYMENTS_PROVIDER: "simulated" },
      "development",
    );
    expect(p?.id).toBe("simulated");
  });

  it("Azul NO se activa aunque estén todas las credenciales: falta el adaptador", () => {
    // El adaptador de Azul se escribe cuando exista la afiliación y sepamos qué
    // trae su paquete de integración. Devolver algo aquí antes de eso sería
    // encender un botón de "Pagar" que no puede cobrar.
    expect(resolvePaymentProvider(AZUL_COMPLETO, "production")).toBeNull();
  });

  it("dice qué le falta a Azul, para no adivinarlo el día del alta", () => {
    expect(missingAzulKeys(AZUL_COMPLETO)).toEqual([]);
    expect(missingAzulKeys({})).toContain("AZUL_MERCHANT_ID");
    expect(missingAzulKeys({ ...AZUL_COMPLETO, AZUL_AUTH2: "" })).toEqual([
      "AZUL_AUTH2",
    ]);
  });

  it("un proveedor que no existe no activa nada", () => {
    expect(
      resolvePaymentProvider({ PAYMENTS_PROVIDER: "paypal" }, "development"),
    ).toBeNull();
  });

  it("no basta con tener las credenciales: hay que ELEGIR el proveedor", () => {
    // Dejar credenciales puestas mientras se prueba no debe encender el cobro
    // por sí solo. Encenderlo es una decisión explícita.
    const sinElegir = { ...AZUL_COMPLETO, PAYMENTS_PROVIDER: "" };
    expect(resolvePaymentProvider(sinElegir, "production")).toBeNull();
  });
});
