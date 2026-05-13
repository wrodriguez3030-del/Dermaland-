# Comparación de versiones del proyecto DermaLand

> Snapshot de las dos copias del proyecto que existían en la PC al
> 2026-05-13 y por qué se eligió una. Útil si vuelve a aparecer otra
> carpeta candidata en el futuro.

## Las dos versiones encontradas

### A · `C:\Users\Admin\OneDrive\Escritorio\dermaland\`  (versión completa, ELEGIDA)

- 533 archivos sin `node_modules` · 231 fuentes (.ts/.tsx/.sql/.md).
- ~453 KB de fuente.
- Monorepo pnpm completo: `package.json`, `pnpm-lock.yaml`,
  `pnpm-workspace.yaml`, `tsconfig.base.json`, `.github/workflows/`,
  `apps/web/`, `supabase/migrations/`, `docs/` (15 archivos),
  `AGENTS.md`, `CLAUDE.md`, `PROJECT_MEMORY.md`, `README.md`.
- Módulos en `apps/web/src/app/(app)/`: admin, api-v3, caja, clientes,
  conteo-fisico, devoluciones, dgii, ia, inventario, notas-credito,
  pagos, pos, productos, proformas, recomendaciones, reportes, ventas,
  whatsapp. Más `(super-admin)/super-admin/`.
- Stack: Next.js 15 + React 19 + Tailwind 4 + Supabase SSR + Zod +
  ZXing + idb.
- Migraciones: `supabase/migrations/{0001_phase1_core,0002_phase2_inventory}.sql`.
- `PROJECT_MEMORY.md` (rev 2026-05-07) declara: Fase 0 ✅, Fases 1–8 ✅
  (75 rutas mock), P1–P11 ✅, build 78/78 ✓, 111 unit tests ✓.
- Actividad de archivos: 2026-05-05 a 2026-05-12.
- **NO** era un repo git (sin `.git/`).
- **Limitación**: vivía dentro de OneDrive — violaba la regla dura del
  propio proyecto: nunca correr Node.js dentro de Drive/OneDrive
  (riesgo R-INF-01). Por eso se copió a `C:\dev\dermaland\`.

### B · `H:\Mi unidad\PROYECTO DERMALAND\`  (solo docs/spec, DESCARTADA como código)

- 15 archivos · ~227 KB.
- Contiene **únicamente**: `SPEC.md` (23 KB), `plan-maestro.md` (13 KB),
  `decisiones.md` (28 KB), `riesgos.md` (22 KB), `SETUP-PC.md`,
  `README.md`, `CLAUDE.md` (Fase 0 only), `PROJECT_MEMORY.md` (Fase 0
  only), `docs/{comandos-locales,import-productos}.md`,
  `data/import/productos-inicial.csv` (catálogo 1342 productos),
  `.claude/settings.local.json`.
- **No tiene** `package.json`, `apps/`, `supabase/migrations/` ni
  código fuente.
- Es **la fuente de verdad** para el SPEC, el plan, los riesgos, las
  decisiones y el CSV de productos. Se conserva.
- Su propio `CLAUDE.md` dice textualmente: «El código vive en
  `C:\dev\dermaland\` — JAMÁS en Google Drive. Drive es sólo docs +
  CSV.»

### Otras rutas revisadas

| Ruta | Estado |
|---|---|
| `C:\dev` | Existía pero **vacía** — destino canónico |
| `C:\Proyectos` | No existía (referida sólo para DOCTORAPP) |
| `C:\Users\Admin\Downloads`, `Documents` | Sin DermaLand |
| `G:\Mi unidad` | Sin DermaLand |
| `D:`, `E:`, `F:` | No existen |

## Por qué A ganó

- A tenía el código real con 13 módulos del MVP, 78 rutas, 111 tests y
  build verde. B sólo tiene docs.
- B no contiene código.
- A no era git, pero el repo remoto sí existía
  (`https://github.com/wrodriguez3030-del/Dermaland-`) — sólo había que
  reinicializar git localmente y subir.

## Cómo se restauró (2026-05-13)

1. `robocopy "C:\Users\Admin\OneDrive\Escritorio\dermaland"
   "C:\dev\dermaland" /E /XD node_modules .next .turbo .git .vercel
   /XF .env .env.local .env.production *.p12 *.pfx *.key *.pem *.crt`
   → 228 archivos copiados, 0 secretos.
2. `git init` en `C:\dev\dermaland`, remote = repo de GitHub.
3. Rama `feature/restore-complete-project`. Commit local con 226
   archivos.
4. `pnpm install` + `pnpm --filter web typecheck` + `pnpm --filter web
   build` → todos verde.
5. `git push -u origin feature/restore-complete-project`.
6. `vercel link --yes --project dermaland`.
7. `vercel pull` (preview) + `vercel deploy --yes` →
   Vercel rechazó por **CVE de Next 15.1.6**. Bump a **15.5.18** →
   redeploy preview READY.
8. Smoke en preview: 13/13 rutas devuelven 200 (autenticado con
   `vercel curl`).
9. `git merge --strategy=ours --allow-unrelated-histories origin/main`
   en feature — preserva la Fase 0 como segundo padre, árbol = feature.
10. `git push origin HEAD:main` — fast-forward, no `--force`.
11. `vercel deploy --prod --yes` → producción READY en
    `https://dermaland.vercel.app`.
12. Smoke en prod: 13/13 rutas devuelven 200. `/` ya no es la landing
    Fase 0.

## Qué hacer si vuelve a aparecer una "carpeta candidata"

1. Listar `apps/`, `supabase/`, `docs/`, `package.json`, `pnpm-lock.yaml`.
2. Contar archivos `.ts/.tsx/.sql/.md` sin `node_modules`.
3. Leer `PROJECT_MEMORY.md` y comparar fecha + "Última sesión".
4. Si tiene `apps/web/src/app/(app)/{clientes,productos,inventario,pos,proformas,ventas,dgii}` y `apps/web/src/app/(super-admin)/super-admin/`, es candidata válida.
5. NO trabajar dentro de Drive/OneDrive. Copiar a `C:\dev\dermaland\`.
6. NO borrar la original — quedar con la copia segura en C:\dev y el
   original como respaldo.
