# Deploy — Vercel

> Cómo se despliega DermaLand en Vercel. Ruta canónica de trabajo:
> `C:\dev\dermaland`. NUNCA correr Node.js / Vercel dentro de
> `H:\Mi unidad\PROYECTO DERMALAND\` (es Drive, sólo docs).

## Identidad del proyecto

| Campo | Valor |
|---|---|
| Scope (team)  | `wrodriguez3030-4801s-projects` (cuenta personal) |
| Proyecto      | `dermaland` |
| Producción    | https://dermaland.vercel.app |
| Repo GitHub   | https://github.com/wrodriguez3030-del/Dermaland- |
| Rama de producción en Vercel | `main` |
| Framework     | Next.js (App Router) |
| Versión Next  | **15.5.18** (no usar < 15.2.x; Vercel bloquea CVE) |
| Node Vercel   | 24.x |

## Vínculo del repo local con el proyecto

```powershell
cd C:\dev\dermaland
vercel link --yes --project dermaland
```

Esto crea `.vercel/project.json` (ignorado por git). El proyecto en Vercel
debe estar configurado con `rootDirectory = apps/web` (ya lo está; no
tocar a menos que cambie la estructura del monorepo).

## Variables de entorno

`.vercel/.env.preview.local` y `.vercel/.env.production.local` se generan
con `vercel pull` y son SECRETOS (están en `.gitignore` vía `.vercel/`).
**Nunca commitearlos.**

```powershell
cd C:\dev\dermaland
vercel pull --yes --environment=preview
vercel pull --yes --environment=production
```

Para editar variables ir al dashboard de Vercel o usar:

```powershell
vercel env ls
vercel env add <NOMBRE> production   # interactivo
```

## Deploy de preview

```powershell
cd C:\dev\dermaland
vercel deploy --yes
```

Las URLs `dermaland-*.vercel.app` (previews) están detrás de **Vercel
Deployment Protection**. Para probarlas anónimamente no se puede; usar:

```powershell
vercel curl https://<preview-url>/api/health
vercel curl -sI https://<preview-url>/clientes        # HEAD
```

## Deploy de producción

```powershell
cd C:\dev\dermaland
vercel deploy --prod --yes
```

Esto promociona el último build a `https://dermaland.vercel.app`.

Producción es **pública** (no requiere auth de Vercel). Las rutas
internas hoy siguen siendo accesibles porque la app corre con
`DATA_SOURCE=mock` y no hay sesión real todavía. Cuando se conecte
Supabase Auth, habrá que validar de nuevo el comportamiento.

## Smoke rápido tras un deploy

```bash
URL="https://dermaland.vercel.app"
for p in / /clientes /clientes/nuevo /productos /productos/nuevo \
         /inventario /conteo-fisico /pos /proformas /ventas /dgii \
         /super-admin /api/health; do
  code=$(curl -sI -o /dev/null -w "%{http_code}" "$URL$p")
  printf "  %-22s -> HTTP %s\n" "$p" "$code"
done
```

Las 13 deben devolver `200`.

## Reglas

- **NO** usar `git push --force` contra `main`.
- **NO** subir `.env*` ni `.vercel/` al repo (ya en `.gitignore`).
- **NO** cambiar el dominio de producción ni configurar DNS sin pedir confirmación.
- **NO** eliminar variables de entorno en Vercel sin respaldarlas primero.
- Cualquier bump de Next.js menor/mayor: probar `pnpm --filter web typecheck && pnpm --filter web build` en local antes de `vercel deploy`.

## Historial de incidentes de deploy

- **2026-05-13** · Vercel rechazó deploy con Next 15.1.6 por CVE
  (`Vulnerable version of Next.js detected`). Bump a **15.5.18** y deploy
  pasó. Ver commit `e7c4915`.
