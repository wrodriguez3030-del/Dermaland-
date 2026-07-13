# DermaLand · Respuesta a Incidentes

Procedimiento básico para el piloto. Objetivo: contener rápido, no perder datos, y
dejar rastro. Ampliar cuando entren más empresas.

## Roles

| Rol | Responsabilidad |
|---|---|
| **Responsable técnico** | Diagnóstico, contención, rollback, comunicación con Supabase/Vercel |
| **Responsable de negocio** | Decide detener/continuar el piloto, avisa a la sucursal |

## Severidades

| Sev | Ejemplo | Respuesta |
|---|---|---|
| **SEV-1 (crítico)** | Fuga cross-tenant, secreto expuesto, datos borrados, sistema caído, pagos/ventas duplicándose | Contener YA. Kill switch si aplica. Backup inmediato. |
| **SEV-2 (alto)** | Módulo roto (POS no vende), login falla para varios, webhook DGII/WhatsApp fallando | Rollback de deploy. Investigar en horas. |
| **SEV-3 (medio)** | Bug en un reporte, error intermitente, lentitud puntual | Ticket. Corregir en el ciclo normal. |

## Flujo general

1. **Detectar** — vía alerta, reporte del usuario, o revisión diaria de errores.
2. **Contener** — apagar la causa: rollback de deploy (`docs/rollback-plan.md` §1),
   apagar integración por env var, o kill switch (§5). No investigar sobre prod viva
   sin antes congelar un backup.
3. **Preservar evidencia** — sacar un backup (`scripts/backup/pg-dump-backup.mjs`) y
   guardar logs (Vercel + Supabase) ANTES de tocar nada.
4. **Diagnosticar** — usar la guía de debugging sistemático (causa raíz, no síntoma).
5. **Corregir** — parche mínimo, test que reproduzca, deploy controlado.
6. **Post-mortem** — 1 página: qué pasó, causa raíz, cómo se contuvo, qué evita que
   se repita. Guardar en `docs/security/`.

## Runbooks por tipo de incidente

### Sospecha de fuga entre empresas (cross-tenant) — SEV-1
1. Correr `node scripts/security/cross-tenant-rls-test.mjs` — confirma en vivo si el
   aislamiento sigue intacto (7 verificaciones).
2. Revisar `get_advisors(security)` por si alguna tabla nueva quedó sin RLS.
3. Si se confirma fuga: kill switch, backup, identificar el cambio que la introdujo
   (`git log`), revertir. NO declarar resuelto hasta que el test cross-tenant pase.

### Secreto expuesto (clave en repo/log/commit) — SEV-1
1. Identificar el secreto y dónde se expuso. **No pegar el valor en tickets/chats.**
2. **Rotar** la credencial (Supabase service_role, OpenAI key, WhatsApp/Meta,
   `DOCUMENT_SHARE_SECRET`, etc.) — **requiere autorización explícita del dueño.**
3. Actualizar el valor en Vercel env vars + redeploy.
4. Si fue en un commit: reescribir historia o rotar; asumir que ya está comprometido.

### Datos borrados/corruptos — SEV-1
1. Detener escrituras al recurso afectado.
2. Restaurar solo lo afectado desde el último backup a tabla temporal
   (`docs/backup-and-restore.md`), reconciliar, re-insertar con autorización.
3. Nunca `TRUNCATE`/`DELETE` masivo para "arreglar".

### Ventas/pagos duplicados — SEV-1
1. Verificar `proformas.idempotency_key` y el índice único (deberían prevenirlo).
2. Consultar duplicados: agrupar `proformas` por `(business_id, ncf/número)` y por
   `idempotency_key`. Anular el duplicado por el flujo del sistema (deja auditoría).
3. Revisar `inventory_movements` asociados para cuadrar stock.

### Sistema caído — SEV-1/2
1. ¿Vercel o Supabase? Revisar status pages y logs.
2. Vercel roto por deploy → rollback (§1). Supabase caído → esperar/soporte;
   activar sistema anterior del cliente si el piloto lo requiere.

## Contactos

- **Supabase:** proyecto `sntcvyozbhrgicwmtcoh`. Soporte según plan.
- **Vercel:** proyecto `dermaland` (team wrodriguez3030-4801s-projects).
- **DGII:** solo relevante cuando la emisión fiscal esté activa (hoy OFF).
- **Emergencia interna:** (asignar teléfono/contacto del responsable técnico).

## Revisión diaria durante el piloto (5 min)

- [ ] Errores en Vercel (Runtime Logs) del día.
- [ ] `get_logs`/advisors de Supabase sin nada nuevo.
- [ ] Cuadre de caja del día vs ventas del sistema.
- [ ] El backup diario de anoche existe y pesa lo esperado.
