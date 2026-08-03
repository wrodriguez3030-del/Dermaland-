import { describe, it, expect } from "vitest";
import {
  emptyScanInputState,
  recordScanInput,
  isScannerBurst,
  autoSubmitDelayMs,
  SCANNER_MAX_GAP_MS,
  SCANNER_MIN_LENGTH,
  SCANNER_IDLE_MS,
  AUTO_SUBMIT_IDLE_MS,
} from "./scanner-input";

/** Simula escribir `value` con un intervalo fijo entre teclas. */
function type(value: string, gapMs: number, startAt = 1_000) {
  let state = emptyScanInputState();
  for (let i = 0; i < value.length; i += 1) {
    state = recordScanInput(state, { at: startAt + i * gapMs, addedChars: 1 });
  }
  return state;
}

describe("isScannerBurst", () => {
  it("un lector que escribe el EAN-13 a 10 ms por tecla cuenta como ráfaga", () => {
    const code = "3282770108729";
    expect(isScannerBurst(type(code, 10), code)).toBe(true);
  });

  it("tecleo humano a 180 ms por tecla NO se envía solo", () => {
    const code = "3282770108729";
    expect(isScannerBurst(type(code, 180), code)).toBe(false);
  });

  it("el lector que entrega el código completo en un solo evento es ráfaga", () => {
    const code = "3282770108729";
    const state = recordScanInput(emptyScanInputState(), {
      at: 1_000,
      addedChars: code.length,
    });
    expect(isScannerBurst(state, code)).toBe(true);
  });

  it("tolera un tropiezo aislado dentro de una ráfaga larga", () => {
    const code = "3282770108729";
    let state = emptyScanInputState();
    for (let i = 0; i < code.length; i += 1) {
      // Una sola pausa larga en medio; el resto a velocidad de lector.
      const gap = i === 6 ? 300 : 8;
      state = recordScanInput(state, { at: 1_000 + i * gap, addedChars: 1 });
    }
    expect(isScannerBurst(state, code)).toBe(true);
  });

  it("no se envía solo con menos de SCANNER_MIN_LENGTH caracteres", () => {
    const parcial = "32";
    expect(parcial.length).toBeLessThan(SCANNER_MIN_LENGTH);
    expect(isScannerBurst(type(parcial, 8), parcial)).toBe(false);
  });

  it("un campo vacío nunca es ráfaga", () => {
    expect(isScannerBurst(emptyScanInputState(), "")).toBe(false);
    expect(isScannerBurst(emptyScanInputState(), "   ")).toBe(false);
  });

  it("una sola tecla no alcanza para decidir ráfaga", () => {
    const state = recordScanInput(emptyScanInputState(), { at: 1_000, addedChars: 1 });
    expect(isScannerBurst(state, "3")).toBe(false);
  });

  it("un SKU escrito a mano y luego corregido sigue sin enviarse solo", () => {
    let state = type("DERM-I0006", 200);
    state = recordScanInput(state, { at: 5_000, addedChars: -1 }); // backspace
    state = recordScanInput(state, { at: 5_300, addedChars: 1 });
    expect(isScannerBurst(state, "DERM-I00061")).toBe(false);
  });

  it("el límite exacto SCANNER_MAX_GAP_MS cuenta como rápido", () => {
    const code = "3282770108729";
    expect(isScannerBurst(type(code, SCANNER_MAX_GAP_MS), code)).toBe(true);
    expect(isScannerBurst(type(code, SCANNER_MAX_GAP_MS + 1), code)).toBe(false);
  });
});

describe("autoSubmitDelayMs — nada depende de Enter", () => {
  const code = "3282770108729";

  it("la ráfaga del lector se envía sola, y rápido", () => {
    expect(autoSubmitDelayMs(type(code, 10), code)).toBe(SCANNER_IDLE_MS);
  });

  it("un lector LENTO (200 ms por tecla) también se envía solo, solo que más tarde", () => {
    expect(autoSubmitDelayMs(type(code, 200), code)).toBe(AUTO_SUBMIT_IDLE_MS);
  });

  it("el código completo entregado de golpe se envía solo", () => {
    const state = recordScanInput(emptyScanInputState(), { at: 1_000, addedChars: code.length });
    expect(autoSubmitDelayMs(state, code)).toBe(SCANNER_IDLE_MS);
  });

  it("un SKU escrito a mano también termina enviándose solo", () => {
    expect(autoSubmitDelayMs(type("DERM-I00061", 220), "DERM-I00061")).toBe(AUTO_SUBMIT_IDLE_MS);
  });

  it("no se envía nada con menos de SCANNER_MIN_LENGTH caracteres", () => {
    expect(autoSubmitDelayMs(type("32", 10), "32")).toBeNull();
    expect(autoSubmitDelayMs(emptyScanInputState(), "")).toBeNull();
  });
});

describe("recordScanInput", () => {
  it("la primera tecla solo fija el reloj, sin clasificar intervalos", () => {
    const state = recordScanInput(emptyScanInputState(), { at: 1_000, addedChars: 1 });
    expect(state).toEqual({ lastAt: 1_000, fastGaps: 0, slowGaps: 0, bulk: false });
  });

  it("no muta el estado recibido", () => {
    const inicial = emptyScanInputState();
    recordScanInput(inicial, { at: 1_000, addedChars: 1 });
    expect(inicial).toEqual({ lastAt: null, fastGaps: 0, slowGaps: 0, bulk: false });
  });
});
