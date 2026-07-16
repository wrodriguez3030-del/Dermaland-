export interface TransferDraftItem {
  lotId: string;
  productId: string;
  quantity: number;
}

export interface BuildTransferPayloadArgs {
  transferNumber: string;
  originBranchId: string;
  originWarehouseId: string;
  destinationBranchId: string;
  destinationWarehouseId: string;
  transferDate: string;
  notes?: string;
  createdByName?: string;
  items: TransferDraftItem[];
}

export interface TransferRpcHeader {
  transfer_number: string;
  origin_branch_id: string;
  origin_warehouse_id: string;
  destination_branch_id: string;
  destination_warehouse_id: string;
  transfer_date: string;
  notes: string | null;
  created_by_name: string | null;
}

export interface TransferRpcItem {
  lot_id: string;
  product_id: string;
  qty: number;
}

export interface TransferRpcPayload {
  header: TransferRpcHeader;
  items: TransferRpcItem[];
}

/**
 * Arma el payload (snake_case) para el RPC `transfer_stock_atomic` a partir del
 * input de UI. Descarta ítems sin lote/producto o con cantidad <= 0. Función pura.
 */
export function buildTransferPayload(args: BuildTransferPayloadArgs): TransferRpcPayload {
  const items: TransferRpcItem[] = args.items
    .filter((i) => i.lotId && i.productId && i.quantity > 0)
    .map((i) => ({
      lot_id: i.lotId,
      product_id: i.productId,
      qty: Math.round(i.quantity),
    }));
  const notes = args.notes?.trim();
  const createdByName = args.createdByName?.trim();
  return {
    header: {
      transfer_number: args.transferNumber,
      origin_branch_id: args.originBranchId,
      origin_warehouse_id: args.originWarehouseId,
      destination_branch_id: args.destinationBranchId,
      destination_warehouse_id: args.destinationWarehouseId,
      transfer_date: args.transferDate,
      notes: notes ? notes : null,
      created_by_name: createdByName ? createdByName : null,
    },
    items,
  };
}
