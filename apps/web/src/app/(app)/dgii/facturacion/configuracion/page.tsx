"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
} from "@/components/ui";
import { BillingDgiiWarning } from "@/components/dgii/billing-warning";
import { CheckCircle2, Lock } from "lucide-react";
import {
  useBillingSettings,
  saveBillingSettings,
  clampPercentage,
  type BillingSettings,
} from "@/features/billing/billing-settings-store";
import { canEditBillingSettings } from "@/features/billing/permissions";
import { mockCurrentUser } from "@/lib/mock-data/users";

/**
 * DGII / Facturación → Configuración de facturación.
 *
 * Sólo ADMIN edita (rol super_admin/admin). Para otros roles, los controles se
 * muestran en sólo lectura. Se guarda por business_id en el store de billing.
 */
export default function BillingConfigPage() {
  const settings = useBillingSettings();
  const isAdmin = canEditBillingSettings(mockCurrentUser.role);

  const [draft, setDraft] = React.useState<BillingSettings>(settings);
  const [saved, setSaved] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // Sincroniza el borrador cuando llega la config del store (hidratación).
  React.useEffect(() => setDraft(settings), [settings]);

  function set<K extends keyof BillingSettings>(key: K, value: BillingSettings[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(null);
  }

  const handleSave = () => {
    setError(null);
    const res = saveBillingSettings({
      defaultBillingMode: draft.defaultBillingMode,
      usageMode: draft.usageMode,
      ecfEnvironment: draft.ecfEnvironment,
      cardEcfImmediateEnabled: draft.cardEcfImmediateEnabled,
      cashTransferEcfClosingEnabled: draft.cashTransferEcfClosingEnabled,
      cashTransferEcfPercentage: draft.cashTransferEcfPercentage,
      cashTransferSelectionStrategy: draft.cashTransferSelectionStrategy,
    });
    if (res.ok) {
      setSaved(new Date().toLocaleTimeString("es-DO"));
    } else {
      setError(res.error);
    }
  };

  const disabled = !isAdmin;

  return (
    <>
      <PageHeader
        title="Configuración de facturación"
        description="Forma de facturación, reglas automáticas y porcentaje e-CF de cierre. Solo ADMIN puede editar."
        breadcrumbs={[
          { label: "DGII / Facturación", href: "/dgii" },
          { label: "Configuración de facturación" },
        ]}
        actions={
          <Button size="sm" onClick={handleSave} disabled={disabled}>
            Guardar
          </Button>
        }
      />

      <BillingDgiiWarning />

      {!isAdmin && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-black/10 bg-black/[0.03] p-3 text-sm">
          <Lock className="h-4 w-4 opacity-60" />
          Solo lectura: tu rol (<strong>{mockCurrentUser.role}</strong>) no puede
          editar la configuración de facturación.
        </div>
      )}
      {saved && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4" /> Configuración guardada · {saved}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Forma de facturación</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Forma de facturación principal">
              <Select
                value={draft.defaultBillingMode}
                disabled={disabled}
                onChange={(e) =>
                  set("defaultBillingMode", e.target.value as BillingSettings["defaultBillingMode"])
                }
              >
                <option value="ncf">NCF tradicional</option>
                <option value="ecf">e-CF electrónico</option>
                <option value="both">Ambos</option>
              </Select>
            </Field>
            <Field label="Modo de uso">
              <Select
                value={draft.usageMode}
                disabled={disabled}
                onChange={(e) =>
                  set("usageMode", e.target.value as BillingSettings["usageMode"])
                }
              >
                <option value="manual">Manual · el usuario elige en cada factura</option>
                <option value="automatic">Automático · el sistema selecciona según reglas</option>
              </Select>
            </Field>
            <Field label="Tipo automático consumidor final">
              <div className="flex items-center gap-2">
                <Badge tone="neutral">E32</Badge>
                <span className="text-sm opacity-70">e-CF Consumo</span>
              </div>
            </Field>
            <Field label="Tipo automático cliente con RNC">
              <div className="flex items-center gap-2">
                <Badge tone="neutral">E31</Badge>
                <span className="text-sm opacity-70">e-CF Crédito Fiscal</span>
              </div>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ambiente e-CF</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Ambiente e-CF">
              <Select
                value={draft.ecfEnvironment}
                disabled={disabled}
                onChange={(e) =>
                  set("ecfEnvironment", e.target.value as BillingSettings["ecfEnvironment"])
                }
              >
                <option value="mock">mock · demo (no consume secuencia)</option>
                <option value="demo">demo</option>
                <option value="testecf">testecf · pruebas DGII</option>
                <option value="certecf">certecf · certificación DGII</option>
                <option value="produccion">producción (requiere autorización)</option>
              </Select>
            </Field>
            <EnvBadge env={draft.ecfEnvironment} />
            <div className="rounded-lg border border-black/10 bg-black/[0.02] p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="opacity-70">Emisión real DGII</span>
                <Badge tone={settings.realEmissionEnabled ? "danger" : "neutral"}>
                  {settings.realEmissionEnabled ? "ACTIVA" : "APAGADA"}
                </Badge>
              </div>
              <p className="mt-2 opacity-70">
                Bloqueada por diseño en mock/demo. Solo se puede activar en
                ambiente <code className="font-mono">producción</code> con
                certificado y rango autorizados.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Reglas por método de pago</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Toggle
              label="Generar e-CF automático en pagos con tarjeta"
              checked={draft.cardEcfImmediateEnabled}
              disabled={disabled}
              onChange={(v) => set("cardEcfImmediateEnabled", v)}
              hint="Default: Sí"
            />
            <Toggle
              label="Generar e-CF al cierre para efectivo / transferencia"
              checked={draft.cashTransferEcfClosingEnabled}
              disabled={disabled}
              onChange={(v) => set("cashTransferEcfClosingEnabled", v)}
              hint="Default: Sí"
            />
            <Field label="Estrategia de selección de ventas para cierre">
              <Select
                value={draft.cashTransferSelectionStrategy}
                disabled={disabled}
                onChange={(e) =>
                  set(
                    "cashTransferSelectionStrategy",
                    e.target.value as BillingSettings["cashTransferSelectionStrategy"],
                  )
                }
              >
                <option value="last">Últimas ventas del día (default)</option>
                <option value="first">Primeras ventas del día</option>
                <option value="manual">Selección manual</option>
              </Select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Porcentaje e-CF de cierre</CardTitle>
            <p className="mt-1 text-xs opacity-60">
              Para ventas en efectivo / transferencia en el cierre de caja. Solo
              ADMIN. El cajero no puede modificarlo desde el cierre.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Porcentaje (0% a 100%)">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  disabled={disabled}
                  value={draft.cashTransferEcfPercentage}
                  onChange={(e) =>
                    set(
                      "cashTransferEcfPercentage",
                      clampPercentage(Number(e.target.value)),
                    )
                  }
                  className="h-10 w-28 rounded-lg border border-black/15 px-3 text-right tabular-nums disabled:opacity-60"
                />
                <span className="text-lg font-semibold">%</span>
                <span className="text-xs opacity-60">Default sugerido: 15%</span>
              </div>
            </Field>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Se guarda en <code className="font-mono">billing_settings.cash_transfer_ecf_percentage</code>.
              Al cerrar caja se copia a <code className="font-mono">cash_closings.ecf_percentage</code>;
              cambiarlo después no altera cierres anteriores.
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="mt-6 rounded-2xl border border-black/10 bg-white p-4 text-xs opacity-80">
        Las numeraciones reales NCF/e-CF solo deben usarse con autorización DGII,
        certificado válido y rango autorizado. Los ambientes mock/demo nunca
        consumen secuencia fiscal real.
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  disabled,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span className="text-sm">
        {label}
        {hint && <span className="ml-2 text-xs opacity-50">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 accent-[color:var(--brand-primary)] disabled:opacity-60"
      />
    </label>
  );
}

function EnvBadge({ env }: { env: BillingSettings["ecfEnvironment"] }) {
  const map: Record<
    BillingSettings["ecfEnvironment"],
    { tone: "neutral" | "warning" | "success" | "danger"; text: string }
  > = {
    mock: { tone: "neutral", text: "mock · sin secuencia fiscal" },
    demo: { tone: "neutral", text: "demo · sin secuencia fiscal" },
    testecf: { tone: "warning", text: "testecf · pruebas" },
    certecf: { tone: "warning", text: "certecf · certificación" },
    produccion: { tone: "danger", text: "producción · requiere autorización" },
  };
  const v = map[env];
  return <Badge tone={v.tone}>{v.text}</Badge>;
}
