# Próximos pasos — DermaLand

> Lista priorizada. Marca con `[x]` lo que cierres y mueve a la sección
> "Hecho recientemente" con la fecha. Léelo después de
> `docs/estado-actual.md`.

**Última actualización:** 2026-08-06

> Esta lista estaba fechada 2026-06-18 y listaba como pendiente cosas que
> llevan meses hechas (p. ej. "Conectar Supabase" — producción corre en
> `DATA_SOURCE=supabase` desde junio 2026). Se purgó en esta sesión: solo
> queda lo que sigue vigente hoy.

## Prioridad 0 — bloqueantes de HOY (cierre de B-01/B-07/B-04)

Nada de código pendiente aquí — son decisiones y acciones del dueño.
Detalle completo en `docs/estado-actual.md` (entrada `2026-08-06`) y
`docs/production-readiness-report.md` (§3, §11).

- [ ] **Activar el enforcement de 2FA (B-04), en este orden exacto — spec
      §6.2, no negociable:**
      1. El dueño enrola su propio 2FA en `/perfil/seguridad` (escanear QR,
         confirmar código).
      2. Con el dueño presente, probar `node scripts/mfa-break-glass.mjs
         <su-correo>` contra su propia cuenta y confirmar que recupera el
         acceso solo con contraseña. **Sin esta prueba, no seguir.**
      3. Solo entonces, y con autorización explícita en ese momento, fusionar
         `feat/cierre-pendientes-produccion` a `main` (auto-deploy activo).
         Verificar en vivo que el admin enrolado entra por `/login/mfa` y que
         el cajero entra sin cambios.
- [ ] **Decidir sobre `cnttest-ct5jmp@example.com`.** Cuenta de prueba
      (`@example.com`, basura de una corrida vieja) con `role: admin` efectivo
      en producción vía `app_metadata` (ver `docs/riesgos.md` R-SEC-02).
      Borrarla requiere confirmación explícita (datos reales de producción).
- [ ] **Autorizar `supabase migration repair` para los 14 archivos «sin
      registro»** que dejó `docs/migration-audit-20260805.md` — **no** para las
      3 PARCIALES. Las 3 PARCIALES (`0001_phase1_core`,
      `0002_phase2_inventory`, `00030_0002a_clients`) **ya tienen fila en el
      historial**: un `repair --status applied` sobre ellas no cambia nada.
      Lo que les falta son objetos que migraciones posteriores **renombraron**
      (verificado contra producción: `products_barcode_unique` hoy es
      `products_barcode_live_unique`; `businesses_select`/`clients_select` se
      partieron en `*_sel`/`_ins`/`_upd`/`_del`), o sea drift cosmético que se
      revisa a mano, no se repara.
      Los que sí necesitan `repair` son los **14 «Archivo sin registro»** (9 de
      ellos ya `APLICADA`); el bloqueo real ahí es **decidir qué versión de 14
      dígitos** asignarles: el historial usa timestamps y los archivos usan
      secuencia de 4 dígitos, así que no hay fuente confiable de cuándo se
      aplicaron. La auditoría no inventa el timestamp a propósito.

## Prioridad 1 — cerca de cerrar

- [ ] **Reactivar el respaldo diario automático**
      (`gh workflow enable` sobre `.github/workflows/backup.yml`) en cuanto
      la versión endurecida (los mismos fixes que pasó `dr-drill.mjs`) llegue
      a `main`. Los secretos `SUPABASE_DB_URL` y `BACKUP_GPG_PASSPHRASE` ya
      están configurados; la passphrase está en el Llavero.
- [ ] **Decidir el backfill de laboratorio.**
      `0017_backfill_product_laboratories.sql` es SQL inválido y nunca corrió;
      **611 de 1.356 productos activos (45,1 %) no tienen laboratorio**, así
      que la regla de vencimiento por laboratorio no aplica a casi medio
      catálogo. Decisión de negocio: reescribir el backfill, o asignar
      laboratorio a mano donde importe.
- [ ] **`preview-admin@dermaland.do` sin 2FA** (`docs/riesgos.md` R-SEC-03):
      al desplegar el enforcement, los smokes de Preview que inicien sesión
      como ese usuario fallarán hasta que se enrole a mano o se le baje el
      rol. Decidir cuál antes del despliegue.
- [ ] **Confirmar reglas documentales del POS con el negocio** (R-FIS-01,
      `docs/riesgos.md`) — sigue sin validar contra la política fiscal
      definitiva ni contra la normativa DGII al 100 %.

## Prioridad 2 — endurecimiento técnico (diferido, no bloqueante)

- [ ] Comprobar el nivel de garantía (AAL) en las **125 rutas de API** y **6
      acciones de servidor** — hoy el 2FA se aplica solo en el middleware
      (`docs/riesgos.md` R-SEC-05).
- [ ] Endurecer el `matcher` del middleware: hoy deja pasar rutas terminadas
      en extensión de imagen sin ejecutar ningún gate (R-SEC-06).
- [ ] Escribir `public.users.two_factor_enabled` desde el enrolamiento y el
      break-glass — hoy nadie la toca y miente en las dos direcciones
      (R-SEC-07).
- [ ] Revisar quién tiene acceso a `SUPABASE_SERVICE_ROLE_KEY` y su rotación
      periódica — es el punto único de fallo del 2FA (R-SEC-04).

## Prioridad 3 — recuperación de desastres más completa

- [ ] Respaldo de roles del clúster (`pg_dumpall -g`) — `pg_dump` no los
      exporta.
- [ ] Respaldo de los binarios de Storage (fotos de producto) — hoy solo se
      respaldan los metadatos de `storage.objects`.
- [ ] Automatizar la cadencia del simulacro de DR (antes de cada cambio
      grande de esquema, mínimo trimestral) — hoy depende de que alguien se
      acuerde de correr `dr-drill.mjs`.
- [ ] Evaluar upgrade a Supabase Pro para tener PITR real (R-BACKUP-02) — el
      respaldo lógico diario restaura completo, pero no vuelve al minuto
      anterior a un borrado.

## Prioridad 4 — mejoras de UX

- [ ] Completar fotos de producto faltantes (emparejar por EAN, no por
      nombre — ver `dermaland-product-images-carol.md`).
- [ ] Responsive del POS en monitor ancho 4K (validar que el grid `2xl:5`
      cols no queda demasiado pequeño).
- [ ] Botón "Nueva venta" más visible en el panel de venta emitida.
- [ ] Atajo de teclado para alternar método de pago (1·2·3 = cash · card ·
      transfer).
- [ ] Búsqueda fonética / por SKU parcial más tolerante en POS.

## Prioridad 5 — fiscal (DGII)

- [ ] **Fase G (envío real a DGII testecf)** sigue bloqueada por política
      operativa — no avanzar sin autorización explícita del dueño en ese
      turno (`dermaland-dgii-phase-g-policy`). Infra real ya construida,
      emisión real apagada por killswitch a propósito.
- [ ] Conversión de proforma a e-CF (transición de status `issued`/`paid` →
      `pending_ecf` → `converted_to_ecf`).
- [ ] Pruebas con NCF de pre-producción DGII una vez autorizada la Fase G.

## Prioridad 6 — canales

- [ ] **WhatsApp Cloud API real** — hoy el envío es asistido (`wa.me`), no
      automatizado; falta el webhook firmado y las plantillas aprobadas.
- [ ] Ampliar el agente IA más allá de NAURA (solo-lectura, recomienda solo
      con stock) a flujos con escritura, si el negocio lo pide.

## Prioridad 7 — calidad y CI/CD

- [ ] CI/CD verde end-to-end (lint + typecheck + test + build + e2e) en
      Gitea/GitHub Actions.
- [ ] Playwright E2E ampliado: flujo completo de venta + impresión.
- [ ] Audit de accesibilidad básica (aria, foco, contraste).

## Prioridad 8 — go-live

- [ ] Ensayar el rollback documentado (`docs/rollback-plan.md`) una vez, no
      solo tenerlo escrito.
- [ ] Dominio productivo confirmado.
- [ ] Alertas automáticas (hoy: revisión manual diaria).
- [ ] Usuarios entrenados.
- [ ] Cierre de R-FIS-01 (reglas documentales confirmadas por el negocio) y
      R-FIS-02 (DGII real, Fase G autorizada).

---

## Hecho recientemente

| Fecha | Item |
|---|---|
| 2026-08-06 | **B-04 cerrado en código: 2FA obligatorio para admin/super_admin/is_platform_admin.** Enrolamiento, desafío en login, enforcement en middleware, break-glass de emergencia probado 16/16 contra Supabase real. Se cerraron un bypass completo del 2FA y tres formas de encierro. **Sin desplegar** — pendiente activación del dueño (spec §6.2). Detalle en `docs/estado-actual.md`. |
| 2026-08-05/06 | **B-01 cerrado: simulacro de recuperación de un solo comando.** `scripts/backup/dr-drill.mjs` restaura producción real en un arenero efímero y compara 7 dimensiones — PASA, 0 diferencias, 0 errores (`docs/dr-drill-20260805.md`). Verificado con 5 sabotajes distintos y con un `SIGKILL` real del proceso local. |
| 2026-08-05 | **B-07 cerrado: el repositorio vuelve a reconstruir el esquema completo.** `scripts/audit-migrations.mjs` recuperó 4 migraciones fuera del repo y corrigió 5 nombres que la CLI de Supabase saltaba en silencio. Hoy 51 archivos, 0 saltados, reconstrucción delta cero (83/83 tablas) (`docs/migration-audit-20260805.md`). |
| 2026-07-13 | **B-02/B-03/B-05 corregidos:** emisión y anulación de venta atómicas (`emit_sale_atomic`, `void_sale_atomic`), y conteo físico con vistas reales + ajuste de stock atómico al aprobar. |
| ~2026-06 | **Conectar Supabase real completado.** `DATA_SOURCE=supabase` es la única fuente en producción; ya no hay modo mock activo. RLS habilitado en 83/83 tablas de `public` (verificado en vivo, `docs/estado-actual.md`). |
| 2026-06-18 | **Productos + catálogos migrados a Supabase** (read+write gated, seed idempotente, CRUD de catálogos por modal). Detalle en `docs/auditoria-supabase.md`. |
| 2026-06-18 | **Sucursales migradas a Supabase** (primer módulo UI→fuente única). Detalle en `docs/auditoria-supabase.md`. |
| 2026-05-07 | Memoria persistente del proyecto: `CLAUDE.md`, `PROJECT_MEMORY.md`, `docs/contexto-general.md`, `docs/estado-actual.md`, `docs/proximos-pasos.md`, `docs/comandos-locales.md`. |
| 2026-05-07 | Rediseño POS: layout fluido + reglas documentales (`resolveDocumentToIssue`) + selector de pago explícito + indicador de documento + botón dinámico + aviso CF sin RNC. |
| 2026-05-07 | Sistema de agentes de desarrollo: `AGENTS.md` + 10 docs en `docs/agents/` + workflow + checklist + prompt. |
| 2026-05-07 | Fix hydration mismatch en `/proformas/[id]/print` (patrón `mounted`). |
