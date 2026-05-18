import "server-only";
import type { EcfBuilderInput } from "./types";

/**
 * Fixtures de pre-certificación DGII (mock).
 *
 * Inputs representativos para cada tipo e-CF cubierto (31/32/33/34). Se
 * usan en el panel de pre-certificación (`/dgii/certificacion`) para
 * ejecutar el pipeline completo (build → sign → PDF) contra datos
 * controlados.
 *
 * IMPORTANTE: estos fixtures son DEMO. NO sustituyen el set oficial de
 * pruebas DGII publicado por la administración tributaria — duda D-08 en
 * `docs/dgii/matriz-requisitos-dgii.md`. Cuando se autorice la
 * certificación real, los inputs deberán reemplazarse por los casos de
 * prueba oficiales DGII.
 */

const fixedDate = new Date(2026, 4, 17, 10, 0, 0);

const COMMON_EMISOR = {
  rncEmisor: "13259077503",
  razonSocialEmisor: "DermaLand SRL",
  nombreComercial: "DermaLand",
  direccionEmisor:
    "Calle E. León Jiménez No. 47, Esq. Mayagüez, Reparto del Este, Santiago",
  correoEmisor: "fiscal@dermaland.do",
  fechaEmision: fixedDate,
} as const;

function commonItem(
  precio: number,
  nombre: string,
): NonNullable<EcfBuilderInput["items"]>[number] {
  const cantidad = 1;
  const itbisRate = 18;
  return {
    numeroLinea: 1,
    indicadorFacturacion: 1,
    nombreItem: nombre,
    indicadorBienoServicio: 1,
    cantidadItem: cantidad,
    precioUnitarioItem: precio,
    montoItem: precio * cantidad,
  };
}

function totalsForGravado(monto: number): EcfBuilderInput["totales"] {
  const itbis = +(monto * 0.18).toFixed(2);
  return {
    montoGravadoTotal: monto,
    itbis1: 18,
    totalItbis: itbis,
    totalItbis1: itbis,
    montoTotal: +(monto + itbis).toFixed(2),
  };
}

const FIXTURE_31: EcfBuilderInput = {
  tipoEcf: "31",
  eNcf: "E310000099931",
  fechaVencimientoSecuencia: new Date(2027, 11, 31),
  tipoIngresos: "01",
  tipoPago: 2, // Crédito (Crédito Fiscal)
  emisor: { ...COMMON_EMISOR },
  comprador: {
    rncComprador: "131234567",
    razonSocialComprador: "Distrimedica SRL",
    correoComprador: "compras@distrimedica.do",
  },
  totales: totalsForGravado(5000),
  items: [commonItem(5000, "Set de prueba dermatológico (paquete corporativo)")],
  fechaHoraFirma: fixedDate,
};

const FIXTURE_32: EcfBuilderInput = {
  tipoEcf: "32",
  eNcf: "E320000099932",
  fechaVencimientoSecuencia: new Date(2027, 11, 31), // ignorado por XSD 32
  tipoIngresos: "01",
  tipoPago: 1, // Contado
  emisor: { ...COMMON_EMISOR },
  comprador: {
    razonSocialComprador: "Consumidor Final",
  },
  totales: totalsForGravado(1200),
  items: [commonItem(1200, "Crema hidratante 50ml")],
  fechaHoraFirma: fixedDate,
};

const FIXTURE_33: EcfBuilderInput = {
  tipoEcf: "33",
  eNcf: "E330000099933",
  fechaVencimientoSecuencia: new Date(2027, 11, 31),
  tipoIngresos: "01",
  tipoPago: 1,
  emisor: { ...COMMON_EMISOR },
  comprador: {
    rncComprador: "131234567",
    razonSocialComprador: "Distrimedica SRL",
  },
  totales: totalsForGravado(300),
  items: [commonItem(300, "Ajuste a factura por precio actualizado")],
  informacionReferencia: {
    ncfModificado: "E310000099931",
    rncOtroContribuyente: "131234567",
    fechaNCFModificado: fixedDate,
    codigoModificacion: 2, // Cambios al original
  },
  fechaHoraFirma: fixedDate,
};

const FIXTURE_34: EcfBuilderInput = {
  tipoEcf: "34",
  eNcf: "E340000099934",
  fechaVencimientoSecuencia: new Date(2027, 11, 31), // ignorado por XSD 34
  tipoIngresos: "01",
  tipoPago: 1,
  indicadorNotaCredito: 0, // <= 30 días del original
  emisor: { ...COMMON_EMISOR },
  comprador: {
    rncComprador: "131234567",
    razonSocialComprador: "Distrimedica SRL",
  },
  totales: totalsForGravado(5000),
  items: [commonItem(5000, "Devolución del paquete corporativo")],
  informacionReferencia: {
    ncfModificado: "E310000099931",
    rncOtroContribuyente: "131234567",
    fechaNCFModificado: fixedDate,
    codigoModificacion: 3, // Devolución de mercancías
  },
  fechaHoraFirma: fixedDate,
};

export const CERTIFICATION_FIXTURES: Record<
  "31" | "32" | "33" | "34",
  EcfBuilderInput
> = {
  "31": FIXTURE_31,
  "32": FIXTURE_32,
  "33": FIXTURE_33,
  "34": FIXTURE_34,
};

export function getCertificationFixture(
  tipo: "31" | "32" | "33" | "34",
): EcfBuilderInput {
  return CERTIFICATION_FIXTURES[tipo];
}
