import { test, expect } from "@playwright/test";

const ROUTES = [
  { path: "/", text: "Dashboard" },
  { path: "/productos", text: "Productos" },
  { path: "/inventario", text: "Stock actual" },
  { path: "/conteo-fisico", text: "Conteo físico" },
  { path: "/conteo-fisico/ic_2026_05_05_001/movil", text: "Acumulado" },
  { path: "/pos", text: "POS" },
  { path: "/clientes", text: "Clientes" },
  { path: "/recomendaciones", text: "Recomendaciones" },
  { path: "/reportes", text: "Reportes" },
  { path: "/super-admin", text: "Súper Admin" },
  { path: "/dgii", text: "DGII" },
  { path: "/whatsapp/conversaciones", text: "Conversaciones" },
  { path: "/api/health", text: "ok" },
];

for (const r of ROUTES) {
  test(`smoke: ${r.path}`, async ({ page }) => {
    const response = await page.goto(r.path);
    expect(response?.ok()).toBeTruthy();
    await expect(page.locator("body")).toContainText(r.text);
  });
}
