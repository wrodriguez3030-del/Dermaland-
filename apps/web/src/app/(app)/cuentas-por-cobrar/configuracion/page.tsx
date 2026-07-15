"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  HelpText,
  Input,
  Label,
  Skeleton,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { SearchInput } from "@/components/ui/search-input";
import { useToast } from "@/components/ui/toast";
import { Save, ShieldAlert } from "lucide-react";
import type { Customer } from "@/types";
import { arApi, money, type ArSettings } from "@/features/receivables/receivables-client";

/**
 * Configuración de Cuentas por Cobrar: política del negocio (días por defecto,
 * bloqueo por límite, recordatorios) y crédito POR CLIENTE (límite, días,
 * bloqueo). Solo administradores pueden guardar la política (gate en la API).
 */
export default function ConfiguracionCxcPage() {
  const toast = useToast();
  const [settings, setSettings] = React.useState<ArSettings | null>(null);
  const [savingSettings, setSavingSettings] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [clients, setClients] = React.useState<Customer[] | null>(null);
  const [draft, setDraft] = React.useState<Record<string, { limit: string; days: string; blocked: boolean }>>({});
  const [savingId, setSavingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    arApi.settings().then(setSettings).catch((e) => toast.error(e instanceof Error ? e.message : "Error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => {
      fetch(`/api/customers${q.trim() ? `?search=${encodeURIComponent(q.trim())}` : ""}`)
        .then((r) => r.json())
        .then((j) => {
          const list: Customer[] = j.customers ?? [];
          setClients(list.slice(0, 50));
          setDraft((prev) => {
            const next = { ...prev };
            for (const c of list) {
              if (!next[c.id]) {
                next[c.id] = {
                  limit: c.creditLimit != null ? String(c.creditLimit) : "",
                  days: c.creditDays != null ? String(c.creditDays) : "",
                  blocked: !!c.creditBlocked,
                };
              }
            }
            return next;
          });
        })
        .catch(() => setClients([]));
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  async function saveSettings() {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const saved = await arApi.saveSettings(settings);
      setSettings(saved);
      toast.success("Configuración guardada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSavingSettings(false);
    }
  }

  async function saveClient(c: Customer) {
    const d = draft[c.id];
    if (!d) return;
    setSavingId(c.id);
    try {
      await arApi.updateCredit(c.id, {
        creditLimit: d.limit === "" ? null : Number(d.limit),
        creditDays: d.days === "" ? null : Number(d.days),
        creditBlocked: d.blocked,
      });
      toast.success(`Crédito de ${c.firstName} ${c.lastName} actualizado.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Configuración de cuentas por cobrar"
        description="Política de crédito del negocio y crédito por cliente."
        breadcrumbs={[{ label: "Cuentas por cobrar" }, { label: "Configuración" }]}
      />

      {!settings ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Política del negocio</CardTitle>
            <CardDescription>Aplica a toda venta que quede con saldo pendiente.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="cfg-days">Días de crédito por defecto</Label>
                <Input
                  id="cfg-days"
                  inputMode="numeric"
                  value={String(settings.defaultCreditDays)}
                  onChange={(e) =>
                    setSettings({ ...settings, defaultCreditDays: Number(e.target.value.replace(/\D/g, "") || 0) })
                  }
                />
                <HelpText>Se usa cuando el cliente no tiene días propios definidos.</HelpText>
              </div>
              <div className="flex items-start gap-3 pt-6">
                <input
                  id="cfg-block"
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={settings.blockOverLimit}
                  onChange={(e) => setSettings({ ...settings, blockOverLimit: e.target.checked })}
                />
                <div>
                  <Label htmlFor="cfg-block">Bloquear ventas que superen el límite de crédito</Label>
                  <HelpText>
                    Si está activo, el POS rechaza emitir a crédito cuando el saldo del cliente más la nueva
                    venta supera su límite.
                  </HelpText>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-black/5 bg-black/[0.02] p-3 text-xs opacity-70">
              <ShieldAlert className="mr-1 inline h-3.5 w-3.5" />
              Recordatorios configurados (días respecto al vencimiento):{" "}
              {settings.reminderOffsetsDays.map((d) => (d > 0 ? `+${d}` : `${d}`)).join(", ")}. El envío
              automático por correo/WhatsApp se activará cuando el canal de WhatsApp API esté conectado; por
              ahora las alertas viven en el dashboard y en Clientes con mora.
            </div>
            <Button size="sm" onClick={saveSettings} disabled={savingSettings}>
              <Save className="h-4 w-4" /> {savingSettings ? "Guardando…" : "Guardar política"}
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Crédito por cliente</CardTitle>
          <CardDescription>Límite en RD$, días de crédito y bloqueo individual.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SearchInput
            placeholder="Buscar cliente…"
            containerClassName="max-w-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          {clients === null ? (
            <Skeleton className="h-40 rounded-xl" />
          ) : clients.length === 0 ? (
            <p className="text-sm opacity-60">Sin clientes que coincidan.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <THead>
                  <TR>
                    <TH>Cliente</TH>
                    <TH>Límite (RD$)</TH>
                    <TH>Días</TH>
                    <TH>Bloqueado</TH>
                    <TH className="pr-4 text-right">Guardar</TH>
                  </TR>
                </THead>
                <TBody>
                  {clients.map((c) => {
                    const d = draft[c.id] ?? { limit: "", days: "", blocked: false };
                    return (
                      <TR key={c.id}>
                        <TD className="text-sm">
                          <div className="font-medium">{c.firstName} {c.lastName}</div>
                          <div className="text-xs opacity-60">
                            {c.phone ?? "—"}
                            {c.creditLimit != null ? ` · límite actual ${money(c.creditLimit)}` : ""}
                          </div>
                        </TD>
                        <TD>
                          <Input
                            className="w-32 text-right tabular-nums"
                            inputMode="decimal"
                            placeholder="Sin límite"
                            value={d.limit}
                            onChange={(e) =>
                              setDraft((p) => ({ ...p, [c.id]: { ...d, limit: e.target.value.replace(/[^\d.]/g, "") } }))
                            }
                          />
                        </TD>
                        <TD>
                          <Input
                            className="w-20 text-right tabular-nums"
                            inputMode="numeric"
                            placeholder="Default"
                            value={d.days}
                            onChange={(e) =>
                              setDraft((p) => ({ ...p, [c.id]: { ...d, days: e.target.value.replace(/\D/g, "") } }))
                            }
                          />
                        </TD>
                        <TD>
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={d.blocked}
                            onChange={(e) => setDraft((p) => ({ ...p, [c.id]: { ...d, blocked: e.target.checked } }))}
                            aria-label={`Bloquear crédito de ${c.firstName}`}
                          />
                        </TD>
                        <TD className="pr-4 text-right">
                          <Button size="sm" variant="outline" onClick={() => saveClient(c)} disabled={savingId === c.id}>
                            {savingId === c.id ? "…" : "Guardar"}
                          </Button>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
