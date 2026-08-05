# Esquemas XSD oficiales de la DGII

> **Descargados de dgii.gov.do el 2026-08-04.** Ninguno se editó, se reescribió
> ni se copió de un tercero: son los bytes que sirve la DGII.
>
> Origen exacto (§5.5 del pliego, «obtenerlos únicamente de fuentes oficiales»):
> `dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/`
> `Documentacin sobre eCF/Documentación Técnica (XSD)/`
>
> Índice de la página:
> https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/documentacionSobreE-CF.aspx

## Por qué esta tabla existe

Un esquema fiscal es una **dependencia versionada**, no un archivo suelto. Si un
día un XML deja de validar, la primera pregunta es «¿cambió el esquema?», y sin
checksum no hay forma de contestarla.

Los catorce se comprobaron con `xmllint` contra el meta-esquema de W3C: **los
catorce compilan como esquema válido**.

## Inventario

| Archivo | Bytes | BOM | SHA-256 |
|---|---:|:---:|---|
| `ACECF-v1.0.xsd` | 3,567 | no | `072f65de202df8ec136a8d4493e0592172690a4e181047245401cc2e7b23c095` |
| `ANECF-v1.0.xsd` | 5,160 | sí | `af2e6a16c2900dfa55264d6ebec58ccbbbb25c1eb9821ee18ccc44fc142d0e78` |
| `ARECF-v1.0.xsd` | 2,871 | no | `c6d186167159110959eb3f54706ecc7462ad9128fc2c3e03440c8352b1c66f10` |
| `RFCE-32-v1.0.xsd` | 15,325 | no | `6aad535875661b05eef072963295202fc94b3b320b257791feb8d3c39a5f8ee6` |
| `e-CF-31-v1.0.xsd` | 121,323 | no | `cc66cbc418ceefaa6437c97607308c3e0814d73070fbbf9e9a2a331d12cb8abc` |
| `e-CF-32-v1.0.xsd` | 121,292 | sí | `ab66dff0b08d743e2f188242025a0dcef45203ad05687280860d3b07a475991b` |
| `e-CF-33-v1.0.xsd` | 122,760 | sí | `718146c15edafd4582efc6886e1a7a8c5043a55236cec4fb3262094edda46615` |
| `e-CF-34-v1.0.xsd` | 120,357 | sí | `6c1c4daf83146ecf35b81a3b2e3e34a79b429f4c1b8d63e05e2ee74f3ff8fab6` |
| `e-CF-41-v1.0.xsd` | 111,171 | sí | `eae1993c637375bc1cbe80932411d87f5680cd54e77e4d1b2752d72a6c8b2ab3` |
| `e-CF-43-v1.0.xsd` | 96,111 | sí | `776f030980c2c50cf0221e9263c55f367c8631727adff00ab45e2c7c1abafc52` |
| `e-CF-44-v1.0.xsd` | 114,302 | sí | `19834f37a9f0e2db40f00c80d07c2bf92f9019f23474480f32cef1ba06af4e67` |
| `e-CF-45-v1.0.xsd` | 121,785 | sí | `030492cc8ef7d1a09a89b16b241f8e5c4920dfd09c0b629b1db8e68406ecd6ca` |
| `e-CF-46-v1.0.xsd` | 115,951 | sí | `e7f8613ade25c7efb88e84d34d7c0ad330d1b22238ad9ef90c80aed01911d67b` |
| `e-CF-47-v1.0.xsd` | 101,382 | sí | `14daf18f52f63dd80e439a18fb60a102d74e71243ee90ee253367f61ce8e1994` |

## Cobertura

| Tipo | Qué es | Esquema |
|---|---|---|
| 31 | Factura de Crédito Fiscal | ✅ |
| 32 | Factura de Consumo | ✅ |
| 33 | Nota de Débito | ✅ |
| 34 | Nota de Crédito | ✅ |
| 41 | Compras | ✅ |
| 43 | Gastos Menores | ✅ |
| 44 | Regímenes Especiales | ✅ |
| 45 | Gubernamental | ✅ |
| 46 | Exportaciones | ✅ |
| 47 | Pagos al Exterior | ✅ |
| RFCE 32 | Resumen de Factura de Consumo | ✅ |
| ARECF | Acuse de Recibo | ✅ |
| ANECF | Anulación | ✅ |
| ACECF | Aprobación Comercial | ✅ |

**Los diez tipos, más los tres documentos auxiliares.** Antes había cuatro.

## Trampas conocidas

- **BOM UTF-8**: varios esquemas lo traen al principio. `validator.ts` lo quita
  antes de pasárselos a `xmllint`, porque con el BOM delante el parser falla con
  un mensaje que no explica nada.
- **Typo en el e-CF 31**: `validator.ts` lo corrige en memoria. El archivo se
  conserva **tal como lo sirve la DGII**; corregirlo en disco rompería el
  checksum y con él la trazabilidad.
- **La firma es obligatoria en el esquema**: un XML **sin firmar falla** la
  validación XSD. No es un fallo del validador.

## Al actualizar

1. Descargar de la página oficial.
2. Recalcular el SHA-256 y **actualizar esta tabla**.
3. Volver a validar con `xmllint`.
4. Correr las pruebas del validador: un esquema nuevo puede rechazar XML que
   antes pasaba, y eso hay que verlo en pruebas y no en producción.
5. Anotar la fecha de descarga.

```bash
shasum -a 256 docs/dgii/xsd/*.xsd
```
