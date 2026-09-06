# Matrices de campos por tipo — derivadas de los XSD OFICIALES (v351-v353 prep)

> Fuente: análisis literal de `e-CF-{41,43,44,45}-v1.0.xsd` (SHA256 en SOURCE.md)
> contra el baseline `e-CF-31-v1.0.xsd`. 2026-07-10. **Esto es el contrato para los
> builders 41-45 — no inventar nada fuera de esto.** (46/47 agregados 2026-07-10 tarde.)

Transversal (los 4 XSD analizados): `TipoeCFType` NO restringe al tipo propio
(enumera 31-47 en todos) → la coherencia eNCF↔tipo la impone el builder (ya lo hace).
`IndicadorFacturacionType` = 0,1,2,3,4 en todos.

## TIPO 41 — Compras (rasgo distintivo: RETENCIÓN por ítem obligatoria)

- ROOT: Encabezado(1), DetallesItems(1), Subtotales(0), DescuentosORecargos(0),
  Paginacion(0), InformacionReferencia(0), FechaHoraFirma(1), xs:any(1).
- Encabezado: Version, IdDoc, Emisor, Comprador, Totales, OtraMoneda(0).
  **SIN** InformacionesAdicionales ni Transporte.
- IdDoc (orden·min): TipoeCF·1, eNCF·1, FechaVencimientoSecuencia·1,
  IndicadorMontoGravado·0, TipoPago·0 (¡opcional!, en 31 es 1), FechaLimitePago·0,
  TerminoPago·0, TablaFormasPago·0, TipoCuentaPago·0, NumeroCuentaPago·0,
  BancoPago·0, TotalPaginas·0. **SIN TipoIngresos** (en 31 obligatorio), sin
  IndicadorEnvioDiferido/ServicioTodoIncluido/FechaDesde/FechaHasta.
- Emisor: como 31 pero **sin** CodigoVendedor/ZonaVenta/RutaVenta.
- Comprador (min 1): RNCComprador·1, RazonSocialComprador·1, ContactoComprador·0,
  CorreoComprador·0, DireccionComprador·0, MunicipioComprador·0, ProvinciaComprador·0,
  CodigoInternoComprador·0, ResponsablePago·0, InformacionAdicionalComprador·0.
  Sin campos de entrega/orden de compra. Sin IdentificadorExtranjero.
- Totales (orden·min): MontoGravadoTotal·0, MontoGravadoI1/I2/I3·0, MontoExento·0,
  ITBIS1/2/3·0, TotalITBIS·0, TotalITBIS1/2/3·0, **MontoTotal·1**, MontoPeriodo·0,
  SaldoAnterior·0, MontoAvancePago·0, ValorPagar·0, **TotalITBISRetenido·0,
  TotalISRRetencion·0, TotalITBISPercepcion·0, TotalISRPercepcion·0**.
  **SIN** MontoImpuestoAdicional/ImpuestosAdicionales/MontoNoFacturable.
- Item (orden·min): NumeroLinea·1, TablaCodigosItem·0, IndicadorFacturacion·1,
  **Retencion·1 → IndicadorAgenteRetencionoPercepcion·1, MontoITBISRetenido·0,
  MontoISRRetenido·0** (bloque OBLIGATORIO — clave del 41), NombreItem·1,
  IndicadorBienoServicio·1, DescripcionItem·0, CantidadItem·1, UnidadMedida·0,
  FechaElaboracion·0, FechaVencimientoItem·0, PrecioUnitarioItem·1, DescuentoMonto·0,
  TablaSubDescuento·0, RecargoMonto·0, TablaSubRecargo·0, OtraMonedaDetalle·0,
  MontoItem·1. Sin CantidadReferencia/TablaSubcantidad/GradosAlcohol/
  PrecioUnitarioReferencia/TablaImpuestoAdicional.

## TIPO 43 — Gastos Menores (minimalista, sin ITBIS, SIN Comprador)

- ROOT: Encabezado(1), DetallesItems(1), Subtotales(0), Paginacion(0),
  InformacionReferencia(0), FechaHoraFirma(1), xs:any(1). **SIN DescuentosORecargos.**
- Encabezado: Version, IdDoc, Emisor, **Totales** — **NO EXISTE Comprador**, sin
  InformacionesAdicionales/Transporte. OtraMoneda(0) reducida.
- IdDoc: TipoeCF·1, eNCF·1, FechaVencimientoSecuencia·1, TipoPago·0, TotalPaginas·0.
  Nada más.
- Emisor: igual al de 41 (sin CodigoVendedor/ZonaVenta/RutaVenta).
- Totales: **MontoExento·0, MontoTotal·1**, MontoPeriodo·0, SaldoAnterior·0,
  MontoAvancePago·0, ValorPagar·0. **SIN gravados/ITBIS/retenciones/percepciones.**
- Item: NumeroLinea·1, TablaCodigosItem·0, IndicadorFacturacion·1, NombreItem·1,
  IndicadorBienoServicio·1, DescripcionItem·0, CantidadItem·1, UnidadMedida·0,
  PrecioUnitarioItem·1, OtraMonedaDetalle·0, MontoItem·1.
  **SIN Retencion, SIN DescuentoMonto/RecargoMonto** ni tablas de sub-descuento.

## TIPO 44 — Regímenes Especiales (todo EXENTO)

- ROOT y Encabezado: **idénticos a 31 en bloques** (incl. InformacionesAdicionales(0)
  y Transporte(0)).
- IdDoc: igual a 31 (TipoIngresos·1, TipoPago·1, IndicadorEnvioDiferido·0, etc.)
  **excepto que NO existe IndicadorMontoGravado**.
- Emisor: idéntico a 31 (incluye CodigoVendedor/ZonaVenta/RutaVenta opcionales).
- Comprador: **RNCComprador·0 (OPCIONAL)** + **IdentificadorExtranjero·0 (NUEVO)**,
  **RazonSocialComprador·1**, resto igual a 31 (entrega/orden incluidos, opcionales).
- Totales (orden·min): MontoExento·0, MontoImpuestoAdicional·0, ImpuestosAdicionales·0
  (→ ImpuestoAdicional 1..20: TipoImpuesto·1, TasaImpuestoAdicional·1,
  **OtrosImpuestosAdicionales·1** — sin Selectivo Específico/Advalorem), **MontoTotal·1**,
  MontoNoFacturable·0, MontoPeriodo·0, SaldoAnterior·0, MontoAvancePago·0, ValorPagar·0.
  **SIN gravados/ITBIS/retenciones** — régimen 100% exento (IndicadorFacturacion=4).
- Item: como 31 pero **SIN Retencion NI CantidadReferencia/UnidadReferencia/
  TablaSubcantidad/GradosAlcohol/PrecioUnitarioReferencia** (el Item más reducido con
  descuentos/recargos aún permitidos).

## TIPO 45 — Gubernamental (casi 31, sin retenciones)

- ROOT/Encabezado/IdDoc/Emisor: **idénticos a 31** (IndicadorMontoGravado·0 presente).
- Comprador: idéntico a 31 — **RNCComprador·1 OBLIGATORIO** (receptor estatal), sin
  IdentificadorExtranjero.
- Totales: idéntico a 31 (gravados I1-I3, ITBIS completo opcional, ImpuestosAdicionales
  CON Selectivo Específico/Advalorem, MontoTotal·1) **excepto SIN los 4 campos de
  retención/percepción finales**.
- Item: idéntico a 31 **excepto SIN el bloque Retencion**.

## Implicaciones para el builder canónico (extensión mínima, sin reescribir 31-34)

| Regla | 41 | 43 | 44 | 45 |
|---|---|---|---|---|
| TipoIngresos en IdDoc | NO emitir | NO emitir | emitir (1) | emitir (1) |
| TipoPago en IdDoc | opcional | opcional | emitir (1) | emitir (1) |
| FechaVencimientoSecuencia | requerida | requerida | requerida | requerida |
| Bloque Comprador | requerido (RNC·1) | **omitir** | requerido (RazonSocial·1; RNC opc.) | requerido (RNC·1) |
| ITBIS permitido | sí (con retención) | **no** (todo exento/0) | **no** (todo exento) | sí |
| Retencion por ítem | **OBLIGATORIA** | no existe | no existe | no existe |
| Totales retención | permitidos | no existen | no existen | no existen |
| Descuento por ítem | permitido | **no existe** | permitido | permitido |
| eNCF prefijo | E41 | E43 | E44 | E45 |

## TIPO 46 — Exportaciones

- ROOT/Encabezado: como 31 (incl. InformacionesAdicionales(0) AMPLIADO con campos
  aduaneros y Transporte(0) ampliado — opcionales, no se emiten).
- IdDoc: TipoeCF·1, eNCF·1, FechaVencimientoSecuencia·1, IndicadorEnvioDiferido·0,
  **TipoIngresos·1, TipoPago·1** (como 31); SIN IndicadorMontoGravado/ServicioTodoIncluido.
- Emisor: idéntico a 31.
- Comprador (min 1): RNCComprador·0 (opcional), **IdentificadorExtranjero·0 (AlfNum20,
  tras RNC)**, **RazonSocialComprador·1**, …, **PaisComprador·0 (Alfa60, tras Provincia)**.
- Totales (orden·min): MontoGravadoTotal·0, **MontoGravadoI3·0, ITBIS3·0 (tasa Integer2),
  TotalITBIS·0, TotalITBIS3·0**, **MontoTotal·1**, MontoNoFacturable·0, MontoPeriodo·0,
  SaldoAnterior·0, MontoAvancePago·0, ValorPagar·0. **SIN MontoExento**, sin I1/I2,
  sin retenciones — exportación = GRAVADO TRAMO 3 (tasa 0%).
- Item: SIN Retencion; bloque Mineria·0 (nuevo, no se emite); DescuentoMonto·0 permitido;
  OtraMonedaDetalle·0. IndicadorFacturacion del ítem de exportación = **"3" (ITBIS3 0%)**.
- OtraMoneda·0: TipoMoneda, TipoCambio, MontoGravadoTotalOtraMoneda, MontoGravado3OtraMoneda,
  TotalITBISOtraMoneda, TotalITBIS3OtraMoneda, MontoTotalOtraMoneda (todos ·0).
- TipoMonedaType (17): BRL CAD CHF CHY XDR DKK EUR GBP JPY NOK SCP SEK USD VEF HTG MXN COP.

## TIPO 47 — Pagos al Exterior

- ROOT: **SIN InformacionesAdicionales NI DescuentosORecargos**; Comprador·**0** (opcional);
  Transporte·0 reducido a PaisDestino·0.
- IdDoc: TipoeCF·1, eNCF·1, FechaVencimientoSecuencia·1, **TipoPago·0**; **SIN TipoIngresos**
  ni indicadores.
- Emisor: como 41/43 (sin CodigoVendedor/ZonaVenta/RutaVenta).
- Comprador·0: SOLO **IdentificadorExtranjero·0 + RazonSocialComprador·0** — **NO existe
  RNCComprador** ni dirección/correo/país.
- Totales: MontoExento·0, **MontoTotal·1**, MontoPeriodo·0, SaldoAnterior·0,
  MontoAvancePago·0, ValorPagar·0, **TotalISRRetencion·0** (al final). Sin gravados/ITBIS.
- Item: **Retencion·1 OBLIGATORIA → IndicadorAgenteRetencionoPercepcion·1 +
  MontoISRRetenido·1 (ambos obligatorios; SIN MontoITBISRetenido)**; SIN DescuentoMonto
  ni recargos; OtraMonedaDetalle·0. Ítems exentos (IndicadorFacturacion "4").
- OtraMoneda·0 mínimo: TipoMoneda, TipoCambio, MontoExentoOtraMoneda, MontoTotalOtraMoneda.

## Reglas builder 46/47 (complemento de la tabla anterior)

| Regla | 46 | 47 |
|---|---|---|
| TipoIngresos/TipoPago | emitir (como 31) | NO TipoIngresos; TipoPago opcional |
| FechaVencimientoSecuencia | requerida | requerida |
| Comprador | requerido: RazonSocial·1; RNC o IdentificadorExtranjero opcionales; PaisComprador opcional | opcional: SOLO IdentificadorExtranjero+RazonSocial; RNC PROHIBIDO |
| ITBIS | tasa 0% tramo 3 (indicador "3"; Gravado I3) | no existe (exento "4") |
| Retencion ítem | no existe | OBLIGATORIA (indicador + MontoISRRetenido) |
| Totales retención | no existen | TotalISRRetencion al final |
| Descuento ítem | permitido | no existe |
