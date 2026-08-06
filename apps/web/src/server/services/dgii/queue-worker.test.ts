import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * El trabajador, sin base de datos y sin hablar con nadie.
 *
 * Se sustituye la capa de datos y se le dan manejadores de mentira. Lo que se
 * comprueba aquí no es la fontanería: es que **el freno funcione** y que un
 * comprobante que revienta no se lleve por delante a los otros nueve del lote.
 */

const filas: Record<string, unknown>[] = [];
const transiciones: unknown[] = [];
const fallos: unknown[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            order: () => ({ limit: async () => ({ data: filas }) }),
          }),
        }),
        in: () => ({ limit: async () => ({ data: filas }) }),
      }),
    }),
  }),
}));

vi.mock("./transitions", () => ({
  applyTransition: async (input: unknown) => {
    transiciones.push(input);
    return { ok: true, from: "signed", to: "submitted" };
  },
  recordFailure: async (input: unknown) => {
    fallos.push(input);
    return { classified: { class: "NETWORK", transient: true }, retryAt: null };
  },
}));

const envMock = { DGII_TESTECF_SEND_ENABLED: "false" };
vi.mock("@/lib/env", () => ({ get env() { return envMock; } }));

const { runQueueForBusiness } = await import("./queue-worker");

function doc(p: Record<string, unknown> = {}) {
  return {
    id: "doc-1",
    status: "signed",
    next_retry_at: null,
    retry_count: 0,
    created_at: "2026-08-04T10:00:00Z",
    ...p,
  };
}

beforeEach(() => {
  filas.length = 0;
  transiciones.length = 0;
  fallos.length = 0;
  envMock.DGII_TESTECF_SEND_ENABLED = "false";
});

describe("el freno", () => {
  it("con el envío apagado NO se llama al manejador de envío", () => {
    // Es LA garantía de este módulo: mientras el envío esté deshabilitado, nada
    // sale hacia la DGII por mucho que la cola corra sola cada pocos minutos.
    filas.push(doc({ status: "signed" }));
    const enviar = vi.fn();

    return runQueueForBusiness({
      businessId: "b1",
      handlers: { enviar },
    }).then((r) => {
      expect(enviar).not.toHaveBeenCalled();
      expect(r.waitingForSend).toBe(1);
      expect(r.advanced).toBe(0);
    });
  });

  it("tampoco se consulta: consultar también habla con la DGII", async () => {
    filas.push(doc({ status: "submitted" }));
    const consultar = vi.fn();
    const r = await runQueueForBusiness({
      businessId: "b1",
      handlers: { consultar },
    });
    expect(consultar).not.toHaveBeenCalled();
    expect(r.waitingForSend).toBe(1);
  });

  it("esperar por el freno NO gasta un reintento", async () => {
    // Si contara como fallo, un documento acabaría agotando sus intentos sin
    // que nadie hubiera intentado nada.
    filas.push(doc({ status: "signed" }));
    await runQueueForBusiness({ businessId: "b1", handlers: { enviar: vi.fn() } });
    expect(fallos).toHaveLength(0);
  });

  it("lo LOCAL sí avanza con el envío apagado", async () => {
    // Así, el día que se habilite, lo pendiente sale de inmediato.
    filas.push(doc({ status: "generated" }));
    const validar = vi.fn(async () => ({ ok: true as const, to: "validated" as const }));
    const r = await runQueueForBusiness({ businessId: "b1", handlers: { validar } });
    expect(validar).toHaveBeenCalledOnce();
    expect(r.advanced).toBe(1);
  });

  it("con el envío encendido, sí se envía", async () => {
    envMock.DGII_TESTECF_SEND_ENABLED = "true";
    filas.push(doc({ status: "signed" }));
    const enviar = vi.fn(async () => ({ ok: true as const, to: "submitted" as const }));
    const r = await runQueueForBusiness({ businessId: "b1", handlers: { enviar } });
    expect(enviar).toHaveBeenCalledOnce();
    expect(r.advanced).toBe(1);
  });
});

describe("un documento roto no tumba el lote", () => {
  it("si un manejador lanza, se registra y se sigue con los demás", async () => {
    filas.push(
      doc({ id: "a", status: "generated" }),
      doc({ id: "b", status: "generated" }),
      doc({ id: "c", status: "generated" }),
    );
    const validar = vi.fn(async (id: string) => {
      if (id === "b") throw Object.assign(new Error("boom"), { code: "ECONNRESET" });
      return { ok: true as const, to: "validated" as const };
    });

    const r = await runQueueForBusiness({ businessId: "b1", handlers: { validar } });

    expect(validar).toHaveBeenCalledTimes(3);
    expect(r.advanced).toBe(2);
    expect(r.failed).toBe(1);
  });

  it("un manejador que devuelve error programa el reintento", async () => {
    filas.push(doc({ status: "generated" }));
    const validar = vi.fn(async () => ({
      ok: false as const,
      error: { httpStatus: 503 },
    }));
    const r = await runQueueForBusiness({ businessId: "b1", handlers: { validar } });
    expect(r.failed).toBe(1);
    expect(fallos).toHaveLength(1);
  });
});

describe("sin manejador", () => {
  it("no se finge que se hizo", async () => {
    // Fingir que se validó algo que nadie validó es peor que no validarlo.
    filas.push(doc({ status: "generated" }));
    const r = await runQueueForBusiness({ businessId: "b1", handlers: {} });
    expect(r.advanced).toBe(0);
    expect(r.waitingForSend).toBe(1);
    expect(transiciones).toHaveLength(0);
  });
});

describe("lo que no toca", () => {
  it("un documento con cita en el futuro no se procesa", async () => {
    filas.push(
      doc({ status: "generated", next_retry_at: "2099-01-01T00:00:00Z" }),
    );
    const validar = vi.fn();
    const r = await runQueueForBusiness({
      businessId: "b1",
      handlers: { validar },
      now: new Date("2026-08-04T20:00:00Z"),
    });
    expect(validar).not.toHaveBeenCalled();
    expect(r.picked).toBe(0);
  });

  it("sin candidatos, la pasada no hace nada", async () => {
    const r = await runQueueForBusiness({ businessId: "b1", handlers: {} });
    expect(r).toMatchObject({ found: 0, picked: 0, advanced: 0 });
  });
});
