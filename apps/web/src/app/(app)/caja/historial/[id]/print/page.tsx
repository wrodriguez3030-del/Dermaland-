import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui";
import { computeShiftDetail } from "@/features/sales/cash-session-detail";
import { CashClosingTicket } from "@/features/sales/components/cash-closing-ticket";
import { getRepoContext } from "@/server/auth/context";
import { getRepositories } from "@/server/repositories";
import { PrintTicketButton } from "./print-button";

/**
 * Ticket 80mm de un cierre de caja, listo para imprimir.
 *
 * El detalle se recalcula server-side con las mismas piezas de la página de
 * caja (`computeShiftDetail` + proformas + movimientos): el ticket dice lo
 * mismo que dijo la pantalla, no una copia guardada aparte. Requiere sesión
 * (vive bajo `(app)`) y la RLS acota por `business_id`.
 */

export const dynamic = "force-dynamic";

export default async function CierreCajaPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await getRepoContext();
  const repos = getRepositories();

  // No hay lector por id: la sesión sale de la actual o del historial.
  const [actual, historial] = await Promise.all([
    repos.cashRegister.current(ctx),
    repos.cashRegister.history(ctx, 100),
  ]);
  const session =
    actual?.id === id ? actual : historial.find((s) => s.id === id);
  if (!session) notFound();

  const [todas, movimientos, sucursal] = await Promise.all([
    repos.proforma.list(ctx),
    repos.cashRegister.movements(ctx, session.id).catch(() => []),
    repos.branch.byId(ctx, session.branchId).catch(() => null),
  ]);
  const proformas = todas.filter((p) => p.cashRegisterSessionId === session.id);
  const detail = computeShiftDetail(
    session,
    proformas,
    movimientos,
    sucursal?.name ?? null,
  );

  return (
    <div className="mx-auto max-w-md py-6">
      {/* Los controles no salen en papel: el CSS de impresión solo deja el
          `.receipt-80mm`. */}
      <div className="mb-4 flex items-center justify-between gap-2 print:hidden">
        <Link href="/caja/historial">
          <Button variant="outline" size="sm">
            <ArrowLeft className="h-4 w-4" />
            Volver al historial
          </Button>
        </Link>
        <PrintTicketButton />
      </div>

      <CashClosingTicket session={session} detail={detail} />
    </div>
  );
}
