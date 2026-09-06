# Pruebas del portado DGII que esperan a una fase posterior

Al portar el módulo fiscal de agendapp (2026-09-05) vinieron 45 ficheros de
prueba. La mayoría ejercita el **núcleo puro** y pasa desde el primer día.
Otras son *guardas de arquitectura*: abren un fichero fuente y comprueban una
invariante sobre él («el servicio de envío no escribe `status` con un UPDATE
crudo», «la pantalla no tiene botón de envío habilitado»). Ésas no pueden pasar
todavía, porque el fichero que vigilan es de una fase que aún no existe en
DermaLand.

No se han borrado. Cada una está marcada en su sitio con la fase que la revive:

```ts
// PENDIENTE fase 3 (persistencia y orquestacion): revive cuando exista
// src/features/dgii/core/submission-service.ts.
it.skip("submission-service usa la máquina de estados", () => {
```

Para revivirlas: crear el fichero que la marca nombra, quitar el `.skip` y el
comentario, y correr. Si la guarda falla, es que el fichero nuevo no cumple la
invariante que agendapp ya cumplía — que es exactamente para lo que sirve.

**Estado a 2026-09-05:** 607 pruebas pasan, 132 esperan. Ninguna falla.

> Nota sobre las rutas: las marcas que dicen `src/lib/dgii/…` son las que el
> traductor `__port__/rutas.ts` no reescribió porque el fichero no existe en
> ningún sitio todavía. Al portarlo irá a `src/features/dgii/core/`, igual que
> el resto.

---

## Fase 2 — Base de datos — 15 tablas, `reserve_next_encf`, `prepare_ecf_invoice`

1 bloques marcados, sobre 1 ficheros que DermaLand aún no tiene.

| Fichero que hace falta | Bloques | Pruebas que lo esperan |
|---|---:|---|
| `prisma/migrations/applied/20260724_dgii_invoice_prepared_status.sql` | 1 | invoice-prepared-status-migration-v423.test.ts |

## Fase 3 — Persistencia y orquestación sobre los repositorios de DermaLand

54 bloques marcados, sobre 19 ficheros que DermaLand aún no tiene.

| Fichero que hace falta | Bloques | Pruebas que lo esperan |
|---|---:|---|
| `src/features/dgii/core/submission-service.ts` | 19 | estado-tras-envio-v577.test.ts ×2, grafo-en-envio-v580.test.ts ×5, higiene-v584.test.ts ×6, nombre-archivo-oficial-v534.test.ts, rfce-auth-host-v531.test.ts ×5 |
| `src/features/dgii/core/estado-veredicto.ts` | 7 | evidencia-del-veredicto-v615.test.ts ×7 |
| `src/features/dgii/core/invoice-prepare.ts` | 6 | compliance-v335.test.ts, venta-comprobante-fiel-v525.test.ts ×5 |
| `src/features/dgii/core/certificate-storage.ts` | 3 | xsd-engine-runtime-v319-forensics.test.ts ×2, xsd-runtime-resolution-v318-hotfix.test.ts |
| `src/features/dgii/core/ri-generator.ts` | 2 | higiene-v584.test.ts, rfce-routing-paridad-v500.test.ts |
| `src/features/dgii/core/simulation-ri.ts` | 2 | higiene-v584.test.ts, venta-comprobante-fiel-v525.test.ts |
| `src/lib/dgii/invoice-prepare.ts` | 2 | nota-rnc-heredado-v555.test.ts, rfce-routing-v499.test.ts |
| `src/lib/dgii/submission-service.ts` | 2 | encf-y-evidencia-v612.test.ts, nota-que-modifica-v612.test.ts |
| `src/features/dgii/core/certification-matrix.ts` | 1 | higiene-v584.test.ts |
| `src/features/dgii/core/dgii-locations-data.ts` | 1 | final-guards.test.ts |
| `src/features/dgii/core/rnc-padron-carga.ts` | 1 | final-guards.test.ts |
| `src/features/dgii/core/submission-simulation-service.ts` | 1 | final-guards.test.ts |
| `src/features/dgii/core/tenant-capabilities.ts` | 1 | higiene-v584.test.ts |
| `src/features/dgii/core/testecf-readiness.ts` | 1 | final-guards.test.ts |
| `src/lib/dgii/certificate-storage.ts` | 1 | xsd-engine-runtime-v319-forensics.test.ts |
| `src/lib/dgii/certification-dataset-service.ts` | 1 | fidelity-fixes-v389.test.ts |
| `src/lib/dgii/certification-portal.ts` | 1 | postulacion-url-ux-v346.test.ts |
| `src/lib/dgii/certification-send-service.ts` | 1 | certecf-rejection-diagnostic-v386.test.ts |
| `src/lib/dgii/ri-generator.ts` | 1 | rfce-routing-paridad-v500.test.ts |

## Fase 5 — Adaptadores de negocio — proforma → e-CF, envío en mostrador, nota de crédito

11 bloques marcados, sobre 5 ficheros que DermaLand aún no tiene.

| Fichero que hace falta | Bloques | Pruebas que lo esperan |
|---|---:|---|
| `src/lib/server/pos-payments.ts` | 4 | pagos-congelados-v530.test.ts ×4 |
| `src/lib/server/pos-sale-send.ts` | 3 | 400-no-es-rechazo-v581.test.ts, rfce-auth-host-v531.test.ts ×2 |
| `src/lib/server/purchase-emit.ts` | 2 | retencion-productor-v579.test.ts ×2 |
| `src/lib/server/pos-sale-ecf.ts` | 1 | venta-comprobante-fiel-v525.test.ts |
| `src/lib/server/pos-sales.ts` | 1 | venta-comprobante-fiel-v525.test.ts |

## Fase 6 — Pantallas y rutas API, incluidas las de certificación

23 bloques marcados, sobre 15 ficheros que DermaLand aún no tiene.

| Fichero que hace falta | Bloques | Pruebas que lo esperan |
|---|---:|---|
| `src/app/(dashboard)/settings/dgii/certification/_components/CertificationBridge.tsx` | 3 | portal-tracker-hardening-v342.test.ts, postulacion-url-ux-v346.test.ts, postulation-signature-compat-v376.test.ts |
| `src/components/facturar/SaleResultDialog.tsx` | 3 | error-dgii-legible-v532.test.ts ×3 |
| `src/app/(dashboard)/sales/credits/page.tsx` | 2 | pagos-congelados-v530.test.ts ×2 |
| `src/app/(dashboard)/settings/dgii/facturas/_components/InvoicesPanel.tsx` | 2 | higiene-v584.test.ts, retencion-41-v575.test.ts |
| `src/app/(dashboard)/settings/dgii/setup/_components/OfficialDatasetPanel.tsx` | 2 | certecf-rejection-diagnostic-v386.test.ts, fidelity-fixes-v389.test.ts |
| `src/app/api/dgii/certification/sign/route.ts` | 2 | portal-tracker-hardening-v342.test.ts, postulacion-url-ux-v346.test.ts |
| `next.config.ts` | 1 | xsd-engine-runtime-v319-forensics.test.ts |
| `src/app/(dashboard)/settings/dgii/envios/_components/TestecfReadinessPanel.tsx` | 1 | final-guards.test.ts |
| `src/app/(dashboard)/settings/dgii/envios/page.tsx` | 1 | final-guards.test.ts |
| `src/app/(dashboard)/settings/dgii/setup/_components/RejectedCaseDetail.tsx` | 1 | certecf-rejection-diagnostic-v386.test.ts |
| `src/app/api/dgii/certification/dataset/audit-fidelity/route.ts` | 1 | fidelity-fixes-v389.test.ts |
| `src/app/api/dgii/enablement/portal-step/route.ts` | 1 | portal-tracker-hardening-v342.test.ts |
| `src/app/api/dgii/invoices/prepare/route.ts` | 1 | final-guards.test.ts |
| `src/app/api/dgii/testecf/readiness/route.ts` | 1 | final-guards.test.ts |
| `src/app/api/pos/credits/route.ts` | 1 | pagos-congelados-v530.test.ts |

## Fase 9 — Ensayo completo sin enviar nada — guiones, documentos y empaquetado

18 bloques marcados, sobre 11 ficheros que DermaLand aún no tiene.

| Fichero que hace falta | Bloques | Pruebas que lo esperan |
|---|---:|---|
| `scripts/dgii/g3b0-preflight.ts` | 5 | final-guards.test.ts ×5 |
| `.env.example` | 2 | final-guards.test.ts ×2 |
| `scripts/dgii/g3b0-generate-evidence-template.ts` | 2 | final-guards.test.ts ×2 |
| `tests/unit/dgii-veredicto-v569.test.ts` | 2 | grafo-en-envio-v580.test.ts ×2 |
| `docs/dgii/G3B0_PAQUETE_OPERATIVO_TESTECF.md` | 1 | final-guards.test.ts |
| `docs/dgii/G3B_ACTIVACION_MANUAL_TESTECF.md` | 1 | final-guards.test.ts |
| `docs/dgii/G3B_EVIDENCIA_POST_ENVIO_TESTECF.md` | 1 | final-guards.test.ts |
| `docs/dgii/templates/G3B_EVIDENCIA_PRIMER_ENVIO_TEMPLATE.md` | 1 | final-guards.test.ts |
| `next.config.ts` | 1 | xsd-runtime-resolution-v318-hotfix.test.ts |
| `prisma/migrations` | 1 | higiene-v584.test.ts |
| `tests/integration/dgii-storage-bucket.integration.test.ts` | 1 | final-guards.test.ts |
