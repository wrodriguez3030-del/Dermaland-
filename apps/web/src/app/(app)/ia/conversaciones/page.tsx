import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageSquare } from "lucide-react";

export default function IAConversacionesPage() {
  return (
    <>
      <PageHeader
        title="Conversaciones IA"
        description="Hilos completos manejados por agentes. Útil para auditoría y mejora del prompt."
        breadcrumbs={[{ label: "IA", href: "/ia" }, { label: "Conversaciones" }]}
      />
      <EmptyState
        icon={MessageSquare}
        title="Sin conversaciones registradas hoy"
        description="Las conversaciones del concierge dermatológico aparecerán aquí cuando se conecte el webhook de WhatsApp y el agente responda."
      />
    </>
  );
}
