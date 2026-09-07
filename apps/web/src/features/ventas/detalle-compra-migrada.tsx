"use client";

import * as React from "react";
import { Modal, Table, THead, TBody, TR, TH, TD, Badge } from "@/components/ui";
import { formatCurrency, formatDate } from "@/lib/utils/format";
import { EtiquetaOrigen } from "./etiqueta-origen";
import type { VentaUnificada } from "./venta-unificada";

/**
 * Qué llevaba una compra migrada de Alegra.
 *
 * El histórico se veía por fuera —fecha, comprobante, total— pero no por
 * dentro: al hacer clic en una compra no había nada que abrir. Para atender a
 * un cliente que pregunta «¿qué me llevé la última vez?» hace falta el renglón,
 * no el total.
 *
 * 🔴 Solo lectura, y se dice. Alegra manda: estas facturas se ven, no se editan
 * ni se cobran desde aquí.
 */

interface Renglon {
  name: string;
  quantity: number;
  total: number;
}

export function DetalleCompraMigrada({
  venta,
  onClose,
}: {
  /** La compra a abrir, o `null` para tener el modal cerrado. */
  venta: VentaUnificada | null;
  onClose: () => void;
}) {
  const [estado, setEstado] = React.useState<
    { tipo: "cargando" } | { tipo: "listo"; items: Renglon[] } | { tipo: "error"; mensaje: string }
  >({ tipo: "cargando" });

  const ventaId = venta?.id ?? null;

  React.useEffect(() => {
    if (!ventaId) return;
    const ctrl = new AbortController();
    setEstado({ tipo: "cargando" });
    fetch(`/api/alegra/invoices/items?invoiceId=${encodeURIComponent(ventaId)}`, {
      signal: ctrl.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        const json: unknown = await res.json().catch((e: unknown) => {
          // Un aborto a mitad del cuerpo tiene que subir: tragárselo lo
          // convertiría en «esta factura no tenía nada», que es mentira.
          if (e instanceof DOMException && e.name === "AbortError") throw e;
          return null;
        });
        if (!res.ok) {
          const msg =
            json && typeof json === "object" && "error" in json && typeof json.error === "string"
              ? json.error
              : "No se pudo cargar el detalle de la factura.";
          throw new Error(msg);
        }
        const bruto = json && typeof json === "object" && "items" in json ? json.items : null;
        return (Array.isArray(bruto) ? bruto : []).map((x): Renglon => {
          const o = (x ?? {}) as Record<string, unknown>;
          return {
            name: typeof o.name === "string" && o.name ? o.name : "(sin nombre)",
            quantity: Number(o.quantity) || 0,
            total: Number(o.total) || 0,
          };
        });
      })
      .then((items) => {
        if (ctrl.signal.aborted) return;
        setEstado({ tipo: "listo", items });
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setEstado({
          tipo: "error",
          mensaje: e instanceof Error ? e.message : "No se pudo cargar el detalle de la factura.",
        });
      });
    return () => ctrl.abort();
  }, [ventaId]);

  if (!venta) return null;

  // 🔴 La suma de los renglones puede no dar el total de la cabecera: la
  // migración arrastró 42 céntimos en todo el histórico. Se enseñan los dos y se
  // dice cuál manda, en vez de esconder la diferencia.
  const sumaRenglones =
    estado.tipo === "listo"
      ? Math.round(estado.items.reduce((s, i) => s + i.total, 0) * 100) / 100
      : null;
  const descuadre =
    sumaRenglones !== null && Math.abs(sumaRenglones - venta.total) >= 0.01;

  return (
    <Modal open onClose={onClose} title={`Compra ${venta.numero}`}>
      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="opacity-70">{formatDate(venta.fecha)}</span>
        <EtiquetaOrigen origen={venta.origen} />
        <Badge tone="neutral">Solo lectura</Badge>
        <span className="ml-auto font-bold tabular-nums text-[color:var(--brand-accent)]">
          {formatCurrency(venta.total)}
        </span>
      </div>

      {estado.tipo === "cargando" && (
        <p className="py-8 text-center text-sm opacity-60">Cargando el detalle…</p>
      )}

      {estado.tipo === "error" && (
        <p className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {estado.mensaje}
        </p>
      )}

      {estado.tipo === "listo" && estado.items.length === 0 && (
        <p className="py-8 text-center text-sm opacity-60">
          Esta factura migrada no trae renglones. Su total sí está arriba.
        </p>
      )}

      {estado.tipo === "listo" && estado.items.length > 0 && (
        <>
          <Table>
            <THead>
              <TR>
                <TH>Producto</TH>
                <TH className="text-right">Cant.</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {estado.items.map((i, n) => (
                <TR key={`${i.name}-${n}`}>
                  <TD className="text-sm">{i.name}</TD>
                  <TD className="text-right tabular-nums">{i.quantity}</TD>
                  <TD className="text-right tabular-nums">{formatCurrency(i.total)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
          {descuadre && (
            <p className="mt-3 text-xs opacity-60">
              Los renglones suman {formatCurrency(sumaRenglones!)}. La diferencia con el total viene
              arrastrada de la migración de Alegra; manda el total de la factura.
            </p>
          )}
        </>
      )}

      <p className="mt-4 text-xs opacity-60">
        Factura migrada de Alegra: se puede ver e imprimir, no editar ni cobrar desde DermaLand. El
        pago se registraría aquí y no allá, y los dos sistemas dejarían de cuadrar.
      </p>
    </Modal>
  );
}
