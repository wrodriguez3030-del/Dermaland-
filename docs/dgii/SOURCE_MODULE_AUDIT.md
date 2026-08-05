# Auditoría del módulo de referencia `l10n_do_edi`

> **Fecha:** 2026-08-04 · **Rama:** `feat/dgii-reformulacion`
> **Fuente:** `l10n_do_edi.zip` · 122 archivos · 1,2 MB
> **Extraído en:** carpeta temporal **fuera del repositorio**. Ni un archivo del
> ZIP entra en `apps/`, `supabase/` ni en el historial de git.
> **Qué es:** módulo Odoo 19 de *Overload Solutions*, licencia declarada AGPL-3.
>
> Se audita como **especificación funcional**, no como arquitectura a copiar.
> **No se ejecutó nada del módulo. No se llamó a DGII.**

---

## 0. Lo que hay que saber si solo se leen diez líneas

1. **Trae credenciales incrustadas** de un servidor privado del proveedor.
   Debe tratarse como **comprometidas** y rotarse. §1.
2. **Cada emisión de e-CF llama a ese servidor privado.** Si no responde, la
   factura no sale. §2.
3. **Seis rutas HTTP públicas sin autenticación y sin CSRF**, incluida una que
   sirve el QR de **cualquier factura de cualquier empresa** por su id. §3.
4. **Los permisos están abiertos a todo el mundo**, incluida la escritura sobre
   `res.company`, que es donde vive la contraseña del certificado. §4.
5. **Trae un solo XSD** (e-CF 31) para diez tipos de comprobante. §5.
6. **Cero pruebas.** §6.
7. Como inventario de reglas fiscales **es bueno y vale la pena**: cubre los diez
   tipos, el RFCE, la aprobación comercial y la recepción. §7.

---

## 1. Credenciales incrustadas — CRÍTICO

`models/account_edi_format.py`, líneas 55-58. Cuatro constantes en el código
fuente: una URL, un nombre de base de datos, un usuario y una contraseña.

**No se reproducen sus valores aquí ni en ningún otro archivo del repositorio.**
Se registran por huella para poder identificarlos sin divulgarlos:

| Línea | Constante | Longitud | SHA-256 (12) |
|---|---|---|---|
| 55 | `URL` | 44 | `91165fccb432` |
| 56 | `DB` | 7 | `1d7993c206d9` |
| 57 | `USERNAME` | 29 | `29d4ccb22d93` |
| 58 | `PASSWORD` | 40 | `e5b895a055c5` |

`USERNAME` es una dirección de correo corporativa del proveedor. `PASSWORD` son
40 caracteres hexadecimales — la forma de un SHA-1, probablemente una clave
derivada, no una contraseña tecleada.

**Acciones:**

- Tratar las cuatro como **comprometidas**: están en un ZIP que circula.
- **Rotarlas es responsabilidad del proveedor**, no de DermaLand. Conviene
  avisarle: quien tenga el módulo tiene acceso a su servidor.
- **No reutilizar ninguna** en DermaLand, ni siquiera para pruebas.
- No copiar el servicio de licencia.

---

## 2. La emisión depende de un servidor privado — CRÍTICO

`_has_license(vat)` (línea 565) abre un XML-RPC contra el servidor del proveedor
con esas credenciales y:

1. busca el `res.partner` cuyo `vat` es el RNC del emisor;
2. busca una `sale.order` en estado `sale` de ese partner;
3. **escribe** en `client_order_ref` un contador incrementado;
4. devuelve `True`.

Se llama en la línea 685, **antes de emitir**, y `except Exception` lo traga
todo devolviendo `False`.

Consecuencias, en orden de gravedad:

- **Si el servidor del proveedor está caído, lento o desaparece, no se puede
  facturar.** Un módulo fiscal no puede tener esa dependencia.
- Las credenciales incrustadas tienen **permiso de escritura** sobre
  `sale.order` de ese servidor. No son de solo lectura.
- El fallo se silencia: no se distingue «sin licencia» de «no hubo red».
- Existe una salida, `l10n_do_ecf_skip_license`, que además revela que el propio
  proveedor sabe que esto estorba.

**Para DermaLand: no se traslada nada de esto.** Ni el chequeo, ni el servidor,
ni el patrón de llamar a un tercero dentro del camino de emisión.

---

## 3. Rutas públicas — ALTO

Dos controladores exponen **seis rutas con `auth='public'` y `csrf=False`**:

```
/fe/autenticacion/api/semilla        GET, POST
/fe/recepcion/api/ecf                POST   (declarada en LOS DOS controladores)
/fe/aprobacioncomercial/api/ecf      POST   (declarada en LOS DOS controladores)
/fe/status                           GET
/fe/test/recibir                     GET
/fe/certification/status             GET
/l10n_do/qr/<int:invoice_id>         GET
```

Tres cosas mal, por separado:

**3.1 · El QR es un IDOR.** `qr_code_controller.py` hace
`request.env['account.move'].sudo().browse(invoice_id)`. `sudo()` salta todas
las reglas de registro, y el identificador es un entero correlativo. Cualquiera
en internet puede recorrer `/l10n_do/qr/1`, `/2`, `/3`… y obtener el QR de
**cualquier factura de cualquier empresa** de esa instalación. El QR de un
e-CF lleva dentro RNC, e-NCF, monto y código de seguridad.

Es literalmente lo que el pliego prohíbe en §20: *«No usar una ruta pública que
entregue el QR de cualquier factura solo por conocer un ID interno.»*

**3.2 · Rutas de prueba en producción.** `/fe/test/recibir` es pública y se
instala con el módulo.

**3.3 · Rutas duplicadas.** `/fe/recepcion/api/ecf` y
`/fe/aprobacioncomercial/api/ecf` están declaradas en los dos controladores.
Cuál gana depende del orden de carga. Dos implementaciones para la misma URL en
un endpoint fiscal es un fallo esperando fecha.

---

## 4. Permisos — ALTO

`security/ir.model.access.csv`, ocho filas, **todas con `group_id` vacío y
`1,1,1,1`**: leer, escribir, crear y borrar, para cualquier usuario.

La fila que importa:

```
access_res_company_edi,...,model_res_company,,1,1,1,1
```

`res.company` es donde el módulo guarda **el P12 y su contraseña** (§5.2 del
pliego). Con esa fila, cualquier usuario de la instalación puede escribir el
certificado de la empresa.

---

## 5. Cobertura XSD — ALTO

El paquete trae **un** esquema: `data/e-CF_31_v.1.0.xsd`.

El código trata **diez** tipos: 31, 32, 33, 34, 41, 43, 44, 45, 46 y 47.

Nueve de diez tipos no se validan contra ningún esquema antes de firmarse.

---

## 6. Pruebas — ALTO

No hay carpeta `tests/` ni un solo archivo de prueba. 6 811 líneas de lógica
fiscal sin una prueba.

Se cuentan además **40 `except Exception`** en modelos y controladores, la
mayoría silenciando el error.

---

## 7. Lo que SÍ vale, y es bastante

Como inventario de reglas fiscales el módulo es útil y ahorra semanas de leer
normativa. Lo aprovechable, **conceptualmente**:

| Capacidad | Dónde mirar | Valor para DermaLand |
|---|---|---|
| Los diez tipos e-CF y sus diferencias | `account_edi_format.py` | Alto — hoy DermaLand cubre 4 |
| Catálogo de endpoints por ambiente | `account_edi_format.py:29-53` | Alto — tres ambientes bien separados |
| Semilla → firma → token | `account_edi_format.py:~3019` | Alto — confirma el flujo ya implementado |
| RFCE y su umbral | `RESUMEN_AMOUNT_LIMIT = 250000` | Alto — **confirma el valor del §12** |
| Aprobación comercial | `commercial_approval_wizard.py` | Alto — DermaLand no lo tiene |
| Recepción de e-CF | `dgii_receptor_controller.py` | Alto — el pipeline, no el código |
| Aviso de vencimiento del certificado | cron diario en `edi_cron_config.xml` | Medio |
| Reproceso cada 15 minutos | cron en `edi_cron_config.xml` | Medio — es la cola del §18 |
| Importar casos desde Excel | `excel_to_xml.py` | Bajo — solo para certificación |

**Los endpoints de producción están en el código y son verificables:**
`ecf.dgii.gov.do`, `fc.dgii.gov.do`, `statusecf.dgii.gov.do`. Aun así, el §17
manda contrastarlos con documentación oficial vigente antes de habilitar
producción, y eso sigue pendiente.

---

## 8. Lo que NO se traslada

- El servicio de licencia y su servidor.
- Las credenciales, en cualquier forma.
- `sudo()` para saltarse las reglas de acceso.
- Rutas públicas sin autenticación técnica ni CSRF.
- Rutas de prueba instaladas en producción.
- Rutas duplicadas entre controladores.
- `except Exception` que traga el error y sigue.
- Guardar la contraseña del certificado como campo de la empresa.
- 3 361 líneas en un archivo mezclando reglas fiscales, XML, firma, HTTP y UI.
- `__pycache__` (21 archivos) y `__MACOSX`.

---

## 9. Vacíos del módulo fuente

Cosas que el pliego pide y que el módulo de referencia **tampoco** resuelve, así
que hay que diseñarlas desde cero:

- Idempotencia real. No hay clave de idempotencia; el cron cada 15 minutos
  reprocesa por estado.
- Máquina de estados explícita con transiciones permitidas.
- Historial append-only de eventos.
- Clasificación de errores en transitorios y permanentes.
- Backoff exponencial con jitter; el cron es de intervalo fijo.
- Circuit breaker.
- Protección contra replay en los endpoints receptores.
- Límite de tamaño de payload.
- Parsing XML seguro sin DTD ni entidades externas — **no se encontró
  configuración anti-XXE** en el receptor.
- Aislamiento entre ambientes al nivel de datos.
- Métricas y alertas.

---

## 10. Conclusión

Sirve como **mapa de reglas fiscales**: qué campos lleva cada tipo, qué endpoint
toca, cómo se encadena la autenticación, dónde está el umbral del RFCE.

No sirve como **modelo de ingeniería**: la seguridad, el aislamiento, la
idempotencia y las pruebas hay que ponerlas enteras.

Y hay que decirlo claro: **si DermaLand hubiera copiado este módulo tal cual,
habría heredado un IDOR público sobre comprobantes fiscales, permisos abiertos
sobre el certificado y la imposibilidad de facturar cuando un servidor ajeno se
caiga.**
