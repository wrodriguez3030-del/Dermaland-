/** Tipos de `vendedor-de-factura.mjs`. Ver ahí el porqué de cada regla. */
export declare function normalizarNombre(nombre: string | null | undefined): string;
export declare function resolverVendedor(
  sellerName: string | null | undefined,
  branchId: string | null,
  porNombre: Map<string, string>,
  porSucursal: Map<string, string>,
): string | null;
