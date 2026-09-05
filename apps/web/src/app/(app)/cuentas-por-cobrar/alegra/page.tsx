import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { env } from "@/lib/env";
import { formatCurrency } from "@/lib/utils/format";
import { redirect } from "next/navigation";
import { getRepoContext, getSession } from "@/server/auth/context";
import { facturasConSaldo } from "@/server/services/alegra/queries";
import { ALEGRA_READ_ROLES, permiteAlegra } from "@/features/alegra/roles";
import { diasDesde, saldosPorCliente } from "@/features/alegra/sales-report";

export const dynamic = "force-dynamic";

function hoyRD(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santo_Domingo" }).format(new Date());
}

/** Antigüedad en tramos, como el resto de cuentas por cobrar. */
function tono(dias: number): "neutral" | "warning" | "danger" {
  if (dias > 60) return "danger";
  if (dias > 30) return "warning";
  return "neutral";
}

export default async function SaldosAlegraPage() {
  // Mismo criterio que la API (`ALEGRA_READ_ROLES`): si la ruta se lo niega,
  // la pantalla tampoco puede enseñárselo.
  const session = await getSession();
  if (!session) redirect("/login?next=/cuentas-por-cobrar/alegra");
  if (!permiteAlegra(ALEGRA_READ_ROLES, session.user.role, session.isPlatformAdmin)) redirect("/");

  if (env.DATA_SOURCE !== "supabase") {
    return (
      <>
        <PageHeader
          title="Saldos en Alegra"
          breadcrumbs={[{ label: "Cuentas por cobrar" }, { label: "Saldos en Alegra" }]}
        />
        <Card>
          <CardContent className="py-12 text-center text-sm opacity-60">
            Esta pantalla lee el historial de Alegra, que necesita Supabase.
          </CardContent>
        </Card>
      </>
    );
  }

  const ctx = await getRepoContext();
  const facturas = await facturasConSaldo(ctx);
  const hoy = hoyRD();
  const porCliente = saldosPorCliente(facturas);
  const total = porCliente.reduce((a, c) => a + c.saldo, 0);
  const masVieja = facturas[0];

  return (
    <>
      <PageHeader
        title="Saldos en Alegra"
        description="Facturas de Alegra que quedaron con saldo. Es lo que Alegra reporta como pendiente, no las cuentas por cobrar propias de DermaLand."
        breadcrumbs={[{ label: "Cuentas por cobrar" }, { label: "Saldos en Alegra" }]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Facturas pendientes" value={facturas.length} />
        <StatCard label="Clientes" value={porCliente.length} />
        <StatCard label="Total pendiente" value={formatCurrency(total)} tone={total > 0 ? "warning" : "default"} />
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Por cliente</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Cliente</TH>
                <TH className="text-right">Facturas</TH>
                <TH>Más antigua</TH>
                <TH className="text-right pr-4">Saldo</TH>
              </TR>
            </THead>
            <TBody>
              {porCliente.length === 0 && (
                <TR>
                  <TD colSpan={4} className="py-8 text-center text-sm opacity-60">
                    Ningún cliente tiene saldo pendiente en Alegra.
                  </TD>
                </TR>
              )}
              {porCliente.map((c) => {
                const dias = diasDesde(c.masAntigua, hoy);
                return (
                  <TR key={c.clientId ?? c.clientName}>
                    <TD>
                      {c.clientId ? (
                        <Link href={`/clientes/${c.clientId}`} className="hover:underline">
                          {c.clientName}
                        </Link>
                      ) : (
                        <span title="Este contacto ya no existe en Alegra">{c.clientName}</span>
                      )}
                    </TD>
                    <TD className="text-right tabular-nums">{c.facturas}</TD>
                    <TD>
                      <Badge tone={tono(dias)}>
                        {c.masAntigua} · {dias} día{dias === 1 ? "" : "s"}
                      </Badge>
                    </TD>
                    <TD className="text-right tabular-nums font-medium pr-4">{formatCurrency(c.saldo)}</TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Facturas una a una</CardTitle>
        </CardHeader>
        <CardContent className="max-h-[32rem] overflow-y-auto p-0">
          <Table>
            <THead>
              <TR>
                <TH>Fecha</TH>
                <TH>Comprobante</TH>
                <TH>Cliente</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Cobrado</TH>
                <TH className="text-right pr-4">Saldo</TH>
              </TR>
            </THead>
            <TBody>
              {facturas.map((f) => (
                <TR key={f.id}>
                  <TD className="text-xs">{f.date}</TD>
                  <TD className="font-mono text-xs">{f.ncf ?? "—"}</TD>
                  <TD className="text-sm">{f.clientName ?? "—"}</TD>
                  <TD className="text-right tabular-nums">{formatCurrency(f.total)}</TD>
                  <TD className="text-right tabular-nums">{formatCurrency(f.totalPaid)}</TD>
                  <TD className="text-right tabular-nums font-medium pr-4">{formatCurrency(f.balance)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>

      {masVieja && (
        <p className="mt-3 text-xs opacity-60">
          La factura pendiente más antigua es del {masVieja.date}.
        </p>
      )}
    </>
  );
}
