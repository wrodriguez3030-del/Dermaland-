"use client";

import * as React from "react";
import { Modal, Button, Input, Label, Textarea } from "@/components/ui";

export interface CatalogField {
  key: "name" | "country" | "description";
  label: string;
  type?: "text" | "textarea";
  required?: boolean;
}

export interface CatalogFormDialogProps {
  open: boolean;
  title: string;
  fields: CatalogField[];
  initial?: Record<string, string>;
  submitting?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (values: Record<string, string>) => void;
}

export function CatalogFormDialog({
  open, title, fields, initial, submitting, error, onClose, onSubmit,
}: CatalogFormDialogProps) {
  const [values, setValues] = React.useState<Record<string, string>>(initial ?? {});
  React.useEffect(() => { setValues(initial ?? {}); }, [initial, open]);

  return (
    <Modal
      open={open}
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button type="button" size="sm" disabled={submitting} onClick={() => onSubmit(values)}>
            {submitting ? "Guardando…" : "Guardar"}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{error}</div>
        )}
        {fields.map((f) => (
          <div key={f.key}>
            <Label>{f.label}{f.required ? " *" : ""}</Label>
            {f.type === "textarea" ? (
              <Textarea value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
            ) : (
              <Input value={values[f.key] ?? ""} onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))} />
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}
