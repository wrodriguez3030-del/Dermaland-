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

**Antes de cualquier migración a prod:** snapshot obligatorio, **con
`--with-drop`**:

```bash
node scripts/backup/pg-dump-backup.mjs --label premig-<version> --with-drop
```

> **Por qué `--with-drop` aquí y no en el respaldo diario.** Un snapshot
> pre-migración existe para restaurarse **encima** de una base que ya tiene
> objetos — es el único caso para el que ese indicador fue diseñado. Sin él, el
> archivo no lleva los `DROP … IF EXISTS` de cabecera: cada `CREATE TABLE` choca
> con la tabla que ya está, el `COPY` que va detrás se cae en cascada y la
> reversión termina con tablas a medio poblar. El respaldo diario, en cambio,
> se restaura en un proyecto nuevo y vacío: ahí el indicador solo añade riesgo,
> y por eso **no** es el comportamiento por defecto (`lib/pg-dump-args.mjs`).

Postgres no revierte DDL solo. Opciones, de menor a mayor impacto:

1. **Migración inversa** (preferido): escribir y aplicar el SQL que deshace el
   cambio (drop de la columna/índice/función nuevos). Solo válido si la migración
   no destruyó datos.
2. **Restaurar el snapshot pre-migración** (ver `docs/backup-and-restore.md`) en un
   proyecto aislado, validar, y —con autorización— repuntar la app o migrar los
   datos buenos de vuelta.

### El comando de reversión, completo

```bash
# 1. Descifrar SI el respaldo viene de CI: los artifacts se cifran SIEMPRE
#    (.github/workflows/backup.yml aborta antes que subir nada en claro), así
#    que el archivo se llama .sql.gz.gpg y `gunzip` solo no lo abre.
gpg --decrypt backups/dermaland-premig-<version>.sql.gz.gpg > /tmp/premig.sql.gz

# 2. Restaurar DETENIÉNDOSE en el primer error.
gunzip -c /tmp/premig.sql.gz | psql -v ON_ERROR_STOP=1 "$TARGET_DB_URL"
echo "salida de psql: $?"     # 0 = restauró sin un solo error

rm -f /tmp/premig.sql.gz      # el descifrado lleva datos personales
```

> **Los dos indicadores se midieron, no se supusieron** (2026-08-06, en un
> Postgres 17.6 efímero: base con 3 usuarios → "migración" que borra uno y
> añade una columna → reversión):
>
> | Reversión | Salida de `psql` | Usuarios recuperados | Columna sobrante |
> |---|---|---|---|
> | Como estaba documentada (sin `--with-drop`, sin `ON_ERROR_STOP`) | **0** ✅ | **2 de 3** ❌ | sigue ahí ❌ |
> | Como queda documentada aquí | 0 ✅ | **3 de 3** ✅ | eliminada ✅ |
>
> La primera fila es el motivo de esta corrección: `psql` imprimió **6 errores,
> se los tragó y salió 0**. El operador ve una reversión exitosa y se va a
> dormir con un usuario perdido. Es el modo de fallo más caro que hay, porque
> nadie vuelve a revisar algo que salió bien.
>
> Si la salida no es 0, **no se repunta la app**: se investiga con el log
> completo antes de tocar nada más.

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
3. Congelar el estado con un backup: `node scripts/backup/pg-dump-backup.mjs
   --label killswitch-<fecha> --with-drop` — **con `--with-drop`** por lo mismo
   que el snapshot pre-migración: si algún día hay que devolverlo, será encima
   de una base que ya tiene objetos.
4. Investigar con `docs/security/incident-response.md`.

## Checklist antes de cada deploy a producción

- [ ] Tests verdes (`npx vitest run`), typecheck y `build` OK.
- [ ] Si hay migración: snapshot `premig-<version>` **con `--with-drop`** tomado
      y guardado externo.
- [ ] Identificado el "último deploy bueno" al que volver.
- [ ] Deploy en horario de bajo tráfico; alguien monitoreando 30 min después.
