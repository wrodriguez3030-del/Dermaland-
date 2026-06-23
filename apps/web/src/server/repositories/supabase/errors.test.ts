import { describe, expect, it } from "vitest";
import {
  failRepo,
  friendlyForPgCode,
  mapSupabaseErrorToUserMessage,
  SupabaseRepositoryError,
  UserFacingRepositoryError,
  toUserFacingMessage,
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
    expect(e.message).toMatch(/ya existe/i);
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

  it("traduce 23502 (not null) a 'falta un dato obligatorio'", () => {
    const e = callFail("23502");
    expect(e).toBeInstanceOf(UserFacingRepositoryError);
    expect(e.message).toMatch(/falta un dato/i);
    expect(e.message).not.toMatch(/SupabaseRepository:/);
  });

  it("traduce 22P02 (uuid/formato inválido) a mensaje de formato", () => {
    const e = callFail("22P02");
    expect(e).toBeInstanceOf(UserFacingRepositoryError);
    expect(e.message).toMatch(/formato inválido/i);
    expect(e.message).not.toMatch(/SupabaseRepository:/);
  });

  it("traduce 42501 (RLS / sin permiso) a mensaje de permiso", () => {
    const e = callFail("42501");
    expect(e).toBeInstanceOf(UserFacingRepositoryError);
    expect(e.message).toMatch(/permiso/i);
    expect(e.message).not.toMatch(/SupabaseRepository:/);
  });

  it("traduce 22007 (fecha inválida) a mensaje de fecha", () => {
    const e = callFail("22007");
    expect(e).toBeInstanceOf(UserFacingRepositoryError);
    expect(e.message).toMatch(/fecha/i);
    expect(e.message).toMatch(/no es válida/i);
  });
});

describe("toUserFacingMessage", () => {
  it("deja pasar el mensaje amigable de un UserFacingRepositoryError", () => {
    const msg = toUserFacingMessage(
      new UserFacingRepositoryError("Ya existe un registro con ese valor (duplicado)."),
      "fallback",
    );
    expect(msg).toMatch(/duplicad/i);
  });

  it("NUNCA expone el prefijo técnico de un SupabaseRepositoryError", () => {
    const msg = toUserFacingMessage(
      new SupabaseRepositoryError("productLot.create", { code: "XX000", message: "boom" }),
      "No se pudo guardar el stock. Verifica la sucursal y vuelve a intentar.",
    );
    expect(msg).not.toMatch(/SupabaseRepository/);
    expect(msg).toMatch(/No se pudo guardar el stock/);
  });

  it("usa el fallback para errores desconocidos sin filtrar detalle técnico", () => {
    const msg = toUserFacingMessage(new Error("connect ECONNREFUSED 127.0.0.1:5432"), "Algo salió mal.");
    expect(msg).toBe("Algo salió mal.");
    expect(msg).not.toMatch(/ECONNREFUSED/);
  });

  it("mapea el código Postgres AUNQUE el repo lance SupabaseRepositoryError (RLS)", () => {
    // Caso real del cobro: el repo lanza SupabaseRepositoryError con la causa PG.
    const msg = toUserFacingMessage(
      new SupabaseRepositoryError("proforma.create", { code: "42501", message: "rls" }),
      "fallback",
    );
    expect(msg).toMatch(/permiso/i);
    expect(msg).not.toMatch(/SupabaseRepository/);
  });

  it("mapea duplicado (23505) desde la causa", () => {
    const msg = toUserFacingMessage(
      new SupabaseRepositoryError("proforma.create:items", { code: "23505", message: "dup" }),
      "fallback",
    );
    expect(msg).toMatch(/ya existe/i);
    expect(msg).not.toMatch(/SupabaseRepository/);
  });

  it("mapea un error PG crudo (objeto con code) directo", () => {
    expect(toUserFacingMessage({ code: "23503", message: "fk" }, "fb")).toMatch(/referencia|en uso/i);
  });

  it("mapSupabaseErrorToUserMessage es alias de toUserFacingMessage", () => {
    expect(mapSupabaseErrorToUserMessage).toBe(toUserFacingMessage);
  });

  it("ninguna entrada produce el prefijo técnico SupabaseRepository", () => {
    const inputs: unknown[] = [
      new SupabaseRepositoryError("sale.create", { code: "23505" }),
      new SupabaseRepositoryError("payment.create", { code: "42501" }),
      new SupabaseRepositoryError("cashSession.create", { message: "boom" }),
      new Error("violates row-level security policy"),
      { code: "23503", message: "foreign key constraint" },
      "duplicate key value violates unique constraint",
    ];
    for (const i of inputs) {
      expect(toUserFacingMessage(i, "No se pudo completar la operación.")).not.toMatch(
        /SupabaseRepository/,
      );
    }
  });
});

describe("friendlyForPgCode — mapeador central", () => {
  it("cubre los códigos comunes con mensajes amigables", () => {
    expect(friendlyForPgCode("23505")).toMatch(/ya existe/i);
    expect(friendlyForPgCode("23503")).toMatch(/referencia|en uso/i);
    expect(friendlyForPgCode("23502")).toMatch(/falta un dato/i);
    expect(friendlyForPgCode("42501")).toMatch(/permiso/i);
    expect(friendlyForPgCode("08006")).toMatch(/conectar/i);
  });
  it("devuelve undefined para códigos desconocidos", () => {
    expect(friendlyForPgCode("XX000")).toBeUndefined();
    expect(friendlyForPgCode(undefined)).toBeUndefined();
  });
});
