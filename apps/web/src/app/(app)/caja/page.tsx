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
import { FileSpreadsheet } from "lucide-react";
import { mockProformas } from "@/lib/mock-data/sales";
import { formatCurrency, formatDateTime } from "@/lib/utils/format";
import { getRepositories } from "@/server/repositories";
import { getRepoContext } from "@/server/auth/context";
import { env } from "@/lib/env";
import { computeShiftDetail } from "@/features/sales/cash-session-detail";
import { ShiftDetailView } from "@/features/sales/components/shift-detail";
import { AbrirCajaButton, CerrarCajaButton } from "./caja-actions";

// Usa cookies/sesión (getRepoContext) en modo supabase → render dinámico.
export const dynamic = "force-dynamic";

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
  } catch (e) {
    // Distinguir error de auth de "sin sesión":
    // getRepoContext lanza "No autenticado" si no hay JWT válido.
    // repository.current() puede lanzar errores de DB (no de auth).
    // En cualquier caso registramos server-side y dejamos current=null.
    const msg = (e as Error).message ?? String(e);
    if (msg.includes("No autenticado")) {
      // Error de auth — el layout de (app) debería haber redirigido antes.
      // Registramos y dejamos la UI mostrar "Sin sesión" como fallback seguro.
      console.error("[CajaPage] Error de autenticación:", msg);
    } else {
      // Error de repositorio/DB inesperado
      console.error("[CajaPage] Error al cargar sesión de caja:", msg);
    }
  }

  const closedOnly = closedSessions.filter((s) => s.status === "closed");

  // Proformas de la sesión actual — en supabase las cargamos del repositorio;
  // en modo mock usamos el seed.
  let proformas: import("@/types").Proforma[] = [];
  let branchName: string | null = null;
  if (current) {
    if (env.DATA_SOURCE === "supabase") {
      try {
        const ctx = await getRepoContext();
        const allProformas = await getRepositories().proforma.list(ctx);
        proformas = allProformas.filter(
          (p) => p.cashRegisterSessionId === current!.id,
        );
        const branch = await getRepositories().branch.byId(ctx, current.branchId);
        branchName = branch?.name ?? null;
      } catch {
        // Fallback a vacío si falla la carga (no bloquear la página)
      }
    } else {
      proformas = mockProformas.filter(
        (p) => p.cashRegisterSessionId === current!.id,
      );
    }
  }
  const pendingEcf = proformas.filter(
    (p) => p.status === "pending_ecf" || p.status === "paid",
  );

  const shiftDetail = current
    ? computeShiftDetail(current, proformas, [], branchName)
    : null;

  if (!current) {
    return (
      <>
        <PageHeader
          title="Caja"
          description="Sin sesión abierta. Abre caja con tu monto inicial para empezar a vender."
          breadcrumbs={[{ label: "Caja" }]}
          actions={<AbrirCajaButton />}
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
            <a
              href={`/api/cash/${current.id}/export`}
              aria-label="Exportar Excel del turno"
            >
              <Button variant="outline" size="sm" title="Exportar Excel">
                <FileSpreadsheet className="h-4 w-4" />
                Exportar Excel
              </Button>
            </a>
            <Link href="/caja/historial">
              <Button variant="outline" size="sm">
                Historial
              </Button>
            </Link>
            <CerrarCajaButton sessionId={current.id} />
          </>
        }
      />

      {shiftDetail && (
        <div className="mb-6">
          <ShiftDetailView detail={shiftDetail} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-3">
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
                      {s.countedCash != null ? formatCurrency(s.countedCash) : "—"}
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
