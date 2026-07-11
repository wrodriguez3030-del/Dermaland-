import "server-only";
import type { AIProviderAdapter, AdapterConfig, ProviderType } from "./types";
import { OpenAIProviderAdapter } from "./openai-adapter";

/**
 * Crea el adaptador correcto para un proveedor. La API key llega YA descifrada
 * (server-only) y nunca se persiste. Agregar un proveedor futuro = un `case`
 * aquí + su adaptador; los agentes/tools no cambian.
 */
export function createAdapter(
  apiKey: string,
  config: AdapterConfig,
): AIProviderAdapter {
  switch (config.type) {
    case "openai":
    case "openai_compatible":
      return new OpenAIProviderAdapter(apiKey, config);
    default:
      throw new Error(
        `El proveedor "${config.type}" todavía no tiene un adaptador funcional.`,
      );
  }
}

export const IMPLEMENTED_PROVIDERS: ProviderType[] = ["openai", "openai_compatible"];
export function isProviderImplemented(type: ProviderType): boolean {
  return IMPLEMENTED_PROVIDERS.includes(type);
}
