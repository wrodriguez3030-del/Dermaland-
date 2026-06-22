"use client";

import * as React from "react";
import { Plus, MapPin } from "lucide-react";
import { Button } from "@/components/ui";
import { ProductImage } from "@/features/products/components/product-image";
import { formatCurrency, formatDate, daysUntil } from "@/lib/utils/format";

export interface ProductCardProps {
  name: string;
  sku: string;
  price: number;
  imageUrl?: string;
  imageAlt?: string;
  minStock?: number;
  /** Stock vendible en la sucursal actual. */
  stockHere: number;
  /** Hay stock en otra sucursal activa (y 0 aquí). */
  availableElsewhere: boolean;
  /** Etiqueta de bloqueo en esta sucursal (vencido/cuarentena/recall), si aplica. */
  blockLabel?: string | null;
  /** Lote FEFO a mostrar cuando hay stock aquí. */
  lotNumber?: string;
  lotExpiresAt?: string;
  /** Agregar al carrito (hay stock aquí). */
  onAdd: () => void;
  /** Ver stock por sucursal (stock en otra sucursal). */
  onViewBranchStock: () => void;
}

/**
 * Tarjeta de producto del POS. La tarjeta entera es clickable Y expone un botón
 * "Agregar" visible (ambos hacen lo mismo). Si hay stock aquí → Agregar; si hay
 * en otra sucursal → Ver stock; si no hay en ninguna → desactivado con razón.
 * Nunca muestra UUID/almacén.
 */
export function ProductCard({
  name,
  sku,
  price,
  imageUrl,
  imageAlt,
  minStock = 0,
  stockHere,
  availableElsewhere,
  blockLabel,
  lotNumber,
  lotExpiresAt,
  onAdd,
  onViewBranchStock,
}: ProductCardProps) {
  const inStockHere = stockHere > 0;
  const actionable = inStockHere || availableElsewhere;

  const act = () => {
    if (inStockHere) onAdd();
    else if (availableElsewhere) onViewBranchStock();
  };

  return (
    <div
      onClick={actionable ? act : undefined}
      className={`group relative flex flex-col overflow-hidden rounded-xl border border-black/5 bg-white text-left transition ${
        actionable
          ? "cursor-pointer hover:border-[color:var(--brand-primary)] hover:shadow-md"
          : "cursor-not-allowed opacity-60"
      }`}
    >
      <div className="relative aspect-square w-full overflow-hidden bg-gradient-to-br from-[color:var(--brand-bg)] to-white">
        <ProductImage
          src={imageUrl}
          alt={imageAlt ?? name}
          name={name}
          size={200}
          rounded="md"
          className="!h-full !w-full !rounded-none border-0 bg-transparent"
        />
        {/* Badge de stock en esta sucursal */}
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            !inStockHere
              ? availableElsewhere
                ? "bg-amber-500 text-black"
                : blockLabel
                  ? "bg-orange-500 text-black"
                  : "bg-rose-600 text-white"
              : stockHere <= minStock
                ? "bg-amber-500 text-black"
                : "bg-emerald-600 text-white"
          }`}
        >
          {inStockHere
            ? `${stockHere} unid. aquí`
            : availableElsewhere
              ? "Sin stock aquí"
              : blockLabel ?? "Agotado"}
        </span>
        {inStockHere && lotExpiresAt && daysUntil(lotExpiresAt) < 90 && (
          <span className="absolute right-2 top-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-black">
            FEFO
          </span>
        )}
        {!inStockHere && availableElsewhere && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <span className="rounded-md bg-amber-500 px-2 py-1 text-[10px] font-bold text-black">
              Ver stock por sucursal
            </span>
          </div>
        )}
        {!inStockHere && !availableElsewhere && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
            <span className="rounded-md bg-rose-600 px-3 py-1 text-xs font-bold text-white">
              {blockLabel ?? "Agotado"}
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        <div className="line-clamp-2 text-sm font-medium leading-tight">{name}</div>
        <div className="mt-1 font-mono text-[10px] opacity-50">{sku}</div>
        <div className="mt-auto pt-2 text-base font-semibold tabular-nums">
          {formatCurrency(price)}
        </div>
        {inStockHere && lotNumber && (
          <div className="text-[10px] opacity-60">
            Lote {lotNumber}
            {lotExpiresAt ? ` · vence ${formatDate(lotExpiresAt)}` : ""}
          </div>
        )}
        {!inStockHere && availableElsewhere && (
          <div className="text-[10px] text-amber-700">Disponible en otra sucursal</div>
        )}
        {!inStockHere && !availableElsewhere && blockLabel && (
          <div className="text-[10px] text-orange-700">{blockLabel}</div>
        )}
        {!inStockHere && !availableElsewhere && !blockLabel && (
          <div className="text-[10px] text-rose-600">Sin stock en ninguna sucursal.</div>
        )}
        <div className="mt-2">
          <Button
            type="button"
            size="sm"
            variant={availableElsewhere ? "outline" : "primary"}
            className="w-full justify-center"
            disabled={!actionable}
            onClick={(e) => {
              e.stopPropagation();
              act();
            }}
            aria-label={
              inStockHere
                ? `Agregar ${name} al carrito`
                : availableElsewhere
                  ? `Ver stock por sucursal de ${name}`
                  : `${name} sin stock`
            }
          >
            {inStockHere ? (
              <>
                <Plus className="h-3.5 w-3.5" /> Agregar
              </>
            ) : availableElsewhere ? (
              <>
                <MapPin className="h-3.5 w-3.5" /> Ver stock
              </>
            ) : (
              "Sin stock"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
