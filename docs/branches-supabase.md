# Sucursales con Supabase (fuente única compartida)

Hoy las sucursales operan en **modo local** (`branch-store`, localStorage por
equipo) — por eso cada PC puede ver datos distintos. El código ya está listo
para usar **Supabase como fuente única compartida**; sólo falta provisionar la
DB y activar el flag. No requiere cambios de código.

## Qué ya está implementado

- Tabla `branches` (migración `0001`) con `status` (active/inactive),
  `deleted_at`, `is_pilot`, `show_on_website` y **RLS por `business_id`**.
- Repositorio Supabase `branchRepository`: `list({activeOnly})`, `byId`,
  `create`, `update`, `softDelete`.
- API de servidor (RLS por JWT): 
  - `GET /api/branches?scope=active|admin`
  - `POST /api/branches`
  - `PATCH /api/branches/[id]`
  - `DELETE /api/branches/[id]` (soft delete)
  Las rutas devuelven `409` mientras `DATA_SOURCE!=supabase` (modo local).
- Helpers cliente: `BRANCH_BACKEND` y `fetchBranchesFromServer(scope)`.

## Pasos para activar (cuando haya Supabase alcanzable)

1. **Provisionar** una instancia Supabase alcanzable para DermaLand
   (self-hosted db-cls o un proyecto Cloud) y aplicar migraciones
   `0001`–`0012` (no destructivas).
2. **Seed** de sucursales del negocio (Santiago/Naco/…); no cargar datos
   sensibles.
3. **Variables de entorno** (Preview primero, nunca tocar Production sin
   autorización):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `DATA_SOURCE=supabase` (servidor)
   - `NEXT_PUBLIC_DATA_SOURCE=supabase` (cliente → `BRANCH_BACKEND="supabase"`)
4. **Wiring final de UI** (1 paso pendiente): hacer que `useBranches` /
   `useActiveBranches` / `useCurrentBranch` y las mutaciones usen
   `fetchBranchesFromServer` + las rutas `POST/PATCH/DELETE` cuando
   `BRANCH_BACKEND==="supabase"` (hoy usan el store local). El contrato de
   datos (`Branch[]`) es el mismo, así que los consumidores no cambian.

## Resultado

Con Supabase activo, todas las PCs leen las **mismas** sucursales (activas para
operación, todas para Administración), las ediciones/bajas se reflejan en
tiempo real y desaparece la divergencia entre equipos. RLS garantiza que cada
negocio sólo vea sus sucursales (sin cross-business).
