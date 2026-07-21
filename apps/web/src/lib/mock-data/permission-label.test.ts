import { describe, it, expect } from "vitest";
import { permissionLabel } from "./users";

describe("permissionLabel", () => {
  it("clave exacta del catálogo → su descripción legible", () => {
    expect(permissionLabel("sales:create")).toBe("Crear ventas/proformas");
    expect(permissionLabel("audit:read")).toBe("Ver auditoría");
    expect(permissionLabel("payments:create")).toBe("Registrar pagos");
  });

  it("comodín `modulo:*` → 'Todo: {Módulo}'", () => {
    expect(permissionLabel("dgii:*")).toBe(
      "Todo: Facturación electrónica (DGII)",
    );
    expect(permissionLabel("cash:*")).toBe("Todo: Caja");
    expect(permissionLabel("users:*")).toBe("Todo: Usuarios");
  });

  it("`*` → 'Todos los permisos'", () => {
    expect(permissionLabel("*")).toBe("Todos los permisos");
  });

  it("patrón `a|b|c` → '{Módulo}: acción, acción'", () => {
    expect(permissionLabel("cash:open|close|change_closing_percentage")).toBe(
      "Caja: abrir, cerrar, cambiar % de cierre",
    );
    expect(permissionLabel("inventory:read|write|adjust|transfer")).toBe(
      "Inventario: ver, crear y editar, ajustar, transferir",
    );
    expect(permissionLabel("proformas:create|read")).toBe(
      "Proformas: crear, ver",
    );
  });

  it("clave fuera de catálogo → módulo + acción prettificados", () => {
    expect(permissionLabel("purchases:receive")).toBe("Compras: recibir");
    expect(permissionLabel("branch:read")).toBe("Sucursales: ver");
  });

  it("nunca devuelve la clave técnica cruda con dos puntos", () => {
    for (const key of [
      "sales:create",
      "dgii:*",
      "cash:open|close",
      "platform:*",
      "inventory_count:create|submit|mobile_scan",
    ]) {
      // La etiqueta no debe ser idéntica a la clave técnica.
      expect(permissionLabel(key)).not.toBe(key);
    }
  });
});
