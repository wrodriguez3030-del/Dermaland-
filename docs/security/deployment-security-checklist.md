# Checklist de seguridad para producción — DermaLand

Marcar antes de operar con datos/dinero reales y múltiples empresas.
(`[x]` = verificado en la auditoría 2026-07-12; `[ ]` = pendiente.)

## Supabase / Base de datos
- [x] RLS habilitado en las 56 tablas (`business_id = auth_business_id()`).
- [x] Sin funciones `SECURITY DEFINER` en `public`; helpers con `search_path` fijo.
- [ ] **Aplicar migración `0026`** (quitar fallback `user_metadata` en RLS — SEC-001).
- [ ] Limpiar `raw_user_meta_data` (business_id/role/is_platform_admin) de usuarios existentes.
- [ ] Prueba cross-tenant e2e con 2 empresas antes de onboardear la 2ª.
- [ ] Backups automáticos + PITR habilitados y probados.

## Vercel / Next.js
- [x] Cabeceras de seguridad (nosniff, X-Frame-Options DENY, HSTS, Referrer/Permissions-Policy).
- [ ] CSP: introducir en `Content-Security-Policy-Report-Only` primero, luego enforce.
- [x] Sin `NEXT_PUBLIC_*` con secretos; `service_role` server-only.
- [ ] Deshabilitar/proteger source maps públicos en prod.
- [ ] Preview deployments: env de Supabase separada o sin datos reales.

## Auth / Sesiones
- [x] Claims de autorización desde `app_metadata` (no `user_metadata`) — SEC-001.
- [x] Sesión en cookies httpOnly (no localStorage).
- [ ] MFA para Súper Admin y admins de empresa (no implementado — proponer con Supabase MFA/TOTP).
- [ ] Política de bloqueo por fuerza bruta (rate-limit login).

## Secretos
- [x] `.env` gitignoreado; sin secretos en el repo.
- [ ] **Setear `DOCUMENT_SHARE_SECRET`** fuerte en prod (SEC-003) o dejar la función deshabilitada.
- [x] `AI_CREDENTIALS_ENCRYPTION_KEY` y `DGII_CERT_ENCRYPTION_KEY` configuradas y exigidas.
- [ ] Rotación documentada de service_role / master keys (ver `secrets-management`).

## POS / Finanzas / Inventario
- [x] Recompute server-side de totales al emitir (SEC-002).
- [ ] Descuento de stock atómico (SEC-010) — RPC con `WHERE current_quantity >= n`.
- [ ] Idempotencia de emisión (SEC-011).
- [ ] Tope de descuento por rol (SEC-012); gate de rol en cancelar (SEC-013).
- [x] Numeración NCF/e-CF atómica sin duplicados.

## RBAC / Rutas
- [x] `incentives/pay` con gate de rol + tenant (SEC-007/008).
- [ ] Gate de rol en el resto de rutas de dinero/fiscal (incentives/commission/sequences/certificado — SEC-007).
- [ ] Gate de rol en approve/reject de conteo físico (SEC-006).
- [ ] `saveDgiiSettings`: auth + tenant del JWT (SEC-009).

## Storage
- [x] Certificados `.p12` cifrados AES-256-GCM en Postgres (no en Storage público).
- [ ] Al implementar imágenes de producto: bucket privado, URLs firmadas con
  expiración, validación MIME/tamaño, anti-SVG-script, separación por tenant.

## Integraciones
- [ ] WhatsApp: verificar firma `X-Hub-Signature-256` antes de persistir (SEC-004).
- [x] IA: keys cifradas server-side; presupuesto por empresa; system prompt fijo.
- [ ] IA: rate-limit por minuto (SEC-015); allowlist de host para `openai_compatible` (SEC-014).
- [ ] DGII: gatear rutas demo antes de conectar a datos reales (SEC-017).

## Observabilidad
- [ ] Logs estructurados sin PII/secretos; alertas de seguridad.
- [x] Auditoría de acciones sensibles (`audit_logs`) — ampliar cobertura (login, cambios de rol).
