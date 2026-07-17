// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(""),
}));

import DashboardPage from "./page";

afterEach(cleanup);

// Destino esperado de cada tarjeta KPI del dashboard. Todas son rutas REALES
// existentes en apps/web (ver árbol de app/(app)/…) → ningún click da 404.
const EXPECTED_CARD_LINKS = [
  // "Ventas del período" y "Clientes nuevos" ahora dependen de los filtros del
  // dashboard (sucursal/mes/año), así que enlazan a la vista general.
  "/ventas",
  "/productos",
  "/inventario/vencimientos?days=90",
  "/inventario/bloqueados",
  "/clientes",
  "/conteo-fisico?status=pending",
  "/caja",
  "/dgii",
];

describe("Dashboard — tarjetas KPI navegables", () => {
  it("cada tarjeta enlaza a su detalle con el filtro correcto", () => {
    const { container } = render(<DashboardPage />);
    const hrefs = new Set(
      Array.from(container.querySelectorAll("a[href]")).map((a) =>
        a.getAttribute("href"),
      ),
    );
    for (const href of EXPECTED_CARD_LINKS) {
      expect(hrefs.has(href), `falta enlace de tarjeta a ${href}`).toBe(true);
    }
  });

  it("cada tarjeta navegable expone un aria-label descriptivo (accesibilidad)", () => {
    const { container } = render(<DashboardPage />);
    for (const href of EXPECTED_CARD_LINKS) {
      const a = container.querySelector(`a[href='${href}']`);
      expect(a, `no se encontró la tarjeta ${href}`).not.toBeNull();
      expect(
        (a?.getAttribute("aria-label") ?? "").length,
        `la tarjeta ${href} debe tener aria-label`,
      ).toBeGreaterThan(0);
    }
  });

  it("ningún enlace del dashboard apunta a una ruta vacía o '#'", () => {
    const { container } = render(<DashboardPage />);
    for (const a of Array.from(container.querySelectorAll("a"))) {
      const href = a.getAttribute("href");
      expect(href, "hay un enlace sin href").not.toBeNull();
      expect(href).not.toBe("");
      expect(href).not.toBe("#");
    }
  });
});
