import { describe, expect, it } from "vitest";
import {
  namesCompatible,
  nameTokens,
  pickClientMatch,
  type ClientCandidate,
} from "./identity-match";

/** Las tres fichas reales de la base cuando se escribió esta regla. */
const WILLIAN: ClientCandidate = {
  id: "cli-420678",
  firstName: "WILLIAN R",
  lastName: "RODRIGUEZ",
  phoneDigits: "8297141975",
  whatsappDigits: "8097565900",
  emailNormalized: "rdarodriguez80@gmail.com",
  createdAt: "2026-06-21T03:13:45Z",
};

const ALAN: ClientCandidate = {
  id: "cli-521212",
  firstName: "Alan",
  lastName: "Rodriguez Bisono",
  phoneDigits: null,
  whatsappDigits: "8297141975", // el MISMO número que Willian: comparten la línea
  emailNormalized: null,
  createdAt: "2026-07-25T15:09:19Z",
};

describe("nameTokens", () => {
  it("parte el nombre y tira las iniciales sueltas", () => {
    expect(nameTokens("WILLIAN R RODRIGUEZ")).toEqual(["willian", "rodriguez"]);
  });

  it("quita tildes y signos", () => {
    expect(nameTokens("José Pérez-Gómez")).toEqual(["jose", "perez", "gomez"]);
  });

  it("aguanta lo vacío", () => {
    expect(nameTokens("")).toEqual([]);
    expect(nameTokens(null)).toEqual([]);
    expect(nameTokens("   ")).toEqual([]);
  });
});

describe("namesCompatible", () => {
  it("el caso real: el mostrador escribió la inicial y la tienda no", () => {
    expect(namesCompatible("WILLIAN R RODRIGUEZ", "Willian Rodriguez")).toBe(true);
  });

  it("da igual el orden y las mayúsculas", () => {
    expect(namesCompatible("Rodriguez Willian", "willian rodriguez")).toBe(true);
    expect(namesCompatible("José Pérez", "jose perez")).toBe(true);
  });

  it("un apellido compartido NO es la misma persona", () => {
    expect(namesCompatible("Willian Rodriguez", "Maria Rodriguez")).toBe(false);
    expect(namesCompatible("WILLIAN R RODRIGUEZ", "Alan Rodriguez Bisono")).toBe(
      false,
    );
  });

  it("sin nombre no se afirma nada", () => {
    expect(namesCompatible("", "Willian Rodriguez")).toBe(false);
    expect(namesCompatible(null, null)).toBe(false);
  });
});

describe("pickClientMatch", () => {
  it("el fallo que motivó todo esto: mismo número escrito de dos formas", () => {
    // El ERP guarda "829-714-1975" y la tienda mandaba "8297141975". Con un
    // `=` literal no casaban NUNCA y se creó una ficha duplicada de verdad.
    const m = pickClientMatch([WILLIAN], {
      fullName: "Willian Rodriguez",
      phone: "8297141975",
    });
    expect(m).toEqual({ id: "cli-420678", reason: "telefono" });
  });

  it("acepta el teléfono con +1, con guiones o con paréntesis", () => {
    for (const t of ["+1 829 714 1975", "829-714-1975", "(829) 714-1975", "18297141975"]) {
      expect(pickClientMatch([WILLIAN], { fullName: "Willian Rodriguez", phone: t }), t)
        .toEqual({ id: "cli-420678", reason: "telefono" });
    }
  });

  it("casa contra el WhatsApp aunque el número venga en el campo teléfono", () => {
    const m = pickClientMatch([WILLIAN], {
      fullName: "Willian Rodriguez",
      phone: "8097565900", // este número está en `whatsapp`, no en `phone`
    });
    expect(m?.id).toBe("cli-420678");
  });

  it("NO le mete la compra al hermano que comparte la línea de casa", () => {
    // Alan lleva el número de Willian en su WhatsApp. Si Alan pide en la
    // tienda, su pedido tiene que ir a la ficha de Alan y no a la de Willian.
    const m = pickClientMatch([WILLIAN, ALAN], {
      fullName: "Alan Rodriguez Bisono",
      phone: "8297141975",
    });
    expect(m?.id).toBe("cli-521212");
  });

  it("ante un nombre que no encaja con ninguna, prefiere no adivinar", () => {
    // La esposa compra con el teléfono de casa. Ninguna ficha es suya: se le
    // hace una. Una ficha de más se fusiona; una compra ajena no se ve.
    const m = pickClientMatch([WILLIAN, ALAN], {
      fullName: "Maria Fernandez",
      phone: "8297141975",
    });
    expect(m).toBeNull();
  });

  it("el correo manda sobre el teléfono y no mira el nombre", () => {
    // Una bandeja de entrada no se comparte. Y la gente se casa, cambia de
    // apellido y escribe su nombre de cinco maneras.
    const m = pickClientMatch([WILLIAN], {
      fullName: "W. Rodriguez de la Cruz",
      phone: "8091112222",
      email: "RDARodriguez80@Gmail.com  ",
    });
    expect(m).toEqual({ id: "cli-420678", reason: "correo" });
  });

  it("con varias fichas compatibles gana la más antigua", () => {
    const nueva: ClientCandidate = {
      ...WILLIAN,
      id: "cli-999999",
      createdAt: "2026-08-04T21:47:47Z",
    };
    // Se pasan en el orden "malo" a propósito: no puede depender del orden.
    const m = pickClientMatch([nueva, WILLIAN], {
      fullName: "Willian Rodriguez",
      phone: "8297141975",
    });
    expect(m?.id).toBe("cli-420678");
  });

  it("sin candidatas devuelve null", () => {
    expect(
      pickClientMatch([], { fullName: "Willian Rodriguez", phone: "8297141975" }),
    ).toBeNull();
  });

  it("un correo vacío no casa con las fichas sin correo", () => {
    // `email_normalized` es null cuando el ERP guardó "". Si el vacío casara,
    // TODOS los clientes sin correo serían la misma persona.
    const m = pickClientMatch([ALAN], { fullName: "Nadie", phone: "", email: "" });
    expect(m).toBeNull();
  });
});
