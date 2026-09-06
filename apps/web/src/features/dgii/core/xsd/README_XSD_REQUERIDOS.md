# XSD oficiales DGII (✅ INCORPORADOS: e-CF 2026-06-09 · certificación ARECF/ACECF/ANECF/RFCE 2026-07-04)

**Estado: PRESENTES.** Los 4 XSD oficiales (`e-CF-31-v1.0.xsd` … `e-CF-34-v1.0.xsd`)
ya están en esta carpeta (ver `SOURCE.md` con fuente + SHA256). El validador y el
builder están alineados; los 4 tipos pasan el XSD. Este documento queda como
referencia para futuras actualizaciones de versión del XSD.

## ⚠️ Reglas
- **NO inventar XSD.** Solo usar los archivos OFICIALES publicados por la DGII.
- Descargarlos únicamente de fuente oficial DGII (ver `SOURCE.md`). No usar blogs
  ni repos de terceros como fuente de verdad.
- Estos archivos son esquemas públicos (no secretos), pero deben ser los oficiales
  vigentes para la versión de e-CF que se vaya a emitir.

## Archivos esperados (nombres que espera el loader)
Colocá en `docs/dgii/xsd/` los XSD oficiales **renombrados** así:

| Tipo e-CF | Archivo esperado |
|---|---|
| 31 — Crédito Fiscal | `e-CF-31.xsd` |
| 32 — Consumo | `e-CF-32.xsd` |
| 33 — Nota de Débito | `e-CF-33.xsd` |
| 34 — Nota de Crédito | `e-CF-34.xsd` |

> El mapa está en `src/lib/dgii/xsd-loader.ts` (`XSD_FILE_BY_TIPO`). Si la DGII
> publica un único XSD para varios tipos, ajustar ese mapa en consecuencia y
> documentarlo.

## Si el XSD tiene `import`/`include`
Algunos XSD oficiales referencian sub-esquemas. En ese caso, colocá también los
archivos importados aquí y pasalos vía la opción `preload` de xmllint-wasm
(extender `validateEcfXml` para aceptar `preload`). Documentar el cambio.

## Cómo validar una vez provistos
```ts
import { loadXsdForTipo } from "@/lib/dgii/xsd-loader";
import { validateEcfXml } from "@/lib/dgii/validator";
import { buildEcfXml } from "@/lib/dgii/builder";

const { xml } = buildEcfXml(/* ...input tipo 32... */);
const xsd = await loadXsdForTipo("32");
const res = await validateEcfXml({ xml, xsd, schemaName: "e-CF-32" });
// res.ok / res.errors
```

## Bloqueo de Fase 5
Mientras falten estos archivos:
- El validador funciona con un XSD pasado por string (probado con un fixture técnico).
- Los tests de **validación oficial** y de **alineación del builder al XSD** quedan
  marcados como `todo`/`skip` con su razón.
- El builder **NO se altera por suposiciones**; cualquier ajuste de nombres/orden/
  cardinalidad se hará recién cuando se valide contra el XSD oficial.
