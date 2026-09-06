# Fuente oficial de los XSD e-CF (DGII)

Los XSD se obtuvieron **únicamente** de la fuente oficial de la DGII (República
Dominicana). No se usaron blogs, gists ni repositorios de terceros.

## Fuente
- **Sitio:** DGII — "Documentación sobre e-CF" → sección **"Documentación Técnica (XSD)"**.
- **Página:** https://dgii.gov.do/cicloContribuyente/facturacion/comprobantesFiscalesElectronicosE-CF/Paginas/documentacionSobreE-CF.aspx
- **Base de descarga:** `…/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%20<NN>%20v.1.0.xsd`
- **Fecha de consulta/descarga:** 2026-06-09.
- **Método:** descarga directa (HTTP 200) de los 4 archivos `.xsd` desde el host oficial `dgii.gov.do`.

## Archivos descargados (renombrados a la convención local)
| Tipo | Archivo local | Fecha modif. (DGII) | Bytes | SHA256 |
|---|---|---|---|---|
| 31 | `e-CF-31-v1.0.xsd` | 16/10/2025 | 123019 | `6f2909a93d84919518d2ae3c77fead4b35c3e8c95996b8af67b0040c2e2be298` |
| 32 | `e-CF-32-v1.0.xsd` | 16/10/2025 | 122998 | `151676df03c61335b4ac1eca97f99395488d57ea92793b49353602871e651f3c` |
| 33 | `e-CF-33-v1.0.xsd` | 01/04/2026 | 124484 | `087cd71beba11c19cf548e22b96363cb4aa210dc6f5c3c8a62122a42c88d2866` |
| 34 | `e-CF-34-v1.0.xsd` | 01/04/2026 | 122024 | `6c62ebabdea9a6f6d62ae85d9e1c2eb788f44f3f0b61945fe116700c4eaac2da` |

> Verificación: cada archivo inicia con `<?xml … ?><xs:schema …>`, root `name="ECF"`,
> no es HTML de error, tamaño ~120 KB. (Recalcular SHA256 con `shasum -a 256 <archivo>`.)

## Typo conocido en el XSD oficial e-CF 31
El XSD oficial de tipo 31 define el tipo con un **espacio inicial**:
`name=" IndicadorServicioTodoIncluidoType"`, pero lo referencia sin espacio, por lo que
el XSD **no compila** tal cual. Se aplica un parche EN MEMORIA (`patchOfficialDgiiXsd`
en `src/lib/dgii/xsd-loader.ts`) que normaliza espacios iniciales en `name="…"`.
**El archivo en disco NO se modifica** (queda idéntico al oficial).

## Nota
Estos XSD son esquemas públicos oficiales, fuente de verdad local para tests y
validación. No son secretos. No reemplazan la verificación de vigencia en la
fuente oficial al momento de un go-live fiscal.

## Formatos de certificación (v317, descargados 2026-07-04)

Misma fuente oficial (sección "Documentación Técnica (XSD)"). Nombres remotos exactos:
`ARECF v1.0.xsd`, `ACECF v.1.0.xsd`, `ANECF v.1.0.xsd`, `RFCE 32 v.1.0.xsd`.
Nota: el host exige User-Agent de navegador (curl "pelado" devuelve 403 del WAF).

| Formato | Archivo local | Bytes | SHA256 |
|---|---|---|---|
| ARECF (Acuse de Recibo) | `ARECF-v1.0.xsd` | 2871 | `c6d186167159110959eb3f54706ecc7462ad9128fc2c3e03440c8352b1c66f10` |
| ACECF (Aprobación Comercial) | `ACECF-v1.0.xsd` | 3567 | `072f65de202df8ec136a8d4493e0592172690a4e181047245401cc2e7b23c095` |
| ANECF (Anulación e-NCF) | `ANECF-v1.0.xsd` | 5160 | `af2e6a16c2900dfa55264d6ebec58ccbbbb25c1eb9821ee18ccc44fc142d0e78` |
| RFCE 32 (Resumen Consumo <250k) | `RFCE-32-v1.0.xsd` | 15325 | `6aad535875661b05eef072963295202fc94b3b320b257791feb8d3c39a5f8ee6` |

### Typos conocidos de estos XSD oficiales (parche EN MEMORIA, archivo intacto)
- Los `xs:pattern` de fechas usan grupos no-capturantes `(?:…)` (sintaxis PCRE) que
  NO existen en regex de XML Schema → libxml2 no compila. `patchCertificationXsd`
  (src/lib/dgii/certification-xsd.ts) los convierte a `(…)` (mismo lenguaje aceptado).
- `ANECF-v1.0.xsd` viene con BOM UTF-8 → se remueve en memoria.

### Firma en el esquema
Los 4 XSD terminan con `xs:any processContents="skip"` para la `<Signature>`:
opcional en ARECF/ACECF (`minOccurs="0"`), OBLIGATORIA en ANECF/RFCE. El flujo real
firma antes de validar; para dry-run sin certificado se usa el placeholder
`withSignaturePlaceholder` (elemento vacío que el esquema ignora por diseño).

## e-CF 41/43/44/45/46/47 (v349, descargados 2026-07-10)

Misma fuente oficial y mismo método (base de descarga
`…/Documentacin%20sobre%20eCF/Documentaci%C3%B3n%20T%C3%A9cnica%20(XSD)/e-CF%20<NN>%20v.1.0.xsd`,
User-Agent de navegador — el WAF devuelve 403 a curl "pelado"). HTTP 200 los 6;
verificación: root `element name="ECF"`, inician `<?xml … <xs:schema`, no-HTML.
**Nota:** estos 6 archivos vienen con **BOM UTF-8** (como ANECF) — se remueve EN
MEMORIA en el loader; el archivo en disco queda idéntico al oficial.

| Tipo | Archivo local | Bytes | SHA256 |
|---|---|---|---|
| 41 | `e-CF-41-v1.0.xsd` | 111171 | `eae1993c637375bc1cbe80932411d87f5680cd54e77e4d1b2752d72a6c8b2ab3` |
| 43 | `e-CF-43-v1.0.xsd` | 96111 | `776f030980c2c50cf0221e9263c55f367c8631727adff00ab45e2c7c1abafc52` |
| 44 | `e-CF-44-v1.0.xsd` | 114302 | `19834f37a9f0e2db40f00c80d07c2bf92f9019f23474480f32cef1ba06af4e67` |
| 45 | `e-CF-45-v1.0.xsd` | 121785 | `030492cc8ef7d1a09a89b16b241f8e5c4920dfd09c0b629b1db8e68406ecd6ca` |
| 46 | `e-CF-46-v1.0.xsd` | 115951 | `e7f8613ade25c7efb88e84d34d7c0ad330d1b22238ad9ef90c80aed01911d67b` |
| 47 | `e-CF-47-v1.0.xsd` | 101382 | `14daf18f52f63dd80e439a18fb60a102d74e71243ee90ee253367f61ce8e1994` |

Estos XSD son la FUENTE DE VERDAD para implementar los builders/validaciones de
41-47 (capability matrix honesta: tener el XSD ≠ soporte end-to-end).
