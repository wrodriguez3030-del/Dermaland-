import { describe, expect, it } from "vitest";
import { diagnosticarNegacion } from "./geolocation-diagnosis";

describe("diagnosticarNegacion", () => {
  it("ya estaba bloqueado para esta página → navegador", () => {
    expect(diagnosticarNegacion("denied", "denied")).toBe("navegador");
  });

  it("acaba de pulsar «Bloquear» en el diálogo → navegador", () => {
    // Antes se podía preguntar; el rechazo quedó anotado.
    expect(diagnosticarNegacion("prompt", "denied")).toBe("navegador");
  });

  it("sigue en «preguntar» tras el rechazo → lo bloquea el sistema", () => {
    // Es el caso del Mac con Localización apagada para el navegador: falla al
    // instante, sin diálogo, y no hay decisión que anotar.
    expect(diagnosticarNegacion("prompt", "prompt")).toBe("sistema");
  });

  it("sin navigator.permissions se supone el navegador, que es lo común", () => {
    expect(diagnosticarNegacion("desconocido", "desconocido")).toBe("navegador");
  });

  it("concedido y aun asi denegado no manda a nadie a la config. del sistema", () => {
    // No deberia ocurrir. Si ocurre, la salida segura es la barata de
    // comprobar, no mandar al cliente a hurgar en su Mac.
    expect(diagnosticarNegacion("granted", "granted")).toBe("navegador");
  });
});
