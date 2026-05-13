// Smoke browser test del POS:
//   - render limpio sin hydration warnings,
//   - selector de método de pago empieza vacío,
//   - "Documento a emitir" responde a la combinación
//     billingType + paymentMethod según resolveDocumentToIssue.
//
//   node apps/web/tests/pos-flow-smoke.mjs
//
// Requiere dev server en :3031 + chromium instalado vía Playwright.

import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3031";
const URL = `${BASE}/pos`;

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

  await page.goto(URL, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);

  const hydrationIssues = issues.filter((i) =>
    HYDRATION_PATTERNS.some((rx) => rx.test(i.text)),
  );

  // Estado inicial: no debe haber método de pago activo (aria-checked=true).
  const initialActive = await page.locator(
    'button[role=radio][aria-checked="true"]',
  ).count();

  // Agregar primer producto (botón con aria-label que empieza con "Agregar")
  // para tener el carrito con totales y el selector de método de pago.
  const addBtns = page.locator('button[aria-label^="Agregar"]');
  await addBtns.first().click();
  await page.waitForTimeout(200);

  // Indicador inicial sin método elegido.
  const docIndicatorBefore = await page
    .locator('text=Documento a emitir')
    .first()
    .locator('xpath=..')
    .innerText();

  // Click en Efectivo.
  await page.getByRole("radio", { name: "Efectivo" }).click();
  await page.waitForTimeout(150);
  const docAfterCash = await page
    .locator('text=Documento a emitir')
    .first()
    .locator('xpath=..')
    .innerText();
  const buttonAfterCash = await page
    .getByRole("button", { name: /Cobrar y emitir/ })
    .innerText();

  // Click en Tarjeta.
  await page.getByRole("radio", { name: "Tarjeta" }).click();
  await page.waitForTimeout(150);
  const docAfterCard = await page
    .locator('text=Documento a emitir')
    .first()
    .locator('xpath=..')
    .innerText();
  const buttonAfterCard = await page
    .getByRole("button", { name: /Cobrar y emitir/ })
    .innerText();

  // Click en Transferencia.
  await page.getByRole("radio", { name: "Transferencia" }).click();
  await page.waitForTimeout(150);
  const docAfterTransfer = await page
    .locator('text=Documento a emitir')
    .first()
    .locator('xpath=..')
    .innerText();
  const buttonAfterTransfer = await page
    .getByRole("button", { name: /Cobrar y emitir/ })
    .innerText();

  // Cambiar a Crédito Fiscal con tarjeta seleccionada.
  await page.getByRole("radio", { name: "Tarjeta" }).click();
  // El select de tipo de facturación está dentro de "Venta actual";
  // hay otro <select> en el header (probablemente sucursal) que hay que excluir.
  await page.getByRole("main").locator("select").selectOption("credito_fiscal");
  await page.waitForTimeout(150);
  const docAfterCreditFiscal = await page
    .locator('text=Documento a emitir')
    .first()
    .locator('xpath=..')
    .innerText();
  // El aviso vive en un div con border-amber-300; el texto completo es:
  // "Crédito fiscal requiere datos fiscales válidos del cliente (RNC). ..."
  const bodyText = await page.locator("body").innerText();
  const hasWarning =
    /requiere/i.test(bodyText) && /RNC/.test(bodyText);
  const creditFiscalWarning = hasWarning ? "ok" : "";
  if (!hasWarning) {
    console.log("\n[debug] body sample:");
    console.log(bodyText.slice(0, 1500));
  }

  // Reportar
  const checks = {
    hydrationIssues: hydrationIssues.length,
    initialPaymentActive: initialActive,
    docBefore: docIndicatorBefore.includes("—"),
    cashIsProforma: docAfterCash.includes("Proforma"),
    cardIsInvoiceConsumo:
      docAfterCard.includes("Factura") && docAfterCard.includes("Consumo"),
    transferIsProforma: docAfterTransfer.includes("Proforma"),
    creditFiscalIsInvoiceCF:
      docAfterCreditFiscal.includes("Crédito Fiscal") &&
      docAfterCreditFiscal.includes("Factura"),
    buttonCashEmitsProforma: /proforma/i.test(buttonAfterCash),
    buttonCardEmitsInvoice: /factura/i.test(buttonAfterCard),
    buttonTransferEmitsProforma: /proforma/i.test(buttonAfterTransfer),
    creditFiscalWarningShown: creditFiscalWarning === "ok",
  };

  let ok = true;
  console.log("\n=== POS Flow Smoke ===");
  console.log(`URL:                        ${URL}`);
  console.log(`Hydration issues:           ${checks.hydrationIssues}`);
  console.log(`Inicialmente sin método:    ${checks.initialPaymentActive === 0 ? "✅" : `❌ (active=${checks.initialPaymentActive})`}`);
  console.log(`Doc inicial = "—":          ${checks.docBefore ? "✅" : "❌"}`);
  console.log(`Efectivo  → Proforma:       ${checks.cashIsProforma ? "✅" : "❌"}`);
  console.log(`Tarjeta   → Factura Cons.:  ${checks.cardIsInvoiceConsumo ? "✅" : "❌"}`);
  console.log(`Transfer. → Proforma:       ${checks.transferIsProforma ? "✅" : "❌"}`);
  console.log(`Crédito Fiscal → Factura CF:${checks.creditFiscalIsInvoiceCF ? "✅" : "❌"}`);
  console.log(`Botón cash dice "proforma": ${checks.buttonCashEmitsProforma ? "✅" : "❌"}`);
  console.log(`Botón card dice "factura":  ${checks.buttonCardEmitsInvoice ? "✅" : "❌"}`);
  console.log(`Botón trans. "proforma":    ${checks.buttonTransferEmitsProforma ? "✅" : "❌"}`);
  console.log(`Aviso CF sin RNC:           ${checks.creditFiscalWarningShown ? "✅" : "❌"}`);

  for (const [key, val] of Object.entries(checks)) {
    if (key === "initialPaymentActive") {
      if (val !== 0) ok = false;
    } else if (key === "hydrationIssues") {
      if (val !== 0) ok = false;
    } else if (val === false) {
      ok = false;
    }
  }

  if (hydrationIssues.length) {
    console.log("\nHydration issues detalle:");
    for (const i of hydrationIssues) console.log(`  [${i.kind}] ${i.text}`);
  }

  await ctx.close();
  exitCode = ok ? 0 : 1;
} finally {
  await browser.close();
}

console.log(exitCode === 0 ? "\n✅ POS smoke OK." : "\n❌ POS smoke con fallos.");
process.exit(exitCode);
