import { describe, it, expect, vi, afterEach } from "vitest";
import { OpenAIProviderAdapter } from "./openai-adapter";

const adapter = () =>
  new OpenAIProviderAdapter("sk-secret-XYZ", { type: "openai", timeoutMs: 5000 });

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

afterEach(() => vi.restoreAllMocks());

describe("OpenAIProviderAdapter", () => {
  it("testConnection OK devuelve latencia y conteo de modelos", async () => {
    vi.stubGlobal("fetch", mockFetch(200, { data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini" }] }));
    const r = await adapter().testConnection();
    expect(r.ok).toBe(true);
    expect(r.modelsAvailable).toBe(2);
    expect(r.message).toBe("Proveedor conectado correctamente.");
  });

  it("401 devuelve mensaje AMIGABLE sin filtrar la clave ni el detalle", async () => {
    vi.stubGlobal("fetch", mockFetch(401, { error: { message: "Incorrect API key sk-secret-XYZ" } }));
    const r = await adapter().testConnection();
    expect(r.ok).toBe(false);
    expect(r.message).toBe("No pudimos validar la API key.");
    expect(r.message).not.toContain("sk-secret");
  });

  it("createResponse parsea texto, uso y tool calls (Responses API)", async () => {
    vi.stubGlobal("fetch", mockFetch(200, {
      status: "completed",
      output_text: "Hola, soy tu asistente.",
      output: [{ type: "function_call", name: "search_products", arguments: '{"q":"crema"}' }],
      usage: { input_tokens: 12, output_tokens: 8 },
    }));
    const r = await adapter().createResponse({ model: "gpt-4o-mini", input: "hola" });
    expect(r.text).toBe("Hola, soy tu asistente.");
    expect(r.usage).toEqual({ inputTokens: 12, outputTokens: 8 });
    expect(r.toolCalls).toEqual([{ name: "search_products", arguments: { q: "crema" } }]);
    expect(r.status).toBe("completed");
  });

  it("404 en createResponse → error de modelo no disponible (sin detalle crudo)", async () => {
    vi.stubGlobal("fetch", mockFetch(404, { error: { message: "model not found" } }));
    await expect(adapter().createResponse({ model: "inexistente", input: "x" }))
      .rejects.toThrow("El modelo seleccionado no está disponible para esta conexión.");
  });

  it("403 model_not_found → proyecto sin acceso al modelo (regresión: key con modelos limitados)", async () => {
    // Proyecto OpenAI con "Limits → Model usage": /models responde OK pero
    // /responses da 403 model_not_found si el modelo no está en la lista.
    vi.stubGlobal("fetch", mockFetch(403, { error: { code: "model_not_found", message: "Project does not have access" } }));
    await expect(adapter().createResponse({ model: "gpt-4o-mini", input: "x" }))
      .rejects.toThrow(/El proyecto de la API key no tiene acceso al modelo configurado/);
  });

  it("estima costo por modelo conocido y null por desconocido", async () => {
    const a = adapter();
    expect(await a.calculateEstimatedCost({ inputTokens: 1000, outputTokens: 1000 }, "gpt-4o-mini")).toBeGreaterThan(0);
    expect(await a.calculateEstimatedCost({ inputTokens: 1000, outputTokens: 1000 }, "modelo-x")).toBeNull();
  });

  it("no incluye la API key en la URL (va en header Authorization)", async () => {
    const f = mockFetch(200, { data: [] });
    vi.stubGlobal("fetch", f);
    await adapter().testConnection();
    const url = (f.mock.calls[0]?.[0] ?? "") as string;
    expect(url).not.toContain("sk-secret");
    expect(url).toContain("/models");
  });

  it("descarta org/project SIN formato OpenAI (regresión: 'Dermaland' causaba HTTP 400)", async () => {
    const f = mockFetch(200, { data: [] });
    vi.stubGlobal("fetch", f);
    const bad = new OpenAIProviderAdapter("k", {
      type: "openai",
      organizationId: "Dermaland", // texto libre → NO se envía
      projectId: "Dermaland",
    });
    await bad.testConnection();
    const headers = (f.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers["OpenAI-Organization"]).toBeUndefined();
    expect(headers["OpenAI-Project"]).toBeUndefined();
  });

  it("SÍ envía org/project con formato real (org-… / proj_…)", async () => {
    const f = mockFetch(200, { data: [] });
    vi.stubGlobal("fetch", f);
    const good = new OpenAIProviderAdapter("k", {
      type: "openai",
      organizationId: "org-abc123",
      projectId: "proj_xyz789",
    });
    await good.testConnection();
    const headers = (f.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers["OpenAI-Organization"]).toBe("org-abc123");
    expect(headers["OpenAI-Project"]).toBe("proj_xyz789");
  });
});
