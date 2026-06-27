"use client";

import * as React from "react";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from "@/components/ui";
import { CheckCircle2, ClipboardList } from "lucide-react";
import {
  simulateEcfFlow,
  type EcfState,
} from "@/features/billing/ecf-lifecycle";
import { useBillingSettings } from "@/features/billing/billing-settings-store";
import {
  appendSimulatedFlowLogs,
  type DgiiLogAction,
  type DgiiLogStatus,
} from "@/features/billing/dgii-logs-store";

const STATE_TO_LOG: Partial<
  Record<EcfState, { action: DgiiLogAction; status: DgiiLogStatus }>
> = {
  generado_xml: { action: "generar_xml", status: "ok" },
  firmado: { action: "firmar", status: "ok" },
  enviado_dgii: { action: "enviar_dgii", status: "info" },
  recibido_dgii: { action: "consultar_estado", status: "ok" },
  aceptado: { action: "consultar_estado", status: "ok" },
  rechazado: { action: "consultar_estado", status: "rechazado" },
  pendiente: { action: "consultar_estado", status: "pendiente" },
  enviado_receptor: { action: "enviar_receptor", status: "ok" },
  acuse_recibido: { action: "guardar_acuse", status: "ok" },
  almacenado: { action: "generar_ri", status: "ok" },
};

/**
 * Visualiza el flujo de estados e-CF (documento DGII §12) en modo mock/demo.
 * Ningún paso toca DGII real ni consume secuencia fiscal real.
 */
export function EcfLifecycleTrace({
  ecfNumber,
  outcome = "aceptado",
}: {
  ecfNumber: string;
  outcome?: "aceptado" | "rechazado" | "pendiente";
}) {
  const settings = useBillingSettings();
  const flow = React.useMemo(
    () => simulateEcfFlow({ ecfNumber, settings, outcome }),
    [ecfNumber, settings, outcome],
  );

  const [logged, setLogged] = React.useState(false);
  const registrarEnLogs = () => {
    const entries = flow.steps
      .map((step) => {
        const map = STATE_TO_LOG[step.state];
        if (!map) return null;
        return { action: map.action, status: map.status, message: step.detail };
      })
      .filter((e): e is NonNullable<typeof e> => e !== null);
    appendSimulatedFlowLogs(ecfNumber, settings.ecfEnvironment, entries);
    setLogged(true);
  };

  const tone = (s: EcfState): "success" | "danger" | "warning" | "neutral" =>
    s === "almacenado" || s === "aceptado"
      ? "success"
      : s === "rechazado"
        ? "danger"
        : s === "pendiente"
          ? "warning"
          : "neutral";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Flujo e-CF (demo)</CardTitle>
        <p className="mt-1 text-xs opacity-60">
          Track id demo <code className="font-mono">{flow.demoTrackId}</code> ·
          envío SIMULADO · no consume secuencia fiscal real.
        </p>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-3 border-l border-black/10 pl-5">
          {flow.steps.map((step, i) => (
            <li key={i} className="relative">
              <span className="absolute -left-[1.42rem] top-1 flex h-3 w-3 items-center justify-center rounded-full bg-[color:var(--brand-primary)]" />
              <div className="flex items-center gap-2">
                <Badge tone={tone(step.state)}>{step.label}</Badge>
              </div>
              <p className="mt-0.5 text-xs opacity-70">{step.detail}</p>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-2 text-xs text-emerald-900">
          <CheckCircle2 className="h-4 w-4" />
          Estado final: <strong>{flow.steps.at(-1)?.label}</strong> · modo mock
        </div>
        <Button
          size="sm"
          variant="outline"
          className="mt-3"
          onClick={registrarEnLogs}
          disabled={logged}
        >
          <ClipboardList className="h-4 w-4" />
          {logged ? "Registrado en Logs DGII" : "Registrar flujo en Logs DGII (demo)"}
        </Button>
      </CardContent>
    </Card>
  );
}
