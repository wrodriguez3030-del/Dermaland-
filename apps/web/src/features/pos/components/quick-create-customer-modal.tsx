"use client";

import * as React from "react";
import { Button, Input, Label, Modal, Select } from "@/components/ui";
import { saveCustomer } from "@/features/customers/customer-store";
import type { Customer, CustomerSkinType } from "@/types";

/**
 * Alta rápida de cliente desde el POS — el cliente es obligatorio para
 * facturar. Al crear con éxito, devuelve el cliente para que el POS lo
 * seleccione automáticamente y permita cobrar.
 *
 * Campos: nombre (obligatorio), apellido (obligatorio en el modelo), teléfono
 * (obligatorio), documento/email/tipo de piel opcionales. Funciona en modo
 * local y Supabase vía `saveCustomer` (despacha al backend activo).
 */

const SKIN_TYPES: { value: CustomerSkinType; label: string }[] = [
  { value: "not_specified", label: "Sin especificar" },
  { value: "normal", label: "Normal" },
  { value: "dry", label: "Seca" },
  { value: "oily", label: "Grasa" },
  { value: "combination", label: "Mixta" },
  { value: "sensitive", label: "Sensible" },
  { value: "acne_prone", label: "Acnéica" },
  { value: "mature", label: "Madura" },
  { value: "hyperpigmentation", label: "Hiperpigmentación" },
  { value: "rosacea_reactive", label: "Rosácea / reactiva" },
];

export function QuickCreateCustomerModal({
  open,
  onClose,
  onCreated,
  initialQuery = "",
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (customer: Customer) => void;
  /** Texto de búsqueda previo para prellenar el nombre. */
  initialQuery?: string;
}) {
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [documentType, setDocumentType] = React.useState<"cedula" | "rnc" | "passport">("cedula");
  const [documentNumber, setDocumentNumber] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [skinType, setSkinType] = React.useState<CustomerSkinType>("not_specified");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Prellenar el nombre con el texto buscado al abrir.
  React.useEffect(() => {
    if (open) {
      const parts = initialQuery.trim().split(/\s+/);
      setFirstName(parts[0] ?? "");
      setLastName(parts.slice(1).join(" "));
      setPhone("");
      setDocumentNumber("");
      setEmail("");
      setSkinType("not_specified");
      setError(null);
    }
  }, [open, initialQuery]);

  const handleSave = async () => {
    setError(null);
    if (!firstName.trim()) {
      setError("El nombre del cliente es obligatorio.");
      return;
    }
    if (!lastName.trim()) {
      setError("El apellido del cliente es obligatorio.");
      return;
    }
    if (!phone.trim()) {
      setError("El teléfono del cliente es obligatorio.");
      return;
    }
    setSaving(true);
    try {
      const res = await saveCustomer("create", {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        documentType,
        documentNumber: documentNumber.trim() || undefined,
        email: email.trim() || undefined,
        skinType,
        defaultBillingType: documentType === "rnc" ? "credito_fiscal" : "consumo",
        source: "manual",
      });
      if (!res.ok) {
        setError(res.error || "No se pudo crear el cliente. Verifica los datos.");
        return;
      }
      onCreated(res.customer);
      onClose();
    } catch {
      setError("No se pudo crear el cliente. Verifica los datos.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Nuevo cliente">
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Nombre *</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Apellido *</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Teléfono *</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="809-000-0000"
            inputMode="tel"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Tipo de documento</Label>
            <Select
              value={documentType}
              onChange={(e) => setDocumentType(e.target.value as "cedula" | "rnc" | "passport")}
            >
              <option value="cedula">Cédula</option>
              <option value="rnc">RNC</option>
              <option value="passport">Pasaporte</option>
            </Select>
          </div>
          <div>
            <Label>Documento (opcional)</Label>
            <Input
              value={documentNumber}
              onChange={(e) => setDocumentNumber(e.target.value)}
            />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Email (opcional)</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} inputMode="email" />
          </div>
          <div>
            <Label>Tipo de piel (opcional)</Label>
            <Select
              value={skinType}
              onChange={(e) => setSkinType(e.target.value as CustomerSkinType)}
            >
              {SKIN_TYPES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-2 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Guardando…" : "Crear y seleccionar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
