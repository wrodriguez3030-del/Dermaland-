// Smoke test: verifica que la página de impresión de proformas no produzca
// hydration mismatch en el navegador. Útil para validar el fix sin abrir
// Chrome a mano.
//
//   node tests/hydration-proforma-print.mjs
//
// Requiere: dev server corriendo en :3031 y `playwright install chromium`.

import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://localhost:3031";

const URLS = [
  // Proforma seed (existe en mockProformas) — primero verás "Cargando…",
  // luego el ticket.
  `${BASE}/proformas/prof_2026_00185/print`,
  // Id inexistente — primero "Cargando…", luego "Proforma no encontrada".
  `${BASE}/proformas/__hydration_check_nonexistent__/print`,
];

const HYDRATION_PATTERNS = [
  /hydration failed/i,
  /text content does not match/i,
  /server rendered html/i,
  /did not match/i,
  /Hydration error/i,
];

let exitCode = 0;

const browser = await chromium.launch();
try {
  for (const url of URLS) {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const issues = [];

    page.on("pageerror", (e) => issues.push({ kind: "pageerror", text: String(e) }));
    page.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") {
        issues.push({ kind: m.type(), text: m.text() });
      }
    });

    const resp = await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForTimeout(800); // dar margen a la hidratación

    const status = resp?.status() ?? 0;
    const hydrationIssues = issues.filter((i) =>
      HYDRATION_PATTERNS.some((rx) => rx.test(i.text)),
    );

    const visible = await page.evaluate(() => {
      const root =
        document.querySelector(".receipt-print-page") ||
        document.querySelector(".receipt-80mm") ||
        document.body;
      return {
        hasReceipt: !!document.querySelector(".receipt-80mm"),
        hasNotFound: /Proforma no encontrada/.test(document.body.innerText),
        hasLoading: /Cargando proforma/.test(document.body.innerText),
        text: root.innerText.slice(0, 200),
      };
    });

    const ok = status === 200 && hydrationIssues.length === 0;
    if (!ok) exitCode = 1;

    console.log(`\n— ${url}`);
    console.log(`  HTTP: ${status}`);
    console.log(
      `  visible: receipt=${visible.hasReceipt} notFound=${visible.hasNotFound} loading=${visible.hasLoading}`,
    );
    console.log(`  hydration issues: ${hydrationIssues.length}`);
    if (hydrationIssues.length) {
      for (const i of hydrationIssues) console.log(`    [${i.kind}] ${i.text}`);
    }
    if (issues.length) {
      console.log(`  total console errors/warnings: ${issues.length}`);
      for (const i of issues.slice(0, 5)) {
        console.log(`    [${i.kind}] ${i.text.slice(0, 200)}`);
      }
    }

    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(exitCode === 0 ? "\n✅ No hydration mismatch detected." : "\n❌ Hydration issues found.");
process.exit(exitCode);
