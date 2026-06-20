#!/usr/bin/env node
/**
 * Genera una PREVIEW_ADMIN_PASSWORD fuerte (cumple la política R-SEC-01) y la
 * guarda en apps/web/.env.local. NO imprime la contraseña (seguro para correr
 * desde cualquier entorno, incluido CI/asistente). Para verla, abrí el archivo.
 *
 * Uso: node scripts/gen-preview-password.mjs
 *
 * Política: 16 chars · mayúscula · minúscula · número · símbolo.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve(__dirname, "..", "apps", "web", ".env.local");

if (!fs.existsSync(ENV_PATH)) {
  console.error(`[gen-password] no existe ${ENV_PATH}`);
  process.exit(1);
}

// Sin caracteres ambiguos (0/O/1/l/I) ni problemáticos para .env.
const UP = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const LO = "abcdefghijkmnpqrstuvwxyz";
const DI = "23456789";
const SY = "!@%*-_+?";
const ALL = UP + LO + DI + SY;
const pick = (set) => set[crypto.randomInt(set.length)];

const chars = [pick(UP), pick(LO), pick(DI), pick(SY)];
for (let i = 0; i < 12; i++) chars.push(pick(ALL));
for (let i = chars.length - 1; i > 0; i--) {
  const j = crypto.randomInt(i + 1);
  [chars[i], chars[j]] = [chars[j], chars[i]];
}
const pw = chars.join("");

// Validación defensiva contra la misma política.
const okStrong =
  pw.length >= 12 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) &&
  /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw);
if (!okStrong) { console.error("[gen-password] generación inválida, reintentá."); process.exit(1); }

let content = fs.readFileSync(ENV_PATH, "utf8");
const pattern = /^PREVIEW_ADMIN_PASSWORD=.*$/m;
if (pattern.test(content)) {
  content = content.replace(pattern, () => `PREVIEW_ADMIN_PASSWORD=${pw}`);
} else {
  if (!content.endsWith("\n")) content += "\n";
  content += `PREVIEW_ADMIN_PASSWORD=${pw}\n`;
}
fs.writeFileSync(ENV_PATH, content, "utf8");

console.log("[gen-password] PREVIEW_ADMIN_PASSWORD generada y guardada en apps/web/.env.local.");
console.log("[gen-password] NO se imprime aquí. Para tu login, abrí ese archivo y copiá la línea PREVIEW_ADMIN_PASSWORD=.");
