import { describe, expect, it } from "vitest";
import {
  classifyDgiiError,
  ERROR_CLASSES,
  errorClassLabel,
  MAX_INTENTOS,
  nextRetryDelayMs,
  shouldRetry,
} from "./error-classification";

describe("el caso que puede duplicar un comprobante", () => {
  it("timeout DESPUÉS de entregar: NO se reenvía, se consulta", () => {
    // La DGII pudo recibirlo perfectamente y perderse la respuesta. Reenviar a
    // ciegas es arriesgarse a emitir dos veces el mismo comprobante fiscal.
    const r = classifyDgiiError({ networkCode: "ETIMEDOUT", delivered: true });
    expect(r.class).toBe("TIMEOUT");
    expect(r.transient).toBe(false);
    expect(r.action).toBe("consultar-estado");
  });

  it("timeout ANTES de entregar: se reintenta sin miedo", () => {
    const r = classifyDgiiError({ networkCode: "ETIMEDOUT", delivered: false });
    expect(r.transient).toBe(true);
    expect(r.action).toBe("reintentar");
  });

  it("un 409 significa que ya lo tenían: se consulta, no se reenvía", () => {
    const r = classifyDgiiError({ httpStatus: 409 });
    expect(r.action).toBe("consultar-estado");
    expect(r.transient).toBe(false);
  });
});

describe("lo que se arregla solo", () => {
  it("los baches de red se reintentan", () => {
    for (const code of ["ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND"]) {
      const r = classifyDgiiError({ networkCode: code });
      expect(r.class, code).toBe("NETWORK");
      expect(r.transient, code).toBe(true);
    }
  });

  it("los 5xx y el 429 también", () => {
    for (const s of [429, 500, 502, 503, 504]) {
      const r = classifyDgiiError({ httpStatus: s });
      expect(r.transient, String(s)).toBe(true);
    }
  });

  it("un 401 se resuelve renovando el token, no avisando a nadie", () => {
    const r = classifyDgiiError({ httpStatus: 401 });
    expect(r.class).toBe("AUTHENTICATION");
    expect(r.transient).toBe(true);
  });
});

describe("lo que NO se arregla solo", () => {
  it("un 400 es el documento, y golpear a la DGII no lo corrige", () => {
    const r = classifyDgiiError({ httpStatus: 400 });
    expect(r.class).toBe("VALIDATION");
    expect(r.transient).toBe(false);
    expect(r.action).toBe("corregir");
  });

  it("un rechazo fiscal NO se reintenta automáticamente", () => {
    const r = classifyDgiiError({ dgiiCode: "2" });
    expect(r.class).toBe("DGII_REJECTION");
    expect(r.transient).toBe(false);
    expect(shouldRetry(r, 1)).toBe(false);
  });

  it("sin certificado no se habla de reintentos: se configura", () => {
    const r = classifyDgiiError({ certificateProblem: true });
    expect(r.class).toBe("CERTIFICATE");
    expect(r.action).toBe("configurar");
    expect(r.transient).toBe(false);
  });

  it("falta de configuración manda a configurar, no a reintentar", () => {
    const r = classifyDgiiError({ missingConfig: true });
    expect(r.action).toBe("configurar");
  });

  it("el certificado gana sobre cualquier otra señal", () => {
    // Si el certificado no sirve, que además hubiera un 503 da igual.
    const r = classifyDgiiError({ certificateProblem: true, httpStatus: 503 });
    expect(r.class).toBe("CERTIFICATE");
  });
});

describe("los mensajes", () => {
  it("ninguno enseña la clase cruda ni códigos", () => {
    const casos = [
      { httpStatus: 400 },
      { httpStatus: 503 },
      { networkCode: "ETIMEDOUT", delivered: true },
      { certificateProblem: true },
      { dgiiCode: "2" },
      {},
    ];
    for (const c of casos) {
      const r = classifyDgiiError(c);
      expect(r.message.length).toBeGreaterThan(20);
      for (const clase of ERROR_CLASSES) expect(r.message).not.toContain(clase);
    }
  });

  it("cada clase tiene etiqueta legible", () => {
    for (const c of ERROR_CLASSES) {
      expect(errorClassLabel(c)).not.toBe(c);
      expect(errorClassLabel(c).length).toBeGreaterThan(0);
    }
  });
});

describe("cuánto se espera antes de reintentar", () => {
  it("crece con cada intento", () => {
    const medio = () => 0.5;
    const esperas = [1, 2, 3, 4].map((i) => nextRetryDelayMs(i, medio));
    for (let i = 1; i < esperas.length; i++) {
      expect(esperas[i]!).toBeGreaterThan(esperas[i - 1]!);
    }
  });

  it("tiene ruido: cien fallos del mismo corte de red NO reintentan a la vez", () => {
    // Sin ruido, todo lo que falló por el mismo corte vuelve en el mismo
    // instante y tumba otra vez lo que se estaba recuperando.
    const conCero = nextRetryDelayMs(3, () => 0);
    const conUno = nextRetryDelayMs(3, () => 1);
    expect(conUno).toBeGreaterThan(conCero);
    // El reparto es amplio, no unos segundos.
    expect(conUno / conCero).toBeGreaterThanOrEqual(1.9);
  });

  it("no crece sin fin: media hora es el techo", () => {
    const muyTarde = nextRetryDelayMs(50, () => 1);
    expect(muyTarde).toBeLessThanOrEqual(30 * 60_000);
  });

  it("un intento raro no produce una espera absurda", () => {
    for (const n of [0, -5, 0.5]) {
      const d = nextRetryDelayMs(n, () => 0.5);
      expect(d).toBeGreaterThan(0);
      expect(Number.isFinite(d)).toBe(true);
    }
  });
});

describe("cuándo rendirse", () => {
  it("se reintenta lo transitorio hasta el tope", () => {
    const transitorio = classifyDgiiError({ httpStatus: 503 });
    expect(shouldRetry(transitorio, 1)).toBe(true);
    expect(shouldRetry(transitorio, MAX_INTENTOS - 1)).toBe(true);
    expect(shouldRetry(transitorio, MAX_INTENTOS)).toBe(false);
  });

  it("lo permanente no se reintenta ni la primera vez", () => {
    const permanente = classifyDgiiError({ httpStatus: 400 });
    expect(shouldRetry(permanente, 1)).toBe(false);
  });
});
