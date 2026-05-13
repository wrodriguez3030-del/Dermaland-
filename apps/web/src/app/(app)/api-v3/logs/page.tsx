import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Activity } from "lucide-react";

export default function ApiLogsPage() {
  return (
    <>
      <PageHeader
        title="Logs API V3"
        description="Histórico de requests por key y endpoint. Filtros por status code y latencia."
        breadcrumbs={[{ label: "API V3", href: "/api-v3" }, { label: "Logs" }]}
      />
      <EmptyState
        icon={Activity}
        title="Sin tráfico todavía"
        description="Los logs de api_request_logs aparecerán aquí cuando un cliente externo o integración llame a la API V3 con una key activa."
      />
    </>
  );
}
