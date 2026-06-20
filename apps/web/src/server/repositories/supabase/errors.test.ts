import { describe, expect, it } from "vitest";
import {
  failRepo,
  SupabaseRepositoryError,
  UserFacingRepositoryError,
} from "./client";

function callFail(code: string | undefined) {
  try {
    failRepo("brand.delete", code ? { code, message: "pg error" } : { message: "boom" });
  } catch (e) {
    return e as Error;
  }
  throw new Error("failRepo no lanzó");
}

describe("failRepo", () => {
  it("traduce 23505 (unique violation) a mensaje de duplicado", () => {
    const e = callFail("23505");
    expect(e).toBeInstanceOf(UserFacingRepositoryError);
    expect(e.message).toMatch(/duplicad/i);
    // El mensaje NO debe llevar el prefijo técnico.
    expect(e.message).not.toMatch(/SupabaseRepository:/);
  });

  it("traduce 23503 (FK violation) a 'en uso'", () => {
    const e = callFail("23503");
    expect(e).toBeInstanceOf(UserFacingRepositoryError);
    expect(e.message).toMatch(/en uso/i);
  });

  it("reenvía cualquier otro error como SupabaseRepositoryError", () => {
    const e = callFail(undefined);
    expect(e).toBeInstanceOf(SupabaseRepositoryError);
    expect(e.message).toMatch(/SupabaseRepository: brand\.delete/);
  });
});
