import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MAX_LINES, MAX_QTY_PER_LINE } from "./cart";
import { toLocalPhoneDigits } from "./phone";

/**
 * El cuerpo que el checkout manda al servidor.
 *
 * Esta prueba existe por un fallo REAL en producción que dejó la tienda sin
 * poder vender: `FormData.get()` de un campo que no está en el DOM devuelve
 * **null**, `JSON.stringify` conserva el null (solo omite `undefined`), y el
 * esquema aceptaba `undefined` pero rechazaba `null`. Como los campos de envío
 * solo se pintan en modo envío y el selector de sucursal solo en modo retiro,
 * **siempre** viajaba algún null y **ningún** pedido podía completarse.
 *
 * El esquema se replica aquí a propósito, en vez de importarlo de la ruta: la
 * ruta arrastra `server-only` y no se puede cargar en una prueba. Si los dos se
 * separan, esta prueba deja de proteger — por eso el comentario de la ruta
 * apunta aquí.
 */
const CuerpoSchema = z.object({
  items: z
    .array(
      z.object({
        slug: z.string().min(1).max(200),
        qty: z.number().int().min(1).max(MAX_QTY_PER_LINE),
      }),
    )
    .min(1)
    .max(MAX_LINES),
  fulfillment: z.enum(["pickup", "delivery"]).default("pickup"),
  paymentMethod: z.enum(["efectivo", "transferencia"]).default("efectivo"),
  branchSlug: z.string().max(120).nullish(),
  province: z.string().max(120).nullish(),
  sector: z.string().max(120).nullish(),
  address: z.string().max(300).nullish(),
  reference: z.string().max(300).nullish(),
  contactName: z.string().trim().min(1).max(120),
  contactPhone: z
    .string()
    .transform((v) => toLocalPhoneDigits(v))
    .refine((v): v is string => v !== null, "Escribe un teléfono de 10 dígitos."),
  contactEmail: z
    .union([z.literal(""), z.string().trim().email().max(200)])
    .nullish(),
  notes: z.string().trim().max(500).nullish(),
  idempotencyKey: z.string().uuid(),
});

const UUID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

/** Lo que de verdad viaja: pasado por JSON, como en el navegador. */
function comoViaja(cuerpo: unknown) {
  return CuerpoSchema.safeParse(JSON.parse(JSON.stringify(cuerpo)));
}

describe("cuerpo del checkout", () => {
  const ITEMS = [{ slug: "avene-cicalfate", qty: 1 }];

  it("RETIRO: los campos de envío llegan en null y NO deben romper", () => {
    // Este es el fallo exacto. `province`, `sector` y `address` no existen en
    // el DOM cuando es retiro, así que `FormData.get()` devuelve null.
    const r = comoViaja({
      items: ITEMS,
      fulfillment: "pickup",
      paymentMethod: "efectivo",
      branchSlug: "cutis",
      province: null,
      sector: null,
      address: null,
      reference: null,
      contactName: "Willian Rodríguez",
      contactPhone: "809-555-1234",
      contactEmail: null,
      notes: null,
      idempotencyKey: UUID,
    });
    expect(r.success).toBe(true);
  });

  it("ENVÍO: la sucursal llega en null y tampoco debe romper", () => {
    const r = comoViaja({
      items: ITEMS,
      fulfillment: "delivery",
      paymentMethod: "efectivo",
      branchSlug: null,
      province: "santiago",
      sector: "Los Jardines",
      address: "Calle 5 #12",
      reference: null,
      contactName: "Ana Pérez",
      contactPhone: "8095551234",
      contactEmail: "",
      notes: null,
      idempotencyKey: UUID,
    });
    expect(r.success).toBe(true);
  });

  it("acepta los cuatro formatos de teléfono que escribe la gente", () => {
    for (const tel of [
      "809-555-1234",
      "+1 809-555-1234",
      "(809) 555-1234",
      "18095551234",
    ]) {
      const r = comoViaja({
        items: ITEMS,
        contactName: "Ana",
        contactPhone: tel,
        idempotencyKey: UUID,
      });
      expect(r.success, `falló con ${tel}`).toBe(true);
      if (r.success) expect(r.data.contactPhone).toBe("8095551234");
    }
  });

  it("sigue rechazando lo que de verdad está mal", () => {
    expect(
      comoViaja({
        items: ITEMS,
        contactName: "Ana",
        contactPhone: "809555",
        idempotencyKey: UUID,
      }).success,
    ).toBe(false);
    expect(
      comoViaja({
        items: [],
        contactName: "Ana",
        contactPhone: "8095551234",
        idempotencyKey: UUID,
      }).success,
    ).toBe(false);
    expect(
      comoViaja({
        items: ITEMS,
        contactName: "  ",
        contactPhone: "8095551234",
        idempotencyKey: UUID,
      }).success,
    ).toBe(false);
    // Clave de idempotencia inventada: sin ella un doble clic crea dos pedidos.
    expect(
      comoViaja({
        items: ITEMS,
        contactName: "Ana",
        contactPhone: "8095551234",
        idempotencyKey: "no-es-un-uuid",
      }).success,
    ).toBe(false);
  });

  it("el correo admite vacío, ausente y null, pero no uno mal escrito", () => {
    const base = {
      items: ITEMS,
      contactName: "Ana",
      contactPhone: "8095551234",
      idempotencyKey: UUID,
    };
    expect(comoViaja({ ...base, contactEmail: "" }).success).toBe(true);
    expect(comoViaja({ ...base, contactEmail: null }).success).toBe(true);
    expect(comoViaja(base).success).toBe(true);
    expect(
      comoViaja({ ...base, contactEmail: "  ana@correo.com  " }).success,
    ).toBe(true);
    expect(comoViaja({ ...base, contactEmail: "ana@correo" }).success).toBe(
      false,
    );
  });

  it("el error señala el CAMPO, para poder decirle a la persona qué arreglar", () => {
    const r = comoViaja({
      items: ITEMS,
      contactName: "Ana",
      contactPhone: "809",
      idempotencyKey: UUID,
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.error.issues[0]?.path[0]).toBe("contactPhone");
  });
});
