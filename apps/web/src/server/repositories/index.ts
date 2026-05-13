/**
 * Factory de repositorios.
 *
 * Una capa de indirección que decide en runtime si las páginas leen de
 * mock data o de Supabase, controlado por `DATA_SOURCE` en `.env`.
 *
 * Uso típico (Server Component):
 *
 *   import { getRepositories } from "@/server/repositories";
 *   import { getRepoContext } from "@/server/auth/context";
 *
 *   const ctx = await getRepoContext();
 *   const { product, productLot } = getRepositories();
 *   const products = await product.list(ctx);
 *
 * Importante: NUNCA pasar el `ctx.businessId` desde un parámetro de URL —
 * siempre derivarlo del JWT del usuario autenticado.
 */

import { env } from "@/lib/env";
import type { Repositories } from "./types";
import { mockRepositories } from "./mock";
import { supabaseRepositories } from "./supabase";

let cached: Repositories | null = null;

export function getRepositories(): Repositories {
  if (cached) return cached;
  cached = env.DATA_SOURCE === "supabase" ? supabaseRepositories : mockRepositories;
  return cached;
}

export type { Repositories, RepoContext } from "./types";
