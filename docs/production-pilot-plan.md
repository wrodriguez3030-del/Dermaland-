# DermaLand · Plan de Piloto Controlado

Plan para arrancar con **una empresa real** minimizando riesgo. Basado en la
validación de producción del 2026-07-12 (ver `docs/production-readiness-report.md`).

Veredicto que habilita este plan: **APTO SOLO PARA PILOTO CONTROLADO.**

## 1. Alcance del piloto

| Parámetro | Valor |
|---|---|
| **Empresa** | 1 (la empresa DermaLand ya cargada, `status=trial` → pasar a `active`) |
| **Sucursales** | 1 (la sucursal piloto) |
| **Usuarios** | 3–5 (1 admin + cajeros/inventario) |
| **Duración inicial** | 4 semanas, con revisión a la semana 1 y 2 |
| **Datos** | catálogo ya cargado (1355 productos, 1368 lotes) — validar precios/stock inicial |

## 2. Módulos — qué se enciende y qué se apaga

### ✅ Activos en el piloto (operativos y verificados)
- **Autenticación / Usuarios / Roles y permisos** — RLS + claims en `app_metadata`.
- **Clientes** — CRUD real en Supabase.
- **Productos / Lotes / Vencimientos** — reales en Supabase.
- **Inventario y movimientos** — descuento atómico (`decrement_lot_stock`).
- **POS / Ventas / Pagos** — totales recalculados en servidor, venta idempotente.
- **Devoluciones / Anulación** — por el flujo del sistema (con auditoría).
- **Compras / Proveedores** — reales en Supabase.
- **Reportes** — leen de Supabase con RLS.
- **Super-administración** — protegida por `is_platform_admin` en `app_metadata`.

### 🟡 Activar con vigilancia
- **Conteo físico móvil (PWA)** — la escritura/sincronización persiste en Supabase
  con idempotencia (`device_id, offline_scan_id`). Validar en 1–2 dispositivos
  reales antes de usarlo para ajustar stock en serio. Empezar en modo "solo
  conteo", aplicar ajustes con revisión manual de diferencias.
- **Imágenes de producto** — hoy se guardan como *data URL en el navegador*
  (localStorage), **no** en servidor. Usar como cosmético; **no** depender de que
  las fotos sincronicen entre equipos hasta migrar al bucket `product-images`.

### 🔴 Apagados en el piloto (no listos / requieren credenciales)
- **DGII e-CF (emisión fiscal real)** — mantener en ambiente de pruebas / OFF
  (0 e-CF emitidos hoy). No emitir comprobantes fiscales reales hasta completar la
  certificación DGII con el certificado `.p12` del cliente y aprobación explícita
  (política de Fase G).
- **WhatsApp Cloud API** — activar solo cuando estén las plantillas aprobadas por
  Meta y el `WHATSAPP_APP_SECRET`/tokens reales. El webhook ya valida firma HMAC.
- **IA** — mantener OFF salvo que el cliente pegue su API key real de OpenAI y con
  presupuesto/cuota configurados. La clave va cifrada y write-only; rate-limit 30/min.

## 3. Requisitos OBLIGATORIOS antes del día 1 (go-live gate)

1. **Backup probado.** Subir Supabase a **Pro** (backups diarios + PITR) **o**
   configurar el `pg_dump` diario externo, **y hacer una restauración de prueba**
   documentada (`docs/backup-and-restore.md`). *Sin esto, no arrancar.*
2. **Backup manual** tomado justo antes del go-live (`--label go-live`).
3. **MFA (TOTP)** habilitado para el usuario admin (Supabase Auth → MFA).
4. **Contraseñas fuertes** para los 3–5 usuarios; rotar cualquier credencial de prueba.
5. **Datos iniciales validados:** precios de venta, ITBIS y stock inicial por lote
   revisados con el cliente (spot-check de 20–30 productos).
6. **Monitoreo encendido** (ver §5).
7. **Sistema anterior disponible** en paralelo las primeras 2 semanas (paracaídas).
8. **Capacitación** de los usuarios de la sucursal (POS, devolución, cierre de caja).
9. **Plan de reversión** leído por el responsable técnico (`docs/rollback-plan.md`).

## 4. Controles diarios durante el piloto

- **Cierre de caja diario** y cuadre contra ventas del sistema.
- **Revisión de diferencias de inventario** (ajustes con motivo y autoría).
- **Revisión de errores** del día (Vercel Runtime Logs + advisors Supabase).
- **Verificar el backup de anoche** (existe y pesa lo esperado).

## 5. Monitoreo mínimo desde el día 1

| Qué | Cómo (piloto) | Evolución |
|---|---|---|
| Errores de app (4xx/5xx) | Vercel Runtime Logs, revisión diaria | Sentry |
| Errores de BD / RLS faltante | `get_advisors(security)` semanal | Alerta automática |
| Accesos no autorizados | `audit_logs` + revisión | Alerta |
| Ventas/pagos duplicados | índices únicos previenen; revisar cierre de caja | Alerta |
| Inventario negativo | RPC lo previene; query semanal `current_quantity<0` | CHECK constraint |
| Backup diario | verificación manual | Alerta si falla el cron |
| Salud del deploy | `/super-admin/salud` + health check | Uptime monitor |

## 6. Criterios para DETENER el piloto (rollback al sistema anterior)

- Cualquier fuga de datos entre… (n/a con 1 empresa, pero vigilar si se agrega otra).
- Descuadre de caja/inventario no explicable y recurrente.
- Pérdida de datos sin backup para recuperarlos.
- Caída del sistema > 2 h en horario laboral sin recuperación.
- Ventas/pagos duplicándose pese a los controles.

## 7. Criterios para AMPLIAR (2ª empresa / más sucursales)

- 4 semanas sin incidentes SEV-1/2.
- Restauración de backup probada al menos una vez con éxito.
- MFA activo para todos los admins.
- Cross-tenant test verde re-ejecutado con la 2ª empresa creada.
- Cierres de caja diarios cuadrando de forma consistente.

## 8. Soporte y recuperación

- **Soporte:** responsable técnico disponible en horario del piloto; canal directo
  con la sucursal.
- **Recuperación:** `docs/rollback-plan.md` (deploy/datos) + `docs/backup-and-restore.md`
  (restauración) + `docs/security/incident-response.md` (incidentes).
