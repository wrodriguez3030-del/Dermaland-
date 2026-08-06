import { describe, expect, it } from "vitest";
import {
  assessCertificateExpiry,
  expiryNotificationKey,
  shouldNotify,
  UMBRALES_DIAS,
} from "./certificate-expiry";

const HOY = new Date("2026-08-04T15:00:00Z");
const enDias = (n: number) =>
  new Date(Date.UTC(2026, 7, 4 + n, 12, 0, 0));

describe("los seis avisos del pliego", () => {
  it("dispara exactamente en 30, 15, 7, 3, 1 y 0", () => {
    for (const u of UMBRALES_DIAS) {
      const r = assessCertificateExpiry(enDias(u), HOY);
      expect(r.threshold, `${u} días`).toBe(u);
    }
  });

  it("por encima de 30 no molesta a nadie", () => {
    const r = assessCertificateExpiry(enDias(45), HOY);
    expect(r.threshold).toBeNull();
    expect(r.level).toBe("ok");
  });

  it("entre umbrales usa el más cercano ya alcanzado", () => {
    // A 20 días toca el aviso de 30, no el de 15: el de 15 aún no llegó.
    expect(assessCertificateExpiry(enDias(20), HOY).threshold).toBe(30);
    expect(assessCertificateExpiry(enDias(10), HOY).threshold).toBe(15);
    expect(assessCertificateExpiry(enDias(5), HOY).threshold).toBe(7);
  });
});

describe("aprieta según se acerca", () => {
  it("a treinta días es una nota; a tres es una urgencia", () => {
    expect(assessCertificateExpiry(enDias(30), HOY).level).toBe("aviso");
    expect(assessCertificateExpiry(enDias(7), HOY).level).toBe("urgente");
    expect(assessCertificateExpiry(enDias(3), HOY).level).toBe("critico");
    expect(assessCertificateExpiry(enDias(0), HOY).level).toBe("critico");
  });
});

describe("vencido", () => {
  it("no se puede emitir", () => {
    const r = assessCertificateExpiry(enDias(-1), HOY);
    expect(r.level).toBe("vencido");
    expect(r.canIssue).toBe(false);
    expect(r.message).toContain("No se puede emitir");
  });

  it("el que vence HOY todavía sirve hoy", () => {
    const r = assessCertificateExpiry(enDias(0), HOY);
    expect(r.canIssue).toBe(true);
    expect(r.message).toContain("HOY");
  });

  it("dice cuántos días lleva vencido, no solo que venció", () => {
    expect(assessCertificateExpiry(enDias(-5), HOY).message).toContain("5 días");
    expect(assessCertificateExpiry(enDias(-1), HOY).message).toContain("1 día");
  });
});

describe("una fecha ilegible se avisa, no se calla", () => {
  it("se trata como crítico y sin poder emitir", () => {
    // Sin fecha legible no se puede AFIRMAR que el certificado sirva.
    const r = assessCertificateExpiry("no es una fecha", HOY);
    expect(r.level).toBe("critico");
    expect(r.canIssue).toBe(false);
  });
});

describe("no repetir el mismo aviso", () => {
  it("cada umbral avisa UNA vez", () => {
    // Un correo diario durante treinta días es cómo se enseña a la gente a
    // filtrar los correos del sistema.
    const r = assessCertificateExpiry(enDias(7), HOY);
    expect(shouldNotify(r, new Set())).toBe(true);
    expect(shouldNotify(r, new Set([7]))).toBe(false);
  });

  it("pero un umbral más cercano SÍ vuelve a avisar", () => {
    const aTres = assessCertificateExpiry(enDias(3), HOY);
    expect(shouldNotify(aTres, new Set([30, 15, 7]))).toBe(true);
  });

  it("sin umbral no se avisa de nada", () => {
    const lejos = assessCertificateExpiry(enDias(60), HOY);
    expect(shouldNotify(lejos, new Set())).toBe(false);
  });
});

describe("la llave del aviso", () => {
  it("un certificado nuevo empieza los avisos de cero", () => {
    // Lleva la huella y no el id: si se sustituye por otro con la misma fecha,
    // los avisos tienen que volver a empezar.
    const viejo = expiryNotificationKey("AA:BB:CC", 7);
    const nuevo = expiryNotificationKey("DD:EE:FF", 7);
    expect(viejo).not.toBe(nuevo);
  });

  it("es estable frente a mayúsculas y espacios", () => {
    expect(expiryNotificationKey("  AA:bb:CC  ", 7)).toBe(
      expiryNotificationKey("aa:BB:cc", 7),
    );
  });

  it("cada umbral tiene su llave", () => {
    const llaves = UMBRALES_DIAS.map((u) => expiryNotificationKey("AA", u));
    expect(new Set(llaves).size).toBe(UMBRALES_DIAS.length);
  });
});
