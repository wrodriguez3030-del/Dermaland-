import type { CashRegisterSession } from "@/types";
import type { ShiftDetail } from "@/features/sales/cash-session-detail";
import { differenceLabel } from "@/features/sales/cash-count";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";

/**
 * Ticket 80mm del cierre de caja — para imprimir y archivar con el arqueo.
 *
 * Mismas reglas que `Receipt80mm`: 80mm fijos, monospace, monocromo. El CSS
 * global de impresión (`.receipt-80mm` en `globals.css`) oculta todo lo demás
 * al imprimir. Server-safe: sin hooks, el botón de imprimir vive aparte.
 */

function Separator() {
  return <div className="my-2 border-t border-dashed border-black/40" />;
}

function Fila({
  etiqueta,
  monto,
  bold,
}: {
  etiqueta: string;
  monto: number;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-2 ${bold ? "font-bold" : ""}`}
    >
      <span>{etiqueta}</span>
      <span className="tabular-nums">{formatCurrency(monto)}</span>
    </div>
  );
}

export function CashClosingTicket({
  session,
  detail,
}: {
  session: CashRegisterSession;
  detail: ShiftDetail;
}) {
  const counted = session.countedCash ?? detail.countedCash;
  const diff =
    counted != null ? counted - detail.expectedCash : null;

  return (
    <div
      className="receipt-80mm mx-auto bg-white p-3 text-black shadow-md"
      style={{
        width: "80mm",
        maxWidth: "80mm",
        fontFamily:
          'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Courier New", monospace',
        fontSize: 11,
        lineHeight: 1.35,
      }}
    >
      <div className="text-center">
        {mockBusiness.logoUrl ? (
          // El mismo logo del ticket de venta (Receipt80mm): la marca sale
          // del SVG público, que ya imprime bien en térmica monocromática.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={mockBusiness.logoUrl}
            alt={mockBusiness.commercialName}
            className="mx-auto mb-1 h-12 w-12 object-contain"
          />
        ) : null}
        <div className="text-[14px] font-bold leading-tight">
          {mockBusiness.commercialName.toUpperCase()}
        </div>
        <div className="text-[12px] font-bold">CIERRE DE CAJA</div>
        <div className="text-[10px]">
          Sesión {session.sessionNumber}
          {detail.branchName ? ` · ${detail.branchName}` : ""}
        </div>
      </div>

      <Separator />

      <div className="space-y-0.5">
        <div className="flex justify-between gap-2">
          <span>Cajero</span>
          <span className="text-right">{session.cashierName}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span>Apertura</span>
          <span>{formatDateTime(session.openedAt)}</span>
        </div>
        {session.closedAt ? (
          <div className="flex justify-between gap-2 font-bold">
            <span>Fecha del cierre</span>
            <span>{formatDateTime(session.closedAt)}</span>
          </div>
        ) : null}
        {session.closedAt ? (
          <div className="flex justify-between gap-2 font-bold">
            <span>Cerrada por</span>
            {/* Las sesiones cerradas antes de guardarse el nombre quedan con
                raya: no se inventa hacia atrás. */}
            <span className="text-right">{session.closedByName ?? "—"}</span>
          </div>
        ) : null}
      </div>

      <Separator />

      <div className="space-y-0.5">
        <div className="font-bold">VENTAS DEL TURNO</div>
        <Fila etiqueta="Efectivo" monto={detail.salesCash} />
        <Fila etiqueta="Tarjeta" monto={detail.salesCard} />
        <Fila etiqueta="Transferencia" monto={detail.salesTransfer} />
        {detail.salesOther > 0 ? (
          <Fila etiqueta="Otros" monto={detail.salesOther} />
        ) : null}
        <Fila etiqueta="Total ventas" monto={detail.totalSales} bold />
        {detail.webSalesCount > 0 ? (
          <div className="text-[10px]">
            De la tienda web: {detail.webSalesCount} venta
            {detail.webSalesCount === 1 ? "" : "s"} ·{" "}
            {formatCurrency(detail.webSalesTotal)} (incluidas arriba)
          </div>
        ) : null}
      </div>

      <Separator />

      <div className="space-y-0.5">
        <div className="font-bold">EFECTIVO</div>
        <Fila etiqueta="Apertura" monto={detail.openingAmount} />
        <Fila etiqueta="+ Ventas en efectivo" monto={detail.salesCash} />
        {detail.cashIncome > 0 ? (
          <Fila etiqueta="+ Entradas" monto={detail.cashIncome} />
        ) : null}
        {detail.cashWithdrawal > 0 ? (
          <Fila etiqueta="- Salidas" monto={detail.cashWithdrawal} />
        ) : null}
        {detail.refundsCash > 0 ? (
          <Fila etiqueta="- Devoluciones" monto={detail.refundsCash} />
        ) : null}
        <Fila etiqueta="Esperado" monto={detail.expectedCash} bold />
        {counted != null ? (
          <>
            <Fila etiqueta="Contado" monto={counted} bold />
            <div className="flex justify-between gap-2 font-bold">
              <span>Diferencia</span>
              <span>{diff != null ? differenceLabel(diff).label : "—"}</span>
            </div>
          </>
        ) : (
          <div className="text-[10px]">Sesión aún abierta: sin conteo.</div>
        )}
      </div>

      <Separator />

      <div className="mt-6 space-y-6 text-[10px]">
        <div>
          <div className="border-t border-black/60 pt-1 text-center">
            Firma del cajero
          </div>
        </div>
        <div>
          <div className="border-t border-black/60 pt-1 text-center">
            Firma del supervisor
          </div>
        </div>
      </div>

      <div className="mt-3 text-center text-[10px]">
        Impreso {formatDateTime(new Date().toISOString())}
      </div>
    </div>
  );
}
