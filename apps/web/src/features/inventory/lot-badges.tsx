import { Badge } from "@/components/ui";
import type { LotStatus } from "@/types";

export function lotStatusBadge(status: LotStatus) {
  const map: Record<
    LotStatus,
    { label: string; tone: "success" | "warning" | "danger" | "neutral" | "info" }
  > = {
    available: { label: "Disponible", tone: "success" },
    quarantine: { label: "Cuarentena", tone: "warning" },
    expired: { label: "Vencido", tone: "danger" },
    recalled: { label: "Recall", tone: "danger" },
    damaged: { label: "Dañado", tone: "neutral" },
    returned: { label: "Devuelto", tone: "info" },
  };
  const v = map[status];
  return <Badge tone={v.tone}>{v.label}</Badge>;
}
