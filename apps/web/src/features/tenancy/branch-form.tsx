"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui";
import { FormSection } from "@/components/ui/filter-bar";
import { useToast } from "@/components/ui/toast";
import { saveBranch } from "@/features/tenancy/branch-store";
import type { Branch } from "@/types";

interface BranchFormProps {
  mode: "create" | "edit";
  branch?: Branch;
}

/** Formulario único de sucursal (crear / editar). */
export function BranchForm({ mode, branch }: BranchFormProps) {
  const router = useRouter();
  const toast = useToast();

  const [name, setName] = React.useState(branch?.name ?? "");
  const [code, setCode] = React.useState(branch?.code ?? "");
  const [address, setAddress] = React.useState(branch?.address ?? "");
  const [city, setCity] = React.useState(branch?.city ?? "");
  const [province, setProvince] = React.useState(branch?.province ?? "");
  const [phone, setPhone] = React.useState(branch?.phone ?? "");
  const [email, setEmail] = React.useState(branch?.email ?? "");
  const [status, setStatus] = React.useState<"active" | "inactive">(
    branch?.status ?? "active",
  );
  const [showOnWebsite, setShowOnWebsite] = React.useState(
    branch?.showOnWebsite ?? false,
  );
  const [isPilot, setIsPilot] = React.useState(branch?.isPilot ?? false);

  const [error, setError] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = React.useState(false);
  const isMissing = (k: string) => missing.has(k);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const payload = {
      name,
      code,
      address,
      city,
      province,
      phone: phone || undefined,
      email: email || undefined,
      showOnWebsite,
      isPilot,
      status,
    };

    const res = await saveBranch(mode, payload, branch?.id);

    setSubmitting(false);
    if (!res.ok) {
      setMissing(new Set(res.missingFields ?? []));
      setError(res.error);
      return;
    }
    setMissing(new Set());
    toast.success(
      mode === "create" ? "Sucursal creada." : "Cambios guardados.",
    );
    setTimeout(() => router.push(`/admin/sucursales/${res.branch.id}`), 600);
  };

  return (
    <form onSubmit={submit} noValidate>
      <div className="mb-6 flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => router.back()}
          disabled={submitting}
        >
          Cancelar
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting
            ? "Guardando…"
            : mode === "create"
              ? "Crear sucursal"
              : "Guardar cambios"}
        </Button>
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-rose-900">
          <AlertTriangle className="mt-0.5 h-5 w-5" />
          <div className="text-sm">{error}</div>
        </div>
      )}

      <Card>
        <CardContent>
          <FormSection title="Identidad" description="Nombre y código únicos de la sucursal.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Nombre *</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="DermaLand Santiago"
                  className={isMissing("name") ? "border-rose-400" : undefined}
                />
              </div>
              <div>
                <Label>Código *</Label>
                <Input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="STG-01"
                  className={isMissing("code") ? "border-rose-400" : undefined}
                />
              </div>
            </div>
          </FormSection>

          <FormSection title="Ubicación" description="Dirección visible en recibos y comprobantes.">
            <div>
              <Label>Dirección</Label>
              <Textarea value={address} onChange={(e) => setAddress(e.target.value)} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Ciudad</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div>
                <Label>Provincia</Label>
                <Input value={province} onChange={(e) => setProvince(e.target.value)} />
              </div>
            </div>
          </FormSection>

          <FormSection title="Contacto">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Teléfono</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
          </FormSection>

          <FormSection title="Estado y visibilidad">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Estado</Label>
                <Select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as "active" | "inactive")}
                >
                  <option value="active">Activa</option>
                  <option value="inactive">Inactiva</option>
                </Select>
              </div>
              <div className="flex flex-col justify-center gap-2 pt-5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={showOnWebsite}
                    onChange={(e) => setShowOnWebsite(e.target.checked)}
                  />
                  Visible en sitio web
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={isPilot}
                    onChange={(e) => setIsPilot(e.target.checked)}
                  />
                  Sucursal piloto / principal
                </label>
              </div>
            </div>
          </FormSection>
        </CardContent>
      </Card>

      <toast.Toast />
    </form>
  );
}
