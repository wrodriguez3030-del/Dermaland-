DOCUMENTO PARA CLAUDE
INTEGRACIÓN DE FACTURACIÓN ELECTRÓNICA DGII - CIBAO SPA LÁSER

Necesito que me ayudes a integrar la Facturación Electrónica de la DGII de República Dominicana en mi sistema de facturación.

Contexto:
Tengo un sistema de ventas/facturación para Cibao Spa Láser. Quiero que el sistema pueda emitir comprobantes fiscales electrónicos e-CF según la documentación oficial de la DGII.

Ya tengo como referencia:
- Página oficial de la DGII: “Documentación sobre e-CF”.
- Archivo XSD “e-CF 31 v.1.0.xsd”, correspondiente a Factura de Crédito Fiscal Electrónica.

Objetivo general:
Implementar un módulo de facturación electrónica DGII que permita:

- Generar XML e-CF.
- Validarlo contra XSD.
- Firmarlo digitalmente.
- Enviarlo a DGII.
- Consultar su estado.
- Guardar TrackId/respuesta.
- Generar representación impresa/PDF con QR.
- Manejar proformas, ventas con tarjeta, ventas en efectivo, transferencia y cierre de caja.
- Permitir que en el cierre de caja un usuario autorizado indique el porcentaje de proformas que se convertirá en e-NCF/e-CF.
- Permitir realizar pre-certificación y certificación DGII con software propio.

Importante:
No quiero que el sistema empiece directamente por “mandar facturas”. Primero debe validar que estén bien configurados los clientes, RNC, secuencias, tipos de comprobante, impuestos, totales y estructura XML. La DGII valida coherencia fiscal y técnica; un XML que “se ve bien” puede ser rechazado si falla XSD, firma, totales, secuencia o reglas de negocio.

También es importante que cualquier lógica relacionada con proformas, porcentajes y cierres de caja quede marcada para validación con el contador y con la normativa DGII. El sistema no debe facilitar omisión fiscal. Las proformas no sustituyen comprobantes fiscales cuando legalmente corresponda emitirlos.

------------------------------------------------------------
1. CONFIGURACIÓN DGII
------------------------------------------------------------

Crear una sección de configuración para:

- RNC emisor.
- Razón social.
- Nombre comercial.
- Dirección.
- Provincia.
- Municipio.
- Teléfono.
- Correo.
- Ambiente:
  - testecf.
  - certecf.
  - ecf.
- Certificado digital .p12/.pfx.
- Contraseña del certificado, guardada como secreto seguro.
- Secuencias e-NCF autorizadas por tipo de comprobante.
- Fecha de vencimiento de secuencia.
- URLs base de DGII por ambiente.
- Configuración de cierre de caja y generación e-CF desde proformas.

La configuración debe permitir cambiar entre ambiente de prueba, certificación y producción sin tocar el código.

------------------------------------------------------------
2. TIPOS DE COMPROBANTES A IMPLEMENTAR
------------------------------------------------------------

Implementar primero:

- e-CF 31: Factura de Crédito Fiscal Electrónica.
- e-CF 32: Factura de Consumo Electrónica.
- e-CF 33: Nota de Débito Electrónica.
- e-CF 34: Nota de Crédito Electrónica.

El sistema debe quedar preparado para extenderse a:

- e-CF 41.
- e-CF 43.
- e-CF 44.
- e-CF 45.
- e-CF 46.
- e-CF 47.

------------------------------------------------------------
3. GENERACIÓN DEL XML E-CF
------------------------------------------------------------

Crear un servicio tipo:

DgiiXmlBuilder

Este servicio debe convertir una factura interna del sistema en XML DGII.

Para e-CF 31, respetar la estructura del XSD:

- Raíz: <ECF>.
- <Encabezado>.
- <IdDoc>.
- <Emisor>.
- <Comprador>.
- <Totales>.
- <DetallesItems>.
- <Item>.
- <FechaHoraFirma>.

Campos mínimos que deben salir desde mi sistema:

- TipoeCF.
- eNCF.
- FechaVencimientoSecuencia.
- TipoIngresos.
- TipoPago.
- RNCEmisor.
- RazonSocialEmisor.
- DireccionEmisor.
- FechaEmision.
- RNCComprador.
- RazonSocialComprador.
- Totales:
  - Monto gravado.
  - Monto exento.
  - ITBIS.
  - Monto total.
- Items:
  - Número de línea.
  - Nombre del servicio/producto.
  - Indicador bien/servicio.
  - Cantidad.
  - Precio unitario.
  - Monto item.
  - Indicador de facturación.
- FechaHoraFirma.

Reglas importantes:

- Mantener el orden exacto de los tags según el XSD.
- Fechas en formato requerido por DGII.
- Decimales con punto, no coma.
- No usar separador de miles.
- Redondear correctamente a 2 decimales donde aplique.
- No incluir campos opcionales vacíos si el XSD no los permite.
- Validar el XML contra el XSD antes de firmar.
- No enviar a DGII un XML inválido.

------------------------------------------------------------
4. VALIDACIÓN XSD
------------------------------------------------------------

Crear un servicio:

DgiiXmlValidator

Este servicio debe:

- Cargar el XSD correspondiente al tipo de comprobante.
- Validar el XML generado.
- Devolver errores claros:
  - Campo.
  - Línea.
  - Descripción.
- Bloquear el envío a DGII si el XML no es válido.
- Guardar log técnico de validación.

------------------------------------------------------------
5. FIRMA DIGITAL XML
------------------------------------------------------------

Crear un servicio:

DgiiXmlSigner

Este servicio debe firmar XML usando el certificado digital del contribuyente.

La firma debe ser XMLDSig enveloped signature.

Requisitos sugeridos:

- SignatureMethod: RSA-SHA256.
- DigestMethod: SHA256.
- Reference URI vacío.
- Incluir KeyInfo con certificado X509.
- Agregar la firma dentro del documento XML.

Reglas de seguridad:

- No firmar en frontend.
- No exponer el certificado.
- No exponer la contraseña del certificado.
- Manejar el certificado en backend o servicio seguro.
- Guardar logs de firma sin exponer datos sensibles.
- Validar que el certificado esté vigente antes de firmar.

------------------------------------------------------------
6. AUTENTICACIÓN DGII
------------------------------------------------------------

Crear un servicio:

DgiiAuthService

Flujo requerido:

1. Hacer GET al endpoint de semilla:

/api/autenticacion/semilla

2. DGII devuelve XML semilla.

3. Firmar la semilla con el certificado digital.

4. Enviar la semilla firmada por POST a:

/api/autenticacion/validarsemilla

5. DGII devuelve:

- Token.
- Fecha/hora de expiración.
- Fecha/hora de expedición.

6. Guardar token en caché hasta antes de expirar.

7. Usar el token en los demás servicios con:

Authorization: Bearer {token}

Ambientes:

- Pre-certificación:
  https://ecf.dgii.gov.do/testecf/autenticacion

- Certificación:
  https://ecf.dgii.gov.do/certecf/autenticacion

- Producción:
  https://ecf.dgii.gov.do/ecf/autenticacion

------------------------------------------------------------
7. ENVÍO DE E-CF A DGII
------------------------------------------------------------

Crear un servicio:

DgiiReceptionService

Flujo:

- Recibir XML e-CF firmado.
- Enviarlo al endpoint de recepción DGII.
- Endpoint base:
  /recepcion/api/ecf
- Enviar como multipart/form-data si así lo indica la documentación técnica.
- Incluir token Bearer.
- Guardar respuesta:
  - TrackId.
  - Error.
  - Mensaje.
  - Fecha/hora de envío.
  - Usuario o proceso que envió.

La factura interna debe manejar estados como:

- Generada.
- Validada.
- Firmada.
- Enviada.
- En proceso.
- Aceptada.
- Aceptada condicional.
- Rechazada.
- Error técnico.

------------------------------------------------------------
8. CONSULTA DE RESULTADO DGII
------------------------------------------------------------

Crear un servicio:

DgiiStatusService

Flujo:

- Consultar estado usando TrackId:

/consultaresultado/api/consultas/estado?trackid={trackid}

Guardar:

- Código.
- Estado.
- Mensajes.
- Fecha recepción.
- Secuencia utilizada.
- Respuesta completa DGII.
- Fecha/hora de consulta.

Reglas:

- Si está “En Proceso”, reintentar con una cola/job programado.
- Si está “Aceptado”, permitir entregar al cliente la representación impresa/PDF.
- Si está “Rechazado”, bloquear entrega fiscal y mostrar errores para corregir.
- Si hay error técnico, permitir reintento controlado sin duplicar eNCF indebidamente.

------------------------------------------------------------
9. FACTURA DE CONSUMO MENOR A RD$250,000
------------------------------------------------------------

Implementar lógica especial para e-CF 32.

Si es e-CF 32 y el monto es menor a RD$250,000:

- Revisar en la documentación DGII si aplica envío por RFCE.
- Conservar XML completo firmado para auditoría.
- Generar la representación impresa.
- Guardar el comprobante en el sistema.
- Enviar resumen RFCE cuando corresponda.
- No asumir comportamiento sin validarlo contra documentación oficial.

------------------------------------------------------------
10. REPRESENTACIÓN IMPRESA Y QR
------------------------------------------------------------

Crear generación de PDF o representación impresa para el cliente.

Debe incluir:

- Datos del emisor.
- Datos del comprador, cuando aplique.
- e-NCF.
- Fecha de emisión.
- Detalle de servicios/productos.
- ITBIS.
- Descuentos.
- Monto total.
- Estado DGII.
- Código de seguridad.
- QR de consulta DGII.

El código de seguridad debe obtenerse según la documentación DGII, usualmente a partir de la firma/hash. Validar la regla exacta contra la documentación oficial.

------------------------------------------------------------
11. BASE DE DATOS PARA FACTURACIÓN ELECTRÓNICA
------------------------------------------------------------

Proponer migraciones/tablas para:

- dgii_settings
- dgii_certificates
- dgii_sequences
- electronic_invoices
- electronic_invoice_items
- dgii_submissions
- dgii_status_logs
- dgii_received_ecf
- dgii_commercial_approvals

Guardar por cada e-CF:

- Factura interna relacionada.
- Tipo e-CF.
- eNCF.
- XML generado.
- XML validado.
- XML firmado.
- TrackId.
- Estado DGII.
- Mensajes DGII.
- Fecha de generación.
- Fecha de firma.
- Fecha de envío.
- Fecha de aceptación/rechazo.
- Hash/código de seguridad.
- PDF/representación impresa generada.
- Usuario que generó.
- Usuario que envió.
- Ambiente usado.
- Secuencia utilizada.

------------------------------------------------------------
12. SEGURIDAD
------------------------------------------------------------

Requisitos:

- Certificado y contraseña nunca deben guardarse en texto plano.
- Usar variables de entorno o secret manager.
- Auditar quién genera, firma, envía o anula comprobantes.
- No permitir reutilizar eNCF salvo que DGII indique que la secuencia puede reutilizarse.
- Implementar control de concurrencia para evitar duplicar secuencias.
- Guardar todos los XML enviados y recibidos.
- Registrar errores sin exponer datos sensibles.
- Proteger endpoints internos con roles y permisos.
- No permitir emisión manual sin control de auditoría.

------------------------------------------------------------
13. CERTIFICACIÓN DGII
------------------------------------------------------------

El sistema debe ayudar a pasar el proceso de certificación DGII:

- Generar XML con los datos del set de pruebas de DGII.
- Enviar a ambiente de certificación.
- Consultar resultados.
- Generar representación impresa en PDF.
- Exponer/crear endpoints de recepción y aprobación comercial si DGII los requiere.
- Preparar URLs de producción para registrar en DGII.
- Guardar evidencias de pruebas.
- Generar reporte de comprobantes enviados en certificación.

------------------------------------------------------------
14. ENDPOINTS INTERNOS SUGERIDOS
------------------------------------------------------------

Crear endpoints internos como:

- POST /dgii/invoices/{id}/generate-xml
- POST /dgii/invoices/{id}/validate-xml
- POST /dgii/invoices/{id}/sign
- POST /dgii/invoices/{id}/send
- GET /dgii/invoices/{id}/status
- POST /dgii/invoices/{id}/refresh-status
- GET /dgii/invoices/{id}/pdf
- POST /dgii/auth/refresh-token
- POST /dgii/sequences/import
- GET /dgii/settings

------------------------------------------------------------
15. REGLA DE VENTAS SEGÚN FORMA DE PAGO
------------------------------------------------------------

Necesito que el sistema maneje la emisión del e-NCF según la forma de pago y el cierre de caja.

------------------------------------------------------------
15.1 VENTAS EN EFECTIVO Y TRANSFERENCIA
------------------------------------------------------------

Cuando una venta sea pagada en:

- Efectivo.
- Transferencia bancaria.

El sistema NO debe generar el e-NCF inmediatamente, salvo que la configuración o normativa obligue a hacerlo.

En estos casos, la venta debe quedar primero como:

- Proforma.
- Pendiente de facturación electrónica.
- Pendiente de cierre de caja.

La proforma debe contener todos los datos de la venta:

- Cliente.
- Servicios/productos.
- Ítems.
- Impuestos.
- Descuentos.
- Total.
- Forma de pago.
- Usuario.
- Caja/turno.
- Fecha/hora.

Importante:

- La proforma no debe consumir secuencia e-NCF todavía.
- La proforma no sustituye un comprobante fiscal si legalmente corresponde emitirlo.
- El sistema debe mostrar advertencia de cumplimiento fiscal.
- Esta lógica debe quedar validada con contador y normativa DGII.

------------------------------------------------------------
15.2 VENTAS CON TARJETA DE CRÉDITO O DÉBITO
------------------------------------------------------------

Cuando una venta sea pagada con:

- Tarjeta de crédito.
- Tarjeta de débito.
- Link de pago.
- POS bancario.

El sistema SÍ debe generar el e-NCF de inmediato.

Flujo:

- Crear la venta.
- Reservar/consumir la secuencia e-NCF.
- Generar XML e-CF.
- Validar contra XSD.
- Firmar XML.
- Enviar a DGII.
- Guardar TrackId.
- Consultar estado.
- Generar representación impresa/PDF con QR.

Estas ventas no deben esperar al cierre de caja para generar e-NCF.

------------------------------------------------------------
16. MÓDULO DE CIERRE DE CAJA
------------------------------------------------------------

Crear un módulo de cierre de caja.

Al cerrar caja, el sistema debe revisar todas las proformas pendientes del turno/caja que fueron pagadas en efectivo o transferencia.

En el cierre de caja debe mostrarse:

- Total vendido en efectivo.
- Total vendido por transferencia.
- Total vendido por tarjeta.
- Total general.
- Cantidad de proformas pendientes.
- Monto total de proformas pendientes.
- Porcentaje a convertir en e-CF.
- Monto objetivo a convertir en e-CF.
- Monto real seleccionado para convertir en e-CF.
- Cantidad de proformas seleccionadas.
- Cantidad de proformas que quedarán pendientes, si aplica.
- Usuario que realiza el cierre.
- Fecha y hora del cierre.
- Caja o turno relacionado.

------------------------------------------------------------
17. REGLA DEL PORCENTAJE EN CIERRE DE CAJA
------------------------------------------------------------

La regla del 10% no debe quedar fija.

Necesito que el sistema tenga una pantalla/consulta en el cierre de caja donde el usuario autorizado pueda indicar qué porcentaje de las ventas en proforma se convertirá en e-NCF/e-CF al momento del cierre.

Ejemplos:

- 10%.
- 20%.
- 50%.
- 100%.

El porcentaje debe ser digitado por el usuario autorizado durante el cierre o venir por defecto desde configuración.

------------------------------------------------------------
17.1 FLUJO REQUERIDO PARA EL PORCENTAJE
------------------------------------------------------------

Al entrar al cierre de caja, el sistema debe mostrar:

- Total de ventas en efectivo en proforma.
- Total de ventas por transferencia en proforma.
- Total general de proformas pendientes.
- Cantidad de proformas pendientes.
- Campo editable: % a facturar electrónicamente.
- Monto estimado que se convertirá a e-CF según el porcentaje digitado.
- Cantidad estimada de proformas que se convertirán.
- Listado de proformas seleccionadas automáticamente.
- Opción para selección manual, si el usuario tiene permiso.

El sistema debe calcular automáticamente:

monto_a_facturar = total_proformas_pendientes * porcentaje_digitado / 100

Luego debe seleccionar las proformas que se convertirán en e-CF hasta cubrir aproximadamente ese monto.

------------------------------------------------------------
17.2 SELECCIÓN DE PROFORMAS A CONVERTIR EN E-CF
------------------------------------------------------------

Claude debe proponer una lógica clara para seleccionar cuáles proformas se convertirán en e-CF durante el cierre.

Opciones sugeridas:

- Primero las ventas más antiguas.
- Primero las ventas de mayor monto.
- Selección manual por usuario administrador.
- Selección automática hasta completar el porcentaje indicado.

Preferencia inicial:

- Usar selección automática por ventas más antiguas.
- Permitir selección manual por administrador antes de confirmar el cierre.
- Mostrar diferencia entre monto objetivo y monto realmente seleccionado.

Ejemplo:

Si hay RD$100,000 en proformas y el usuario indica 10%:

- Monto objetivo: RD$10,000.
- El sistema selecciona proformas antiguas hasta acercarse a RD$10,000.
- Si la selección real termina en RD$10,350, debe mostrar la diferencia.
- El usuario debe confirmar antes de generar los e-CF.

------------------------------------------------------------
17.3 VALIDACIONES DEL PORCENTAJE
------------------------------------------------------------

Reglas:

- El porcentaje no puede ser menor que 0.
- El porcentaje no puede ser mayor que 100.
- Si el porcentaje es 0, no se genera ningún e-NCF en ese cierre, pero debe quedar auditado.
- Si el porcentaje es 100, todas las proformas pendientes del cierre se convierten en e-CF.
- El usuario debe confirmar antes de generar los e-NCF.
- Solo usuarios autorizados pueden cambiar el porcentaje.
- Si el porcentaje es menor a 100%, el sistema puede requerir comentario o autorización administrativa.
- El sistema debe mostrar advertencia de cumplimiento fiscal.
- El sistema no debe permitir usar esta herramienta para evadir obligaciones fiscales.

------------------------------------------------------------
17.4 CONFIGURACIÓN DEL PORCENTAJE
------------------------------------------------------------

Crear configuración general:

- default_cash_closing_ecf_percentage
- allow_user_change_closing_percentage
- minimum_closing_ecf_percentage
- maximum_closing_ecf_percentage
- require_admin_authorization_below_100_percent
- auto_generate_ecf_on_cash_closing
- applies_to_payment_methods = ["cash", "bank_transfer"]

Esta configuración debe estar en una pantalla administrativa.

------------------------------------------------------------
17.5 AUDITORÍA DEL PORCENTAJE
------------------------------------------------------------

Guardar en base de datos:

- Porcentaje digitado.
- Usuario que digitó el porcentaje.
- Fecha y hora.
- Total de proformas disponibles.
- Monto objetivo calculado.
- Monto real convertido a e-CF.
- Cantidad de proformas convertidas.
- Proformas que quedaron pendientes.
- Motivo o comentario, si el porcentaje es menor a 100%.
- Usuario que autorizó, si aplica.
- Caja/turno relacionado.
- Estado del cierre.

------------------------------------------------------------
18. ESTADOS NUEVOS PARA VENTAS Y PROFORMAS
------------------------------------------------------------

Agregar estados como:

- proforma
- pending_cash_closing
- selected_for_ecf
- ecf_generation_pending
- ecf_generated
- ecf_validated
- ecf_signed
- ecf_sent
- ecf_in_process
- ecf_accepted
- ecf_conditionally_accepted
- ecf_rejected
- closed_without_ecf, solo si legalmente aplica y queda autorizado por configuración/administrador.
- cancelled
- voided

------------------------------------------------------------
19. CIERRE DE CAJA NO REVERSIBLE SIN AUDITORÍA
------------------------------------------------------------

Una vez cerrado el turno/caja:

- No permitir editar montos de ventas incluidas.
- No permitir cambiar forma de pago sin permiso de administrador.
- No permitir eliminar proformas incluidas.
- Guardar log de auditoría.
- Guardar quién cerró caja.
- Guardar qué proformas fueron convertidas a e-CF.
- Guardar qué proformas quedaron sin e-CF.
- Guardar motivo o regla aplicada.
- Guardar porcentaje usado.
- Guardar fecha y hora exacta.

Si se necesita reversar un cierre, debe existir un proceso especial:

- Solicitud de reverso.
- Motivo obligatorio.
- Usuario solicitante.
- Usuario administrador que aprueba.
- Log completo.
- No borrar historial anterior.

------------------------------------------------------------
20. BASE DE DATOS ADICIONAL PARA CAJA Y PROFORMAS
------------------------------------------------------------

Proponer tablas o campos para:

- cash_registers
- cash_register_sessions
- cash_closings
- cash_closing_sales
- payment_methods
- proformas
- proforma_items
- proforma_to_ecf_logs
- cash_closing_percentage_logs

Campos mínimos para cierre:

- ID de caja.
- ID de sesión/turno.
- Usuario de apertura.
- Usuario de cierre.
- Fecha apertura.
- Fecha cierre.
- Total efectivo.
- Total transferencia.
- Total tarjeta.
- Total general.
- Total proformas.
- Porcentaje aplicado para generación e-CF.
- Monto objetivo a convertir a e-CF.
- Monto real convertido a e-CF.
- Cantidad convertida a e-CF.
- Cantidad pendiente.
- Estado del cierre.
- Comentario o motivo.
- Auditoría de cambios.

------------------------------------------------------------
21. VALIDACIONES ANTES DE CERRAR CAJA
------------------------------------------------------------

Antes de cerrar caja:

- No debe haber ventas con pagos incompletos.
- No debe haber ventas sin forma de pago.
- Las ventas con tarjeta deben tener e-CF generado o error visible.
- Las ventas en efectivo/transferencia deben estar como proforma pendiente.
- El sistema debe mostrar un resumen antes de confirmar.
- El usuario debe indicar o confirmar el porcentaje a convertir en e-CF.
- Si el porcentaje es menor al mínimo configurado, debe bloquearse o requerir autorización.
- Si hay error DGII en comprobantes seleccionados, el cierre debe mostrarlo claramente.
- No se deben consumir secuencias e-NCF hasta confirmar el cierre.
- Una vez confirmado, debe bloquearse la edición de las ventas incluidas.

------------------------------------------------------------
22. FLUJO COMPLETO DE VENTA
------------------------------------------------------------

Flujo esperado:

A. Venta en efectivo:

1. Usuario registra venta.
2. Sistema identifica forma de pago: efectivo.
3. Sistema crea proforma.
4. No consume e-NCF inmediatamente.
5. Queda pendiente de cierre de caja.
6. En cierre, puede ser seleccionada para generar e-CF según porcentaje digitado.
7. Si se selecciona:
   - Consume e-NCF.
   - Genera XML.
   - Valida XSD.
   - Firma.
   - Envía a DGII.
   - Guarda TrackId.
   - Genera PDF/QR.
8. Si no se selecciona:
   - Queda pendiente o cerrada según reglas configuradas y cumplimiento legal.
   - Debe quedar auditado.

B. Venta por transferencia:

1. Usuario registra venta.
2. Sistema identifica forma de pago: transferencia.
3. Sistema crea proforma.
4. No consume e-NCF inmediatamente.
5. Queda pendiente de cierre de caja.
6. En cierre, se maneja igual que efectivo.

C. Venta con tarjeta:

1. Usuario registra venta.
2. Sistema identifica forma de pago: tarjeta.
3. Sistema consume e-NCF inmediatamente.
4. Genera XML.
5. Valida XSD.
6. Firma XML.
7. Envía a DGII.
8. Consulta estado.
9. Genera representación impresa/PDF.
10. Queda registrada en cierre de caja como venta con tarjeta ya fiscalizada.

------------------------------------------------------------
23. REPORTES
------------------------------------------------------------

Crear reportes para:

- Ventas por forma de pago.
- Proformas pendientes.
- Proformas convertidas a e-CF.
- Proformas no convertidas a e-CF.
- Ventas con tarjeta facturadas inmediatamente.
- Cierres de caja.
- Porcentajes usados en cada cierre.
- Comprobantes enviados a DGII.
- Comprobantes aceptados.
- Comprobantes rechazados.
- Secuencias usadas.
- Secuencias disponibles.
- Errores DGII.
- Auditoría de cambios.

------------------------------------------------------------
24. ROLES Y PERMISOS
------------------------------------------------------------

Crear permisos para:

- Configurar DGII.
- Subir certificado digital.
- Importar secuencias.
- Generar XML.
- Validar XML.
- Firmar XML.
- Enviar a DGII.
- Consultar estado DGII.
- Abrir caja.
- Cerrar caja.
- Cambiar porcentaje de cierre.
- Autorizar porcentaje menor a 100%.
- Reversar cierre.
- Ver reportes fiscales.
- Ver logs técnicos.
- Descargar XML.
- Descargar PDF.

------------------------------------------------------------
25. RESULTADO ESPERADO DE LA INTEGRACIÓN
------------------------------------------------------------

Necesito que implementes esta lógica dentro del flujo de facturación electrónica DGII:

- Efectivo/transferencia → crear proforma.
- Tarjeta → generar e-NCF inmediatamente.
- Cierre de caja → mostrar consulta de proformas pendientes.
- Usuario autorizado → digita el porcentaje que se convertirá en e-CF.
- Sistema → calcula monto objetivo.
- Sistema → selecciona proformas automáticamente.
- Administrador → puede ajustar selección si tiene permiso.
- Usuario → confirma cierre.
- Sistema → genera los e-CF correspondientes.
- Sistema → valida XSD.
- Sistema → firma XML.
- Sistema → envía a DGII.
- Sistema → guarda TrackId y estado.
- Sistema → genera PDF/QR.
- Todo con auditoría, control de secuencias, validación DGII y reportes claros.

------------------------------------------------------------
26. PLAN DE IMPLEMENTACIÓN POR FASES
------------------------------------------------------------

Primero revisa el código actual y dime:

- Qué tablas existentes se pueden reutilizar.
- Qué campos faltan en factura, cliente, empresa e ítems.
- Qué módulos hay que crear.
- Qué librerías recomiendas según el lenguaje/framework del sistema.
- Qué riesgos ves.
- Qué dudas deben validarse contra documentación DGII.
- Qué partes deben validarse con contador.
- Plan de implementación por fases.

Luego implementa por fases:

Fase 1:
Modelo de datos y configuración DGII.

Fase 2:
Módulo de clientes, RNC, formas de pago, impuestos y secuencias.

Fase 3:
Generación XML e-CF 31.

Fase 4:
Validación XSD.

Fase 5:
Firma XML.

Fase 6:
Autenticación DGII.

Fase 7:
Envío y consulta TrackId.

Fase 8:
Representación impresa con QR.

Fase 9:
Manejo de ventas por forma de pago:
- Efectivo.
- Transferencia.
- Tarjeta.

Fase 10:
Módulo de proformas.

Fase 11:
Módulo de cierre de caja.

Fase 12:
Pantalla para indicar porcentaje de proformas a convertir en e-CF.

Fase 13:
Auditoría, permisos y reportes.

Fase 14:
Implementación e-CF 32, 33 y 34.

Fase 15:
Pruebas de certificación DGII.

------------------------------------------------------------
27. INSTRUCCIÓN FINAL PARA CLAUDE
------------------------------------------------------------

No inventes campos ni endpoints.

Cuando haya dudas:

- Deja constantes/configuraciones editables.
- Marca la duda para revisarla contra la documentación oficial de DGII.
- No asumas reglas fiscales.
- No implementes nada que pueda causar incumplimiento fiscal.
- Señala claramente qué debe validar el contador.
- Señala claramente qué debe validar la documentación técnica DGII.

Necesito que la solución sea segura, auditable, escalable y lista para certificación DGII.

------------------------------------------------------------
28. PRE-CERTIFICACIÓN DGII REALIZADA POR NOSOTROS MISMOS
------------------------------------------------------------

Necesito que el sistema quede preparado para que podamos hacer la pre-certificación y certificación DGII nosotros mismos, sin depender obligatoriamente de un proveedor externo.

El software puede ser propio, siempre que cumpla con los requisitos técnicos de DGII.

El sistema debe ayudarme a completar el proceso de pre-certificación de la siguiente manera:

------------------------------------------------------------
28.1 VALIDAR REQUISITOS INICIALES
------------------------------------------------------------

Antes de iniciar pruebas, el sistema debe verificar que estén configurados:

- RNC del emisor.
- Razón social.
- Dirección fiscal.
- Certificado digital válido.
- Contraseña del certificado.
- Ambiente DGII configurado en testecf o certecf.
- Secuencias e-NCF de prueba.
- Tipos de comprobantes habilitados.
- Impuestos y totales correctamente calculados.
- Datos del comprador cuando apliquen.
- URLs de servicios DGII.
- Usuario/clave o accesos necesarios del portal DGII, cuando apliquen.

------------------------------------------------------------
28.2 AMBIENTE DE PRE-CERTIFICACIÓN
------------------------------------------------------------

El sistema debe permitir trabajar en ambiente de pre-certificación DGII sin afectar producción.

Debe existir configuración separada para:

- Pre-certificación / pruebas: testecf.
- Certificación: certecf.
- Producción: ecf.

El sistema debe mostrar claramente en qué ambiente se está trabajando para evitar errores.

------------------------------------------------------------
28.3 SET DE PRUEBAS DGII
------------------------------------------------------------

Crear un módulo o pantalla para ejecutar el set de pruebas DGII.

El sistema debe permitir:

- Crear comprobantes de prueba.
- Generar XML de prueba.
- Validar XML contra XSD.
- Firmar XML con certificado digital.
- Enviar XML a DGII.
- Consultar estado por TrackId.
- Guardar respuesta de DGII.
- Mostrar si el comprobante fue aceptado o rechazado.
- Mostrar errores técnicos o fiscales.
- Descargar XML generado.
- Descargar XML firmado.
- Descargar representación impresa/PDF.

------------------------------------------------------------
28.4 TIPOS DE COMPROBANTES PARA PRUEBAS
------------------------------------------------------------

El sistema debe permitir probar al menos:

- e-CF 31: Factura de Crédito Fiscal Electrónica.
- e-CF 32: Factura de Consumo Electrónica.
- e-CF 33: Nota de Débito Electrónica.
- e-CF 34: Nota de Crédito Electrónica.

Y quedar preparado para:

- e-CF 41.
- e-CF 43.
- e-CF 44.
- e-CF 45.
- e-CF 46.
- e-CF 47.

------------------------------------------------------------
28.5 ORDEN DE IMPLEMENTACIÓN RECOMENDADO
------------------------------------------------------------

Implementar primero:

- e-CF 31 completo.
- Validación XSD.
- Firma XML.
- Autenticación con semilla.
- Envío a DGII.
- Consulta TrackId.
- Representación impresa con QR.

Luego implementar:

- e-CF 33.
- e-CF 34.
- e-CF 32.
- RFCE para factura de consumo menor al monto requerido por DGII, cuando aplique.

------------------------------------------------------------
28.6 EVIDENCIAS PARA CERTIFICACIÓN
------------------------------------------------------------

El sistema debe guardar evidencias de cada prueba:

- Tipo de comprobante.
- e-NCF usado.
- Fecha/hora de generación.
- XML generado.
- XML firmado.
- TrackId.
- Estado DGII.
- Respuesta completa DGII.
- PDF/representación impresa.
- Usuario que ejecutó la prueba.
- Ambiente utilizado.

------------------------------------------------------------
28.7 PANEL DE AVANCE DE CERTIFICACIÓN
------------------------------------------------------------

Crear una pantalla que muestre el avance de pruebas:

- Comprobantes pendientes.
- Comprobantes enviados.
- Comprobantes aceptados.
- Comprobantes rechazados.
- Errores pendientes de corregir.
- Tipos e-CF ya probados.
- Tipos e-CF pendientes.
- Último TrackId recibido.
- Estado general del proceso.

------------------------------------------------------------
28.8 MANEJO DE ERRORES EN PRE-CERTIFICACIÓN
------------------------------------------------------------

Cuando DGII rechace un comprobante, el sistema debe mostrar:

- Código de error.
- Mensaje DGII.
- XML relacionado.
- Campo o sección afectada, si se puede identificar.
- Recomendación técnica.
- Botón para corregir y volver a intentar.

No se debe consumir una secuencia real de producción durante pruebas.

------------------------------------------------------------
28.9 PASO A PRODUCCIÓN
------------------------------------------------------------

El sistema no debe permitir cambiar a producción hasta que:

- El ambiente de certificación haya sido probado.
- El certificado digital esté configurado.
- Las secuencias reales estén cargadas.
- Las URLs de producción estén confirmadas.
- El usuario administrador autorice el cambio.
- Quede auditoría del cambio de ambiente.

------------------------------------------------------------
28.10 RESULTADO ESPERADO DE PRE-CERTIFICACIÓN
------------------------------------------------------------

El objetivo es que podamos realizar internamente el proceso de pre-certificación DGII:

- Generar comprobantes de prueba.
- Validarlos.
- Firmarlos.
- Enviarlos.
- Consultar resultados.
- Corregir errores.
- Guardar evidencias.
- Preparar el sistema para certificación y producción.

Claude debe implementar este flujo de forma ordenada, sin inventar reglas y validando siempre contra la documentación oficial DGII.

------------------------------------------------------------
FIN DEL DOCUMENTO
------------------------------------------------------------
