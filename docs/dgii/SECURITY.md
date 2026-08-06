# Seguridad del módulo fiscal

## 1. Autorización

**La RLS valida el `business_id`, no el rol** (DL-01). Es el malentendido que
dejó ocho rutas fiscales sin portero: el middleware exige sesión del negocio y
eso parecía suficiente.

Hoy **las 18 rutas de `/api/dgii` exigen un permiso fiscal** vía
`authorizeDgii(...)`, y `routes-guarded.test.ts` recorre el árbol de rutas y
falla si aparece una sin él — incluido el caso de un archivo con dos handlers
donde solo uno comprueba.

### Los trece permisos

| Permiso | Quién |
|---|---|
| `dgii.view`, `dgii.issue`, `dgii.query_status` | Mostrador (caja, vendedor, supervisor) + gerencia + admin |
| `dgii.download_xml`, `dgii.retry`, `dgii.receive`, `dgii.commercial_approve/reject` | Gerencia + admin |
| `dgii.configure`, `dgii.manage_certificate`, `dgii.manage_sequences`, `dgii.certification_run` | Solo admin |
| `dgii.production_enable` | **Solo `super_admin`** |
| `dgii.audit_view` | Gerencia + admin + auditor |

**Inventario no tiene ninguno.** Y quien emite una factura no obtiene por ello
acceso al certificado (§25 del pliego, con prueba propia).

## 2. El certificado

- Cifrado con `DGII_CERT_ENCRYPTION_KEY`, **fuera de la base**.
- La contraseña **nunca** vuelve al navegador; `loadActiveCertificateAction`
  devuelve solo metadatos.
- **No se firma en el navegador**, nunca.
- Avisos de vencimiento a 30, 15, 7, 3, 1 y 0 días, **una vez por umbral**: un
  correo diario durante treinta días es cómo se enseña a la gente a filtrar los
  correos del sistema.

Lo que el módulo de referencia hacía y aquí **no** se hace: guardar el P12 y su
contraseña como campos de la empresa, con permiso de escritura para cualquier
usuario.

## 3. Idempotencia

```
business_id : ambiente : e-NCF : operación
```

Un e-NCF se gasta una sola vez, y enviarlo dos veces se arregla con papeles, no
con un `DELETE`.

**La barrera es un índice único en la base, no un `if` en TypeScript.** En
Vercel hay varias funciones sin servidor atendiendo a la vez y «leer, comprobar,
escribir» no es atómico entre ellas: dos peticiones simultáneas leen las dos
«no existe» y las dos envían.

El **ambiente** entra en la llave para que haber probado con un e-NCF no impida
emitirlo de verdad.

## 4. El error que puede duplicar un comprobante

Un tiempo de espera agotado **después** de entregar el XML. La DGII pudo
recibirlo y perderse la respuesta.

Ese caso **no se reintenta: se consulta** por `trackId`. Igual el `409`, que
significa «ya lo tenía».

## 5. Lo que no se registra

Nunca, en ningún log: el token, la contraseña del certificado, el material del
certificado, el XML completo en logs generales, ni datos del contribuyente que
no hagan falta.

Los mensajes de error que ve el usuario **no llevan la clase cruda ni códigos**,
y hay una prueba que lo comprueba.

## 6. Aislamiento de ambientes

`testecf`, `certecf` y `ecf` están separados en la llave de idempotencia y en el
índice único de e-NCF. Una prueba no puede bloquear una emisión real, y una
emisión real no puede confundirse con una prueba.

`DGII_TESTECF_SEND_ENABLED` está en **`false` por defecto**.

## 7. Pendiente antes de producción

- Parsing XML sin DTD ni entidades externas en el receptor **(el receptor aún no
  existe)**.
- Límite de tamaño de payload y protección contra replay en la recepción.
- Verificar los endpoints contra documentación oficial vigente de la DGII.
- Los XSD de los seis tipos que faltan, **solo de fuentes oficiales**.

## 8. Lo que se rechazó del módulo de referencia

Todo esto estaba en `l10n_do_edi` y **no se trasladó**:

- Credenciales incrustadas de un servidor privado, con permiso de escritura.
- Emisión que depende de que responda un servidor ajeno.
- Seis rutas públicas sin autenticación ni CSRF.
- Un QR público que sirve cualquier factura de cualquier empresa por su id
  correlativo.
- Permisos abiertos a todos, incluida la escritura sobre la empresa.
- Rutas de prueba instaladas en producción.

Detalle en `SOURCE_MODULE_AUDIT.md`.
