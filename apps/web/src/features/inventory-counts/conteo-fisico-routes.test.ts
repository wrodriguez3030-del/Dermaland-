import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

// Regresión del 404 en Inventario físico móvil: la ruta /movil hacía un lookup
// server-side contra el catálogo mock y `notFound()` para conteos reales de
// localStorage → 404. Ahora redirige a /escanear (que sí escanea con cámara y
// persiste en el conteo real).

const appDir = path.resolve(__dirname, "../../app/(app)/conteo-fisico/[id]");

function read(rel: string): string {
  return fs.readFileSync(path.join(appDir, rel), "utf-8");
}

describe("Inventario físico — rutas móviles (anti-404)", () => {
  it("2-3. /movil redirige a /escanear y NO usa notFound()", () => {
    const src = read("movil/page.tsx");
    expect(src).toContain("redirect(");
    expect(src).toContain("/escanear`");
    expect(src).not.toContain("notFound(");
    expect(src).not.toContain("getInventoryCountById");
  });

  it("1. el botón de la vista de escaneo NO enlaza a la ruta rota /movil", () => {
    const src = read("escanear/page.tsx");
    expect(src).not.toMatch(/\/movil/);
  });

  it("4. la vista de escaneo abre la cámara (BarcodeScanModal) con la misma lógica", () => {
    const src = read("escanear/page.tsx");
    expect(src).toMatch(/BarcodeScanModal/);
    expect(src).toMatch(/Escanear con cámara/);
    expect(src).toMatch(/scanCode\(codeScanned, "camera"\)/);
  });

  it("el detalle del conteo enlaza a /escanear (no a /movil)", () => {
    const src = read("page.tsx");
    expect(src).toMatch(/\/escanear/);
    expect(src).not.toMatch(/\/movil/);
  });
});
