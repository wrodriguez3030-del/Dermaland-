# Facturación electrónica DGII — estado y veredicto

> **2026-08-04** · rama `feat/dgii-reformulacion` · **sin desplegar** (§32)
> **Veredicto: NO-GO** para emisión fiscal real. Razones en §9.

## 1. Por dónde empezar a leer

| Documento | Qué contesta |
|---|---|
| `CURRENT_DERMALAND_FISCAL_AUDIT.md` | Qué tiene DermaLand hoy, medido |
| `SOURCE_MODULE_AUDIT.md` | Qué trae el módulo Odoo y qué **no** se traslada |
| `THIRD_PARTY_AND_LICENSE_REVIEW.md` | El riesgo AGPL-3 |
| `STATE_MACHINE.md` | Por dónde pasa un comprobante |
| `SECURITY.md` | Permisos, certificado, idempotencia |
| `ROLLBACK.md` | Cómo se deshace cada cosa |

## 2. Estado inicial encontrado

El módulo **no estaba en cero ni cerca de terminado**. Tenía el camino de
emisión escrito y probado —construir, validar contra XSD, firmar, autenticar,
transmitir— para cuatro tipos, 13 tablas fiscales en producción y 285 pruebas.
Le faltaban enteros los permisos, la máquina de estados, la cola, la recepción,
la aprobación comercial, el RFCE y seis tipos de comprobante.

La auditoría que había en el repo era de mayo y describía como *stubs* piezas
que ya funcionaban.

## 3. Riesgos críticos detectados en el módulo de referencia

1. **Credenciales incrustadas** de un servidor privado, con permiso de
   escritura. Registradas por huella, sin reproducir sus valores.
2. **Cada emisión depende de ese servidor.** Si no responde, no se factura.
3. **QR público con IDOR**: cualquiera saca el comprobante de cualquier empresa
   por un id correlativo.
4. **Permisos abiertos a todos**, incluida la escritura sobre la empresa, que es
   donde ese módulo guarda la contraseña del certificado.
5. Un XSD para diez tipos. Cero pruebas.

**Ninguno se trasladó.**

## 4. Qué se construyó

| | |
|---|---|
| **13 permisos fiscales** | `features/dgii/permissions.ts`. Inventario no toca nada; solo `super_admin` enciende producción |
| **18/18 rutas con portero** | `authorizeDgii(...)` + prueba de propiedad del árbol de rutas |
| **Máquina de estados** | Sobre los 12 estados que ya tenía el `CHECK`. Aceptado no retrocede; firmado no se edita |
| **Historial append-only** | Disparador en la base que rechaza `UPDATE` y `DELETE` |
| **Idempotencia** | Índice único en la base, no un `if`. El ambiente entra en la llave |
| **Clasificación de errores** | 8 clases. Timeout tras entregar → **consultar**, no reenviar |
| **Política de cola** | Pura, sin base de datos. Respeta la cita, prioriza lo más viejo, topa en 10 |
| **Avisos de certificado** | 30/15/7/3/1/0 días, una vez por umbral |
| **Un solo camino de envío** | Eliminado el `dgiiService` que fingía enviar |
| **Trabajador de la cola** | Cron cada 15 min. Un negocio cada vez; se para antes de hablar con la DGII |
| **RFCE** | Umbral RD$250 000 verificado en la DGII. Estrictamente menor |
| **14 XSD oficiales** | Descargados de dgii.gov.do con checksum y prueba de integridad. Antes 4 |
| **Los 10 tipos e-CF** | Construyen y **validan contra su esquema oficial**. Antes 4 |
| **Reglas por tipo** | Tabla sacada de los XSD, con prueba que la compara contra ellos |

**2 526 pruebas** en el proyecto. Migraciones `0045` aplicadas y verificadas
contra la base de producción, con las filas de prueba retiradas.

## 5. Verificado contra la base real

| | |
|---|---|
| Doble clic / dos funciones a la vez, misma llave | Rechazado |
| Mismo e-NCF, mismo ambiente | Rechazado |
| Mismo e-NCF en producción tras probarlo | **Permitido** |
| `UPDATE` del historial | Rechazado |
| `DELETE` del historial | Rechazado |
| Borrar comprobante con historial | Rechazado |

## 6. Lo que sigue faltando

| § | Qué | Bloqueado por |
|---|---|---|
| ~~10~~ | ~~Seis tipos e-CF (41, 43, 44, 45, 46, 47)~~ | **HECHO.** Los diez construyen y validan contra su XSD oficial |
| ~~12~~ | ~~RFCE~~ | **HECHO.** Umbral verificado en fuente oficial DGII |
| ~~18~~ | ~~El trabajador que consume la cola~~ | **HECHO.** Falta enchufarle los manejadores de validar/firmar |
| 19 | Job de consulta por `trackId` | Es Fase H, bloqueada por política |
| 21, 22 | Recepción y aprobación comercial | Nada. Diseño listo en `SOURCE_MODULE_AUDIT` §7 |
| 28 | Métricas y alertas | Nada |

## 7. Migraciones

`0045_ecf_idempotency_and_events.sql` — **aditiva**. No borra ni modifica datos.
Aplicada sobre una tabla vacía.

Corrección durante la verificación: la clave foránea era `ON DELETE CASCADE`, lo
que hacía que borrar un comprobante fallara con un mensaje sobre «append-only»
en vez de decir lo que pasaba. Cambiada a `RESTRICT`.

## 8. Pendientes que no cierra ningún programador

1. Acta / designación oficial de Usuario Administrador e-CF ante la DGII.
2. Certificado vigente >60 días y sin revocación en CRL/OCSP.
3. Titular del certificado autorizado para representar el RNC.
4. RNC emisor coincidente con certificado y designación.
5. **Autorización explícita del propietario** para Fase G.

## 9. GO / NO-GO

**NO-GO.** Por el §34, no se declara GO si:

- ✅ ~~Faltan XSD~~ — **los 14, oficiales y fijados por checksum**.
- ❌ **Faltan pruebas reales** — nunca se ha transmitido nada, ni a `testecf`.
- ❌ **Faltan credenciales** — las cuatro validaciones externas del §8.
- ✅ ~~Riesgo de pérdida de datos~~ — migración aditiva, tabla vacía.
- ✅ ~~Secretos en código~~ — ninguno; los del ZIP no entraron.
- ✅ ~~La firma no se verifica~~ — `verifyEcfSignature` existe y está probada.
- ✅ ~~Idempotencia sin probar~~ — probada contra la base real.
- ✅ ~~No hay rollback~~ — `ROLLBACK.md`.
- ❌ **Certificación DGII sin completar.**
- ❌ **Producción no autorizada por el propietario.**

**Seis de diez cerradas.** Las cuatro que quedan no dependen de escribir más
código: transmitir a `testecf`, las validaciones externas, la certificación y tu
autorización.

## 10. Política vigente

**Fase G (envío real a `testecf`), Fase H (consulta por `trackId`) y producción
fiscal siguen bloqueadas.** Requieren autorización explícita del propietario en
el momento, aunque todas las puertas técnicas estén verdes.

`DGII_TESTECF_SEND_ENABLED` está en `false`. El botón «Enviar pruebas a DGII
testecf» está deshabilitado **a propósito**: es una decisión, no un fallo.
