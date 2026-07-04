# Verificación del QR de consulta DGII (duda D-06 — CERRADA)

**Fecha de revisión:** 2026-07-03
**Revisado por:** Claude (sesión de correcciones DGII v0.36.0/v0.37.0)
**Código afectado:** `apps/web/src/server/services/dgii/qr.ts` (+ tests)

## Fuentes consultadas

1. **Descripción Técnica de Facturación Electrónica v1.6 (junio 2023)** — DGII,
   sección de representaciones impresas / código QR:
   <https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Documentacin%20sobre%20eCF/Informe%20y%20Descripci%C3%B3n%20T%C3%A9cnica/Descripcion-tecnica-de-facturacion-electronica.pdf>
2. **Página de consulta general (testecf), verificada EN VIVO 2026-07-03:**
   <https://ecf.dgii.gov.do/testecf/ConsultaTimbre> — responde la página
   "Consultas Factura Electrónica / Verificación e-NCF" (navegable por humanos).
3. **Página de consulta FC (testecf), verificada EN VIVO 2026-07-03:**
   <https://fc.dgii.gov.do/TesteCF/ConsultaTimbreFC> — responde
   "Verificación e-NCF" de factura de consumo.
4. Comunidad de ayuda DGII (discusiones sobre QR):
   <https://ayuda.dgii.gov.do/conversations/discusiones/codigo-qr-factura-electronica-a-veces-funciona-otras-veces-no/66e42383ba792406faa941b8>

## Parámetros CONFIRMADOS

### Consulta general — `https://ecf.dgii.gov.do/{ambiente}/ConsultaTimbre`

Aplica a e-CF 31/33/34 (y 32 con MontoTotal ≥ RD$250,000).

| Parámetro | Formato | Nota |
|---|---|---|
| `RncEmisor` | 9/11 dígitos | |
| `RncComprador` | 9/11 dígitos | cuando aplica (consumo sin RNC lo omite) |
| `ENCF` | E + tipo(2) + secuencia(10) | 13 chars |
| `FechaEmision` | `dd-MM-yyyy` | |
| `MontoTotal` | decimal 2 posiciones, punto | |
| `FechaFirma` | `dd-MM-yyyy HH:mm:ss` | fecha/hora de la firma digital |
| `CodigoSeguridad` | 6 caracteres | **primeros 6 del hash `SignatureValue`** de la firma, tal cual |

### Consulta reducida FC — `https://fc.dgii.gov.do/{ambiente}/ConsultaTimbreFC`

Aplica SOLO a e-CF 32 (factura de consumo electrónica) con
MontoTotal **< RD$250,000** (las que se envían por el web service de
Resumen de Factura de Consumo).

| Parámetro | Formato |
|---|---|
| `RncEmisor` | 9/11 dígitos |
| `ENCF` | 13 chars |
| `MontoTotal` | decimal 2 posiciones |
| `CodigoSeguridad` | 6 caracteres |

Sin `RncComprador` ni fechas.

## Decisión aplicada en código (`qr.ts`)

- `buildDgiiConsultaUrl` construye la URL de la **página** de consulta (no un
  endpoint de API): `/{testecf|certecf|ecf}/ConsultaTimbre` en
  `ecf.dgii.gov.do`, o `/{...}/ConsultaTimbreFC` en `fc.dgii.gov.do` cuando
  `tipo == 32 && montoTotal < 250000` (`FC_MONTO_THRESHOLD`).
- El parámetro se llama **`CodigoSeguridad`** (el nombre anterior
  `CodigoSeguridadIeCF` NO aparece en la documentación oficial — corregido
  en v0.36.0).
- `FechaFirma` es **obligatoria** en la consulta general; la función lanza si
  falta. Acepta el string `FechaHoraFirma` del XML tal cual para garantizar
  consistencia QR↔XML.
- `computeSecurityCode` toma los **primeros 6 caracteres del
  `SignatureValue` tal cual** (base64, incluyendo `+`/`/`/`=`; solo se
  remueve whitespace de formato XML).

## Dudas pendientes

1. **Ambiente `certecf` en FC**: la documentación y las URLs vivas
   confirman `TesteCF` y `eCF` para `fc.dgii.gov.do`; no encontramos
   confirmación explícita de un segmento `certecf` en FC. El código lo
   mapea por simetría — validar durante la certificación real.
2. **Mayúsculas del path**: el sitio vivo usa `/TesteCF/ConsultaTimbreFC`;
   nuestras URLs usan minúsculas (`/testecf/consultatimbrefc` responde igual
   — stack IIS case-insensitive). Riesgo bajo; confirmar en certificación.
3. **Codificación del `CodigoSeguridad` en la URL**: los chars base64
   (`+`, `/`, `=`) se URL-encodean (`%2B`, `%2F`, `%3D`) — es lo estándar,
   pero verificar en certificación que el validador DGII los decodifica.

## Riesgo si DGII cambia el formato

La URL/parámetros viven SOLO en `qr.ts` (una función) y sus tests. Un cambio
de DGII requiere tocar un archivo. Los QR ya impresos con el formato viejo
quedarían rotos — por eso el QR solo se genera en modo demo/preview hasta
pasar certificación. Re-verificar este documento ANTES de Fase G.
