import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.{ts,tsx}", "tests/unit/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**", "node_modules/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` por diseño lanza al importar fuera de un Server
      // Component. Vitest corre en entorno node sin esa distinción → stub.
      "server-only": path.resolve(
        __dirname,
        "./src/test/server-only-stub.ts",
      ),
    },
  },
});
