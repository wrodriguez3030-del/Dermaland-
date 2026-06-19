import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { Banknote, Lock, Receipt } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import { mockProformas } from "@/lib/mock-data/sales";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { env } from "@/lib/env";

/**
 * Caja — página de sesión actual.
 *
 * En modo `supabase` la sesión activa se lee desde el repositorio Supabase
 * con RLS por business_id del JWT. En modo `mock` se usa el seed de
 * mock-data (comportamiento anterior, sin cambios).
 */
export default async function CajaPage() {
  // Obtener sesión actual via repositorio (Supabase o mock según DATA_SOURCE).
  let current: import("@/types").CashRegisterSession | null = null;
  let closedSessions: import("@/types").CashRegisterSession[] = [];

  try {
    const ctx = await getRepoContext();
    const repo = getRepositories().cashRegister;
    const [cur, hist] = await Promise.all([
      repo.current(ctx),
      repo.history(ctx, 10),
    ]);
    current = cur;
    closedSessions = hist;
  } catch {
    // En modo mock sin sesión activa, getRepoContext devuelve el mock context
    // y repository.current() devuelve el seed. Si falla, queda null (sin sesión).
  }

  const closedOnly = closedSessions.filter((s) => s.status === "closed");

  // Proformas de la sesión actual (solo en modo mock con seed)
  const proformas =
    env.DATA_SOURCE !== "supabase" && current
      ? mockProformas.filter((p) => p.cashRegisterSessionId === current!.id)
      : [];
  const pendingEcf = proformas.filter(
    (p) => p.status === "pending_ecf" || p.status === "paid",
  );

  if (!current) {
    return (
      <>
        <PageHeader
          title="Caja"
          description="Sin sesión abierta. Abre caja con tu monto inicial para empezar a vender."
          breadcrumbs={[{ label: "Caja" }]}
          actions={
            <Button size="sm">
              <Banknote className="h-4 w-4" />
              Abrir caja
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Caja actual"
        description={`Sesión ${current.sessionNumber} · cajero ${current.cashierName}`}
        breadcrumbs={[{ label: "Caja" }]}
        actions={
          <>
            <Link href="/caja/historial">
              <Button variant="outline" size="sm">
                Historial
              </Button>
            </Link>
            <Link href="/caja/cierre">
              <Button size="sm" variant="danger">
                <Lock className="h-4 w-4" />
                Cerrar caja
              </Button>
            </Link>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Apertura"
          value={formatCurrency(current.openingAmount)}
          icon={Banknote}
        />
        <StatCard
          label="Esperado en efectivo"
          value={formatCurrency(current.expectedCash)}
          icon={Banknote}
          tone="primary"
        />
        <StatCard
          label="Tarjeta"
          value={formatCurrency(current.totals.card)}
          icon={Receipt}
        />
        <StatCard
          label="Transferencia"
          value={formatCurrency(current.totals.transfer)}
          icon={Receipt}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Proformas seleccionables para e-CF</CardTitle>
            <p className="mt-1 text-xs opacity-60">
              En cierre de caja seleccionas manualmente qué proformas se envían a DGII.
              No se envía nada automático.
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {pendingEcf.length === 0 ? (
              <div className="p-6 text-center text-sm opacity-60">
                No hay proformas pendientes de conversión a e-CF en esta sesión.
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH className="w-10"></TH>
                    <TH>Proforma</TH>
                    <TH>Cliente</TH>
                    <TH className="text-right">Total</TH>
                    <TH>Tipo sugerido</TH>
                  </TR>
                </THead>
                <TBody>
                  {pendingEcf.map((p) => (
                    <TR key={p.id}>
                      <TD>
                        <input type="checkbox" defaultChecked={p.status === "pending_ecf"} />
                      </TD>
                      <TD className="font-mono text-xs">{p.number}</TD>
                      <TD className="text-sm">{p.customerName}</TD>
                      <TD className="text-right tabular-nums">{formatCurrency(p.total)}</TD>
                      <TD>
                        <Badge tone={p.status === "pending_ecf" ? "warning" : "info"}>
                          {p.status === "pending_ecf" ? "e-CF 31 (Crédito Fiscal)" : "e-CF 32 (Consumo)"}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cierre estimado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="opacity-70">Efectivo esperado</span>
              <span className="tabular-nums font-medium">{formatCurrency(current.expectedCash)}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-70">Tarjeta</span>
              <span className="tabular-nums">{formatCurrency(current.totals.card)}</span>
            </div>
            <div className="flex justify-between">
              <span className="opacity-70">Transferencia</span>
              <span className="tabular-nums">{formatCurrency(current.totals.transfer)}</span>
            </div>
            <div className="border-t border-black/5 pt-3">
              <label className="text-xs font-medium">Efectivo contado</label>
              <input
                type="number"
                placeholder="0.00"
                className="mt-1 h-10 w-full rounded-lg border border-black/15 px-3"
              />
            </div>
            <p className="text-xs opacity-60">
              Diferencia mayor a la tolerancia (RD$50) requiere autorización del supervisor.
            </p>
          </CardContent>
        </Card>
      </div>

      {closedOnly.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Sesiones cerradas recientes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>Sesión</TH>
                  <TH>Cajero</TH>
                  <TH>Apertura</TH>
                  <TH>Cierre</TH>
                  <TH className="text-right">Esperado</TH>
                  <TH className="text-right">Contado</TH>
                  <TH className="text-right">Diferencia</TH>
                </TR>
              </THead>
              <TBody>
                {closedOnly.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-mono text-xs">{s.sessionNumber}</TD>
                    <TD className="text-sm">{s.cashierName}</TD>
                    <TD className="text-xs">{formatDateTime(s.openedAt)}</TD>
                    <TD className="text-xs">
                      {s.closedAt ? formatDateTime(s.closedAt) : "—"}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {formatCurrency(s.expectedCash)}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {s.countedCash ? formatCurrency(s.countedCash) : "—"}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {s.difference != null ? (
                        <span
                          className={
                            s.difference < 0 ? "text-rose-700" : "text-emerald-700"
                          }
                        >
                          {formatCurrency(s.difference)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
