import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Card, CardContent, CardHeader, CardTitle, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { env } from "@/lib/env";
import { formatDateTime } from "@/lib/utils/format";
import { redirect } from "next/navigation";
import { getRepoContext, getSession } from "@/server/auth/context";
import { resumenAlegra, ultimasCorridas, type CorridaSync } from "@/server/services/alegra/queries";
import { ALEGRA_SYNC_ROLES, permiteAlegra } from "@/features/alegra/roles";
import { SyncNowButton } from "@/features/alegra/sync-now-button";

export const dynamic = "force-dynamic";

const DISPARO: Record<string, string> = {
  cron: "Automática",
  manual: "A mano",
  cli: "Desde la terminal",
};

function resumenDeCorrida(c: CorridaSync): string {
  const partes: string[] = [];
  const n = (entidad: string, clave: string): number => c.counts?.[entidad]?.[clave] ?? 0;
  if (n("contacts", "read")) partes.push(`${n("contacts", "created")} clientes nuevos`);
  if (n("items", "read")) partes.push(`${n("items", "updated")} productos al día`);
  if (n("stock", "movements")) partes.push(`${n("stock", "movements")} ajustes de stock`);
  if (n("invoices", "upserted")) partes.push(`${n("invoices", "upserted")} facturas`);
  return partes.length > 0 ? partes.join(" · ") : "Sin cambios";
}

export default async function IntegracionAlegraPage() {
  // Mismo criterio que la API (`ALEGRA_SYNC_ROLES`): si la ruta se lo niega,
  // la pantalla tampoco puede enseñárselo.
  const session = await getSession();
  if (!session) redirect("/login?next=/admin/integraciones/alegra");
  if (!permiteAlegra(ALEGRA_SYNC_ROLES, session.user.role, session.isPlatformAdmin)) redirect("/");

  if (env.DATA_SOURCE !== "supabase") {
    return (
      <>
        <PageHeader
          title="Alegra"
          breadcrumbs={[{ label: "Administración" }, { label: "Integraciones" }, { label: "Alegra" }]}
        />
        <Card>
          <CardContent className="py-12 text-center text-sm opacity-60">
            La integración con Alegra necesita Supabase. Ahora mismo la aplicación corre con datos de
            demostración.
          </CardContent>
        </Card>
      </>
    );
  }

  const ctx = await getRepoContext();
  const [corridas, resumen] = await Promise.all([ultimasCorridas(ctx), resumenAlegra(ctx)]);
  const ultima = corridas[0];

  return (
    <>
      <PageHeader
        title="Alegra"
        description="Alegra es el sistema de verdad. DermaLand solo lee de él: clientes, productos, precios, stock y facturas."
        breadcrumbs={[{ label: "Administración" }, { label: "Integraciones" }, { label: "Alegra" }]}
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Clientes traídos" value={resumen.clientes.toLocaleString("es-DO")} />
        <StatCard label="Productos traídos" value={resumen.productos.toLocaleString("es-DO")} />
        <StatCard label="Facturas" value={resumen.facturas.toLocaleString("es-DO")} />
        <StatCard label="Líneas de factura" value={resumen.lineas.toLocaleString("es-DO")} />
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Última sincronización</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {ultima ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              {ultima.ok === true && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
              {ultima.ok === false && <AlertTriangle className="h-5 w-5 text-rose-600" />}
              {ultima.ok === null && <Clock className="h-5 w-5 opacity-60" />}
              <span>
                <strong>{formatDateTime(ultima.startedAt)}</strong> · {DISPARO[ultima.trigger] ?? ultima.trigger}
                {ultima.dryRun ? " · simulación" : ""}
                {ultima.mode === "full" ? " · histórico completo" : ""}
              </span>
              <span className="opacity-70">{resumenDeCorrida(ultima)}</span>
              {ultima.errors.length > 0 && (
                <Badge tone="danger">{ultima.errors.length} error(es)</Badge>
              )}
            </div>
          ) : (
            <p className="text-sm opacity-60">Todavía no hay ninguna sincronización registrada.</p>
          )}

          <SyncNowButton canTrigger={Boolean(env.GITHUB_ACTIONS_TOKEN)} />

          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <strong>Alegra manda.</strong> Cada corrida iguala precios, costos y stock a lo que diga
            Alegra, así que una edición hecha a mano aquí se pisa a la mañana siguiente. Y todo lo
            que se venda en DermaLand debe quedar facturado en Alegra el mismo día: si no, esas
            unidades vuelven al stock.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Corridas recientes</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Cuándo</TH>
                <TH>Origen</TH>
                <TH>Alcance</TH>
                <TH>Resultado</TH>
                <TH>Qué trajo</TH>
              </TR>
            </THead>
            <TBody>
              {corridas.length === 0 && (
                <TR>
                  <TD colSpan={5} className="py-8 text-center text-sm opacity-60">
                    Sin corridas todavía.
                  </TD>
                </TR>
              )}
              {corridas.map((c) => (
                <TR key={c.id}>
                  <TD className="text-xs">{formatDateTime(c.startedAt)}</TD>
                  <TD className="text-xs">{DISPARO[c.trigger] ?? c.trigger}</TD>
                  <TD className="text-xs">
                    {c.mode === "full" ? "Histórico" : "Solo lo nuevo"}
                    {c.dryRun ? " · simulación" : ""}
                  </TD>
                  <TD>
                    {c.ok === true && <Badge tone="success">Bien</Badge>}
                    {c.ok === false && <Badge tone="danger">Con errores</Badge>}
                    {c.ok === null && <Badge tone="neutral">En curso</Badge>}
                  </TD>
                  <TD className="text-xs opacity-70">{resumenDeCorrida(c)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
