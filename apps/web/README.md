# @dermaland/web

App Next.js principal — admin, POS, súper admin, sitio público.

## Estructura objetivo

```
apps/web/
├── src/
│   ├── app/
│   │   ├── (auth)/              login, signup, 2fa
│   │   ├── (admin)/             dashboard, clientes, inventario, POS, etc.
│   │   ├── (super-admin)/       solo platform_users
│   │   ├── (public)/            sitio público por business
│   │   └── api/
│   │       └── v3/              API pública versionada
│   ├── lib/
│   │   ├── supabase/            clientes browser/server/admin
│   │   ├── auth/                helpers de auth + RLS context
│   │   └── tenant/              guardas de business_id
│   └── components/
└── public/
    └── brand/                   logo, favicons (PENDIENTE del cliente)
```

> Estado actual: solo skeleton. Inicialización Next.js real al ejecutar primer `pnpm install` + `next dev` (después de definir si dev se hace en G: o en clon local — ver R-INF-01 en `riesgos.md`).
