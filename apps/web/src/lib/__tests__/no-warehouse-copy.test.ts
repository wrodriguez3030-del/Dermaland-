/**
 * Guardian test: UI copy must say "sucursal", never expose warehouse/almacén to users.
 *
 * DOES NOT match:
 *  - "almacenamiento" / "almacena " (storage verb, not warehouse)
 *  - warehouseId / warehouse_id / WarehouseIcon (internal identifiers)
 *  - comments (lines starting with // or inside block comments)
 *
 * Fails if prohibited visible copy re-appears in operational screens.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const SRC = path.resolve(__dirname, "../../app/(app)");
const FEATURE_SRC = path.resolve(__dirname, "../../features");

const SCANNED_APP_DIRS = [
  "inventario",
  "productos",
  "conteo-fisico",
];

const SCANNED_FEATURE_DIRS = [
  "inventory",
  "products",
  "pos",
];

// Patterns that identify PROHIBITED visible copy (label/title/description text)
// Each must NOT match strings that are internal identifiers or storage-verb.
const PROHIBITED_PATTERNS: RegExp[] = [
  /lote y almac[eé]n/i,
  /sucursal\s*\/\s*almac[eé]n/i,
  /por almac[eé]n/i,
  /entre almacenes/i,
  /almac[eé]n\s+(origen|destino|principal)/i,
  /stock por almac[eé]n/i,
  // JSX text nodes / description strings that expose "Almacén" or "Almacenes" as label
  />\s*Almac[eé]n\s*</,
  />\s*Almacenes\s*</,
  // Option / label text patterns
  /todo el almac[eé]n/i,
  /todo[sa]? lo[sa]? almacenes/i,
  /sin almacenes/i,
  /nuevo almac[eé]n/i,
  /almac[eé]n eliminado/i,
];

// These strings are always safe to ignore — internal identifiers or storage verb
const SAFE_SUBSTRINGS = [
  "warehouseId",
  "warehouse_id",
  "WarehouseIcon",
  "almacenamiento",
  "almacena ",
  "almacenar",
  "// ",
  " * ",
  "AlmacenesPage", // redirect shim function name (not visible)
];

function isSafeLine(line: string): boolean {
  return SAFE_SUBSTRINGS.some((s) => line.includes(s));
}

function collectTsxFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsxFiles(full));
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.includes(".test.")) {
      results.push(full);
    }
  }
  return results;
}

function checkFile(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const violations: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (isSafeLine(line)) continue;

    for (const pattern of PROHIBITED_PATTERNS) {
      if (pattern.test(line)) {
        violations.push(
          `${filePath}:${i + 1} — matches ${pattern}: ${line.trim()}`,
        );
        break;
      }
    }
  }

  return violations;
}

describe("no-warehouse-copy guardian", () => {
  it("operational app screens contain no prohibited warehouse copy", () => {
    const files: string[] = [];

    for (const dir of SCANNED_APP_DIRS) {
      files.push(...collectTsxFiles(path.join(SRC, dir)));
    }
    for (const dir of SCANNED_FEATURE_DIRS) {
      files.push(...collectTsxFiles(path.join(FEATURE_SRC, dir)));
    }

    expect(files.length, "should find source files to scan").toBeGreaterThan(0);

    const allViolations: string[] = [];
    for (const file of files) {
      allViolations.push(...checkFile(file));
    }

    expect(
      allViolations,
      `Prohibited warehouse copy found:\n${allViolations.join("\n")}`,
    ).toHaveLength(0);
  });
});
