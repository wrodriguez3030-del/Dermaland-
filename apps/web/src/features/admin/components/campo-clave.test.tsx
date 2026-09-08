// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CampoClave } from "./campo-clave";
import { esClaveAceptable } from "@/lib/auth/password-generator";

/**
 * El campo donde el administrador pone la clave de alguien. Lo que se prueba:
 *
 *  · Empieza OCULTA. Quien crea un usuario suele tener a alguien al lado, y
 *    una clave a la vista es una clave que ya vio otra persona.
 *  · El ojo la enseña de verdad (cambia el `type`, no un truco visual).
 *  · «Generar» produce una clave que la política ACEPTA: si no, el
 *    administrador la pega, el servidor la rechaza y se queda con la persona
 *    delante y una ficha a medias.
 */
afterEach(cleanup);

function Campo({ inicial = "" }: { inicial?: string }) {
  const [v, setV] = require("react").useState(inicial) as [string, (x: string) => void];
  return <CampoClave valor={v} onChange={setV} />;
}

describe("CampoClave", () => {
  it("🔴 empieza oculta", () => {
    render(<Campo inicial="Kx7m-Rt4p-Wq9s" />);
    expect(screen.getByLabelText("Clave de acceso")).toHaveAttribute("type", "password");
  });

  it("🔴 el ojo la enseña y la vuelve a ocultar", () => {
    render(<Campo inicial="Kx7m-Rt4p-Wq9s" />);
    const campo = screen.getByLabelText("Clave de acceso");
    fireEvent.click(screen.getByLabelText("Ver la clave"));
    expect(campo).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByLabelText("Ocultar la clave"));
    expect(campo).toHaveAttribute("type", "password");
  });

  it("🔴 «Generar» pone una clave que la política acepta, y la enseña", () => {
    render(<Campo />);
    fireEvent.click(screen.getByLabelText("Generar una clave"));
    const campo = screen.getByLabelText("Clave de acceso") as HTMLInputElement;
    expect(esClaveAceptable(campo.value), `clave rechazada: ${campo.value}`).toBe(true);
    // Se enseña al generarla: hay que poder dictarla o copiarla.
    expect(campo).toHaveAttribute("type", "text");
  });

  it("avisa cuando lo escrito no cumple, y calla cuando sí", () => {
    render(<Campo />);
    const campo = screen.getByLabelText("Clave de acceso");
    fireEvent.change(campo, { target: { value: "corta" } });
    expect(screen.getByText(/12 caracteres|mínimo/i)).toBeInTheDocument();
    fireEvent.change(campo, { target: { value: "Kx7m-Rt4p-Wq9s" } });
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("vacío no avisa de nada: todavía no se ha escrito", () => {
    render(<Campo />);
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("copiar no revienta si el navegador no deja", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: () => Promise.reject(new Error("no")) } });
    render(<Campo inicial="Kx7m-Rt4p-Wq9s" />);
    fireEvent.click(screen.getByLabelText("Copiar la clave"));
    expect(screen.getByLabelText("Copiar la clave")).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
