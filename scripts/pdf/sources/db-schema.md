
---

## ESQUEMA DE BASE DE DATOS COMPLETO - DermaLand

### ORDEN DE APLICACIÓN DE MIGRACIONES

| # | Archivo | Introducción |
|---|---------|--------------|
| 0001 | `0001_phase1_core.sql` | Tablas core: tenancia (businesses, branches, warehouses), usuarios, audit_logs, planes. RLS y funciones auth. |
| 0002a | `0002a_clients.sql` | Tabla clients (CRM/clientes), referencias de proformas/e-CF. |
| 0002 | `0002_phase2_inventory.sql` | Inventario: productos, marcas, laboratorios, lotes, movimientos, conteos físicos, cuarentena, recalls. |
| 0003 | `0003_dgii_pos.sql` | DGII (e-CF): configuración, certificados, secuencias, POS (cajas, proformas, e-CF, cierres), recepción de facturas. |
| 0004 | `0004_dgii_permissions_seed.sql` | Tabla `permissions` con 18 permisos DGII/cash (catálogo). |
| 0005 | `0005_dgii_role_permissions_seed.sql` | Tablas `roles` y `role_permissions`, mapeo N:M de 7 roles con 18 permisos. |
| 0006 | `0006_auth_helpers_jwt_metadata.sql` | Actualiza funciones `auth_business_id()` y `auth_is_platform_admin()` para leer JWT metadata anidado. |
| 0007 | `0007_audit_logs_insert_policy.sql` | Añade policy INSERT a `audit_logs` con guardia `business_id` y `user_id`. |
| 0008 | `0008_security_advisor_fixes.sql` | Optimizaciones RLS (InitPlan, security_invoker, search_path). Sin cambios de lógica. |
| 0009 | `0009_rls_initplan_remaining.sql` | Envuelve `auth_*()` en (select ...) en todas las policies restantes. |

---

## TABLAS POR DOMINIO

### A. PLATAFORMA Y TENANCY

#### `platform_users`
**Propósito:** Usuarios de la plataforma (super admin).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK: identificador único |
| email | text | - | ✓ | Único por usuario admin |
| full_name | text | - | ✓ | Nombre completo |
| is_active | boolean | true | ✓ | Usuario activo |
| two_factor_enabled | boolean | false | ✓ | 2FA habilitado |
| created_at | timestamptz | now() | ✓ | Timestamp de creación |
| updated_at | timestamptz | now() | ✓ | Timestamp de última actualización |

**Constraints:**
- PRIMARY KEY: `id`
- UNIQUE: `email`
- RLS: `platform_users_select` (SELECT solo si `auth_is_platform_admin()`)

**Índices:**
- (Ninguno adicional más allá de PK/UNIQUE)

---

#### `plans`
**Propósito:** Catálogo de planes de suscripción (global).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK: identificador único |
| name | text | - | ✓ | Nombre único del plan (p.ej. 'Básico', 'Pro', 'Business / POS') |
| monthly_price_usd | numeric(10,2) | - | ✓ | Precio mensual en USD |
| features | jsonb | '[]' | ✓ | Array de características (JSON) |
| limits | jsonb | '{}' | ✓ | Límites por plan (JSON) |
| highlight | boolean | false | ✓ | Destaca el plan en UI |
| created_at | timestamptz | now() | ✓ | Timestamp de creación |

**Constraints:**
- PRIMARY KEY: `id`
- UNIQUE: `name`
- RLS: `plans_select` (SELECT: true), `plans_admin_insert`, `plans_admin_update`, `plans_admin_delete` (solo `auth_is_platform_admin()`)

**Seed (valores iniciales):**
```
('00000000-0000-0000-0000-000000000001', 'Básico', 39, '[]'::jsonb, '{}'::jsonb, false)
('00000000-0000-0000-0000-000000000002', 'Pro', 99, '[]'::jsonb, '{}'::jsonb, false)
('00000000-0000-0000-0000-000000000003', 'Business / POS', 199, '[]'::jsonb, '{}'::jsonb, true)
('00000000-0000-0000-0000-000000000004', 'Premium IA', 349, '[]'::jsonb, '{}'::jsonb, false)
('00000000-0000-0000-0000-000000000005', 'Enterprise', 0, '[]'::jsonb, '{}'::jsonb, false)
```

---

#### `businesses`
**Propósito:** Tenant/empresa (multi-tenant core).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK: identificador único |
| legal_name | text | - | ✓ | Razón social |
| commercial_name | text | - | ✓ | Nombre comercial |
| rnc | text | - | ✓ | RNC/NIT del negocio (Rep. Dominicana) |
| country | text | 'República Dominicana' | ✓ | País |
| phone | text | - | - | Teléfono |
| whatsapp | text | - | - | WhatsApp |
| email | text | - | - | Email contacto |
| instagram_url | text | - | - | URL Instagram |
| logo_url | text | - | - | URL logo |
| dgii_enabled | boolean | false | ✓ | DGII habilitado (control gating) |
| plan_id | uuid | - | ✓ | FK → `plans(id)` |
| status | text | 'trial' | ✓ | CHECK: 'active'\|'suspended'\|'trial'\|'past_due' |
| created_at | timestamptz | now() | ✓ | Timestamp de creación |
| updated_at | timestamptz | now() | ✓ | Timestamp de última actualización |
| deleted_at | timestamptz | - | - | Soft delete |

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `plan_id` → `plans(id)`
- CHECK: `status in ('active','suspended','trial','past_due')`
- RLS: `businesses_sel` (SELECT: admin OR id=biz), `businesses_ins` (INSERT: admin), `businesses_upd` (UPDATE: admin OR id=biz), `businesses_del` (DELETE: admin)

**Índices:**
- `businesses_status_idx`: (status)

**Seed:**
```
('00000000-0000-0000-0000-00000000d001', 'DermaLand SRL', 'DermaLand', '1-32-59077-5', 
 'República Dominicana', '+1 809-226-5252', '+1 809-226-5252', 'dermalandrd@gmail.com', 
 '00000000-0000-0000-0000-000000000003', 'trial')
```

---

#### `branches`
**Propósito:** Sucursales de un business.

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK: identificador único |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| code | text | - | ✓ | Código único por business (ej. 'STG-01') |
| name | text | - | ✓ | Nombre sucursal |
| address | text | - | ✓ | Dirección |
| city | text | - | ✓ | Ciudad |
| province | text | - | ✓ | Provincia/estado |
| country | text | - | ✓ | País |
| phone | text | - | - | Teléfono |
| whatsapp | text | - | - | WhatsApp |
| email | text | - | - | Email |
| is_pilot | boolean | false | ✓ | Sucursal piloto (para pruebas DGII) |
| show_on_website | boolean | true | ✓ | Mostrar en web |
| status | text | 'active' | ✓ | CHECK: 'active'\|'inactive' |
| created_at | timestamptz | now() | ✓ | Timestamp de creación |
| updated_at | timestamptz | now() | ✓ | Timestamp de última actualización |
| deleted_at | timestamptz | - | - | Soft delete |

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- UNIQUE: (business_id, code)
- CHECK: `status in ('active','inactive')`
- RLS: `branches_sel` (SELECT: business_id=biz OR admin), `branches_ins/upd/del` (business_id=biz)

**Índices:**
- `branches_business_idx`: (business_id)

**Seed:**
```
('00000000-0000-0000-0000-00000000b001', '00000000-0000-0000-0000-00000000d001', 'STG-01', 
 'DermaLand Santiago', 'Calle E. León Jiménez No. 47, Esq. Mayagüez, Reparto del Este',
 'Santiago de los Caballeros', 'Santiago', 'República Dominicana',
 '+1 809-226-5252', NULL, 'santiago@dermaland.do', true, true, 'active')
```

---

#### `warehouses`
**Propósito:** Almacenes por sucursal.

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK: identificador único |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| branch_id | uuid | - | ✓ | FK → `branches(id)` ON DELETE CASCADE |
| code | text | - | ✓ | Código único por business |
| name | text | - | ✓ | Nombre almacén |
| description | text | - | - | Descripción |
| is_main | boolean | false | ✓ | Almacén principal |
| created_at | timestamptz | now() | ✓ | Timestamp de creación |
| updated_at | timestamptz | now() | ✓ | Timestamp de última actualización |

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `branch_id` → `branches(id)` ON DELETE CASCADE
- UNIQUE: (business_id, code)
- RLS: `warehouses_all` (business_id=biz)

---

### B. AUTH Y PERMISOS

#### `users`
**Propósito:** Usuarios del tenant (mapeo a auth.users de Supabase).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | - | ✓ | PK: mismo id que auth.users |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| email | text | - | ✓ | Email único |
| full_name | text | - | ✓ | Nombre completo |
| phone | text | - | - | Teléfono |
| role | text | 'cashier' | ✓ | CHECK: 'admin'\|'manager'\|'cashier'\|'inventory'\|'supervisor'\|'auditor' |
| branch_ids | uuid[] | '{}' | ✓ | Array de sucursales autorizadas |
| two_factor_enabled | boolean | false | ✓ | 2FA habilitado |
| status | text | 'active' | ✓ | CHECK: 'active'\|'invited'\|'disabled' |
| last_login_at | timestamptz | - | - | Última conexión |
| avatar_color | text | '#1A7F8E' | ✓ | Color de avatar |
| created_at | timestamptz | now() | ✓ | Timestamp de creación |
| updated_at | timestamptz | now() | ✓ | Timestamp de última actualización |
| deleted_at | timestamptz | - | - | Soft delete |

**Enums:**
- `role`: admin, manager, cashier, inventory, supervisor, auditor
- `status`: active, invited, disabled

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- UNIQUE: `email`
- CHECK: `role in ('admin','manager','cashier','inventory','supervisor','auditor')`
- CHECK: `status in ('active','invited','disabled')`
- RLS: `users_sel/ins/upd/del` (business_id=biz)

**Índices:**
- `users_business_idx`: (business_id)

---

#### `permissions`
**Propósito:** Catálogo de permisos granulares (creado en 0004).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| code | text | - | ✓ | PK: código único (ej. 'dgii:invoices:send') |
| module | text | - | ✓ | Módulo (ej. 'Facturas electrónicas') |
| description | text | - | ✓ | Descripción legible |
| is_destructive | boolean | false | ✓ | Marca operación destructiva (auditable) |
| created_at | timestamptz | now() | ✓ | Timestamp de creación |

**Permisos DGII (18):**

| Code | Module | Destructive | Descripción |
|------|--------|-------------|-------------|
| dgii:configure | Configuración DGII | false | Editar RNC, ambiente, URLs |
| dgii:certificate:upload | Certificado | true | Subir/reemplazar .p12 |
| dgii:sequences:manage | Secuencias | true | Importar/gestionar secuencias |
| dgii:invoices:generate_xml | Facturas electrónicas | false | Generar XML e-CF |
| dgii:invoices:validate_xml | Facturas electrónicas | false | Validar contra XSD DGII |
| dgii:invoices:sign | Facturas electrónicas | true | Firmar XML con certificado |
| dgii:invoices:send | Facturas electrónicas | true | Enviar XML a DGII |
| dgii:invoices:check_status | Facturas electrónicas | false | Consultar estado TrackId |
| dgii:invoices:download_xml | Facturas electrónicas | false | Descargar XML |
| dgii:invoices:download_pdf | Facturas electrónicas | false | Descargar PDF |
| dgii:credit_notes:create | Notas de crédito | true | Crear NC (e-CF 34) |
| dgii:reports:view | Reportes | false | Ver reportes fiscales |
| dgii:certification:run_tests | Pre-certificación | false | Pruebas en testecf |
| cash:open | Caja/cierre | false | Abrir sesión caja |
| cash:close | Caja/cierre | true | Cerrar sesión caja |
| cash:change_closing_percentage | Caja/cierre | true | Cambiar % e-CF en cierre |
| cash:authorize_below_100_percent | Caja/cierre | true | Autorizar cierres < 100% |
| cash:reverse_closing | Caja/cierre | true | Reversar cierre confirmado |

**Constraints:**
- PRIMARY KEY: `code`
- RLS: `permissions_read_all` (SELECT: true, cualquier usuario)

---

#### `roles`
**Propósito:** Catálogo de roles del sistema (creado en 0005).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| code | text | - | ✓ | PK: código único (ej. 'admin') |
| label | text | - | ✓ | Etiqueta legible (ej. 'Admin') |
| description | text | - | ✓ | Descripción |
| created_at | timestamptz | now() | ✓ | Timestamp de creación |

**Roles (7):**

| Code | Label | Descripción |
|------|-------|-------------|
| super_admin | Súper Admin | Acceso total. Solo personal interno. |
| admin | Admin | Administra negocio: sucursales, usuarios, config. |
| manager | Gerente de sucursal | Gestiona sucursal asignada: POS, inventario, conteos. |
| cashier | Cajero | Atiende ventas POS, abre/cierra caja. |
| inventory | Inventario | Recepciones, conteos, ajustes. |
| supervisor | Supervisor | Aprueba ajustes, autoriza cierres sensibles. |
| auditor | Auditor | Solo lectura: auditoría, reportes, logs. |

**Constraints:**
- PRIMARY KEY: `code`
- RLS: `roles_read_all` (SELECT: true)

---

#### `role_permissions`
**Propósito:** Matriz N:M rol ↔ permiso (creado en 0005).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| role_code | text | - | ✓ | FK → `roles(code)` ON DELETE CASCADE |
| permission_code | text | - | ✓ | FK → `permissions(code)` ON DELETE CASCADE |
| granted_at | timestamptz | now() | ✓ | Timestamp de otorgamiento |

**Constraints:**
- PRIMARY KEY: (role_code, permission_code)
- FOREIGN KEY: `role_code` → `roles(code)` ON DELETE CASCADE
- FOREIGN KEY: `permission_code` → `permissions(code)` ON DELETE CASCADE
- RLS: `role_permissions_read_all` (SELECT: true)

**Asignación por rol:**

| Rol | Permisos (count) |
|-----|------------------|
| super_admin | 18 (todos) |
| admin | 18 (todos) |
| manager | 12 (dgii: generate_xml, validate_xml, sign, send, check_status, download_xml, download_pdf, credit_notes:create, reports:view; cash: open, close, change_closing_percentage) |
| cashier | 4 (dgii: generate_xml, download_pdf; cash: open, close) |
| inventory | 0 |
| supervisor | 3 (dgii: reports:view; cash: authorize_below_100_percent, reverse_closing) |
| auditor | 4 (dgii: reports:view, invoices:check_status, invoices:download_xml, invoices:download_pdf) |

---

#### `audit_logs`
**Propósito:** Auditoria de acciones por tenant.

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK: identificador único |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| user_id | uuid | - | - | FK → `users(id)` ON DELETE SET NULL |
| user_name | text | - | - | Nombre del usuario (snapshot) |
| action | text | - | ✓ | Acción realizada (ej. 'created', 'updated', 'deleted') |
| entity | text | - | ✓ | Entidad afectada (ej. 'proforma', 'electronic_invoice') |
| entity_id | text | - | ✓ | ID de la entidad |
| branch_id | uuid | - | - | FK → `branches(id)` (referencia opcional) |
| metadata | jsonb | - | - | Datos adicionales (antes/después) |
| ip_address | inet | - | - | IP del cliente |
| created_at | timestamptz | now() | ✓ | Timestamp de creación |

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `user_id` → `users(id)` ON DELETE SET NULL
- FOREIGN KEY: `branch_id` → `branches(id)` (sin constraint explícito listado pero referencia)
- RLS: `audit_logs_select` (SELECT: business_id=biz), `audit_logs_insert` (INSERT: business_id=biz AND (user_id IS NULL OR user_id=auth.uid()))

**Índices:**
- `audit_logs_business_created_idx`: (business_id, created_at DESC)

---

### C. CATÁLOGO Y INVENTARIO

#### `brands`
**Propósito:** Marcas de productos.

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| name | text | - | ✓ | Nombre de marca |
| product_count | int | 0 | ✓ | Contador de productos (desnormalizado) |
| created_at | timestamptz | now() | ✓ | Timestamp |
| updated_at | timestamptz | now() | ✓ | Timestamp |

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- UNIQUE: (business_id, name)
- RLS: `brands_all` (business_id=biz)

---

#### `laboratories`
**Propósito:** Laboratorios (fabricantes).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| name | text | - | ✓ | Nombre del laboratorio |
| country | text | - | - | País de origen |
| created_at | timestamptz | now() | ✓ | Timestamp |
| updated_at | timestamptz | now() | ✓ | Timestamp |

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- RLS: `laboratories_all` (business_id=biz)

---

#### `product_categories`
**Propósito:** Categorías jerárquicas de productos.

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| name | text | - | ✓ | Nombre categoría |
| parent_id | uuid | - | - | FK → `product_categories(id)` (autorreferencia) |
| description | text | - | - | Descripción |
| created_at | timestamptz | now() | ✓ | Timestamp |
| updated_at | timestamptz | now() | ✓ | Timestamp |

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `parent_id` → `product_categories(id)` (sin ON DELETE listado; NULL para raíz)
- RLS: `product_categories_all` (business_id=biz)

---

#### `products`
**Propósito:** Catálogo de productos.

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| sku | text | - | ✓ | SKU único por business |
| barcode | text | - | - | Código de barras (único por business si no null) |
| name | text | - | ✓ | Nombre producto |
| description | text | - | - | Descripción |
| brand_id | uuid | - | - | FK → `brands(id)` |
| laboratory_id | uuid | - | - | FK → `laboratories(id)` |
| category_id | uuid | - | - | FK → `product_categories(id)` |
| unit | text | 'unidad' | ✓ | Unidad de medida |
| pharmaceutical_form | text | - | - | Forma farmacéutica (cápsula, jarabe, etc.) |
| presentation | text | - | - | Presentación (10 ml, 30 comp, etc.) |
| active_ingredient | text | - | - | Principio activo |
| concentration | text | - | - | Concentración |
| sanitary_registry | text | - | - | Registro sanitario |
| storage_temperature | text | - | - | Temperatura de almacenamiento |
| requires_prescription | boolean | false | ✓ | Requiere receta |
| controlled | boolean | false | ✓ | Sustancia controlada |
| cost | numeric(12,2) | 0 | ✓ | Costo unitario |
| price | numeric(12,2) | - | ✓ | Precio de venta |
| itbis_rate | numeric(5,2) | 18 | ✓ | Tasa ITBIS (%) |
| min_stock | int | 0 | ✓ | Stock mínimo |
| max_stock | int | 0 | ✓ | Stock máximo |
| image_url | text | - | - | URL imagen |
| active | boolean | true | ✓ | Producto activo |
| sellable | boolean | true | ✓ | Vendible |
| created_at | timestamptz | now() | ✓ | Timestamp |
| updated_at | timestamptz | now() | ✓ | Timestamp |
| deleted_at | timestamptz | - | - | Soft delete |

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `brand_id` → `brands(id)`
- FOREIGN KEY: `laboratory_id` → `laboratories(id)`
- FOREIGN KEY: `category_id` → `product_categories(id)`
- UNIQUE: (business_id, sku)
- UNIQUE (parcial): (business_id, barcode) WHERE barcode IS NOT NULL
- RLS: `products_all` (business_id=biz)

**Índices:**
- `products_barcode_unique`: (business_id, barcode) WHERE barcode IS NOT NULL
- `products_business_active_idx`: (business_id, active)

---

#### `product_lots`
**Propósito:** Lotes/números de serie de productos (por almacén).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| branch_id | uuid | - | ✓ | FK → `branches(id)` ON DELETE CASCADE |
| product_id | uuid | - | ✓ | FK → `products(id)` ON DELETE CASCADE |
| warehouse_id | uuid | - | ✓ | FK → `warehouses(id)` ON DELETE CASCADE |
| warehouse_location_id | uuid | - | - | Ubicación física (pendiente modelo) |
| lot_number | text | - | ✓ | Número lote/lote |
| manufactured_at | date | - | - | Fecha fabricación |
| expires_at | date | - | ✓ | Fecha vencimiento |
| received_at | timestamptz | now() | ✓ | Fecha recepción |
| initial_quantity | int | - | ✓ | Cantidad inicial |
| current_quantity | int | - | ✓ | Cantidad actual (stock) |
| unit_cost | numeric(12,2) | - | ✓ | Costo unitario |
| unit_price | numeric(12,2) | - | - | Precio unitario (sobrescribe producto) |
| supplier_id | uuid | - | - | Proveedor (referencia pendiente) |
| purchase_invoice | text | - | - | Número factura de compra |
| status | text | 'available' | ✓ | CHECK: 'available'\|'quarantine'\|'expired'\|'recalled'\|'damaged'\|'returned' |
| notes | text | - | - | Notas |
| created_at | timestamptz | now() | ✓ | Timestamp |
| updated_at | timestamptz | now() | ✓ | Timestamp |

**Enums:**
- `status`: available, quarantine, expired, recalled, damaged, returned

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `branch_id` → `branches(id)` ON DELETE CASCADE
- FOREIGN KEY: `product_id` → `products(id)` ON DELETE CASCADE
- FOREIGN KEY: `warehouse_id` → `warehouses(id)` ON DELETE CASCADE
- UNIQUE: (business_id, product_id, lot_number, warehouse_id)
- CHECK: `status in ('available','quarantine','expired','recalled','damaged','returned')`
- RLS: `product_lots_all` (business_id=biz)

**Índices:**
- `product_lots_fefo_idx`: (business_id, product_id, expires_at) WHERE status='available' AND current_quantity > 0 (FEFO: First Expiring, First Out)
- `product_lots_expiring_idx`: (business_id, expires_at) WHERE status='available'

**Funciones:**
- `select_lot_for_sale(p_business_id uuid, p_product_id uuid, p_branch_id uuid DEFAULT NULL)` → uuid: Devuelve el lote más próximo a vencer disponible (FEFO). Usado por POS y server actions.

---

#### `inventory_movements`
**Propósito:** Registro de movimientos de inventario (entrada, salida, transferencia, ajuste).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| branch_id | uuid | - | ✓ | FK → `branches(id)` ON DELETE CASCADE |
| product_id | uuid | - | ✓ | FK → `products(id)` |
| lot_id | uuid | - | - | FK → `product_lots(id)` |
| warehouse_id | uuid | - | ✓ | FK → `warehouses(id)` |
| type | text | - | ✓ | CHECK: 'entry_purchase'\|'exit_sale'\|'transfer_out'\|'transfer_in'\|'adjustment_positive'\|'adjustment_negative'\|'return_in'\|'return_out'\|'quarantine'\|'release'\|'expiry'\|'count_adjustment' |
| quantity | int | - | ✓ | Cantidad (positiva o negativa según tipo) |
| reason | text | - | - | Motivo/razón del movimiento |
| reference | text | - | - | Referencia (ej. número factura, proforma) |
| user_id | uuid | - | - | FK → `users(id)` |
| user_name | text | - | - | Nombre usuario (snapshot) |
| created_at | timestamptz | now() | ✓ | Timestamp |

**Enums:**
- `type`: entry_purchase, exit_sale, transfer_out, transfer_in, adjustment_positive, adjustment_negative, return_in, return_out, quarantine, release, expiry, count_adjustment

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `branch_id` → `branches(id)` ON DELETE CASCADE
- FOREIGN KEY: `product_id` → `products(id)`
- FOREIGN KEY: `lot_id` → `product_lots(id)`
- FOREIGN KEY: `warehouse_id` → `warehouses(id)`
- FOREIGN KEY: `user_id` → `users(id)`
- CHECK: `type in (...)`
- RLS: `inventory_movements_all` (business_id=biz)

**Índices:**
- `inventory_movements_business_idx`: (business_id, created_at DESC)

---

#### Vista: `inventory_stock_by_lot`
**Propósito:** Vista desnormalizada de stock por lote.

```sql
SELECT
  business_id,
  branch_id,
  warehouse_id,
  product_id,
  id as lot_id,
  lot_number,
  expires_at,
  current_quantity as quantity,
  status
FROM product_lots
```

**Propiedades:** `security_invoker = true` (0008) para respetar RLS.

---

#### `inventory_counts`
**Propósito:** Conteos físicos de inventario.

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| branch_id | uuid | - | ✓ | FK → `branches(id)` ON DELETE CASCADE |
| warehouse_id | uuid | - | ✓ | FK → `warehouses(id)` ON DELETE CASCADE |
| count_number | text | - | ✓ | Número único conteo |
| count_type | text | - | ✓ | CHECK: 'full'\|'partial'\|'spot' |
| status | text | 'draft' | ✓ | CHECK: 'draft'\|'in_progress'\|'paused'\|'submitted'\|'reviewed'\|'approved'\|'rejected'\|'adjusted'\|'cancelled' |
| assigned_to | uuid[] | '{}' | ✓ | Array de usuarios asignados |
| started_at | timestamptz | - | - | Inicio conteo |
| submitted_at | timestamptz | - | - | Envío para revisión |
| reviewed_at | timestamptz | - | - | Revisión completada |
| approved_at | timestamptz | - | - | Aprobación completada |
| cancelled_at | timestamptz | - | - | Cancelación |
| reviewed_by | uuid | - | - | FK → `users(id)` (quien revisó) |
| approved_by | uuid | - | - | FK → `users(id)` (quien aprobó) |
| notes | text | - | - | Notas |
| scan_count | int | 0 | ✓ | Cantidad escaneos |
| item_count | int | 0 | ✓ | Cantidad items |
| created_at | timestamptz | now() | ✓ | Timestamp |
| updated_at | timestamptz | now() | ✓ | Timestamp |

**Enums:**
- `count_type`: full, partial, spot
- `status`: draft, in_progress, paused, submitted, reviewed, approved, rejected, adjusted, cancelled

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `branch_id` → `branches(id)` ON DELETE CASCADE
- FOREIGN KEY: `warehouse_id` → `warehouses(id)` ON DELETE CASCADE
- FOREIGN KEY: `reviewed_by` → `users(id)`
- FOREIGN KEY: `approved_by` → `users(id)`
- UNIQUE: (business_id, count_number)
- CHECK: `count_type in ('full','partial','spot')`
- CHECK: `status in (...)`
- RLS: `inventory_counts_all` (business_id=biz)

---

#### `inventory_count_scans`
**Propósito:** Escaneos individuales durante conteo (offline-sync aware).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| inventory_count_id | uuid | - | ✓ | FK → `inventory_counts(id)` ON DELETE CASCADE |
| product_id | uuid | - | ✓ | FK → `products(id)` |
| product_lot_id | uuid | - | - | FK → `product_lots(id)` |
| branch_id | uuid | - | ✓ | FK → `branches(id)` |
| warehouse_id | uuid | - | ✓ | FK → `warehouses(id)` |
| warehouse_location_id | uuid | - | - | Ubicación física |
| barcode | text | - | - | Código escaneado |
| scanned_quantity | int | 1 | ✓ | Cantidad escaneada |
| scan_source | text | - | ✓ | CHECK: 'camera'\|'bluetooth_scanner'\|'manual' |
| scanned_by | uuid | - | - | FK → `users(id)` |
| scanned_by_name | text | - | - | Nombre usuario (snapshot) |
| scanned_at | timestamptz | now() | ✓ | Timestamp escaneo |
| device_id | text | - | ✓ | ID dispositivo (para idempotencia offline) |
| offline_scan_id | text | - | ✓ | ID escaneo offline (para idempotencia) |
| sync_status | text | 'synced' | ✓ | CHECK: 'synced'\|'pending'\|'failed' |
| notes | text | - | - | Notas |
| created_at | timestamptz | now() | ✓ | Timestamp |

**Enums:**
- `scan_source`: camera, bluetooth_scanner, manual
- `sync_status`: synced, pending, failed

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `inventory_count_id` → `inventory_counts(id)` ON DELETE CASCADE
- FOREIGN KEY: `product_id` → `products(id)`
- FOREIGN KEY: `product_lot_id` → `product_lots(id)`
- FOREIGN KEY: `branch_id` → `branches(id)`
- FOREIGN KEY: `warehouse_id` → `warehouses(id)`
- FOREIGN KEY: `scanned_by` → `users(id)`
- UNIQUE: (device_id, offline_scan_id) [idempotencia offline]
- CHECK: `scan_source in ('camera','bluetooth_scanner','manual')`
- CHECK: `sync_status in ('synced','pending','failed')`
- RLS: `inventory_count_scans_all` (business_id=biz)

**Índices:**
- `inventory_count_scans_idempotent`: (device_id, offline_scan_id) UNIQUE
- `inventory_count_scans_count_idx`: (inventory_count_id, scanned_at DESC)

---

#### `inventory_count_items`
**Propósito:** Resumen por producto/lote en un conteo (esperado vs. contado).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| inventory_count_id | uuid | - | ✓ | FK → `inventory_counts(id)` ON DELETE CASCADE |
| product_id | uuid | - | ✓ | FK → `products(id)` |
| product_sku | text | - | ✓ | SKU (snapshot) |
| product_name | text | - | ✓ | Nombre (snapshot) |
| product_lot_id | uuid | - | - | FK → `product_lots(id)` |
| lot_number | text | - | - | Número lote (snapshot) |
| expires_at | date | - | - | Vencimiento (snapshot) |
| warehouse_id | uuid | - | ✓ | FK → `warehouses(id)` |
| expected_quantity | int | - | ✓ | Cantidad esperada (sistema) |
| counted_quantity | int | 0 | ✓ | Cantidad contada |
| difference_quantity | int | GENERATED | ✓ | counted - expected (GENERATED ALWAYS AS ... STORED) |
| status | text | 'match' | ✓ | CHECK: 'match'\|'shortage'\|'overage'\|'expired'\|'unregistered' |
| last_scan_at | timestamptz | - | - | Último escaneo |
| created_at | timestamptz | now() | ✓ | Timestamp |
| updated_at | timestamptz | now() | ✓ | Timestamp |

**Enums:**
- `status`: match, shortage, overage, expired, unregistered

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `inventory_count_id` → `inventory_counts(id)` ON DELETE CASCADE
- FOREIGN KEY: `product_id` → `products(id)`
- FOREIGN KEY: `product_lot_id` → `product_lots(id)`
- FOREIGN KEY: `warehouse_id` → `warehouses(id)`
- CHECK: `status in ('match','shortage','overage','expired','unregistered')`
- RLS: `inventory_count_items_all` (business_id=biz)

---

#### `inventory_count_evidence`
**Propósito:** Fotos/documentos de evidencia en conteos.

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| inventory_count_id | uuid | - | ✓ | FK → `inventory_counts(id)` ON DELETE CASCADE |
| inventory_count_item_id | uuid | - | - | FK → `inventory_count_items(id)` |
| file_url | text | - | ✓ | URL archivo (Storage) |
| file_type | text | - | ✓ | Tipo MIME (image/jpeg, etc.) |
| notes | text | - | - | Notas |
| uploaded_by | uuid | - | - | FK → `users(id)` |
| created_at | timestamptz | now() | ✓ | Timestamp |

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `inventory_count_id` → `inventory_counts(id)` ON DELETE CASCADE
- FOREIGN KEY: `inventory_count_item_id` → `inventory_count_items(id)`
- FOREIGN KEY: `uploaded_by` → `users(id)`
- RLS: `inventory_count_evidence_all` (business_id=biz)

---

#### `inventory_count_sync_logs`
**Propósito:** Trazabilidad de sincronización offline-online de conteos.

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| inventory_count_id | uuid | - | ✓ | FK → `inventory_counts(id)` |
| device_id | text | - | ✓ | ID dispositivo origen |
| user_id | uuid | - | - | FK → `users(id)` |
| sync_status | text | - | ✓ | CHECK: 'success'\|'partial'\|'failed' |
| request_payload | jsonb | - | - | Payload enviado |
| response_payload | jsonb | - | - | Respuesta servidor |
| conflict_detected | boolean | false | ✓ | Conflicto detectado |
| error_message | text | - | - | Mensaje error |
| synced_at | timestamptz | now() | ✓ | Timestamp sincronización |
| created_at | timestamptz | now() | ✓ | Timestamp |

**Enums:**
- `sync_status`: success, partial, failed

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `inventory_count_id` → `inventory_counts(id)`
- FOREIGN KEY: `user_id` → `users(id)`
- CHECK: `sync_status in ('success','partial','failed')`
- RLS: `inventory_count_sync_logs_all` (business_id=biz)

---

#### `lot_quarantine`
**Propósito:** Cuarentena de lotes (problema detectado).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| product_lot_id | uuid | - | ✓ | FK → `product_lots(id)` ON DELETE CASCADE |
| reason | text | - | ✓ | Motivo cuarentena |
| user_id | uuid | - | - | FK → `users(id)` (quien quarantine) |
| released_at | timestamptz | - | - | Timestamp de liberación |
| released_by | uuid | - | - | FK → `users(id)` (quien libera) |
| created_at | timestamptz | now() | ✓ | Timestamp |

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `product_lot_id` → `product_lots(id)` ON DELETE CASCADE
- FOREIGN KEY: `user_id` → `users(id)`
- FOREIGN KEY: `released_by` → `users(id)`
- RLS: `lot_quarantine_all` (business_id=biz)

---

#### `lot_recalls`
**Propósito:** Recalls de lotes (retirada de mercado).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| product_lot_id | uuid | - | ✓ | FK → `product_lots(id)` ON DELETE CASCADE |
| reason | text | - | ✓ | Motivo recall |
| initiated_by | uuid | - | - | FK → `users(id)` |
| customers_notified | int | 0 | ✓ | Cantidad clientes notificados |
| created_at | timestamptz | now() | ✓ | Timestamp |

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `product_lot_id` → `product_lots(id)` ON DELETE CASCADE
- FOREIGN KEY: `initiated_by` → `users(id)`
- RLS: `lot_recalls_all` (business_id=biz)

---

### D. CLIENTES (CRM)

#### `clients`
**Propósito:** Clientes/pacientes del negocio.

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| customer_number | text | - | ✓ | Número cliente único por business |
| first_name | text | - | ✓ | Nombre |
| last_name | text | - | ✓ | Apellido |
| document_type | text | - | - | CHECK: 'cedula'\|'rnc'\|'passport' |
| document_number | text | - | - | Número documento |
| phone | text | - | - | Teléfono |
| whatsapp | text | - | - | WhatsApp |
| email | text | - | - | Email |
| birth_date | date | - | - | Fecha nacimiento |
| address | text | - | - | Dirección |
| city | text | - | - | Ciudad |
| province | text | - | - | Provincia |
| source | text | 'manual' | ✓ | CHECK: 'manual'\|'whatsapp'\|'web'\|'import'\|'agendapro' |
| tags | text[] | '{}' | ✓ | Etiquetas/categorías |
| default_billing_type | text | 'consumo' | ✓ | CHECK: 'consumo'\|'credito_fiscal' |
| skin_type | text | 'not_specified' | ✓ | CHECK: 'not_specified'\|'normal'\|'dry'\|'oily'\|'combination'\|'sensitive'\|'acne_prone'\|'mature'\|'hyperpigmentation'\|'rosacea_reactive' |
| total_spent | numeric(14,2) | 0 | ✓ | Total gastado (desnormalizado) |
| total_orders | int | 0 | ✓ | Cantidad órdenes (desnormalizado) |
| last_visit_at | timestamptz | - | - | Última visita |
| notes | text | - | - | Notas |
| consents | jsonb | '[]' | ✓ | Consentimientos (marketing, etc.) |
| created_at | timestamptz | now() | ✓ | Timestamp |
| updated_at | timestamptz | now() | ✓ | Timestamp |
| deleted_at | timestamptz | - | - | Soft delete |

**Enums:**
- `document_type`: cedula, rnc, passport
- `source`: manual, whatsapp, web, import, agendapro
- `default_billing_type`: consumo, credito_fiscal
- `skin_type`: not_specified, normal, dry, oily, combination, sensitive, acne_prone, mature, hyperpigmentation, rosacea_reactive

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- UNIQUE: (business_id, customer_number)
- UNIQUE (parcial): (business_id, document_number) WHERE document_number IS NOT NULL AND deleted_at IS NULL
- CHECK: `document_type in ('cedula','rnc','passport')`
- CHECK: `source in ('manual','whatsapp','web','import','agendapro')`
- CHECK: `default_billing_type in ('consumo','credito_fiscal')`
- CHECK: `skin_type in ('not_specified','normal','dry','oily','combination','sensitive','acne_prone','mature','hyperpigmentation','rosacea_reactive')`
- RLS: `clients_sel/ins/upd/del` (business_id=biz)

**Índices:**
- `clients_business_document_unique`: (business_id, document_number) WHERE document_number IS NOT NULL AND deleted_at IS NULL
- `clients_business_idx`: (business_id)
- `clients_business_active_idx`: (business_id, deleted_at)

---

### E. DGII / FISCAL / POS

#### `dgii_settings`
**Propósito:** Configuración DGII por business (única por business).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE, UNIQUE |
| rnc_emisor | text | - | ✓ | RNC emisor (espejo de businesses.rnc) |
| razon_social_emisor | text | - | ✓ | Razón social (espejo de businesses.legal_name) |
| nombre_comercial | text | - | - | Nombre comercial (espejo de businesses.commercial_name) |
| direccion_emisor | text | - | ✓ | Dirección fiscal |
| municipio | text | - | - | Municipio |
| provincia | text | - | - | Provincia |
| actividad_economica | text | - | - | Actividad económica DGII |
| telefono_emisor | text | - | - | Teléfono |
| correo_emisor | text | - | - | Email |
| website | text | - | - | Sitio web |
| ambiente | text | 'testecf' | ✓ | CHECK: 'testecf'\|'certecf'\|'ecf' |
| dgii_enabled_real_send | boolean | false | ✓ | Habilita envío a ecf (no testecf). Gating crítico. |
| base_url_testecf | text | 'https://ecf.dgii.gov.do/testecf' | ✓ | URL testecf |
| base_url_certecf | text | 'https://ecf.dgii.gov.do/certecf' | ✓ | URL certecf |
| base_url_ecf | text | 'https://ecf.dgii.gov.do/ecf' | ✓ | URL ecf (producción) |
| default_cash_closing_ecf_percentage | numeric(5,2) | 0 | ✓ | % default proformas → e-CF en cierre (0-100) |
| allow_user_change_closing_percentage | boolean | false | ✓ | Permite al usuario cambiar % |
| minimum_closing_ecf_percentage | numeric(5,2) | 0 | ✓ | % mínimo permitido (0-100) |
| maximum_closing_ecf_percentage | numeric(5,2) | 100 | ✓ | % máximo permitido (0-100) |
| require_admin_authorization_below_100_percent | boolean | true | ✓ | Requiere autorización si % < 100 |
| auto_generate_ecf_on_cash_closing | boolean | false | ✓ | Auto-generar e-CF en cierre |
| applies_to_payment_methods | text[] | array['cash','transfer'] | ✓ | Métodos pago a los que aplica % |
| created_at | timestamptz | now() | ✓ | Timestamp |
| updated_at | timestamptz | now() | ✓ | Timestamp |

**Enums:**
- `ambiente`: testecf, certecf, ecf

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- UNIQUE: `business_id`
- CHECK: `ambiente in ('testecf','certecf','ecf')`
- CHECK: `default_cash_closing_ecf_percentage BETWEEN 0 AND 100`
- CHECK: `minimum_closing_ecf_percentage BETWEEN 0 AND 100`
- CHECK: `maximum_closing_ecf_percentage BETWEEN 0 AND 100`
- CHECK: `minimum_closing_ecf_percentage <= maximum_closing_ecf_percentage` (constraint dgii_settings_percentage_range)
- RLS: `dgii_settings_all` (business_id=biz)

---

#### `dgii_certificates`
**Propósito:** Certificados digitales X.509 para firma DGII (metadata + referencias seguras).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| alias | text | - | ✓ | Alias legible (ej. 'Cert Principal 2024') |
| subject_dn | text | - | - | DN del subject |
| issuer_dn | text | - | - | DN del issuer |
| serial_number | text | - | - | Serial number |
| valid_from | timestamptz | - | - | Fecha inicio validez |
| valid_to | timestamptz | - | - | Fecha fin validez |
| pkcs12_storage_bucket | text | 'certificates' | - | Bucket Storage (preferido) |
| pkcs12_storage_path | text | - | - | Ruta en Storage (si se usa bucket) |
| pkcs12_encrypted_blob | bytea | - | - | Blob cifrado AES-256-GCM (fallback) |
| kdf | text | - | - | Derivación de clave usada |
| iv | bytea | - | - | IV del cifrado |
| tag | bytea | - | - | Tag de autenticación |
| password_secret_ref | text | - | ✓ | Referencia simbólica a secret (Vercel Env, Vault, KMS). NUNCA el valor en claro. |
| is_active | boolean | false | ✓ | Certificado activo |
| revoked_at | timestamptz | - | - | Timestamp revocación |
| uploaded_by | uuid | - | - | FK → `users(id)` |
| created_at | timestamptz | now() | ✓ | Timestamp |
| updated_at | timestamptz | now() | ✓ | Timestamp |

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `uploaded_by` → `users(id)`
- EXCLUDE: (business_id WITH =) WHERE is_active = true [solo un cert activo por business]
- RLS: `dgii_certificates_all` (business_id=biz)

**Índices:**
- `dgii_certificates_business_idx`: (business_id)

---

#### `ecf_sequences`
**Propósito:** Secuencias e-NCF (rangos autorizados por DGII).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| tipo_ecf | text | - | ✓ | CHECK: '31'\|'32'\|'33'\|'34'\|'41'\|'43'\|'44'\|'45'\|'46'\|'47' |
| prefix | text | - | ✓ | Prefijo (ej. 'E31') |
| range_start | int | - | ✓ | Inicio rango |
| range_end | int | - | ✓ | Fin rango |
| next_number | int | - | ✓ | Próximo número a asignar |
| fecha_vencimiento | date | - | ✓ | Vencimiento autorización DGII |
| ambiente | text | - | ✓ | CHECK: 'testecf'\|'certecf'\|'ecf' |
| status | text | 'active' | ✓ | CHECK: 'active'\|'expiring'\|'exhausted'\|'expired'\|'cancelled' |
| created_at | timestamptz | now() | ✓ | Timestamp |
| updated_at | timestamptz | now() | ✓ | Timestamp |

**Enums:**
- `tipo_ecf`: 31, 32, 33, 34, 41, 43, 44, 45, 46, 47
  - 31: Factura de Crédito Fiscal
  - 32: Factura de Consumo
  - 33: Nota de Débito
  - 34: Nota de Crédito
  - 41-47: Otros tipos (reservados)
- `ambiente`: testecf, certecf, ecf
- `status`: active, expiring, exhausted, expired, cancelled

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- UNIQUE: (business_id, tipo_ecf, ambiente, range_start)
- CHECK: `tipo_ecf in ('31','32','33','34','41','43','44','45','46','47')`
- CHECK: `ambiente in ('testecf','certecf','ecf')`
- CHECK: `status in ('active','expiring','exhausted','expired','cancelled')`
- CHECK: `range_end >= range_start` (constraint ecf_sequences_range_ok)
- CHECK: `next_number >= range_start AND next_number <= range_end + 1` (constraint ecf_sequences_next_ok)
- RLS: `ecf_sequences_all` (business_id=biz)

**Índices:**
- `ecf_sequences_unique`: (business_id, tipo_ecf, ambiente, range_start) UNIQUE
- `ecf_sequences_business_idx`: (business_id, tipo_ecf, ambiente, status)

**Funciones:**
- `reserve_ecf_sequence_number(p_business_id uuid, p_tipo_ecf text, p_ambiente text)` → int: Reserva atómicamente el próximo número disponible. Incrementa `next_number`, marca como 'exhausted' si se agota. Devuelve NULL si no hay secuencia disponible. Usa FOR UPDATE para concurrencia.

---

#### `payment_methods`
**Propósito:** Formas de pago disponibles.

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| code | text | - | ✓ | Código único por business (ej. 'cash', 'card', 'transfer') |
| label | text | - | ✓ | Etiqueta legible |
| requires_immediate_ecf | boolean | false | ✓ | Si true → e-CF inmediato, no proforma |
| default_ecf_type | text | - | - | CHECK: '31'\|'32'\|'33'\|'34'\|'41'\|'43'\|'44'\|'45'\|'46'\|'47' |
| is_active | boolean | true | ✓ | Activo |
| created_at | timestamptz | now() | ✓ | Timestamp |
| updated_at | timestamptz | now() | ✓ | Timestamp |

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- UNIQUE: (business_id, code)
- CHECK: `default_ecf_type in ('31','32','33','34','41','43','44','45','46','47')` (si no NULL)
- RLS: `payment_methods_all` (business_id=biz)

---

#### `cash_registers`
**Propósito:** Cajas/terminales POS.

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| branch_id | uuid | - | ✓ | FK → `branches(id)` ON DELETE CASCADE |
| code | text | - | ✓ | Código único por business (ej. 'CAJA-01') |
| name | text | - | ✓ | Nombre (ej. 'Caja Principal') |
| is_active | boolean | true | ✓ | Activa |
| created_at | timestamptz | now() | ✓ | Timestamp |
| updated_at | timestamptz | now() | ✓ | Timestamp |

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `branch_id` → `branches(id)` ON DELETE CASCADE
- UNIQUE: (business_id, code)
- RLS: `cash_registers_all` (business_id=biz)

---

#### `cash_register_sessions`
**Propósito:** Sesiones de caja (abierta → cerrada).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| branch_id | uuid | - | ✓ | FK → `branches(id)` ON DELETE CASCADE |
| cash_register_id | uuid | - | ✓ | FK → `cash_registers(id)` ON DELETE CASCADE |
| session_number | text | - | ✓ | Número único por business |
| opened_by | uuid | - | ✓ | FK → `users(id)` (quien abrió) |
| opened_by_name | text | - | ✓ | Nombre usuario (snapshot) |
| opened_at | timestamptz | now() | ✓ | Timestamp apertura |
| opening_amount | numeric(14,2) | 0 | ✓ | Monto inicial en caja |
| closed_by | uuid | - | - | FK → `users(id)` (quien cerró) |
| closed_at | timestamptz | - | - | Timestamp cierre |
| expected_cash | numeric(14,2) | 0 | ✓ | Efectivo esperado (cálculo sistema) |
| counted_cash | numeric(14,2) | - | - | Efectivo contado (manual) |
| difference_amount | numeric(14,2) | - | - | Diferencia (counted - expected) |
| totals | jsonb | '{}' | ✓ | Totales por método pago (desnormalizado) |
| notes | text | - | - | Notas |
| status | text | 'open' | ✓ | CHECK: 'open'\|'closing'\|'closed'\|'reverted' |
| created_at | timestamptz | now() | ✓ | Timestamp |
| updated_at | timestamptz | now() | ✓ | Timestamp |

**Enums:**
- `status`: open, closing, closed, reverted

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `branch_id` → `branches(id)` ON DELETE CASCADE
- FOREIGN KEY: `cash_register_id` → `cash_registers(id)` ON DELETE CASCADE
- FOREIGN KEY: `opened_by` → `users(id)`
- FOREIGN KEY: `closed_by` → `users(id)`
- UNIQUE: (business_id, session_number)
- CHECK: `status in ('open','closing','closed','reverted')`
- RLS: `cash_register_sessions_all` (business_id=biz)

**Índices:**
- `cash_register_sessions_business_idx`: (business_id, status, opened_at DESC)

---

#### `proformas`
**Propósito:** Documentos de venta (proformas o facturas inmediatas, fiscales o no).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| branch_id | uuid | - | ✓ | FK → `branches(id)` ON DELETE CASCADE |
| cash_register_session_id | uuid | - | - | FK → `cash_register_sessions(id)` ON DELETE SET NULL |
| number | text | - | ✓ | Número único por business |
| customer_id | uuid | - | - | FK → `clients(id)` |
| customer_name | text | - | ✓ | Nombre cliente (snapshot) |
| customer_phone | text | - | - | Teléfono cliente (snapshot) |
| customer_document | text | - | - | Documento cliente (snapshot) |
| cashier_id | uuid | - | ✓ | FK → `users(id)` (cajero) |
| cashier_name | text | - | ✓ | Nombre cajero (snapshot) |
| billing_type | text | - | - | CHECK: 'consumo'\|'credito_fiscal' |
| document_kind | text | 'proforma' | ✓ | CHECK: 'proforma'\|'invoice' |
| ecf_type | text | - | - | CHECK: '31'\|'32'\|'33'\|'34' (si document_kind='invoice') |
| sequence_type | text | - | - | CHECK: 'consumo'\|'credito_fiscal' |
| subtotal | numeric(14,2) | 0 | ✓ | Subtotal |
| discount | numeric(14,2) | 0 | ✓ | Descuento total |
| discount_percent | numeric(5,2) | - | - | % descuento |
| discount_amount | numeric(14,2) | - | - | $ descuento |
| itbis | numeric(14,2) | 0 | ✓ | ITBIS total |
| total | numeric(14,2) | 0 | ✓ | Total |
| paid | numeric(14,2) | 0 | ✓ | Pagado |
| balance | numeric(14,2) | 0 | ✓ | Saldo pendiente |
| amount_received | numeric(14,2) | - | - | Monto recibido en POS |
| change_amount | numeric(14,2) | - | - | Cambio entregado |
| status | text | 'draft' | ✓ | CHECK: 'draft'\|'issued'\|'paid'\|'partially_paid'\|'pending_ecf'\|'pending_cash_closing'\|'selected_for_ecf'\|'ecf_generation_pending'\|'converted_to_ecf'\|'closed_without_ecf'\|'cancelled'\|'expired'\|'voided' |
| notes | text | - | - | Notas |
| ecf_number | text | - | - | Número e-NCF (si se convierte) |
| electronic_invoice_id | uuid | - | - | FK → `electronic_invoices(id)` (deferrable) |
| created_at | timestamptz | now() | ✓ | Timestamp |
| updated_at | timestamptz | now() | ✓ | Timestamp |

**Enums:**
- `billing_type`: consumo, credito_fiscal
- `document_kind`: proforma, invoice
- `ecf_type`: 31, 32, 33, 34
- `sequence_type`: consumo, credito_fiscal
- `status`: draft, issued, paid, partially_paid, pending_ecf, pending_cash_closing, selected_for_ecf, ecf_generation_pending, converted_to_ecf, closed_without_ecf, cancelled, expired, voided

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `branch_id` → `branches(id)` ON DELETE CASCADE
- FOREIGN KEY: `cash_register_session_id` → `cash_register_sessions(id)` ON DELETE SET NULL
- FOREIGN KEY: `customer_id` → `clients(id)`
- FOREIGN KEY: `cashier_id` → `users(id)`
- FOREIGN KEY: `electronic_invoice_id` → `electronic_invoices(id)` ON DELETE SET NULL (DEFERRABLE INITIALLY DEFERRED)
- UNIQUE: (business_id, number)
- CHECK: `billing_type in ('consumo','credito_fiscal')` (si no NULL)
- CHECK: `document_kind in ('proforma','invoice')`
- CHECK: `ecf_type in ('31','32','33','34')` (si no NULL)
- CHECK: `sequence_type in ('consumo','credito_fiscal')` (si no NULL)
- CHECK: `status in (...)`
- RLS: `proformas_all` (business_id=biz)

**Índices:**
- `proformas_business_status_idx`: (business_id, status, created_at DESC)
- `proformas_session_idx`: (business_id, cash_register_session_id)

---

#### `proforma_items`
**Propósito:** Líneas de una proforma.

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| proforma_id | uuid | - | ✓ | FK → `proformas(id)` ON DELETE CASCADE |
| line_no | int | - | ✓ | Número línea (orden) |
| product_id | uuid | - | - | FK → `products(id)` |
| product_sku | text | - | ✓ | SKU (snapshot) |
| product_name | text | - | ✓ | Nombre (snapshot) |
| product_lot_id | uuid | - | - | FK → `product_lots(id)` |
| lot_number | text | - | - | Número lote (snapshot) |
| kind | text | 'bien' | ✓ | CHECK: 'bien'\|'servicio' |
| quantity | numeric(14,2) | - | ✓ | Cantidad |
| unit_price | numeric(14,4) | - | ✓ | Precio unitario |
| itbis_rate | numeric(5,2) | 0 | ✓ | % ITBIS |
| discount | numeric(14,2) | 0 | ✓ | Descuento línea |
| subtotal | numeric(14,2) | - | ✓ | Subtotal (qty * unit_price - discount) |
| itbis | numeric(14,2) | 0 | ✓ | ITBIS línea |
| total | numeric(14,2) | - | ✓ | Total línea |
| indicador_facturacion | text | - | - | Indicador facturación DGII (codificación pendiente) |
| created_at | timestamptz | now() | ✓ | Timestamp |

**Enums:**
- `kind`: bien, servicio

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `proforma_id` → `proformas(id)` ON DELETE CASCADE
- FOREIGN KEY: `product_id` → `products(id)`
- FOREIGN KEY: `product_lot_id` → `product_lots(id)`
- UNIQUE: (proforma_id, line_no)
- CHECK: `kind in ('bien','servicio')`
- RLS: `proforma_items_all` (business_id=biz)

---

#### `proforma_payments`
**Propósito:** Pagos registrados en una proforma.

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| proforma_id | uuid | - | ✓ | FK → `proformas(id)` ON DELETE CASCADE |
| payment_method_id | uuid | - | - | FK → `payment_methods(id)` |
| method_code | text | - | ✓ | CHECK: 'cash'\|'card'\|'transfer'\|'azul'\|'cardnet'\|'visanet'\|'paypal'\|'manual'\|'other' |
| amount | numeric(14,2) | - | ✓ | Monto pagado (> 0) |
| reference | text | - | - | Referencia (ej. número autorizacion, recibo) |
| user_id | uuid | - | ✓ | FK → `users(id)` |
| user_name | text | - | ✓ | Nombre usuario (snapshot) |
| created_at | timestamptz | now() | ✓ | Timestamp |

**Enums:**
- `method_code`: cash, card, transfer, azul, cardnet, visanet, paypal, manual, other

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `proforma_id` → `proformas(id)` ON DELETE CASCADE
- FOREIGN KEY: `payment_method_id` → `payment_methods(id)`
- FOREIGN KEY: `user_id` → `users(id)`
- CHECK: `method_code in ('cash','card','transfer','azul','cardnet','visanet','paypal','manual','other')`
- CHECK: `amount > 0`
- RLS: `proforma_payments_all` (business_id=biz)

**Índices:**
- `proforma_payments_proforma_idx`: (business_id, proforma_id)

---

#### `cash_closings`
**Propósito:** Cierre de caja (registro de totales y decisión de % a e-CF).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| branch_id | uuid | - | ✓ | FK → `branches(id)` ON DELETE CASCADE |
| cash_register_session_id | uuid | - | ✓ | FK → `cash_register_sessions(id)` ON DELETE CASCADE |
| closing_by | uuid | - | ✓ | FK → `users(id)` (quien cierra) |
| closing_by_name | text | - | ✓ | Nombre usuario (snapshot) |
| closing_at | timestamptz | now() | ✓ | Timestamp cierre |
| total_cash | numeric(14,2) | 0 | ✓ | Total efectivo |
| total_transfer | numeric(14,2) | 0 | ✓ | Total transferencia |
| total_card | numeric(14,2) | 0 | ✓ | Total tarjeta |
| total_other | numeric(14,2) | 0 | ✓ | Total otros métodos |
| total_general | numeric(14,2) | 0 | ✓ | Total general |
| total_proformas_pending | numeric(14,2) | 0 | ✓ | $ proformas pendientes (cash/transfer) |
| count_proformas_pending | int | 0 | ✓ | Cantidad proformas pendientes |
| applied_percentage | numeric(5,2) | 0 | ✓ | % aplicado (0-100) |
| target_amount_to_ecf | numeric(14,2) | 0 | ✓ | $ objetivo a e-CF (calculated) |
| actual_amount_to_ecf | numeric(14,2) | 0 | ✓ | $ actual convertido a e-CF |
| count_proformas_converted | int | 0 | ✓ | Cantidad proformas convertidas |
| count_proformas_left_pending | int | 0 | ✓ | Cantidad proformas no convertidas |
| authorizer_user_id | uuid | - | - | FK → `users(id)` (quien autoriza si % < 100) |
| authorizer_name | text | - | - | Nombre autorizador (snapshot) |
| comment | text | - | - | Comentario |
| status | text | 'pending' | ✓ | CHECK: 'pending'\|'confirmed'\|'reverted' |
| created_at | timestamptz | now() | ✓ | Timestamp |
| updated_at | timestamptz | now() | ✓ | Timestamp |

**Enums:**
- `status`: pending, confirmed, reverted

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `branch_id` → `branches(id)` ON DELETE CASCADE
- FOREIGN KEY: `cash_register_session_id` → `cash_register_sessions(id)` ON DELETE CASCADE
- FOREIGN KEY: `closing_by` → `users(id)`
- FOREIGN KEY: `authorizer_user_id` → `users(id)`
- CHECK: `applied_percentage BETWEEN 0 AND 100`
- CHECK: `status in ('pending','confirmed','reverted')`
- RLS: `cash_closings_all` (business_id=biz)

**Índices:**
- `cash_closings_business_idx`: (business_id, closing_at DESC)
- `cash_closings_session_idx`: (business_id, cash_register_session_id)

---

#### `cash_closing_sales`
**Propósito:** Proformas seleccionadas en un cierre para conversión a e-CF.

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| cash_closing_id | uuid | - | ✓ | FK → `cash_closings(id)` ON DELETE CASCADE |
| proforma_id | uuid | - | ✓ | FK → `proformas(id)` ON DELETE CASCADE |
| selected_for_ecf | boolean | false | ✓ | Seleccionada para e-CF |
| converted_to_ecf_at | timestamptz | - | - | Timestamp conversión |
| electronic_invoice_id | uuid | - | - | FK → `electronic_invoices(id)` (deferrable) |
| selection_method | text | 'manual' | ✓ | CHECK: 'manual'\|'fifo'\|'largest'\|'smallest' |
| created_at | timestamptz | now() | ✓ | Timestamp |

**Enums:**
- `selection_method`: manual, fifo, largest, smallest

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `cash_closing_id` → `cash_closings(id)` ON DELETE CASCADE
- FOREIGN KEY: `proforma_id` → `proformas(id)` ON DELETE CASCADE
- FOREIGN KEY: `electronic_invoice_id` → `electronic_invoices(id)` ON DELETE SET NULL (DEFERRABLE INITIALLY DEFERRED)
- UNIQUE: (cash_closing_id, proforma_id)
- CHECK: `selection_method in ('manual','fifo','largest','smallest')`
- RLS: `cash_closing_sales_all` (business_id=biz)

**Índices:**
- `cash_closing_sales_closing_idx`: (business_id, cash_closing_id)

---

#### `cash_closing_percentage_logs`
**Propósito:** Auditoría inmutable del porcentaje ingresado en cierres sensibles.

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| cash_closing_id | uuid | - | ✓ | FK → `cash_closings(id)` ON DELETE CASCADE |
| entered_by | uuid | - | ✓ | FK → `users(id)` |
| entered_by_name | text | - | ✓ | Nombre usuario |
| entered_at | timestamptz | now() | ✓ | Timestamp entrada |
| percentage_entered | numeric(5,2) | - | ✓ | % ingresado (0-100) |
| total_proformas_available | numeric(14,2) | - | ✓ | $ proformas disponibles |
| target_amount_calculated | numeric(14,2) | - | ✓ | $ objetivo calculado |
| actual_amount_converted | numeric(14,2) | - | ✓ | $ actual convertido |
| count_converted | int | - | ✓ | Cantidad convertidas |
| count_left_pending | int | - | ✓ | Cantidad no convertidas |
| comment | text | - | - | Comentario |
| authorizer_user_id | uuid | - | - | FK → `users(id)` (si requirió autorización) |
| authorizer_name | text | - | - | Nombre autorizador |
| final_status | text | - | ✓ | CHECK: 'confirmed'\|'rejected'\|'reverted' |

**Enums:**
- `final_status`: confirmed, rejected, reverted

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `cash_closing_id` → `cash_closings(id)` ON DELETE CASCADE
- FOREIGN KEY: `entered_by` → `users(id)`
- FOREIGN KEY: `authorizer_user_id` → `users(id)`
- CHECK: `percentage_entered BETWEEN 0 AND 100`
- CHECK: `final_status in ('confirmed','rejected','reverted')`
- RLS: `cash_closing_percentage_logs_all` (business_id=biz)

**Índices:**
- `cash_closing_percentage_logs_closing_idx`: (business_id, cash_closing_id, entered_at DESC)

---

#### `proforma_to_ecf_logs`
**Propósito:** Trazabilidad inmutable de conversión proforma → e-CF.

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| proforma_id | uuid | - | ✓ | FK → `proformas(id)` ON DELETE CASCADE |
| electronic_invoice_id | uuid | - | ✓ | FK → `electronic_invoices(id)` ON DELETE SET NULL (deferrable) |
| triggered_by | uuid | - | ✓ | FK → `users(id)` |
| triggered_by_name | text | - | ✓ | Nombre usuario |
| cash_closing_id | uuid | - | - | FK → `cash_closings(id)` ON DELETE SET NULL (contexto del cierre) |
| reason | text | - | - | Motivo conversión (ej. 'via cash closing', 'immediate') |
| created_at | timestamptz | now() | ✓ | Timestamp |

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `proforma_id` → `proformas(id)` ON DELETE CASCADE
- FOREIGN KEY: `electronic_invoice_id` → `electronic_invoices(id)` ON DELETE SET NULL (DEFERRABLE INITIALLY DEFERRED)
- FOREIGN KEY: `triggered_by` → `users(id)`
- FOREIGN KEY: `cash_closing_id` → `cash_closings(id)` ON DELETE SET NULL
- RLS: `proforma_to_ecf_logs_all` (business_id=biz)

**Índices:**
- `proforma_to_ecf_logs_proforma_idx`: (business_id, proforma_id)

---

#### `electronic_invoices`
**Propósito:** Facturas electrónicas DGII (e-CF).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| branch_id | uuid | - | - | FK → `branches(id)` ON DELETE SET NULL |
| proforma_id | uuid | - | - | FK → `proformas(id)` ON DELETE SET NULL |
| source_invoice_id | uuid | - | - | FK a otra e-CF (para NC/ND 33/34) |
| tipo_ecf | text | - | ✓ | CHECK: '31'\|'32'\|'33'\|'34'\|'41'\|'43'\|'44'\|'45'\|'46'\|'47' |
| e_ncf | text | - | ✓ | Número e-NCF (único por business + ambiente) |
| secuencia_id | uuid | - | - | FK → `ecf_sequences(id)` |
| status | text | 'draft' | ✓ | CHECK: 'draft'\|'generated'\|'validated'\|'signed'\|'submitted'\|'in_process'\|'accepted'\|'accepted_conditional'\|'rejected'\|'cancelled'\|'error'\|'voided' |
| customer_id | uuid | - | - | FK → `clients(id)` |
| customer_name | text | - | - | Nombre cliente |
| customer_rnc | text | - | - | RNC cliente |
| subtotal_gravado | numeric(14,2) | 0 | ✓ | Subtotal gravado (ITBIS) |
| subtotal_exento | numeric(14,2) | 0 | ✓ | Subtotal exento |
| total_itbis | numeric(14,2) | 0 | ✓ | Total ITBIS |
| total_otros_impuestos | numeric(14,2) | 0 | ✓ | Otros impuestos |
| total | numeric(14,2) | - | ✓ | Total |
| currency | text | 'DOP' | ✓ | Moneda |
| xml_generated_path | text | - | - | Ruta XML generado (Storage) |
| xml_signed_path | text | - | - | Ruta XML firmado (Storage) |
| xml_response_path | text | - | - | Ruta respuesta XML (Storage) |
| pdf_path | text | - | - | Ruta PDF (Storage) |
| qr_code_payload | text | - | - | Payload QR |
| security_code | text | - | - | Código de seguridad DGII |
| hash_sha256 | text | - | - | Hash SHA-256 documento |
| track_id | text | - | - | TrackId DGII |
| dgii_status_code | text | - | - | Código estado DGII |
| dgii_status_message | text | - | - | Mensaje estado DGII |
| ambiente | text | - | ✓ | CHECK: 'testecf'\|'certecf'\|'ecf' |
| generated_at | timestamptz | - | - | Timestamp generación XML |
| signed_at | timestamptz | - | - | Timestamp firma |
| sent_at | timestamptz | - | - | Timestamp envío a DGII |
| accepted_at | timestamptz | - | - | Timestamp aceptación DGII |
| rejected_at | timestamptz | - | - | Timestamp rechazo DGII |
| cancelled_at | timestamptz | - | - | Timestamp cancelación |
| generated_by | uuid | - | - | FK → `users(id)` |
| sent_by | uuid | - | - | FK → `users(id)` |
| created_at | timestamptz | now() | ✓ | Timestamp |
| updated_at | timestamptz | now() | ✓ | Timestamp |

**Enums:**
- `tipo_ecf`: 31, 32, 33, 34, 41, 43, 44, 45, 46, 47
- `status`: draft, generated, validated, signed, submitted, in_process, accepted, accepted_conditional, rejected, cancelled, error, voided
- `ambiente`: testecf, certecf, ecf

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `branch_id` → `branches(id)` ON DELETE SET NULL
- FOREIGN KEY: `proforma_id` → `proformas(id)` ON DELETE SET NULL
- FOREIGN KEY: `customer_id` → `clients(id)`
- FOREIGN KEY: `secuencia_id` → `ecf_sequences(id)`
- FOREIGN KEY: `generated_by` → `users(id)`
- FOREIGN KEY: `sent_by` → `users(id)`
- UNIQUE: (business_id, e_ncf, ambiente)
- CHECK: `tipo_ecf in ('31','32','33','34','41','43','44','45','46','47')`
- CHECK: `status in (...)`
- CHECK: `ambiente in ('testecf','certecf','ecf')`
- RLS: `electronic_invoices_all` (business_id=biz)

**Índices:**
- `electronic_invoices_business_status_idx`: (business_id, status, created_at DESC)
- `electronic_invoices_business_track_idx`: (business_id, track_id) WHERE track_id IS NOT NULL
- `electronic_invoices_proforma_idx`: (business_id, proforma_id)

---

#### `electronic_invoice_items`
**Propósito:** Líneas de una factura electrónica (snapshot inmutable).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| electronic_invoice_id | uuid | - | ✓ | FK → `electronic_invoices(id)` ON DELETE CASCADE |
| line_no | int | - | ✓ | Número línea |
| product_id | uuid | - | - | FK → `products(id)` ON DELETE SET NULL |
| product_sku | text | - | - | SKU (snapshot) |
| name_item | text | - | ✓ | Nombre item |
| description_item | text | - | - | Descripción |
| kind | text | 'bien' | ✓ | CHECK: 'bien'\|'servicio' |
| quantity | numeric(14,2) | - | ✓ | Cantidad |
| unit_measure | text | - | - | Unidad medida |
| unit_price | numeric(14,4) | - | ✓ | Precio unitario |
| discount_amount | numeric(14,2) | 0 | ✓ | Descuento línea |
| itbis_rate | numeric(5,2) | 0 | ✓ | % ITBIS |
| indicador_facturacion | text | - | - | Indicador facturación DGII |
| monto_item | numeric(14,2) | - | ✓ | Monto total línea |
| created_at | timestamptz | now() | ✓ | Timestamp |

**Enums:**
- `kind`: bien, servicio

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `electronic_invoice_id` → `electronic_invoices(id)` ON DELETE CASCADE
- FOREIGN KEY: `product_id` → `products(id)` ON DELETE SET NULL
- UNIQUE: (electronic_invoice_id, line_no)
- CHECK: `kind in ('bien','servicio')`
- RLS: `electronic_invoice_items_all` (business_id=biz)

---

#### `dgii_submissions`
**Propósito:** Registro de intentos de envío a DGII (immutable).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| electronic_invoice_id | uuid | - | ✓ | FK → `electronic_invoices(id)` ON DELETE CASCADE |
| attempt_no | int | 1 | ✓ | Número intento (1..N) |
| endpoint_url | text | - | ✓ | URL endpoint DGII usado |
| request_headers | jsonb | - | - | Headers request |
| request_body_path | text | - | - | Ruta XML request (Storage) |
| response_status | int | - | - | HTTP status response |
| response_body_path | text | - | - | Ruta XML response (Storage) |
| track_id | text | - | - | TrackId devuelto |
| error_code | text | - | - | Código error (si aplica) |
| error_message | text | - | - | Mensaje error |
| sent_at | timestamptz | now() | ✓ | Timestamp envío |
| responded_at | timestamptz | - | - | Timestamp respuesta |

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `electronic_invoice_id` → `electronic_invoices(id)` ON DELETE CASCADE
- UNIQUE: (electronic_invoice_id, attempt_no)
- RLS: `dgii_submissions_all` (business_id=biz)

**Índices:**
- `dgii_submissions_invoice_idx`: (business_id, electronic_invoice_id, sent_at DESC)

---

#### `dgii_status_logs`
**Propósito:** Consultas de estado a DGII (immutable).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| electronic_invoice_id | uuid | - | ✓ | FK → `electronic_invoices(id)` ON DELETE CASCADE |
| track_id | text | - | ✓ | TrackId consultado |
| response_status | int | - | - | HTTP status |
| response_code | text | - | - | Código estado DGII |
| response_message | text | - | - | Mensaje estado |
| response_body_path | text | - | - | Ruta respuesta (Storage) |
| consulted_at | timestamptz | now() | ✓ | Timestamp consulta |

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `electronic_invoice_id` → `electronic_invoices(id)` ON DELETE CASCADE
- RLS: `dgii_status_logs_all` (business_id=biz)

**Índices:**
- `dgii_status_logs_invoice_idx`: (business_id, electronic_invoice_id, consulted_at DESC)
- `dgii_status_logs_track_idx`: (business_id, track_id)

---

#### `dgii_received_ecf`
**Propósito:** Facturas electrónicas RECIBIDAS de otros emisores (aprobación comercial).

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| tipo_ecf | text | - | ✓ | CHECK: '31'\|'32'\|'33'\|'34'\|'41'\|'43'\|'44'\|'45'\|'46'\|'47' |
| e_ncf | text | - | ✓ | Número e-NCF |
| rnc_emisor_sender | text | - | ✓ | RNC del emisor |
| razon_social_emisor | text | - | - | Razón social emisor |
| xml_path | text | - | ✓ | Ruta XML (Storage) |
| total | numeric(14,2) | 0 | ✓ | Total |
| received_at | timestamptz | now() | ✓ | Timestamp recepción |
| processed_at | timestamptz | - | - | Timestamp procesamiento |
| commercial_approval_status | text | 'pending' | ✓ | CHECK: 'pending'\|'approved'\|'conditionally_approved'\|'rejected'\|'total_rejection' |

**Enums:**
- `tipo_ecf`: 31, 32, 33, 34, 41, 43, 44, 45, 46, 47
- `commercial_approval_status`: pending, approved, conditionally_approved, rejected, total_rejection

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- UNIQUE: (business_id, e_ncf, rnc_emisor_sender)
- CHECK: `tipo_ecf in ('31','32','33','34','41','43','44','45','46','47')`
- CHECK: `commercial_approval_status in ('pending','approved','conditionally_approved','rejected','total_rejection')`
- RLS: `dgii_received_ecf_all` (business_id=biz)

**Índices:**
- `dgii_received_ecf_business_idx`: (business_id, received_at DESC)

---

#### `dgii_commercial_approvals`
**Propósito:** Decisión de aprobación comercial de facturas recibidas.

| Columna | Tipo | DEFAULT | NOT NULL | Comentario |
|---------|------|---------|----------|-----------|
| id | uuid | gen_random_uuid() | ✓ | PK |
| business_id | uuid | - | ✓ | FK → `businesses(id)` ON DELETE CASCADE |
| received_ecf_id | uuid | - | ✓ | FK → `dgii_received_ecf(id)` ON DELETE CASCADE |
| decision | text | - | ✓ | CHECK: 'approved'\|'conditionally_approved'\|'rejected'\|'total_rejection' |
| decided_by | uuid | - | ✓ | FK → `users(id)` |
| decided_by_name | text | - | ✓ | Nombre usuario |
| decided_at | timestamptz | now() | ✓ | Timestamp decisión |
| reason | text | - | - | Motivo rechazo/condiciones |
| xml_path | text | - | - | Ruta XML respuesta (Storage) |
| response_sent_at | timestamptz | - | - | Timestamp envío respuesta a emisor |
| response_track_id | text | - | - | TrackId respuesta DGII |

**Enums:**
- `decision`: approved, conditionally_approved, rejected, total_rejection

**Constraints:**
- PRIMARY KEY: `id`
- FOREIGN KEY: `business_id` → `businesses(id)` ON DELETE CASCADE
- FOREIGN KEY: `received_ecf_id` → `dgii_received_ecf(id)` ON DELETE CASCADE
- FOREIGN KEY: `decided_by` → `users(id)`
- CHECK: `decision in ('approved','conditionally_approved','rejected','total_rejection')`
- RLS: `dgii_commercial_approvals_all` (business_id=biz)

**Índices:**
- `dgii_commercial_approvals_business_idx`: (business_id, decided_at DESC)

---

## RESUMEN DE FUNCIONES PL/pgSQL

| Función | Parámetros | Retorna | Propósito | Archivo |
|---------|-----------|---------|-----------|---------|
| `auth_business_id()` | - | uuid | Lee business_id del JWT (root → app_metadata → user_metadata) | 0001, 0006 |
| `auth_is_platform_admin()` | - | boolean | Lee is_platform_admin del JWT | 0001, 0006 |
| `select_lot_for_sale()` | p_business_id, p_product_id, p_branch_id | uuid | Selecciona lote FEFO disponible para venta | 0002 |
| `reserve_ecf_sequence_number()` | p_business_id, p_tipo_ecf, p_ambiente | int | Reserva atómicamente próximo número e-NCF, incremente next_number | 0003 |

---

## ENUMERACIONES SINTETIZADAS

**Todas las columnas TEXT que actúan como enum:**

| Tabla | Columna | Valores | Notas |
|-------|---------|---------|-------|
| businesses | status | active, suspended, trial, past_due | Estado subscripción |
| branches | status | active, inactive | Estado sucursal |
| users | role | admin, manager, cashier, inventory, supervisor, auditor | Rol de usuario |
| users | status | active, invited, disabled | Estado usuario |
| clients | document_type | cedula, rnc, passport | Tipo documento |
| clients | source | manual, whatsapp, web, import, agendapro | Origen cliente |
| clients | default_billing_type | consumo, credito_fiscal | Tipo facturación default |
| clients | skin_type | not_specified, normal, dry, oily, combination, sensitive, acne_prone, mature, hyperpigmentation, rosacea_reactive | Tipo piel (dermatología) |
| product_lots | status | available, quarantine, expired, recalled, damaged, returned | Estado lote |
| inventory_movements | type | entry_purchase, exit_sale, transfer_out, transfer_in, adjustment_positive, adjustment_negative, return_in, return_out, quarantine, release, expiry, count_adjustment | Tipo movimiento |
| inventory_counts | count_type | full, partial, spot | Tipo conteo |
| inventory_counts | status | draft, in_progress, paused, submitted, reviewed, approved, rejected, adjusted, cancelled | Estado conteo |
| inventory_count_scans | scan_source | camera, bluetooth_scanner, manual | Origen escaneo |
| inventory_count_scans | sync_status | synced, pending, failed | Estado sincronización |
| inventory_count_items | status | match, shortage, overage, expired, unregistered | Resultado conteo |
| inventory_count_sync_logs | sync_status | success, partial, failed | Resultado sincronización |
| dgii_settings | ambiente | testecf, certecf, ecf | Ambiente DGII |
| ecf_sequences | tipo_ecf | 31, 32, 33, 34, 41, 43, 44, 45, 46, 47 | Tipo comprobante e-CF (codificación DGII) |
| ecf_sequences | ambiente | testecf, certecf, ecf | Ambiente |
| ecf_sequences | status | active, expiring, exhausted, expired, cancelled | Estado secuencia |
| payment_methods | default_ecf_type | 31, 32, 33, 34, 41, 43, 44, 45, 46, 47 | Tipo e-CF default |
| cash_register_sessions | status | open, closing, closed, reverted | Estado sesión caja |
| proformas | billing_type | consumo, credito_fiscal | Tipo facturación |
| proformas | document_kind | proforma, invoice | Tipo documento (proforma no fiscal vs invoice fiscal) |
| proformas | ecf_type | 31, 32, 33, 34 | Tipo e-CF (si aplica) |
| proformas | sequence_type | consumo, credito_fiscal | Tipo secuencia |
| proformas | status | draft, issued, paid, partially_paid, pending_ecf, pending_cash_closing, selected_for_ecf, ecf_generation_pending, converted_to_ecf, closed_without_ecf, cancelled, expired, voided | Estado proforma |
| proforma_items | kind | bien, servicio | Tipo línea |
| proforma_payments | method_code | cash, card, transfer, azul, cardnet, visanet, paypal, manual, other | Método pago |
| cash_closings | status | pending, confirmed, reverted | Estado cierre |
| cash_closing_percentage_logs | final_status | confirmed, rejected, reverted | Resultado porcentaje |
| electronic_invoices | tipo_ecf | 31, 32, 33, 34, 41, 43, 44, 45, 46, 47 | Tipo comprobante |
| electronic_invoices | status | draft, generated, validated, signed, submitted, in_process, accepted, accepted_conditional, rejected, cancelled, error, voided | Estado e-CF |
| electronic_invoices | ambiente | testecf, certecf, ecf | Ambiente |
| electronic_invoice_items | kind | bien, servicio | Tipo línea |
| dgii_received_ecf | tipo_ecf | 31, 32, 33, 34, 41, 43, 44, 45, 46, 47 | Tipo |
| dgii_received_ecf | commercial_approval_status | pending, approved, conditionally_approved, rejected, total_rejection | Estado aprobación |
| dgii_commercial_approvals | decision | approved, conditionally_approved, rejected, total_rejection | Decisión |

---

## NOTAS FINALES

1. **RLS**: Todas las tablas de negocio tienen RLS habilitado. Las políticas se consolidaron en 0008-0009 para evitar "multiple permissive policies" y mejorar plan InitPlan.

2. **Foreign Keys Circulares (Deferrable)**: 
   - `proformas.electronic_invoice_id` → `electronic_invoices(id)`
   - `cash_closing_sales.electronic_invoice_id` → `electronic_invoices(id)`
   - `proforma_to_ecf_logs.electronic_invoice_id` → `electronic_invoices(id)`
   
   Todas declaradas `DEFERRABLE INITIALLY DEFERRED` para permitir inserciones bidireccionales en la misma transacción.

3. **Soft Deletes**: `businesses`, `branches`, `users`, `products`, `clients` tienen columna `deleted_at`. Índices parciales respetan `WHERE deleted_at IS NULL`.

4. **Desnormalizaciones Intencionales**: 
   - `brands.product_count` (actualización manual o trigger futuro)
   - `clients.total_spent`, `total_orders` (agregados de auditoría)
   - `proformas/proforma_items`: snapshots de producto/cliente en momento de venta

5. **Storage**: Rutas de archivos en columnas `*_path` (XML, PDF, respuestas DGII) refieren a Supabase Storage privado o similar. Nunca se almacenan binarios en la DB.

6. **Funciones Seguras**: `auth_business_id()`, `auth_is_platform_admin()`, `select_lot_for_sale()`, `reserve_ecf_sequence_number()` tienen `search_path` fijo (0008) para evitar secuestro de esquema.

7. **Permisos Granulares**: Los 18 permisos DGII/cash (creados en 0004-0005) mapean a un sistema RBAC en tablas `roles` y `role_permissions`. Las políticas RLS siguen siendo a nivel de tenant (business_id); los permisos granulares se evalúan en aplicación.

8. **No Hay Datos Reales DGII**: Certificados, secuencias, RNC emisor no se insertan en migraciones. El usuario debe importarlos manualmente después de autorizar Fase C.

---

Este esquema es exhaustivo, preciso y listo para reconstrucción desde cero.