// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { CondicionCards } from "./condition-cards";

afterEach(cleanup);

describe("CondicionCards", () => {
  it("muestra las 6 tarjetas por su nombre", () => {
    render(<CondicionCards activa={null} onSeleccionar={() => {}} onLimpiar={() => {}} />);
    for (const label of [
      "Manchas",
      "Acné",
      "Caspa",
      "Caída de cabello",
      "Filtro solar piel seca",
      "Filtro solar piel grasa",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("clic en una tarjeta llama a onSeleccionar con su clave", () => {
    const onSeleccionar = vi.fn();
    render(<CondicionCards activa={null} onSeleccionar={onSeleccionar} onLimpiar={() => {}} />);
    fireEvent.click(screen.getByText("Acné"));
    expect(onSeleccionar).toHaveBeenCalledWith("acne");
  });

  it("la tarjeta activa se marca con aria-pressed y aparece el chip «Filtrando por»", () => {
    render(<CondicionCards activa="acne" onSeleccionar={() => {}} onLimpiar={() => {}} />);
    const btn = screen.getByRole("button", { name: /^Acné$/ });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Filtrando por:")).toBeInTheDocument();
    expect(screen.getAllByText("Acné")).toHaveLength(2); // la tarjeta y el chip
  });

  it("clic en la tarjeta ya activa la desactiva (llama a onLimpiar, no a onSeleccionar)", () => {
    const onSeleccionar = vi.fn();
    const onLimpiar = vi.fn();
    render(<CondicionCards activa="acne" onSeleccionar={onSeleccionar} onLimpiar={onLimpiar} />);
    fireEvent.click(screen.getByRole("button", { name: /^Acné$/ }));
    expect(onLimpiar).toHaveBeenCalledTimes(1);
    expect(onSeleccionar).not.toHaveBeenCalled();
  });

  it("el chip «Filtrando por» también limpia la selección", () => {
    const onLimpiar = vi.fn();
    render(<CondicionCards activa="caspa" onSeleccionar={() => {}} onLimpiar={onLimpiar} />);
    fireEvent.click(screen.getByText("Filtrando por:").closest("button")!);
    expect(onLimpiar).toHaveBeenCalledTimes(1);
  });

  it("sin condición activa no aparece el chip", () => {
    render(<CondicionCards activa={null} onSeleccionar={() => {}} onLimpiar={() => {}} />);
    expect(screen.queryByText("Filtrando por:")).toBeNull();
  });
});
