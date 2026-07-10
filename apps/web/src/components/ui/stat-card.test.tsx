// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { StatCard } from "./stat-card";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/",
}));

afterEach(cleanup);

describe("StatCard — tarjeta navegable y accesible", () => {
  it("con href se renderiza como enlace navegable (toda la tarjeta)", () => {
    render(<StatCard label="Ventas hoy" value="RD$1,000" href="/ventas?period=today" />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/ventas?period=today");
    // El enlace envuelve el valor y la etiqueta → toda la tarjeta es clicable.
    expect(link).toHaveTextContent("Ventas hoy");
    expect(link).toHaveTextContent("RD$1,000");
  });

  it("expone aria-label por defecto (label: value) y permite personalizarlo", () => {
    const { rerender } = render(
      <StatCard label="Clientes nuevos" value={7} href="/clientes" />,
    );
    expect(screen.getByRole("link")).toHaveAccessibleName("Clientes nuevos: 7");

    rerender(
      <StatCard
        label="Clientes nuevos"
        value={7}
        href="/clientes"
        ariaLabel="Ver clientes nuevos"
      />,
    );
    expect(screen.getByRole("link")).toHaveAccessibleName("Ver clientes nuevos");
  });

  it("el enlace es enfocable por teclado (Enter navega de forma nativa)", () => {
    render(<StatCard label="Caja" value="RD$0" href="/caja" />);
    const link = screen.getByRole("link");
    link.focus();
    expect(link).toHaveFocus();
    // Un <a href> nativo no necesita tabindex para ser alcanzable por teclado.
    expect(link).not.toHaveAttribute("tabindex", "-1");
  });

  it("sin href NO es un enlace (tarjeta estática, compatible hacia atrás)", () => {
    render(<StatCard label="DGII" value="Inactivo" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Inactivo")).toBeInTheDocument();
  });
});
