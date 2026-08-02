// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { UserMenu } from "./user-menu";

const USER = {
  id: "u1",
  fullName: "Dario Rodríguez",
  role: "admin" as const,
  avatarColor: "#1A7F8E",
  isPlatformAdmin: false,
};

afterEach(cleanup);

describe("UserMenu", () => {
  it("muestra el nombre y las iniciales del usuario", () => {
    render(<UserMenu user={USER} />);
    expect(screen.getByText("Dario Rodríguez")).toBeInTheDocument();
    expect(screen.getByText("DR")).toBeInTheDocument();
  });

  it("empieza cerrado: 'Cerrar sesión' no está visible", () => {
    render(<UserMenu user={USER} />);
    expect(screen.queryByRole("menuitem", { name: /cerrar sesión/i })).not.toBeInTheDocument();
  });

  it("al abrirlo aparece 'Cerrar sesión'", () => {
    render(<UserMenu user={USER} />);
    fireEvent.click(screen.getByRole("button", { name: /abrir menú de usuario/i }));
    expect(screen.getByRole("menuitem", { name: /cerrar sesión/i })).toBeInTheDocument();
  });

  it("'Cerrar sesión' envía un formulario (server action), no es un enlace", () => {
    render(<UserMenu user={USER} />);
    fireEvent.click(screen.getByRole("button", { name: /abrir menú de usuario/i }));
    const item = screen.getByRole("menuitem", { name: /cerrar sesión/i });
    expect(item.tagName).toBe("BUTTON");
    expect(item).toHaveAttribute("type", "submit");
    expect(item.closest("form")).not.toBeNull();
  });

  it("ofrece también el acceso a seguridad de la cuenta", () => {
    render(<UserMenu user={USER} />);
    fireEvent.click(screen.getByRole("button", { name: /abrir menú de usuario/i }));
    expect(screen.getByRole("menuitem", { name: /seguridad/i })).toHaveAttribute(
      "href",
      "/perfil/seguridad",
    );
  });

  it("el botón refleja el estado de apertura para lectores de pantalla", () => {
    render(<UserMenu user={USER} />);
    const trigger = screen.getByRole("button", { name: /abrir menú de usuario/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
  });

  it("se cierra con la tecla Escape", () => {
    render(<UserMenu user={USER} />);
    fireEvent.click(screen.getByRole("button", { name: /abrir menú de usuario/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menuitem", { name: /cerrar sesión/i })).not.toBeInTheDocument();
  });

  it("un nombre de una sola palabra produce una sola inicial", () => {
    render(<UserMenu user={{ ...USER, fullName: "Dario" }} />);
    expect(screen.getByText("D")).toBeInTheDocument();
  });
});
