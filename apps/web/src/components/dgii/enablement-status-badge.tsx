import { Badge } from "@/components/ui";
import {
  CheckCircle2,
  Circle,
  Clock,
  Lock,
  ShieldAlert,
  UserCheck,
  Building2,
} from "lucide-react";
import type { EnablementStatus } from "@/features/dgii/enablement-store";

const STATUS_CONFIG: Record<
  EnablementStatus,
  {
    label: string;
    tone: "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "purple";
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  pending: { label: "Pendiente", tone: "neutral", icon: Circle },
  in_progress: { label: "En progreso", tone: "info", icon: Clock },
  completed: { label: "Finalizado", tone: "success", icon: CheckCircle2 },
  blocked: { label: "Bloqueado", tone: "danger", icon: Lock },
  requires_user_action: {
    label: "Requiere acción",
    tone: "warning",
    icon: ShieldAlert,
  },
  requires_accountant_validation: {
    label: "Requiere contador",
    tone: "purple",
    icon: UserCheck,
  },
  requires_dgii_validation: {
    label: "Requiere DGII",
    tone: "warning",
    icon: Building2,
  },
};

export function EnablementStatusBadge({
  status,
  className,
}: {
  status: EnablementStatus;
  className?: string;
}) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <Badge tone={cfg.tone} className={className}>
      <Icon className="h-3 w-3" aria-hidden />
      {cfg.label}
    </Badge>
  );
}

export const ENABLEMENT_STATUS_OPTIONS: {
  value: EnablementStatus;
  label: string;
}[] = (Object.entries(STATUS_CONFIG) as [EnablementStatus, { label: string }][]).map(
  ([value, { label }]) => ({ value, label }),
);
