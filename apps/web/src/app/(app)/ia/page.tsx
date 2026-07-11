import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { Bot, AlertTriangle, Coins, MessageSquare } from "lucide-react";
import { mockAIAgents, mockAILogs } from "@/lib/mock-data/integrations";
import { AgentConfigPanel } from "@/features/ai/agent-config";

export default function IAOverview() {
  const totalCalls = mockAIAgents.reduce((s, a) => s + a.monthlyCallsUsed, 0);
  const totalCost = mockAILogs.reduce((s, l) => s + l.costUSD, 0);
  const handoffs = mockAILogs.filter((l) => l.status === "handoff").length;
  return (
    <>
      <PageHeader
        title="Agentes IA"
        description="Concierge dermatológico y asistente de inventario. Tools internas — prohibido agendamiento."
        breadcrumbs={[{ label: "IA" }]}
        actions={
          <Link href="/ia/agentes">
            <Button size="sm">
              <Bot className="h-4 w-4" />
              Configurar agentes
            </Button>
          </Link>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Llamadas (mes)" value={totalCalls} icon={MessageSquare} tone="primary" />
        <StatCard label="Costo (USD)" value={`$${totalCost.toFixed(4)}`} icon={Coins} />
        <StatCard label="Handoffs a humano" value={handoffs} icon={AlertTriangle} tone="warning" />
        <StatCard label="Agentes activos" value={mockAIAgents.filter((a) => a.active).length} icon={Bot} />
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Proveedor y modelo por agente</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm opacity-70">
            Asigna a cada agente un proveedor de IA (configúralos en{" "}
            <Link href="/ia/proveedores" className="underline">Proveedores de IA</Link>),
            elige el modelo, prueba y actívalo o pásalo a pausa.
          </p>
          <AgentConfigPanel />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Política dura</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
            <strong>Prohibido</strong> ejecutar acciones de agendamiento, citas, bookings,
            calendarios o reservas. Las tools del agente NO incluyen
            <code className="mx-1 rounded bg-white px-1 font-mono text-xs">
              create_appointment
            </code>
            ni similares. Test obligatorio en CI valida que el agente responde
            "no realizamos agendamientos" si se le pide.
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[
              "get_client",
              "search_products",
              "get_inventory_stock",
              "get_expiring_lots",
              "send_whatsapp_message",
              "handoff_to_human",
            ].map((t) => (
              <Badge key={t} tone="primary" outlined>
                {t}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
