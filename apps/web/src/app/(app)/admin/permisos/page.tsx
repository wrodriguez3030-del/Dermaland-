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
import { allPermissions } from "@/lib/mock-data/users";

export default function PermisosPage() {
  const grouped = allPermissions.reduce(
    (acc, p) => {
      (acc[p.module] ||= []).push(p);
      return acc;
    },
    {} as Record<string, typeof allPermissions>,
  );

  return (
    <>
      <PageHeader
        title="Permisos"
        description="Catálogo de permisos granulares — base de RBAC. Asignables por rol o como override por usuario."
        breadcrumbs={[{ label: "Administración" }, { label: "Permisos" }]}
      />

      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(grouped).map(([module, items]) => (
          <Card key={module}>
            <CardHeader>
              <CardTitle>{module}</CardTitle>
              <p className="mt-1 text-xs opacity-60">
                {items.length} {items.length === 1 ? "permiso" : "permisos"}
              </p>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Clave</TH>
                    <TH>Descripción</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((p) => (
                    <TR key={p.key}>
                      <TD>
                        <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[11px]">
                          {p.key}
                        </code>
                      </TD>
                      <TD className="text-xs opacity-80">{p.description}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Convención de nombres</CardTitle>
          <p className="mt-1 text-sm opacity-60">
            <code className="rounded bg-black/5 px-1 font-mono text-xs">
              modulo:accion
            </code>{" "}
            con acciones agrupadas por <code className="rounded bg-black/5 px-1 font-mono text-xs">|</code>.
            Ejemplos:
          </p>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <ItemExample code="products:read" desc="Solo lectura del catálogo." />
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
