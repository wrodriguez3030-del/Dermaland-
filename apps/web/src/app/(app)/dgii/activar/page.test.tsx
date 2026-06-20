// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));

import ActivarFacturaElectronicaPage from "./page";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("Activar factura electrónica", () => {
  it("muestra título con 'beneficios', requisitos, beneficios y aviso de no envío", async () => {
    render(<ActivarFacturaElectronicaPage />);
    expect(
      await screen.findByText(/Pásate de forma voluntaria/i),
    ).toBeInTheDocument();
    expect(screen.getByText("beneficios")).toBeInTheDocument();
    // Requisitos previos
    expect(screen.getByText("Requisitos previos para comenzar")).toBeInTheDocument();
    expect(screen.getByText(/portal de certificación/i)).toBeInTheDocument();
    expect(screen.getByText(/Certificado de firma/i)).toBeInTheDocument();
    // Beneficios
    expect(screen.getByText("Beneficios económicos")).toBeInTheDocument();
    expect(screen.getByText("Más agilidad")).toBeInTheDocument();
    expect(screen.getByText("Cumplimiento tributario óptimo")).toBeInTheDocument();
    // Aviso de seguridad
    expect(
      screen.getByText(/No se enviará nada a DGII sin tu autorización/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/DEMO \/ NO FISCAL/i)).toBeInTheDocument();
  });

  it("sin progreso muestra 'Comenzar' que lleva a /dgii/habilitacion", () => {
    render(<ActivarFacturaElectronicaPage />);
    const comenzar = screen.getByText("Comenzar").closest("a");
    expect(comenzar).toHaveAttribute("href", "/dgii/habilitacion");
  });

  it("incluye un enlace de Ayuda", () => {
    render(<ActivarFacturaElectronicaPage />);
    expect(screen.getByText("Ayuda").closest("a")).toHaveAttribute("href", "/dgii");
  });
});
