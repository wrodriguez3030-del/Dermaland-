# DermaLand · Setup DGII e-CF (RD)

Activación del módulo fiscal cuando el cliente entregue el certificado digital.

## Estado actual (2026-05-05)

`dgii_enabled = false`. POS opera con proformas y comprobantes no fiscales.
Bloqueo está en `riesgos.md → R-DGII-01`.

## Requisitos del cliente

1. **RNC verificado** del business (DermaLand: `1-32-59077-5` ✅).
2. **Certificado digital `.p12`** emitido por:
   - Cámara de Comercio y Producción de Santiago (más rápido en RD).
   - Avansi.
   - Otra autoridad certificadora autorizada por DGII.
3. **Usuario delegado** registrado en el portal DGII para emisión.
4. **Secuencias e-NCF** asignadas por DGII (rangos por tipo: 31, 32, 33, 34, etc.).

Tiempo estimado: **2–6 semanas** desde la solicitud.

## Activación técnica

### 1. Subir certificado

Súper admin → `/super-admin` (cuando exista) → Empresa → DGII → Subir `.p12`.

Backend:
```ts
import { createServiceRoleClient } from "@/lib/supabase/server";

// Subida vía Edge Function — el `.p12` NUNCA toca el cliente
const sb = createServiceRoleClient();
await sb.storage
  .from("certificates")
  .upload(`${businessId}/cert.p12`, file, {
    contentType: "application/x-pkcs12",
    upsert: true,
  });

// Cifrar password con KMS / Supabase Vault
await encrypt(password, businessId);
```

Bucket `certificates` es **privado** y solo accesible desde Edge Function
`dgii-sign-xml`. Documentado en `riesgos.md → R-SEC-02`.

### 2. Configurar secuencias

```sql
insert into ecf_sequences (business_id, type, range_start, range_end, next_number, expires_at)
values
  ('<biz>', '31', 1, 1000, 1, '2027-12-31'),
  ('<biz>', '32', 1, 5000, 1, '2027-12-31'),
  ...;
```

Alertas configuradas en `inventory_count_sync_logs`/equivalente cuando
`(range_end - next_number) < 100`.

### 3. Activar módulo

```sql
update businesses set dgii_enabled = true where id = '<biz>';
```

A partir de ahí:
- En cierre de caja, el cajero ve checkboxes por proforma → marca cuáles
  enviar a DGII.
- `DgiiService.convertProformaToEcf()` ejecuta:
  1. `generateXml(proforma, ecfType)` con `node-forge`.
  2. `signXml(xml, businessId)` con XAdES-BES.
  3. `submitToDgii(signedXml)` POST al endpoint.
  4. Guarda TrackID en `electronic_invoices`.
- Edge Function `dgii-poll-status` (cron 5 min) actualiza estados.

## Ambientes

```
Certificación:  https://ecf.dgii.gov.do/testecf
Producción:     https://ecf.dgii.gov.do/ecf
```

`DGII_ENVIRONMENT=cert` durante onboarding. Pasar a `prod` solo después de
emitir y aceptar al menos 10 e-CF de cada tipo en certificación sin error.

## Tipos e-CF habilitados

| Tipo | Uso |
|---|---|
| **31** | Crédito Fiscal — clientes con RNC que requieren ITBIS deducible |
| **32** | Consumo — venta a consumidor final |
| **33** | Nota de Débito |
| **34** | Nota de Crédito (devoluciones, ajustes) |
| 41 | Compras (gastos del business) |
| 43 | Gastos Menores |
| 44 | Regímenes Especiales |
| 45 | Gubernamental |

## Modo contingencia

Si DGII está caído > 1h, activar:
```sql
update fiscal_settings set contingency_mode = true where business_id = '<biz>';
```
POS sigue emitiendo localmente, queue se sincroniza cuando vuelve.
Riesgo R-DGII-03.

## Tests obligatorios antes de prod

- [ ] Emitir e-CF tipo 31 a Distrimedica (RNC cliente) y recibir `accepted`.
- [ ] Emitir tipo 32 a walk-in.
- [ ] Generar tipo 34 (NC) desde devolución.
- [ ] Anular un e-CF aceptado.
- [ ] Provocar error de XML inválido y verificar mensaje legible al usuario.
- [ ] Simular timeout DGII y verificar reintento con backoff.

## Troubleshooting común

| Síntoma | Causa probable | Acción |
|---|---|---|
| 401 al firmar | `.p12` corrupto o password mal cifrada | Re-subir certificado |
| 400 XML inválido | XSD desactualizado | Validar XML contra XSD oficial DGII |
| TrackID retorna `rejected` por timezone | Fechas no en `America/Santo_Domingo` | Forzar locale en generación |
| Secuencia se agota | Falta renovación con DGII | Solicitar nuevo rango con 30 días de margen |
