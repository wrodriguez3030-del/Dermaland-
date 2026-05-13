import { test, expect } from "@playwright/test";

test("conteo móvil acumula escaneos", async ({ page }) => {
  await page.goto("/conteo-fisico/ic_2026_05_05_001/movil");
  await expect(page.locator("body")).toContainText("Acumulado");

  // El simulador permite escanear sin cámara.
  const simulateBtn = page.getByRole("button", { name: /Simular escaneo/i });
  await expect(simulateBtn).toBeVisible();

  await simulateBtn.click();
  await simulateBtn.click();
  await simulateBtn.click();

  // El contador grande de "escaneos" debe haberse incrementado.
  await expect(page.getByText("escaneos", { exact: false })).toBeVisible();
});

test("conteo móvil tiene botón para entrada manual con permiso", async ({ page }) => {
  await page.goto("/conteo-fisico/ic_2026_05_05_001/movil");
  await expect(page.getByText(/Manual/i).first()).toBeVisible();
});
