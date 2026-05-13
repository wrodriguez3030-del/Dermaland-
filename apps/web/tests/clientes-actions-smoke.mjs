// Smoke browser de las acciones de clientes:
//   - listado tiene botones Ver/Editar/Eliminar visibles,
//   - doble click en fila lleva al perfil,
//   - perfil tiene botón "Editar cliente" que lleva a /clientes/[id]/editar,
//   - editar abre el formulario con datos y permite guardar sin disparar
//     "duplicado de sí mismo",
//   - tras guardar redirige al perfil con dato actualizado,
//   - eliminar pide confirmación (no se confirma para no afectar mocks).
//
//   node apps/web/tests/clientes-actions-smoke.mjs

import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3031";
const SEED_ID = "cust_001";
const HYDRATION_PATTERNS = [
  /hydration failed/i,
  /text content does not match/i,
  /server rendered html/i,
  /did not match/i,
];

let exitCode = 0;
const browser = await chromium.launch();

try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const issues = [];
  page.on("pageerror", (e) => issues.push({ kind: "pageerror", text: String(e) }));
  page.on("console", (m) => {
    if (m.type() === "error" || m.type() === "warning") {
      issues.push({ kind: m.type(), text: m.text() });
    }
  });

  const checks = {};

  // 1. Ir al listado de clientes.
  await page.goto(`${BASE}/clientes`, { waitUntil: "networkidle" });
  // Esperar a que useEffect haga el merge mock+local (puede tomar un tick).
  await page.waitForSelector('a[aria-label="Ver"]', { timeout: 5000 });
  await page.waitForTimeout(300);

  const rowCount = await page.locator("tbody tr").count();
  checks.tbodyRows = rowCount;

  // 2. Verificar que botones inline existan en alguna fila.
  checks.hasVer = (await page.locator('a[aria-label="Ver"]').count()) > 0;
  checks.hasEditar = (await page.locator('a[aria-label="Editar"]').count()) > 0;
  checks.hasEliminar =
    (await page.locator('button[aria-label="Eliminar"]').count()) > 0;

  // 3. Doble click en la primera fila → debe ir a /clientes/<id>.
  //    Usamos waitForURL en lugar de networkidle (router.push es client-side
  //    y puede no producir tráfico de red apreciable).
  const firstRow = page.locator("tbody tr").first();
  // Click sobre una celda "neutra" (Documento) para que no nos roben el
  // dblclick los <Link> del nombre o el cell de acciones.
  const neutralCell = firstRow.locator("td").nth(2);
  await neutralCell.dblclick();
  try {
    await page.waitForURL(/\/clientes\/[^/]+$/, { timeout: 5000 });
  } catch {
    // se reportará abajo
  }
  checks.dblClickGoesToProfile = /\/clientes\/[^/]+$/.test(page.url());

  // 4. En el perfil, debe existir el botón "Editar cliente".
  const editBtn = page.getByRole("link", { name: /editar cliente/i });
  checks.profileHasEditButton = (await editBtn.count()) > 0;

  // 5. Click en "Editar cliente" → /clientes/<id>/editar.
  if (checks.profileHasEditButton) {
    await editBtn.first().click();
    try {
      await page.waitForURL(/\/clientes\/[^/]+\/editar$/, { timeout: 5000 });
    } catch {
      // se reporta abajo
    }
    checks.editButtonNavigates = /\/clientes\/[^/]+\/editar$/.test(page.url());
  }

  // 6. Ir directo al editar de un id conocido y verificar que el form
  //    está pre-poblado y NO muestra "ya fue registrado" como duplicado
  //    de sí mismo.
  await page.goto(`${BASE}/clientes/${SEED_ID}/editar`, {
    waitUntil: "networkidle",
  });
  await page.waitForTimeout(700);

  const firstNameInput = page.locator('input').nth(0);
  const filledFirstName = await firstNameInput.inputValue();
  checks.editFormPrefilled = filledFirstName.length > 0;

  const bodyText = await page.locator("body").innerText();
  checks.noSelfDuplicateBanner =
    !/Este cliente ya fue registrado/i.test(bodyText);

  // 7. Cambiar tipo de piel y guardar. Esperamos redirect al perfil.
  const skinSelect = page
    .locator('select')
    .filter({ has: page.locator('option[value="oily"]') })
    .first();
  if ((await skinSelect.count()) > 0) {
    await skinSelect.selectOption("oily");
  }
  await page.getByRole("button", { name: /guardar cambios/i }).first().click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(900);
  checks.afterSaveOnProfile = /\/clientes\/[^/]+$/.test(page.url());

  // 8. Volver al listado y validar que el botón Eliminar abre confirmación
  //    (sin confirmar — sólo verificamos que el diálogo aparece).
  await page.goto(`${BASE}/clientes`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const firstDeleteBtn = page.locator('button[aria-label="Eliminar"]').first();
  await firstDeleteBtn.click();
  await page.waitForTimeout(250);
  const confirmText = await page.locator("body").innerText();
  checks.deleteAsksConfirm =
    /confirmar eliminar/i.test(confirmText) ||
    /no se puede deshacer/i.test(confirmText) ||
    /está seguro/i.test(confirmText);
  // Cancelar el diálogo para no mutar el listado.
  const cancelBtn = page.getByRole("button", { name: /cancelar/i }).first();
  if ((await cancelBtn.count()) > 0) await cancelBtn.click();
  await page.waitForTimeout(150);

  const hydrationIssues = issues.filter((i) =>
    HYDRATION_PATTERNS.some((rx) => rx.test(i.text)),
  );
  checks.hydrationIssues = hydrationIssues.length;

  // Campos puramente diagnósticos (no booleanos) no cuentan como fallo.
  const diagnosticKeys = new Set(["tbodyRows"]);

  console.log("\n=== Clientes acciones smoke ===");
  for (const [k, v] of Object.entries(checks)) {
    if (diagnosticKeys.has(k)) {
      console.log(`  ℹ️   ${k}: ${v}`);
      continue;
    }
    const ok = k === "hydrationIssues" ? v === 0 : v === true;
    console.log(`  ${ok ? "✅" : "❌"}  ${k}: ${v}`);
    if (!ok) exitCode = 1;
  }

  if (hydrationIssues.length) {
    console.log("\nHydration issues detalle:");
    for (const i of hydrationIssues) console.log(`  [${i.kind}] ${i.text}`);
  }

  await ctx.close();
} finally {
  await browser.close();
}

console.log(
  exitCode === 0 ? "\n✅ Clientes acciones smoke OK." : "\n❌ Clientes smoke con fallos.",
);
process.exit(exitCode);
