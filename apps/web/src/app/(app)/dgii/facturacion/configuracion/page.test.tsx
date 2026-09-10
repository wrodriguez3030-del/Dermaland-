// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import BillingConfigPage from "./page";
import { resetBillingSettings, DEFAULT_BILLING_SETTINGS } from "@/features/billing/billing-settings-store";

/**
 * 🔴 Reportado por el dueño 10/09/2026: "seleccioné NCF tradicional y se
 * cambia a Ambos, no se debe cambiar sin el admin, no lo cambia [el admin]".
 *
 * Causa real: al montar, la pantalla pide la configuración al servidor
 * (`hidratarDesdeServidor`) en segundo plano. Si el admin elige un valor
 * ANTES de que esa respuesta llegue, cuando llega pisa la selección sin
 * preguntar — un efecto sincroniza `draft` con el store cada vez que el
 * store cambia, sin importar si el admin ya estaba editando.
 */
vi.mock("@/features/auth/current-user", () => ({
  useCurrentUser: () => ({ fullName: "Ana Admin", role: "admin" }),
}));

function mockFetchServidorLento(defaultBillingMode: string, delayMs: number) {
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (!init || init.method === undefined) {
      // GET /api/billing-settings (hidratación) — llega TARDE a propósito.
      return new Promise((resolve) =>
        setTimeout(
          () =>
            resolve({
              ok: true,
              json: async () => ({
                settings: { ...DEFAULT_BILLING_SETTINGS, defaultBillingMode },
              }),
            }),
          delayMs,
        ),
      );
    }
    // PATCH — captura el cuerpo enviado.
    return Promise.resolve({
      ok: true,
      json: async () => ({ settings: { ...DEFAULT_BILLING_SETTINGS, ...JSON.parse(init.body as string) } }),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  resetBillingSettings();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Configuración de facturación — la hidratación del servidor no pisa una edición en curso", () => {
  it("🔴 elegir NCF antes de que responda el servidor no vuelve a Ambos", async () => {
    mockFetchServidorLento("both", 50);
    render(<BillingConfigPage />);

    const select = await screen.findByDisplayValue(/ambos/i);
    fireEvent.change(select, { target: { value: "ncf" } });
    expect(screen.getByDisplayValue(/ncf tradicional/i)).toBeInTheDocument();

    // Espera a que la hidratación tardía del servidor termine de verdad.
    await new Promise((r) => setTimeout(r, 80));

    // 🔴 Si el bug reaparece, esto falla: el select vuelve a "Ambos".
    expect(screen.getByDisplayValue(/ncf tradicional/i)).toBeInTheDocument();
  });

  it("Guardar después de la hidratación tardía manda NCF, no Ambos", async () => {
    const fetchMock = mockFetchServidorLento("both", 50);
    render(<BillingConfigPage />);

    const select = await screen.findByDisplayValue(/ambos/i);
    fireEvent.change(select, { target: { value: "ncf" } });
    await new Promise((r) => setTimeout(r, 80));

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/billing-settings",
      expect.objectContaining({ method: "PATCH" }),
    ));

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    const body = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(body.defaultBillingMode).toBe("ncf");
  });

  it("🔴 Guardar también manda defaultCustomerBillingType (se perdía en silencio)", async () => {
    const fetchMock = mockFetchServidorLento("both", 0);
    render(<BillingConfigPage />);
    await screen.findByDisplayValue(/ambos/i);

    fireEvent.click(screen.getByRole("button", { name: /guardar/i }));
    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(patchCall).toBeTruthy();
    });

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    const body = JSON.parse((patchCall![1] as RequestInit).body as string);
    expect(body.defaultCustomerBillingType).toBe(DEFAULT_BILLING_SETTINGS.defaultCustomerBillingType);
  });
});
