"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";

export interface CreatableOption {
  id: string;
  name: string;
}

export interface ExtraCreateField {
  /** Clave que se devuelve en `onCreate` (p. ej. "description", "country"). */
  key: string;
  label: string;
  type?: "text" | "textarea";
  placeholder?: string;
}

export type CreateResult =
  | { ok: true; item: CreatableOption }
  | { ok: false; error: string };

export interface CreatableClassificationSelectProps {
  label: string;
  /** id seleccionado; "" = ninguno. */
  value: string;
  onChange: (id: string) => void;
  options: CreatableOption[];
  placeholder: string;
  /** Nombre de la entidad en minúscula para mensajes/aria (p. ej. "marca"). */
  entityName: string;
  /** Título del modal de alta (p. ej. "Crear marca"). */
  createTitle: string;
  /** Tooltip / aria-label del botón + (p. ej. "Crear marca"). */
  createTooltip: string;
  /** Toast de éxito (p. ej. "Marca creada correctamente."). */
  createdToast: string;
  /** Campos extra del modal además del nombre (descripción, país, …). */
  extraFields?: ExtraCreateField[];
  onCreate: (
    values: { name: string } & Record<string, string>,
  ) => Promise<CreateResult>;
  disabled?: boolean;
}

/**
 * Select de clasificación con buscador + botón "+" para crear el registro sin
 * salir del formulario de producto. Reutilizable para Marca / Categoría /
 * Laboratorio. El alta se delega a `onCreate` (que persiste en Supabase vía los
 * wrappers del catálogo, respetando RLS/business_id) y al crear queda
 * seleccionado automáticamente.
 */
export function CreatableClassificationSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
  entityName,
  createTitle,
  createTooltip,
  createdToast,
  extraFields = [],
  onCreate,
  disabled,
}: CreatableClassificationSelectProps) {
  const toast = useToast();
  const selected = options.find((o) => o.id === value) ?? null;

  // ── Combobox (buscador) ────────────────────────────────────────────────────
  const [query, setQuery] = React.useState(selected?.name ?? "");
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Sincroniza el texto cuando cambia la selección desde afuera (p. ej. al
  // crear un registro nuevo y autoseleccionarlo).
  React.useEffect(() => {
    setQuery(selected?.name ?? "");
  }, [selected?.name]);

  // Cierra el dropdown al hacer click fuera.
  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery(selected?.name ?? "");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open, selected?.name]);

  // Normaliza para buscar sin distinguir acentos ni mayúsculas (UX en español:
  // "avene" encuentra "Avène").
  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
  const normQuery = norm(query);
  const showingAll = normQuery === "" || normQuery === norm(selected?.name ?? "");
  const filtered = showingAll
    ? options
    : options.filter((o) => norm(o.name).includes(normQuery));

  function selectOption(id: string, name: string) {
    onChange(id);
    setQuery(name);
    setOpen(false);
  }

  // ── Modal de alta rápida ───────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [extraValues, setExtraValues] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [modalError, setModalError] = React.useState<string | null>(null);

  function openCreateModal() {
    // Prellena el nombre con lo que el usuario venía escribiendo (si no es la
    // selección actual): si buscó "Eucerin" y no existe, el modal ya lo trae.
    const prefill = showingAll ? "" : query.trim();
    setCreateName(prefill);
    setExtraValues({});
    setModalError(null);
    setModalOpen(true);
    setOpen(false);
  }

  async function submitCreate() {
    const name = createName.trim();
    if (!name) {
      setModalError("El nombre es obligatorio.");
      return;
    }
    // Duplicado por nombre (case-insensitive) contra las opciones ya visibles
    // del mismo negocio; el servidor además lo garantiza por business_id.
    if (options.some((o) => o.name.trim().toLowerCase() === name.toLowerCase())) {
      setModalError("Ya existe un registro con ese nombre.");
      return;
    }
    setSubmitting(true);
    setModalError(null);
    try {
      const trimmedExtras: Record<string, string> = {};
      for (const f of extraFields) {
        const v = (extraValues[f.key] ?? "").trim();
        if (v) trimmedExtras[f.key] = v;
      }
      const res = await onCreate({ name, ...trimmedExtras });
      if (!res.ok) {
        setModalError(
          /duplicad|ya existe/i.test(res.error)
            ? "Ya existe un registro con ese nombre."
            : res.error,
        );
        return;
      }
      selectOption(res.item.id, res.item.name);
      setModalOpen(false);
      toast.success(createdToast);
    } catch (e) {
      setModalError((e as Error).message || "No se pudo crear. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  const listboxId = `cls-${entityName}-listbox`;

  return (
    <div ref={rootRef} className="relative">
      <Label>{label}</Label>
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <input
            role="combobox"
            aria-expanded={open}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-label={`Buscar o seleccionar ${entityName}`}
            className="h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-sm placeholder:text-black/40 focus:border-[color:var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-primary)]/20 disabled:opacity-60"
            placeholder={placeholder}
            value={query}
            disabled={disabled}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
          {open && (
            <ul
              id={listboxId}
              role="listbox"
              className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-black/10 bg-white py-1 shadow-lg"
            >
              <li
                role="option"
                aria-selected={value === ""}
                className="cursor-pointer px-3 py-1.5 text-sm text-black/50 hover:bg-black/5"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOption("", "");
                }}
              >
                — Sin {entityName} —
              </li>
              {filtered.map((o) => (
                <li
                  key={o.id}
                  role="option"
                  aria-selected={o.id === value}
                  className="cursor-pointer px-3 py-1.5 text-sm hover:bg-[color:var(--brand-primary)]/10"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectOption(o.id, o.name);
                  }}
                >
                  {o.name}
                </li>
              ))}
              {!showingAll && filtered.length === 0 && (
                <li className="px-3 py-2 text-sm text-black/60">
                  No existe. Puedes crearla con +
                </li>
              )}
            </ul>
          )}
        </div>
        <Button
          type="button"
          variant="primary"
          size="icon"
          title={createTooltip}
          aria-label={createTooltip}
          disabled={disabled}
          onClick={openCreateModal}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <Modal
        open={modalOpen}
        title={createTitle}
        onClose={() => setModalOpen(false)}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={submitCreate} disabled={submitting}>
              {submitting ? "Creando…" : "Crear"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor={`cls-${entityName}-name`}>Nombre *</Label>
            <Input
              id={`cls-${entityName}-name`}
              value={createName}
              autoFocus
              onChange={(e) => setCreateName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void submitCreate();
                }
              }}
            />
          </div>
          {extraFields.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`cls-${entityName}-${f.key}`}>{f.label}</Label>
              {f.type === "textarea" ? (
                <Textarea
                  id={`cls-${entityName}-${f.key}`}
                  placeholder={f.placeholder}
                  value={extraValues[f.key] ?? ""}
                  onChange={(e) =>
                    setExtraValues((s) => ({ ...s, [f.key]: e.target.value }))
                  }
                />
              ) : (
                <Input
                  id={`cls-${entityName}-${f.key}`}
                  placeholder={f.placeholder}
                  value={extraValues[f.key] ?? ""}
                  onChange={(e) =>
                    setExtraValues((s) => ({ ...s, [f.key]: e.target.value }))
                  }
                />
              )}
            </div>
          ))}
          {modalError && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {modalError}
            </p>
          )}
        </div>
      </Modal>
      <toast.Toast />
    </div>
  );
}
