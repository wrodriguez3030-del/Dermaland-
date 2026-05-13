import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { Code2, Key, Webhook, Activity } from "lucide-react";
import { mockApiKeys, mockWebhooks } from "@/lib/mock-data/integrations";

export default function ApiV3Overview() {
  const activeKeys = mockApiKeys.filter((k) => k.status === "active").length;
  const activeHooks = mockWebhooks.filter((w) => w.status === "active").length;
  return (
    <>
      <PageHeader
        title="API V3"
        description="API REST pública con keys hasheadas, scopes, rate limits y webhooks."
        breadcrumbs={[{ label: "API V3" }]}
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="API keys activas" value={activeKeys} icon={Key} tone="primary" />
        <StatCard label="Webhooks activos" value={activeHooks} icon={Webhook} />
        <StatCard label="Requests hoy" value="—" hint="Sin tráfico" icon={Activity} />
        <StatCard label="Errores" value="0" icon={Code2} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Endpoints destacados</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs font-mono">
            {[
              "GET /v3/products",
              "GET /v3/products/barcode/{barcode}",
              "GET /v3/lots/expiring",
              "POST /v3/inventory/counts",
              "POST /v3/inventory/counts/{id}/scan",
              "POST /v3/sales",
              "POST /v3/messages/whatsapp/send",
              "GET /v3/dgii/batches",
            ].map((e) => (
              <div key={e} className="rounded bg-black/[0.04] px-2 py-1">
                {e}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Scopes disponibles</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {[
                "clients:read",
                "clients:write",
                "products:read",
                "products:write",
                "inventory:read",
                "inventory:write",
                "inventory_counts:read",
                "inventory_counts:write",
                "sales:read",
                "sales:write",
                "dgii:read",
                "dgii:write",
                "whatsapp:write",
                "ai:write",
                "webhooks:write",
              ].map((s) => (
                <Badge key={s} tone="info" outlined>
                  {s}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Developer Hub</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm opacity-70">
            OpenAPI / Swagger en{" "}
            <Link
              href="/api-v3/docs"
              className="text-[color:var(--brand-accent)] hover:underline"
            >
              /v3/docs
            </Link>{" "}
            · Sandbox con datos de prueba · Postman collection descargable.
          </p>
        </CardContent>
      </Card>
    </>
  );
}
