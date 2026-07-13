# DermaLand · Production checklist

Revisión obligatoria antes de cada release a producción.

> **Estado verificado (2026-07-12, v0.70.1):** ver el informe con evidencias en
> `docs/production-readiness-report.md`. Veredicto: **APTO SOLO PARA PILOTO
> CONTROLADO**. Verde: RLS 56/56, cross-tenant 7/7 en vivo, 1721 tests, typecheck 0,
> build 0, decremento de stock atómico. **Bloqueadores para producción plena:**
> backup automático/probado (B-01, plan Free), atomicidad venta+inventario (B-02),
> devolución con reingreso de stock (B-03), MFA (B-04), vistas de conteo (B-05). El
> plan de arranque está en `docs/production-pilot-plan.md`.
>
> _La lista de abajo es la meta completa (SaaS multiempresa); muchos ítems aplican
> al escalado, no al piloto de 1 empresa._

## Backend (P1)

- [ ] Proyecto Supabase creado (no reusar el de `csl-app`).
- [ ] `DATABASE_URL` y claves añadidas a Vercel / proveedor.
- [ ] Migraciones SQL aplicadas (`supabase/migrations/0001_*.sql`, `0002_*.sql`).
- [ ] `DATA_SOURCE=supabase` en producción.
- [ ] Tipos generados con `supabase gen types` y commiteados.
- [ ] Trigger de claims JWT (`set_business_claim`) instalado.
- [ ] PITR de 7 días activado (Supabase Pro).
- [ ] Backup semanal del bucket `certificates` programado.

## Auth (P2)

- [ ] Supabase Auth configurada con providers email + Google opcional.
- [ ] Política de contraseña: mín 12, mayúsc/minúsc/número/símbolo.
- [ ] MFA TOTP **obligatorio** para `role IN ('admin','super_admin')`.
- [ ] Sesión 8h para súper admin · 7 días para usuarios normales.
- [ ] Reauthentication para acciones destructivas (impersonar, eliminar negocio).
- [ ] Middleware activo y `/super-admin` protegido por `is_platform_admin`.
- [ ] **Leaked Password Protection (HaveIBeenPwned)** activado en
      Authentication → Settings → Security. ⚠️ **Bloqueado en plan Free**
      (requiere Supabase Pro+). Riesgo aceptado temporal: ver
      `docs/riesgos.md` R-SEC-01. **Activar al subir a Pro, antes de
      producción SaaS real.**

## RLS y multi-tenant (P3)

- [ ] RLS habilitado en TODAS las tablas operativas.
- [ ] `auth_business_id()` y `auth_is_platform_admin()` instalados.
- [ ] Test de cross-tenant pasa (matriz de tablas → 0 rows leakage).
- [ ] Lint custom en CI: prohibido importar `@/lib/mock-data/*` desde `src/app/**`.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` solo en server actions con verificación explícita.

## Conteo móvil + Offline (P4, P5)

- [ ] PWA installable (manifest + sw + icons 192/512).
- [ ] BarcodeDetector probado en Chrome móvil real.
- [ ] @zxing/browser fallback probado en iOS Safari + desktop.
- [ ] Lector Bluetooth (Honeywell, Symbol) probado físicamente.
- [ ] IndexedDB funcionando offline 50+ scans sin pérdida.
- [ ] Reconexión sincroniza con idempotencia confirmada (índice único en `(device_id, offline_scan_id)`).
- [ ] Background Sync registrado y funcional.

## DGII e-CF (P6)

- [ ] Certificado `.p12` recibido del cliente y subido cifrado.
- [ ] Contraseña cifrada con KMS / Supabase Vault.
- [ ] Ambiente `cert` validado con DGII antes de pasar a `prod`.
- [ ] Todos los tipos e-CF (31, 32, 33, 34, 41, 43, 44, 45) probados.
- [ ] Modo contingencia activable si DGII está caído > 1h.
- [ ] Alertas configuradas: certificado < 30 días, secuencia < 100.

## WhatsApp Cloud API (P7)

- [ ] App Business + WABA configurados en Meta Business Manager.
- [ ] Plantillas críticas aprobadas (`envio_proforma`, `envio_factura_ecf`, `aviso_recall_lote`).
- [ ] Webhook URL registrada con verify token rotado.
- [ ] Validación de firma SHA-256 con app secret en POST.
- [ ] Counter de uso conectado a `business_usage_counters`.

## OpenAI / IA (P8)

- [ ] API key con scope mínimo (solo `chat.completions`).
- [ ] Tools registry validado — `validateToolName()` rechaza agendamiento.
- [ ] Test E2E: agente recibe "agéndame cita" → responde "no realizamos agendamientos".
- [ ] Counter de costos por business activo.
- [ ] Rate limit por agente (Upstash Redis) activado.

## Tests (P9)

- [ ] `pnpm test` pasa todos los unit tests.
- [ ] `pnpm test:e2e` pasa el smoke test.
- [ ] CI bloquea merge si typecheck/test/build falla.
- [ ] Cross-tenant E2E con dos businesses reales en CI.

## CI/CD (P10)

- [ ] `.github/workflows/ci.yml` activo.
- [ ] Branch `main` protegido: requiere PR + tests verdes + 1 review.
- [ ] Deploy preview por PR a Vercel.
- [ ] Deploy production solo desde `main` con manual approval.
- [ ] Sentry conectado (frontend + backend).

## Seguridad

- [ ] Secrets rotation: cada 90 días para tokens externos.
- [ ] CORS configurado: solo orígenes permitidos.
- [ ] CSP headers en `next.config.ts`.
- [ ] Rate limit en API V3 con Upstash Redis.
- [ ] Logs estructurados con `pino` — sin PII en logs.
- [ ] Auditoría completa para acciones sensibles.

## Performance

- [ ] Lighthouse mobile ≥ 85 en `/conteo-fisico/[id]/movil`.
- [ ] Lighthouse desktop ≥ 90 en `/`.
- [ ] First Load JS < 200KB en rutas críticas.
- [ ] k6: 100 usuarios concurrentes en POS sin degradación > 500ms p95.
- [ ] 10 dispositivos sincronizando conteos sin colisiones.

## Operación

- [ ] Runbook DGII en `docs/dgii-setup.md`.
- [ ] Runbook WhatsApp en `docs/whatsapp-setup.md`.
- [ ] Runbook backup/restore en `docs/runbook-backup.md`.
- [ ] Plan de DRP documentado.
- [ ] Lista de contactos de emergencia.
- [ ] Checklist de go-live firmada por cliente y equipo técnico.

## Cliente DermaLand específico

- [ ] Logo PNG/SVG entregados → en `apps/web/public/brand/`.
- [ ] Favicon 32×32, 64×64, 192×192, 512×512.
- [ ] Catálogo `data/import/productos-inicial.csv` con `precio_venta` y `barcode` completos.
- [ ] Datos del business confirmados en `decisiones.md` aplicados al seed real.
- [ ] Capacitación del equipo de la sucursal piloto Santiago.
