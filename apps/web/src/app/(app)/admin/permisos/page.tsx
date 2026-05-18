import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
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
import { AlertTriangle, ShieldCheck } from "lucide-react";
import {
  allPermissions,
  DGII_RBAC_PENDING_KEYS,
  DGII_PERMISSION_MODULES_ORDER,
} from "@/lib/mock-data/users";

export default function PermisosPage() {
  const grouped = allPermissions.reduce(
    (acc, p) => {
      (acc[p.module] ||= []).push(p);
      return acc;
    },
    {} as Record<string, typeof allPermissions>,
  );

  // Las categorías DGII van primero (en el orden declarado), luego el resto
  // alfabéticamente. Permite al usuario ver de un vistazo los nuevos
  // permisos preparados para Fase C.
  const dgiiModulesPresent = DGII_PERMISSION_MODULES_ORDER.filter((m) =>
    Object.keys(grouped).includes(m),
  );
  const otherModules = Object.keys(grouped)
    .filter((m) => !dgiiModulesPresent.includes(m))
    .sort();
  const orderedModules = [...dgiiModulesPresent, ...otherModules];

  const pendingCount = allPermissions.filter((p) =>
    DGII_RBAC_PENDING_KEYS.has(p.key),
  ).length;

  return (
    <>
      <PageHeader
        title="Permisos"
        description="Catálogo de permisos granulares — base de RBAC. Asignables por rol o como override por usuario."
        breadcrumbs={[{ label: "Administración" }, { label: "Permisos" }]}
      />

      <div className="mb-6 rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-amber-900">
              {pendingCount} permisos DGII / caja preparados como MOCK
            </h3>
            <p className="mt-1 text-sm text-amber-900">
              Estos permisos ya están declarados en el catálogo y se
              referencian desde la UI, pero{" "}
              <strong>NO se enforcean en runtime</strong> mientras{" "}
              <code className="rounded bg-amber-100 px-1 font-mono text-xs">
                DATA_SOURCE=mock
              </code>
              . En Fase C (Supabase + RLS) pasan a ser obligatorios: las
              server actions verifican el permiso, las políticas RLS de
              Supabase rechazan operaciones sin él, y el UI oculta acciones
              cuando el usuario no lo tiene.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {orderedModules.map((module) => {
          const items = grouped[module]!;
          const isDgiiCategory = dgiiModulesPresent.includes(module);
          const pendingInGroup = items.filter((p) =>
            DGII_RBAC_PENDING_KEYS.has(p.key),
          ).length;
          return (
            <Card key={module}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>{module}</span>
                  {isDgiiCategory && (
                    <Badge tone="warning" className="text-[10px]">
                      MOCK · Fase C
                    </Badge>
                  )}
                </CardTitle>
                <p className="mt-1 text-xs opacity-60">
                  {items.length} {items.length === 1 ? "permiso" : "permisos"}
                  {pendingInGroup > 0 &&
                    ` · ${pendingInGroup} pendientes RLS`}
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <THead>
                    <TR>
                      <TH>Clave</TH>
                      <TH>Descripción</TH>
                      <TH className="w-24 text-right pr-4">Estado</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {items.map((p) => {
                      const pending = DGII_RBAC_PENDING_KEYS.has(p.key);
                      return (
                        <TR key={p.key}>
                          <TD>
                            <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[11px]">
                              {p.key}
                            </code>
                          </TD>
                          <TD className="text-xs opacity-80">
                            {p.description}
                          </TD>
                          <TD className="pr-4 text-right">
                            {pending ? (
                              <Badge tone="warning" className="text-[10px]">
                                mock
                              </Badge>
                            ) : (
                              <Badge tone="success" className="text-[10px]">
                                <ShieldCheck className="h-3 w-3" />
                                activo
                              </Badge>
                            )}
                          </TD>
                        </TR>
                      );
                    })}
                  </TBody>
                </Table>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Convención de nombres</CardTitle>
          <p className="mt-1 text-sm opacity-60">
            <code className="rounded bg-black/5 px-1 font-mono text-xs">
              modulo:accion
            </code>{" "}
            con acciones agrupadas por{" "}
            <code className="rounded bg-black/5 px-1 font-mono text-xs">|</code>
            . Ejemplos:
          </p>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ItemExample
            code="products:read"
            desc="Solo lectura del catálogo."
          />
          <ItemExample
            code="inventory:read|write|adjust"
            desc="Lee inventario, hace entradas/salidas y ajustes."
          />
          <ItemExample
            code="inventory_count:approve"
            desc="Solo aprobar diferencias — no contar ni revisar."
          />
          <ItemExample
            code="business:*"
            desc="Wildcard — acceso total al módulo."
          />
          <ItemExample
            code="dgii:invoices:sign"
            desc="Solo firmar XML — quien firma no necesariamente quien envía."
          />
        </CardContent>
      </Card>

      <Card className="mt-6 border-amber-200">
        <CardHeader>
          <CardTitle>Obligatorios cuando Supabase / RLS estén activos</CardTitle>
          <p className="mt-1 text-sm opacity-60">
            Estos permisos definen el control de acceso del módulo DGII y la
            lógica de caja fiscal cuando se autorice Fase C. Hoy en{" "}
            <code className="rounded bg-black/5 px-1 font-mono text-xs">
              DATA_SOURCE=mock
            </code>{" "}
            todos los flujos son ejercicios, pero{" "}
            <strong>el contador / admin debe acordar la asignación</strong>{" "}
            (qué rol recibe qué permiso) antes de activar el módulo real.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <ResponsibilityBlock
            title="Configuración DGII y certificado"
            highRisk
            items={[
              "dgii:configure — editar RNC, razón social, ambiente, URLs base DGII.",
              "dgii:certificate:upload — subir/reemplazar el .p12. Acción auditable.",
              "dgii:sequences:manage — importar y reservar secuencias e-NCF autorizadas.",
            ]}
          />
          <ResponsibilityBlock
            title="Operación de facturación electrónica"
            items={[
              "dgii:invoices:generate_xml — armar el XML desde una venta/proforma.",
              "dgii:invoices:validate_xml — correr validación XSD antes de firmar.",
              "dgii:invoices:sign — firmar XML (acceso al cert descifrado).",
              "dgii:invoices:send — enviar XML firmado a DGII (consume secuencia real).",
              "dgii:invoices:check_status — consultar TrackId.",
              "dgii:invoices:download_xml — descargar XML firmado/sin firmar.",
              "dgii:invoices:download_pdf — descargar representación impresa.",
            ]}
          />
          <ResponsibilityBlock
            title="Notas de crédito y pre-certificación"
            items={[
              "dgii:credit_notes:create — emitir NC (e-CF 34) desde una factura origen.",
              "dgii:certification:run_tests — ejecutar set de pruebas internas contra testecf.",
              "dgii:reports:view — leer reportes fiscales (por tipo, estado, secuencias).",
            ]}
          />
          <ResponsibilityBlock
            title="Caja y cierre fiscal"
            highRisk
            items={[
              "cash:open — abrir sesión de caja.",
              "cash:close — confirmar cierre (genera lote de e-CFs según % aplicado).",
              "cash:change_closing_percentage — modificar el % default antes del cierre.",
              "cash:authorize_below_100_percent — autorizar cierres con % < 100. Auditable.",
              "cash:reverse_closing — reversar un cierre confirmado. Auditable.",
            ]}
          />
        </CardContent>
      </Card>
    </>
  );
}

function ItemExample({ code, desc }: { code: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <Badge tone="primary" className="mt-0.5 font-mono">
        {code}
      </Badge>
      <span className="opacity-80">{desc}</span>
    </div>
  );
}

function ResponsibilityBlock({
  title,
  items,
  highRisk = false,
}: {
  title: string;
  items: string[];
  highRisk?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 text-sm ${
        highRisk
          ? "border-rose-200 bg-rose-50/40"
          : "border-black/5 bg-black/[0.02]"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="font-semibold">{title}</span>
        {highRisk && (
          <Badge tone="danger" className="text-[10px]">
            alto riesgo
          </Badge>
        )}
      </div>
      <ul className="mt-2 space-y-1 text-xs opacity-80">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-2">
            <span className="opacity-40">•</span>
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
