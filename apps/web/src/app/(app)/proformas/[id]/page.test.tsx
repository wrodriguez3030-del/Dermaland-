// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Proforma } from "@/types";

// useParams varía por test mediante un estado hoisteado.
const { state } = vi.hoisted(() => ({ state: { id: "" } }));
vi.mock("next/navigation", () => ({
  useParams: () => ({ id: state.id }),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={typeof href === "string" ? href : "#"}>{children}</a>,
}));

import ProformaDetailPage from "./page";

const STORAGE_KEY = "dermaland.proformas";

const proforma: Proforma = {
  id: "prof_demo_xyz",
  number: "PROF-2026-00099",
  customerName: "María Pérez",
  customerPhone: "+1 809-555-0101",
  cashierId: "usr_1",
  cashierName: "Rosa Peralta",
  businessId: "biz_dermaland",
  branchId: "br_santiago",
  items: [
    {
      productId: "p1",
      productSku: "SKU1",
      productName: "Protector solar SPF50",
      quantity: 2,
      unitPrice: 500,
      itbisRate: 0.18,
      discount: 0,
      subtotal: 1000,
      itbis: 180,
      total: 1180,
    },
  ],
  subtotal: 1000,
  discount: 0,
  itbis: 180,
  total: 1180,
  status: "paid",
  payments: [
    {
      id: "pay_1",
      proformaId: "prof_demo_xyz",
      method: "card",
      amount: 1180,
      last4: "4242",
      userId: "usr_1",
      userName: "Rosa Peralta",
      createdAt: "2026-06-16T18:00:00Z",
    },
  ],
  paid: 1180,
  balance: 0,
  createdAt: "2026-06-16T18:00:00Z",
  updatedAt: "2026-06-16T18:00:00Z",
};

beforeEach(() => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([proforma]));
});
afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe("ProformaDetailPage", () => {
  it("muestra el documento existente (no 404): logo, negocio, RNC, número y DEMO", async () => {
    state.id = "prof_demo_xyz";
    render(<ProformaDetailPage />);

    // Datos de empresa
    expect(await screen.findByText("PROF-2026-00099")).toBeInTheDocument();
    expect(screen.getAllByText("DermaLand").length).toBeGreaterThan(0);
    expect(screen.getByText(/RNC 1-32-59077-5/)).toBeInTheDocument();
    // Logo presente
    const logo = screen.getByAltText("DermaLand") as HTMLImageElement;
    expect(logo.getAttribute("src")).toContain("dermaland-logo.svg");
    // Cliente y producto
    expect(screen.getByText("María Pérez")).toBeInTheDocument();
    expect(screen.getByText("Protector solar SPF50")).toBeInTheDocument();
    // Pago con últimos 4
    expect(screen.getByText(/4242/)).toBeInTheDocument();
    // Aviso DEMO / NO FISCAL visible
    expect(screen.getByText(/sin validez fiscal/i)).toBeInTheDocument();
    // Botón WhatsApp presente (ahora prepara el PDF y abre WhatsApp por acción,
    // ya no es un <a> con href; el enlace al PDF lo arma el servidor/cliente).
    expect(
      screen.getByText("Enviar WhatsApp").closest("button"),
    ).toBeInTheDocument();
  });

  it("documento inexistente muestra pantalla amigable, no 404", async () => {
    state.id = "prof_no_existe";
    render(<ProformaDetailPage />);
    expect(
      await screen.findByText("Documento no encontrado"),
    ).toBeInTheDocument();
    expect(screen.getByText("Ver proformas")).toBeInTheDocument();
    // No debe mencionar localStorage / otro navegador en el mensaje.
    expect(screen.queryByText(/localStorage/i)).toBeNull();
    expect(screen.queryByText(/otro navegador/i)).toBeNull();
  });
});
