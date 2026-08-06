# Rollback del módulo fiscal

> **La primera regla: un comprobante que la DGII ya aceptó no se deshace.**
> No con un `DELETE`, no con un `UPDATE`, no reasignando su e-NCF. Lo que existe
> para eso es la nota de crédito, que es un documento fiscal nuevo.
>
> Este documento trata de deshacer **cambios del sistema**, no hechos fiscales.

## Estado de partida (2026-08-04)

**Cero comprobantes emitidos.** `electronic_invoices` está vacía. Ningún
rollback de los de abajo puede perder un dato fiscal, porque no hay ninguno.
Esto dejará de ser cierto en cuanto se emita el primero.

## 1. Apagar sin desplegar nada

La palanca más rápida, y la que hay que usar primero ante cualquier duda:

```
DGII_TESTECF_SEND_ENABLED = false
```

Ya es el valor por defecto. Con eso **no sale ni un XML**, y el resto del ERP
—POS, inventario, tienda— sigue funcionando: el módulo fiscal no está en el
camino de una venta normal.

No hace falta desplegar ni revertir nada.

## 2. Volver a la versión anterior del código

Todo el trabajo vive en `feat/dgii-reformulacion` y **no se ha desplegado**
(§32 del pliego). Volver atrás es no fusionar.

Si ya se hubiera fusionado:

```bash
git revert -m 1 <sha-del-merge>
git push origin main
```

Las migraciones **no** se revierten con eso. Ver §3.

## 3. Las migraciones

### 0045 — idempotencia y eventos

Añade columnas, dos índices únicos, una tabla y un disparador. **No borra ni
modifica ningún dato.**

Revertirla, si hiciera falta y **solo mientras `electronic_invoices` no tenga
comprobantes reales**:

```sql
begin;
drop trigger if exists ecf_document_events_append_only on public.ecf_document_events;
drop function if exists public.ecf_events_solo_insertar();
drop table if exists public.ecf_document_events;

drop index if exists public.electronic_invoices_idempotency_key_uidx;
drop index if exists public.electronic_invoices_encf_por_ambiente_uidx;
drop index if exists public.electronic_invoices_pendientes_idx;

alter table public.electronic_invoices
  drop column if exists idempotency_key,
  drop column if exists retry_count,
  drop column if exists next_retry_at,
  drop column if exists last_error_class,
  drop column if exists last_error_message;
commit;
```

⚠️ **Con comprobantes emitidos, esto NO se ejecuta.** Quitar el índice único de
e-NCF es quitar lo único que impide gastar dos veces el mismo número, y borrar
`ecf_document_events` es borrar el historial fiscal. Si hay comprobantes y hay
que revertir código, **se revierte el código y se dejan las migraciones**: son
aditivas y no estorban.

### Alternativa menos destructiva

Si el problema es un índice concreto que bloquea algo legítimo:

```sql
drop index if exists public.electronic_invoices_encf_por_ambiente_uidx;
```

Deja el resto en pie y se puede volver a crear después. Pero mientras no exista,
**nada impide emitir el mismo e-NCF dos veces**: es una ventana que se abre a
sabiendas y se cierra cuanto antes.

## 4. Los permisos

Revertir `features/dgii/permissions.ts` deja las rutas sin `authorizeDgii` y
vuelve a abrirlas a cualquier usuario con sesión. **No se revierte solo esto**:
si hay que volver atrás, se vuelve el commit entero.

## 5. Limpiar datos de prueba

Los eventos son append-only, así que un `DELETE` normal falla. La válvula de
administrador —**nunca un camino de la aplicación**— es:

```sql
begin;
alter table public.ecf_document_events disable trigger ecf_document_events_append_only;
delete from public.ecf_document_events where electronic_invoice_id in (...);
delete from public.electronic_invoices where id in (...);
alter table public.ecf_document_events enable trigger ecf_document_events_append_only;
commit;
```

Comprobar después que el disparador quedó activo:

```sql
select tgenabled from pg_trigger where tgname = 'ecf_document_events_append_only';
-- 'O' = activo
```

## 6. Qué NO tiene rollback

- Un e-NCF entregado a la DGII y aceptado. Se corrige con nota de crédito.
- Una secuencia e-NCF consumida. El número se gastó.
- Un XML firmado y transmitido. Existe en la DGII.

Por eso `DGII_TESTECF_SEND_ENABLED` está en `false` y Fase G sigue bloqueada:
**hasta que se envía, todo tiene marcha atrás.**
