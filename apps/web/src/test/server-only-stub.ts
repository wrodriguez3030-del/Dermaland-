// Stub vacío para `server-only` durante los tests vitest.
// En producción, Next.js resuelve el package real que lanza si se importa
// desde un Client Component. En vitest (entorno node, sin distinción
// client/server) ese guard no aplica y debe quedar inerte.
export {};
