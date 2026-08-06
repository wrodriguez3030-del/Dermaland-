# DermaLand · Informe de Validación para Producción

**Fecha:** 2026-07-12 · **Versión auditada:** v0.70.1 (commit `3c853b1`) + parche de
auditoría (cashier_name) · **Proyecto Supabase:** `sntcvyozbhrgicwmtcoh` · **Deploy:**
Vercel `dermaland`.

Auditoría basada en evidencia real (BD de producción vía MCP, código, migraciones,
pruebas ejecutadas), no en "compila y abre".

> **Actualización 2026-08-06 (cierre de B-01, B-07 y B-04):** los §3 y §11 de abajo
> reflejan el resultado real y verificado del cierre — el resto del documento (§1, §2,
> §4-§10, §12) sigue fechado 2026-07-12 y no se reescribió entero en esta pasada.
> Detalle completo, con comandos y números, en `docs/estado-actual.md` (entrada
> `2026-08-06`) y en `docs/dr-drill-20260805.md` / `docs/migration-audit-20260805.md`.
> **B-04 está cerrado en código, no en producción:** el enforcement de 2FA sigue sin
> desplegar — activarlo depende de tres pasos del dueño (spec §6.2, orden no
> negociable) documentados en `docs/proximos-pasos.md`.

---

## 1. Veredicto ejecutivo

# ✅ APTO SOLO PARA PILOTO CONTROLADO

El núcleo de seguridad, aislamiento multiempresa y persistencia de datos está
**sólido y verificado en vivo**. **No** califica todavía como *APTO PARA PRODUCCIÓN*
plena por tres razones concretas y acotadas (backup no probado en plan Free,
emisión de venta+inventario no atómica, y flujos incompletos: devolución de stock,
vistas de conteo, MFA). Ninguna es catastrófica en un piloto de **una empresa /
una sucursal con controles diarios**, y todas tienen mitigación clara.

---

## 2. Resumen

- **Estado general:** listo para un piloto real controlado con la empresa ya
  cargada (1 empresa, 1355 productos, 1368 lotes). Seguridad de nivel producción.
- **Riesgos principales:**
  1. **Backups.** Proyecto en **plan Free** → sin backups automáticos ni PITR; sin
     restauración probada. *Bloqueador para producción plena.*
  2. **Atomicidad POS.** La venta y el descuento de inventario son dos llamadas
     separadas; si el descuento falla, la venta queda sin descontar stock (sin
     rollback). Riesgo de inventario sobrestimado.
  3. **Flujos incompletos.** Anular venta **no** reingresa stock; las **vistas** de
     conteo físico muestran datos mock; **MFA** no habilitado.
- **Nivel de confianza:** **Alto** en seguridad/RLS/multiempresa (verificado en
  vivo). **Medio** en integridad transaccional del POS bajo fallo/concurrencia
  (verificado por código, no por prueba de carga real).
- **Limitaciones de la auditoría:** no se ejecutó prueba de carga real (k6) ni
  restauración real de backup (requiere connection string / upgrade); el plan de
  Supabase se infirió del advisor + checklist, no de la página de facturación.
- **Evidencias principales:** 1721 tests verdes, typecheck y build en 0, advisors
  sin ERROR, RLS 56/56, cross-tenant e2e 7/7 en vivo, funciones e índices de
  integridad confirmados por SQL contra la BD real.

---

## 3. Bloqueadores

| ID | Sev | Bloqueador | Área | Estado | Acción requerida |
|----|-----|-----------|------|--------|------------------|
| B-01 | **Alta** | Plan Free sin backups automáticos/PITR; **restauración nunca probada** | DR/Backups | ✅ **CERRADO 2026-08-06** (simulacro real, corrido 3 veces) | `scripts/backup/dr-drill.mjs` restauró un respaldo fresco de producción en un arenero efímero y comparó **7 dimensiones**: **98 tablas rastreadas, 5.900 filas, 106 políticas RLS, 15 funciones, 219 índices, 325 restricciones — 0 errores de restauración, 0 diferencias** (`docs/dr-drill-20260805.md`). Verificado contra **5 sabotajes** (filas borradas, RLS apagada, índice eliminado, política a `USING (true)`, FK eliminada) → los 5 detectados. Autodestrucción probada con `SIGKILL` real (≤35 s). **Fuera de alcance, dicho a propósito:** no exporta roles del clúster (falta `pg_dumpall -g`) ni los binarios de Storage (`storage.objects` es solo metadatos). **El cron diario (`.github/workflows/backup.yml`) sigue DESACTIVADO** hasta fusionar la versión endurecida a `main` — acción del dueño |
| B-02 | **Alta** | Emisión de venta y descuento de inventario **no atómicos**; venta puede quedar sin descontar stock, sin rollback | POS/Inventario | ✅ **CORREGIDO** (código + RPC en prod; pendiente deploy) | RPC transaccional `emit_sale_atomic` (mig `0029`); verificado en vivo 14/14 |
| B-03 | Media | **Anular venta no reingresa stock**; Nota de Crédito es demo | Devoluciones | ✅ **CORREGIDO** (código + RPC en prod; pendiente deploy) | RPC `void_sale_atomic` reingresa stock (atómico e idempotente); NC sigue demo (pre-Fase G) |
| B-04 | Media | **MFA no habilitado** para admin | Auth | 🟡 **CERRADO EN CÓDIGO 2026-08-06 · SIN DESPLEGAR** | 2FA obligatorio para `admin`/`super_admin`/`is_platform_admin`, opcional para el resto, fail-open conservado. `scripts/mfa-break-glass.mjs` probado **16/16** contra Supabase real. Durante el trabajo se cerró un **bypass completo del 2FA** y **tres formas distintas de quedar encerrado** (dos ya presentes en producción). **Falta (dueño, orden no negociable, spec §6.2):** 1) enrolar su propio 2FA en `/perfil/seguridad`; 2) probar el break-glass contra su cuenta, con él presente; 3) autorizar el despliegue (merge a `main`) en ese momento. **Dato corregido:** son **3** administradores reales en `auth.users`, no 2 — uno (`cnttest-ct5jmp@example.com`) es una cuenta de prueba con `role: admin` efectivo (ver riesgo abierto en `docs/riesgos.md`) |
| B-05 | Media | **Vistas de conteo físico = mock**; `approve` no ajusta stock | Conteo | ✅ **CORREGIDO** (código + RPC en prod; pendiente deploy) | Vistas cableadas a la API real (`counts-store`, fallback demo); `approve` ajusta stock atómico (`apply_count_adjustments`, mig `0030`), verificado 9/9. Fix bug latente: `difference_quantity` es generada |
| B-06 | Baja | `product_lots` sin CHECK `current_quantity >= 0` (solo el RPC lo protege) | Inventario | ✅ **CERRADO** | CHECK aplicado a prod (mig `0028`, 0 filas violaban) |
| B-07 | Baja | Historial de migraciones incompleto (13/27 rastreadas; 0007–0022 fuera de banda) | Migraciones | ✅ **CERRADO 2026-08-06** | `scripts/audit-migrations.mjs` audita **por objeto contra la base real**, no por el historial. Recuperadas 4 migraciones aplicadas por MCP que nunca dejaron `.sql`; renombradas 5 que la CLI de Supabase saltaba en silencio. Hoy **51 archivos, 0 saltados**. Reconstrucción desde cero verificada: **83 tablas vs 83 de producción, delta cero**, 106 políticas con md5 idéntico. **Pendiente (dueño):** autorizar `supabase migration repair` para los **14 archivos «sin registro»** (9 ya `APLICADA`); el bloqueo es decidir su **versión de 14 dígitos**, que la auditoría no inventa a propósito. **No** es para las 3 PARCIALES: esas ya tienen fila en el historial y un `repair` sobre ellas no cambia nada — los objetos que les faltan los **renombraron** migraciones posteriores (verificado contra producción: `products_barcode_unique` → `products_barcode_live_unique`; `businesses_select`/`clients_select` → `*_sel`/`_ins`/`_upd`/`_del`), o sea drift cosmético para revisar a mano. **Hallazgo aparte sin resolver, es decisión de negocio:** `0017_backfill_product_laboratories.sql` es SQL inválido y nunca corrió; **611 de 1.356 productos activos (45,1 %) siguen sin laboratorio**, así que la regla de vencimiento por laboratorio no aplica a casi medio catálogo |

> **Resueltos en esta auditoría:** el `cashier_name` hardcodeado ("Rosa Peralta")
> que se persistía en cada factura → ahora deriva de la sesión (JWT). Ver §8.

---

## 4. Pruebas realizadas

| Prueba | Comando | Resultado | Evidencia |
|--------|---------|-----------|-----------|
| Unit + integración | `npx vitest run` | ✅ **1721 passed / 1721** | 76 s, 0 fallos |
| Repositorios (post-fix) | `npx vitest run src/server/repositories` | ✅ **176 / 176** | tras parche cashier_name |
| Typecheck | `npx tsc --noEmit` | ✅ **exit 0** | sin errores TS |
| Build de producción | `next build` | ✅ **exit 0** | todas las rutas compilan |
| Cross-tenant e2e (RLS) | `node scripts/security/cross-tenant-rls-test.mjs` | ✅ **7 / 7** en vivo | 2 empresas reales, JWT reales, SEC-001 cerrado |
| Advisor seguridad | `get_advisors(security)` | ⚠️ 1 WARN | solo *Leaked Password Protection* (bloqueado en Free) |
| Advisor rendimiento | `get_advisors(performance)` | ✅ solo INFO | ~113 FK sin índice + 16 índices sin uso (no bloquean) |
| RLS habilitado | SQL sobre `pg_policies` / advisor | ✅ **56 / 56 tablas** | `docs/security/rls-matrix.md` |
| Integridad (índices/constraints) | SQL sobre `pg_constraint`/`pg_indexes` | ✅ | NCF único, idempotencia venta+scan, lote único, RPC atómico |
| Prueba de carga (k6) | — | ⏸️ **No ejecutada** | fuera de alcance del piloto inicial |
| Backup de datos (REST JSON) | `node scripts/backup/rest-json-backup.mjs` | ✅ **57/57 tablas, 3081 filas** | backup real ejecutado y verificado |
| Restaurabilidad del backup | `node scripts/backup/verify-backup-integrity.mjs` | ✅ **11/11 FKs OK** (backup restaurable, 0 refs rotas) | validado sin destino |
| Drill de restauración end-to-end | — | ⏸️ **Pendiente** (necesita 2º proyecto Free como destino) | ver B-01 |

---

## 5. Estado por módulo

| Módulo | Estado | Riesgo | ¿Piloto? |
|--------|--------|--------|----------|
| Autenticación | ✅ Real (JWT + `app_metadata`, SEC-001) | Bajo | Sí |
| Usuarios | ✅ Real (Supabase, RLS) | Bajo | Sí |
| Roles / Permisos | ✅ Real (gates server-side SEC-006/07/09/13) | Bajo | Sí |
| Clientes | ✅ Real | Bajo | Sí |
| Productos | ✅ Real (1355 en prod) | Bajo | Sí |
| Inventario (movimientos) | ✅ Real | Bajo | Sí |
| Lotes / Vencimientos | ✅ Real (decremento atómico) | Bajo | Sí |
| POS / Ventas | ✅ Real, **atómico** venta+stock (B-02 corregido, `emit_sale_atomic`) | Bajo | Sí |
| Pagos / Caja | ✅ Real (montos recalculados server-side) | Bajo | Sí |
| Devoluciones / Anulación | ✅ Anula y **reingresa stock** atómico (B-03 corregido, `void_sale_atomic`); NC aún demo | Bajo | Sí (anulación); NC vía ajuste manual |
| Reportes | ✅ Real (ventas/clientes/inventario); conteos mock | Bajo | Sí (excepto reporte de conteos) |
| Conteo físico / PWA | ✅ Vistas reales (fallback demo) + **approve ajusta stock** atómico (B-05 corregido) | Bajo | Sí |
| Compras | ✅ Real | Bajo | Sí |
| Proveedores | ✅ Real | Bajo | Sí |
| Super-administración | 🔴 Mock (`mock-data/saas`) | Bajo (no operativo en 1 empresa) | No usar |
| WhatsApp | 🔴 Stub (envío a Meta no cableado; UI = link `wa.me`) | Bajo | Solo compartir por `wa.me` |
| IA | 🟡 LLM real, agentes mock, gated por proveedor+clave | Bajo | OFF salvo clave real |
| DGII e-CF | 🟡 Infra real, **emisión real OFF por killswitch** | Bajo (mientras OFF) | **Mantener OFF** |

Leyenda: ✅ listo · 🟡 usable con vigilancia/límites · 🔴 no usar / apagado.

---

## 6. Seguridad multiempresa

- **Tablas revisadas:** 56/56 de `public` con RLS habilitado (advisor + SQL).
- **Políticas revisadas:** patrón canónico `business_id = auth_business_id()` en
  todas las tablas de tenant; catálogos globales (`permissions`, `roles`,
  `role_permissions`, `plans`) con `SELECT USING(true)` **a propósito** y escrituras
  denegadas/restringidas a platform admin. **0 funciones `SECURITY DEFINER`** en
  `public`; `auth_business_id()`/`auth_is_platform_admin()` son STABLE con
  `search_path` fijo (confirmado por SQL).
- **Tenant no manipulable:** tras SEC-001, los claims se leen SOLO de `app_metadata`
  (escribible solo por service_role); el cliente no puede enviar/cambiar
  `business_id`/`branch_id`/`role`.
- **Pruebas cross-tenant:** `scripts/security/cross-tenant-rls-test.mjs` — **7/7 en
  vivo**: lectura aislada, IDOR bloqueado, UPDATE/DELETE cross-tenant → 0 filas, y el
  vector SEC-001 (manipular `user_metadata` para escalar) **falla**.
- **Riesgos pendientes:** ninguno de aislamiento. Pendiente operativo: re-ejecutar
  el test al crear la 2ª empresa.

---

## 7. Backups y restauración

- **Configuración actual:** plan **Free** → **sin** backups automáticos ni PITR.
  **Riesgo de pérdida total ante un fallo de la BD.**
- **Frecuencia / Retención objetivo:** diaria / 14 días (ver `docs/backup-and-restore.md`).
- **Resultado de restauración:** ⏸️ **no probada** (bloqueador B-01).
- **RPO objetivo piloto:** ≤ 24 h (backup lógico diario) · **RTO:** ≤ 4 h.
- **Responsable:** por asignar (dueño técnico del piloto).
- **Entregables:** `docs/backup-and-restore.md` + `scripts/backup/pg-dump-backup.mjs`
  (dump comprimido, solo lectura). **Acción antes del go-live:** upgrade a Pro *o*
  cron de `pg_dump` externo, y **una restauración de prueba documentada**.

---

## 8. Cambios realizados (esta auditoría)

| # | Archivo | Problema | Solución | Compat. | Prueba |
|---|---------|----------|----------|---------|--------|
| 1 | `server/repositories/types.ts` | `RepoContext` no llevaba el nombre del usuario | + campo opcional `userName?` | ✅ (opcional) | typecheck 0 |
| 2 | `server/auth/context.ts` | `getRepoContext` no propagaba el nombre de sesión | `userName: session.user.fullName` | ✅ | typecheck 0 |
| 3 | `server/repositories/supabase/sales.ts` | `cashier_name` se tomaba del body → `"Rosa Peralta"` hardcodeado se persistía en TODA factura | `cashier_name: ctx.userName ?? proforma.cashierName` (deriva del JWT, patrón SEC-016) | ✅ | 176/176 repos |

**Documentos entregados (nuevos):** `docs/production-readiness-report.md`,
`docs/production-pilot-plan.md`, `docs/backup-and-restore.md`, `docs/rollback-plan.md`,
`docs/security/incident-response.md`, `scripts/backup/pg-dump-backup.mjs`.
**Actualizados:** `docs/production-checklist.md` (estado verificado).

> Todos los cambios de código son **aditivos y compatibles hacia atrás**; el
> `git diff` no elimina ni sobrescribe lógica previa. **No se desplegó a producción**
> (commit en rama local de auditoría, pendiente de autorización para push/deploy).

---

## 9. Riesgos aceptados temporalmente (para el piloto)

| Riesgo | Impacto | Mitigación durante el piloto | Corregir para |
|--------|---------|------------------------------|---------------|
| ~~POS no atómico (B-02)~~ | ✅ CORREGIDO (`emit_sale_atomic`) — ya no aplica | — | Cerrado |
| Backup en Free (B-01) | Pérdida de datos ante fallo de BD | `pg_dump` diario externo + restauración probada + backup pre-go-live | Antes del go-live (obligatorio) |
| ~~Devolución sin reingreso (B-03)~~ | ✅ CORREGIDO (`void_sale_atomic`) — ya no aplica | — | Cerrado |
| MFA off (B-04) | Cuenta admin más expuesta | Contraseña fuerte + activar TOTP antes del go-live | Go-live |
| ~~Conteo físico vistas mock (B-05)~~ | ✅ CORREGIDO (vistas reales + approve ajusta stock) — ya no aplica | — | Cerrado |
| `Leaked Password Protection` off | Contraseñas comprometidas aceptadas | Política de contraseña fuerte manual | Al subir a Pro |
| Imágenes en localStorage | Fotos no persisten/sincronizan | Tratar fotos como cosméticas | Al migrar a bucket `product-images` |

---

## 10. Plan de piloto

Detalle completo en `docs/production-pilot-plan.md`. Resumen:

- **Empresa:** 1 (DermaLand, pasar `trial`→`active`). **Sucursales:** 1. **Usuarios:** 3–5.
- **Duración:** 4 semanas, revisión a semana 1 y 2.
- **Módulos activos:** Auth, Usuarios, Roles, Clientes, Productos, Inventario, Lotes,
  POS/Ventas, Pagos, Compras, Proveedores, Reportes.
- **Desactivados:** DGII emisión real, WhatsApp automatizado, IA (salvo clave real),
  conteo físico para ajustes, super-admin.
- **Monitoreo:** Vercel logs + advisors Supabase + cuadre diario + verificación de
  backup (§5 del plan).
- **Backups:** upgrade Pro o cron `pg_dump` + backup pre-go-live.
- **Soporte:** responsable técnico en horario; sistema anterior en paralelo 2 semanas.
- **Detener si:** descuadre recurrente, pérdida de datos sin backup, caída > 2 h,
  duplicación de ventas/pagos.
- **Reversión:** `docs/rollback-plan.md`.

---

## 11. Checklist final

Producción / go-live:

- [ ] **Base de producción** definida (Supabase `sntcvyozbhrgicwmtcoh`) ✅ (existe)
- [x] **Migraciones** aplicadas (esquema completo) — B-07 ✅ **CERRADO 2026-08-06**: 51 archivos, 0 saltados por la CLI, reconstrucción desde cero delta cero (83/83 tablas). ⚠️ 14 archivos «sin registro» esperan `supabase migration repair` con autorización del dueño (las 3 PARCIALES no: ya están registradas, ver B-07 arriba)
- [x] **RLS** en 56/56 tablas
- [x] **Cross-tenant** verificado en vivo (7/7)
- [x] **Roles** validados server-side
- [ ] **MFA** para admin (B-04) — 🟡 **código cerrado y probado 2026-08-06** (2FA obligatorio + break-glass 16/16); **sin desplegar**: falta que el dueño enrole su 2FA, pruebe el break-glass contra su cuenta, y autorice el despliegue (spec §6.2)
- [x] **POS** persiste correctamente + **atomicidad venta+stock** (B-02 ✅ `emit_sale_atomic`)
- [x] **Inventario** con decremento atómico y sin negativos (0 hoy)
- [x] **Compras** reales
- [x] **Devoluciones** (anulación) con reingreso de stock (B-03 ✅ `void_sale_atomic`)
- [x] **Backups** — restauración **probada de verdad** (B-01 ✅ `docs/dr-drill-20260805.md`, PASA); ⚠️ el cron diario sigue desactivado hasta fusionar la versión endurecida a `main`
- [x] **Restauración** probada (B-01 ✅) — 98 tablas, 5.900 filas, 0 errores, 0 diferencias, verificado con 5 sabotajes distintos (los 5 detectados)
- [x] **Logs / Auditoría** (`audit_logs` + Vercel)
- [ ] **Alertas** automáticas (piloto: revisión manual diaria)
- [ ] **Dominio** productivo confirmado
- [x] **HTTPS** (Vercel) + cabeceras de seguridad (SEC-005)
- [x] **Variables** de entorno server-only (service_role nunca al cliente)
- [x] **Storage** — sin buckets (certs cifrados en tabla RLS); imágenes MVP-local
- [x] **Dependencias** — build/tests verdes
- [x] **Build** de producción en 0
- [ ] **Rollback** — documentado ✅, ensayar una vez
- [ ] **Usuarios entrenados**
- [ ] **Integraciones externas** clasificadas (DGII/WhatsApp/IA OFF hasta credenciales)

---

## 12. Conclusión final

- **¿Puede cargarse una empresa real?** **Sí**, como **piloto controlado** de 1
  empresa/1 sucursal, tras cumplir el go-live gate (backup probado, MFA, backup
  pre-arranque). La empresa y su catálogo ya están cargados.
- **¿Qué módulos pueden usarse?** Auth, Usuarios, Roles, Clientes, Productos,
  Inventario, Lotes, POS/Ventas, Pagos, Compras, Proveedores, Reportes.
- **¿Qué debe quedar apagado?** Emisión fiscal DGII real, WhatsApp automatizado, IA
  (salvo clave real), conteo físico para ajustes de stock, super-admin.
- **¿Qué podría causar pérdida de datos?** Un fallo de la BD **sin backup** (B-01) —
  por eso el backup probado es obligatorio antes del día 1. Borrados manuales en la
  BD (usar los flujos del sistema, no SQL directo).
- **¿Qué podría causar una caída?** Un deploy roto (mitigado por rollback de Vercel)
  o indisponibilidad de Supabase (mitigado por sistema anterior en paralelo).
- **¿Qué hacer si el sistema falla?** `docs/rollback-plan.md` (deploy/datos),
  `docs/backup-and-restore.md` (restaurar), `docs/security/incident-response.md`.
- **Pasos exactos antes del primer día:**
  1. Subir Supabase a **Pro** (o cron `pg_dump`) y **probar una restauración**.
  2. Tomar **backup** etiquetado `go-live`.
  3. Activar **MFA (TOTP)** para el admin; contraseñas fuertes a todos.
  4. Validar precios/ITBIS/stock inicial (spot-check 20–30 productos).
  5. Confirmar integraciones **OFF** (DGII real, WhatsApp, IA).
  6. Capacitar usuarios; dejar el sistema anterior disponible.
  7. Autorizar el deploy del parche de auditoría (cashier_name) y publicar.
  8. Encender monitoreo/revisión diaria.
