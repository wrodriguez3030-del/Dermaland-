import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, Clock, FileText, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Card, CardContent } from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { QueueRunButton } from "@/features/dgii/components/queue-run-button";
import { roleHasDgiiPermission } from "@/features/dgii/permissions";
import { getSession } from "@/server/auth/context";
import { loadDgiiDashboard } from "@/server/services/dgii/dashboard";

/**
 * Estado real del módulo fiscal.
 *
 * Pantalla nueva y separada de `/dgii` a propósito: aquella enseña datos de
 * mentira desde hace meses (`mockElectronicInvoices`) y sustituirla de golpe
 * sería cambiarle el suelo a quien la esté usando. Esta lee **la base**, y
 * cuando la vieja se retire, esta ocupa su sitio.
 *
 * Lo que contesta, en este orden, porque es el orden en que preocupa:
 *   1. ¿Sale algo hacia la DGII ahora mismo?
 *   2. ¿Hay algo atascado?
 *   3. ¿El certificado aguanta?
 */

export const dynamic = "force-dynamic";

export default async function EstadoDgiiPage() {
  const session = await getSession();
  if (!session) redirect("/login?next=/dgii/estado");

  // La RLS valida el negocio, no el rol (DL-01). Esta pantalla enseña el estado
  // fiscal completo, así que exige el permiso de verlo.
  const puedeVer =
    session.isPlatformAdmin || roleHasDgiiPermission(session.user.role, "dgii.view");
  if (!puedeVer) redirect("/");

  const puedeProcesar =
    session.isPlatformAdmin || roleHasDgiiPermission(session.user.role, "dgii.retry");

  const d = await loadDgiiDashboard(session.businessId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Estado de facturación electrónica"
        description="Lo que hay en la cola fiscal ahora mismo, leído de la base."
        breadcrumbs={[{ label: "DGII" }, { label: "Estado" }]}
      />

      {/* Lo primero: ¿sale algo o no? Es lo que más se malinterpreta. */}
      <div
        className={`flex items-start gap-3 rounded-2xl px-5 py-4 ${
          d.sendEnabled ? "bg-amber-50" : "bg-[color:var(--brand-primary)]/5"
        }`}
      >
        {d.sendEnabled ? (
          <AlertTriangle aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        ) : (
          <ShieldAlert
            aria-hidden
            className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--brand-primary)]"
          />
        )}
        <div>
          <p className="font-semibold text-[color:var(--brand-fg)]">
            {d.sendEnabled
              ? `Envío a DGII ENCENDIDO · ambiente ${d.ambiente}`
              : "El envío a DGII está apagado"}
          </p>
          <p className="mt-1 text-sm text-[color:var(--brand-fg)]/70">
            {d.sendEnabled
              ? "Los comprobantes firmados se transmiten. Cada e-NCF que sale ya no se puede deshacer."
              : "Los comprobantes se construyen, se validan y se firman, y se quedan esperando. No sale nada hacia la DGII."}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Comprobantes" value={String(d.total)} icon={FileText} />
        <StatCard label="Pendientes" value={String(d.pendientes)} icon={Clock} />
        <StatCard label="Autorizados" value={String(d.autorizados)} icon={CheckCircle2} />
        <StatCard
          label="Con problema"
          value={String(d.enError + d.rechazados)}
          icon={AlertTriangle}
        />
      </div>

      {/* Un comprobante viejo y quieto es la señal de que la cola se atascó, y
          no se ve mirando totales. */}
      {d.masAntiguoPendiente ? (
        <Card>
          <CardContent>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
              El que más lleva esperando
            </h2>
            <p className="mt-2 text-sm text-[color:var(--brand-fg)]/80">
              <span className="font-mono">{d.masAntiguoPendiente.eNcf}</span>, desde el{" "}
              {new Date(d.masAntiguoPendiente.desde).toLocaleString("es-DO")}.
            </p>
            <p className="mt-1 text-sm text-[color:var(--brand-fg)]/60">
              Si lleva mucho ahí y la cola corre cada 15 minutos, algo no está
              avanzando.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {d.porEstado.length > 0 ? (
        <Card>
          <CardContent>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
              Por dónde van
            </h2>
            <ul className="mt-3 divide-y divide-black/5">
              {d.porEstado.map((e) => (
                <li key={e.status} className="flex justify-between py-2 text-sm">
                  <span className="text-[color:var(--brand-fg)]/80">{e.label}</span>
                  <span className="font-semibold text-[color:var(--brand-fg)]">
                    {e.count}
                  </span>
                </li>
              ))}
            </ul>
            {d.conReintento > 0 ? (
              <p className="mt-3 text-sm text-[color:var(--brand-fg)]/60">
                {d.conReintento} con reintento programado.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <p className="text-sm text-[color:var(--brand-fg)]/70">
              Todavía no se ha emitido ningún comprobante electrónico.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
                Certificado digital
              </h2>
              <Badge
                tone={
                  !d.certificado.presente
                    ? "neutral"
                    : d.certificado.nivel === "ok"
                      ? "success"
                      : d.certificado.nivel === "vencido"
                        ? "neutral"
                        : "info"
                }
              >
                {!d.certificado.presente
                  ? "Sin cargar"
                  : d.certificado.nivel === "ok"
                    ? "Vigente"
                    : "Atención"}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-[color:var(--brand-fg)]/70">
              {d.certificado.presente
                ? d.certificado.mensaje
                : "Sin certificado activo no se puede firmar ni un comprobante."}
            </p>
            <Link
              href="/dgii/certificado"
              className="mt-3 inline-block text-sm font-semibold text-[color:var(--brand-primary)] underline-offset-4 hover:underline"
            >
              Ir al certificado
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
                Esquemas oficiales
              </h2>
              <Badge tone={d.esquemas.ok ? "success" : "neutral"}>
                {d.esquemas.correctos} de {d.esquemas.total}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-[color:var(--brand-fg)]/70">
              {d.esquemas.ok
                ? "Los esquemas XSD son los que publica la DGII, sin modificar."
                : "Algún esquema no coincide con el que se descargó de la DGII. Revísalo antes de emitir."}
            </p>
          </CardContent>
        </Card>
      </div>

      {puedeProcesar ? (
        <Card>
          <CardContent>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-[color:var(--brand-fg)]/50">
              Procesar la cola
            </h2>
            <p className="mt-1 mb-4 text-sm text-[color:var(--brand-fg)]/60">
              Corre sola cada 15 minutos. Esto es para no esperar — por ejemplo,
              después de arreglar lo que hacía fallar a un comprobante.
            </p>
            <QueueRunButton />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
