# DermaLand · Plan de Rollback

Cómo volver atrás con seguridad si un deploy, una migración o un cambio de datos
sale mal. **Orden de preferencia: revertir código (barato) → revertir datos (caro).**

## 1. Rollback de despliegue (Vercel) — segundos

El caso más común y más seguro: un deploy nuevo rompe algo, la BD está intacta.

- **Dashboard:** Vercel → proyecto `dermaland` → Deployments → elegir el último
  deploy **bueno** → **⋯ → Promote to Production** (o *Rollback*).
- **CLI:** `vercel rollback <deployment-url> --scope wrodriguez3030-4801s-projects`
- **Git:** `git revert <commit>` + push a `main` (auto-deploy) — deja historia
  trazable. Preferible cuando el fix debe quedar en el repo.

Tiempo: < 2 min. No toca datos. **Siempre intentar esto primero.**

## 2. Rollback de variables de entorno

Si el problema fue un cambio de env var (clave rotada, flag mal puesto):

- Vercel → Settings → Environment Variables → restaurar el valor anterior →
  **Redeploy** el último deploy bueno.
- Los flags de integración (`AI_ENABLED`, ambiente DGII, WhatsApp) se apagan aquí
  para "desactivar módulo" sin tocar código.

## 3. Rollback de una migración de esquema

**Antes de cualquier migración a prod:** snapshot obligatorio
(`node scripts/backup/pg-dump-backup.mjs --label premig-<version>`).

Postgres no revierte DDL solo. Opciones, de menor a mayor impacto:

1. **Migración inversa** (preferido): escribir y aplicar el SQL que deshace el
   cambio (drop de la columna/índice/función nuevos). Solo válido si la migración
   no destruyó datos.
2. **Restaurar el snapshot pre-migración** (ver `docs/backup-and-restore.md`) en un
   proyecto aislado, validar, y —con autorización— repuntar la app o migrar los
   datos buenos de vuelta.

> Las migraciones de DermaLand son **aditivas** (nuevas tablas/columnas/índices,
> `CREATE OR REPLACE` de funciones). Ninguna hace `DROP`/`DELETE` de datos, así que
> el riesgo de una migración es bajo; aun así, el snapshot pre-migración es regla.

### Migraciones recientes y su reversa

| Migración | Qué hace | Reversa |
|---|---|---|
| `0026_sec001…` | `CREATE OR REPLACE` de `auth_business_id()`/`auth_is_platform_admin()` sin fallback a `user_metadata` | volver a aplicar la versión previa (`0006`) — **NO recomendado** (reabre SEC-001) |
| `0027_sec010_011…` | crea RPC `decrement_lot_stock` + `proformas.idempotency_key` + índice | `drop function decrement_lot_stock; drop index proformas_idempotency_key_uidx; alter table proformas drop column idempotency_key;` |

## 4. Rollback de datos operativos (venta/pago/ajuste erróneo)

- **Ventas/proformas:** usar la **anulación** del propio sistema (deja rastro en
  `audit_logs` y revierte inventario). No borrar filas a mano.
- **Ajustes de inventario:** registrar un ajuste compensatorio con motivo; no editar
  cantidades a mano en la BD.
- **Borrado accidental:** restaurar solo las filas afectadas desde el último backup
  a una tabla temporal y re-insertar con autorización. **Nunca** `TRUNCATE`/`DELETE`
  masivo en prod.

## 5. Interruptor de emergencia ("kill switch")

Si hay que **detener el piloto** rápido sin borrar nada:

1. Vercel → poner el proyecto en mantenimiento (o redeploy de una página estática
   de "en mantenimiento") **o** revertir al sistema anterior del cliente.
2. Apagar integraciones externas por env var (DGII ambiente, `AI_ENABLED=false`).
3. Sacar el último backup (`pg-dump-backup.mjs`) para congelar el estado.
4. Investigar con `docs/security/incident-response.md`.

## Checklist antes de cada deploy a producción

- [ ] Tests verdes (`npx vitest run`), typecheck y `build` OK.
- [ ] Si hay migración: snapshot `premig-<version>` tomado y guardado externo.
- [ ] Identificado el "último deploy bueno" al que volver.
- [ ] Deploy en horario de bajo tráfico; alguien monitoreando 30 min después.
