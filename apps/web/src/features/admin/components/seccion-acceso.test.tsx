// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { SeccionAcceso } from "./seccion-acceso";
import type { UsuarioDelPanel } from "../user-store";

/**
 * 🔴 EL FALLO QUE ESTO CIERRA (08/09/2026)
 * ────────────────────────────────────────
 * Faltaba `USER_PASSWORD_VAULT_KEY` en el servidor. «Asignar clave» entonces no
 * hace NADA: el servidor comprueba la bóveda ANTES de tocar nada, así que ni
 * crea la cuenta de acceso ni guarda la clave.
 *
 * El dueño escribió la clave, dio a guardar, y lo que vio fue un aviso que
 * nombraba una variable de entorno. De ahí nadie deduce «esta persona sigue sin
 * poder entrar»: se fue al login, leyó «Invalid login credentials», y pareció
 * otro problema distinto. Se perdió una tarde entre los dos síntomas.
 *
 * Ahora la pantalla lo dice ANTES y no deja pulsar. Comprobado en la base
 * aquel día: cero filas en `auth.users` para esa persona y la bóveda VACÍA.
 */

const BASE: UsuarioDelPanel = {
  id: "u-1",
  businessId: "b1",
  email: "persona@dermaland.local",
  fullName: "Persona de prueba",
  role: "vendedor",
  branchIds: [],
  twoFactorEnabled: false,
  status: "active",
  avatarColor: "#1A7F8E",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  tieneCuenta: false,
} as unknown as UsuarioDelPanel;

const boton = () => screen.getByRole("button", { name: /Dar acceso|Cambiar la clave/ });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("«Acceso al sistema» cuando falta la bóveda", () => {
  it("🔴 lo AVISA antes de escribir nada, y nombra la llave", () => {
    render(<SeccionAcceso usuario={BASE} boveda={false} />);
    expect(screen.getByText(/no se pueden asignar todavía/i)).toBeInTheDocument();
    expect(screen.getByText("USER_PASSWORD_VAULT_KEY")).toBeInTheDocument();
  });

  it("🔴 con una clave VÁLIDA escrita, el botón sigue sin poder pulsarse", () => {
    // 🔴 Escribir la clave es el paso que importa: con el campo vacío el botón
    // ya está apagado por la política, y la prueba pasaría igual con la guarda
    // de la bóveda quitada. Sin este `change`, esta prueba no protege nada —
    // comprobado por mutación.
    render(<SeccionAcceso usuario={BASE} boveda={false} />);
    fireEvent.change(screen.getByLabelText(/Clave para darle acceso/i), {
      target: { value: "Kx7m-Rt4p-Wq9s" },
    });
    expect(boton()).toBeDisabled();
  });

  it("con la bóveda puesta, esa MISMA clave sí lo habilita", () => {
    // El contraste: si el botón estuviera apagado siempre, la prueba de arriba
    // pasaría sin comprobar la bóveda.
    render(<SeccionAcceso usuario={BASE} boveda={true} />);
    fireEvent.change(screen.getByLabelText(/Clave para darle acceso/i), {
      target: { value: "Kx7m-Rt4p-Wq9s" },
    });
    expect(boton()).toBeEnabled();
  });

  it("con la bóveda puesta no hay aviso ninguno", () => {
    render(<SeccionAcceso usuario={BASE} boveda={true} />);
    expect(screen.queryByText(/no se pueden asignar todavía/i)).not.toBeInTheDocument();
    expect(screen.queryByText("USER_PASSWORD_VAULT_KEY")).not.toBeInTheDocument();
  });

  it("mientras no se sabe, no se estorba", () => {
    // `undefined` es «la lista todavía no ha llegado». Pintar el aviso rojo ahí
    // sería asustar en cada carga.
    render(<SeccionAcceso usuario={BASE} boveda={undefined} />);
    expect(screen.queryByText(/no se pueden asignar todavía/i)).not.toBeInTheDocument();
  });

  it("🔴 sin cuenta se dice que HOY no puede entrar, no se insinúa lo contrario", () => {
    render(<SeccionAcceso usuario={BASE} boveda={true} />);
    expect(screen.getByText(/hoy NO puede entrar al sistema/i)).toBeInTheDocument();
  });
});
