import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Badge,
  Button,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { MessageSquare, Send, Users, AlertTriangle } from "lucide-react";
import {
  mockWhatsappConversations,
  mockWhatsappTemplates,
} from "@/lib/mock-data/integrations";

export default function WhatsappOverview() {
  const open = mockWhatsappConversations.filter((c) => c.status === "open").length;
  const handoff = mockWhatsappConversations.filter((c) => c.status === "handoff").length;
  const templates = mockWhatsappTemplates.filter((t) => t.status === "approved").length;
  return (
    <>
      <PageHeader
        title="WhatsApp"
        description="Meta Cloud API · 1000 conversaciones/mes gratis. Plantillas aprobadas via Meta Business."
        breadcrumbs={[{ label: "WhatsApp" }]}
        actions={
          <Link href="/whatsapp/conversaciones">
            <Button size="sm">
              <MessageSquare className="h-4 w-4" />
              Abrir conversaciones
            </Button>
          </Link>
        }
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Conversaciones abiertas" value={open} icon={MessageSquare} tone="primary" />
        <StatCard label="Esperando humano" value={handoff} icon={AlertTriangle} tone="warning" />
        <StatCard label="Mensajes enviados (mes)" value={142} icon={Send} hint="de 10,000 disponibles" />
        <StatCard label="Plantillas aprobadas" value={templates} icon={Users} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Conexión Meta Cloud API</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Badge tone="success">Conectado</Badge>
            <span className="text-sm opacity-70">
              Número verificado: <strong>+1 809-226-5252</strong>
            </span>
          </div>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wider opacity-50">Phone Number ID</dt>
              <dd className="mt-0.5 font-mono text-xs">pn_2026_xxx</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider opacity-50">Business Account</dt>
              <dd className="mt-0.5 font-mono text-xs">wba_dermaland</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider opacity-50">Webhook URL</dt>
              <dd className="mt-0.5 font-mono text-xs">/api/whatsapp/webhook</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </>
  );
}
