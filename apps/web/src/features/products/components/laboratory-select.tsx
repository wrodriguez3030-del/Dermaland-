"use client";

import * as React from "react";
import { Plus, X, Check, FlaskConical } from "lucide-react";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { saveLaboratory } from "@/features/products/catalog-store";
import {
  normalizeLabName,
  laboratoryTypeByName,
} from "@/lib/mock-data/laboratory-seed";
import type { Laboratory } from "@/types";

export interface LaboratorySelectProps {
  /** id del laboratorio seleccionado; "" = ninguno. */
  value: string;
  onChange: (id: string) => void;
  laboratories: Laboratory[];
  disabled?: boolean;
}

/** Subtítulo "País · Tipo" de un laboratorio (tipo conocido o por defecto). */
function labSubtitle(lab: Laboratory): string {
  const type = lab.type ?? laboratoryTypeByName(lab.name) ?? "Laboratorio";
  return [lab.country, type].filter(Boolean).join(" · ");
}

/**
 * Selector de Laboratorio para el modal de stock. El buscador SIEMPRE inicia en
 * blanco (aunque haya selección), el menú es amplio (≥420px, alto 360px con
 * scroll) y muestra Nombre + País · Tipo. Permite crear laboratorio sin salir
 * del modal (Nombre*, País, Tipo, Nota) con dedup case/acento-insensitive.
 */
export function LaboratorySelect({
  value,
  onChange,
  laboratories,
  disabled,
}: LaboratorySelectProps) {
  const toast = useToast();
  const selected = laboratories.find((l) => l.id === value) ?? null;

  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLDivElement>(null);

  // Cierra al hacer click fuera y deja el buscador en blanco.
  React.useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const nq = normalizeLabName(query);
  const filtered = React.useMemo(() => {
    const base = nq
      ? laboratories.filter((l) => normalizeLabName(l.name).includes(nq))
      : [...laboratories];
    return base.sort((a, b) => {
      if (nq) {
        const na = normalizeLabName(a.name);
        const nb = normalizeLabName(b.name);
        const ra = na === nq ? 0 : na.startsWith(nq) ? 1 : 2;
        const rb = nb === nq ? 0 : nb.startsWith(nq) ? 1 : 2;
        if (ra !== rb) return ra - rb;
      }
      return a.name.localeCompare(b.name);
    });
  }, [laboratories, nq]);

  const exactExists = !!nq && laboratories.some((l) => normalizeLabName(l.name) === nq);

  function selectOption(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  // ── Alta rápida ─────────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen] = React.useState(false);
  const [createName, setCreateName] = React.useState("");
  const [createCountry, setCreateCountry] = React.useState("");
  const [createType, setCreateType] = React.useState("");
  const [createNote, setCreateNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [modalError, setModalError] = React.useState<string | null>(null);

  function openCreate() {
    setCreateName(query.trim());
    setCreateCountry("");
    setCreateType("");
    setCreateNote("");
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
    if (laboratories.some((l) => normalizeLabName(l.name) === normalizeLabName(name))) {
      setModalError("Este laboratorio ya existe.");
      return;
    }
    setSubmitting(true);
    setModalError(null);
    try {
      const r = await saveLaboratory("create", {
        name,
        country: createCountry.trim() || undefined,
      });
      if (!r.ok) {
        setModalError(
          /duplicad|ya existe/i.test(r.error)
            ? "Este laboratorio ya existe."
            : "No se pudo crear el laboratorio. Intenta nuevamente.",
        );
        return;
      }
      onChange(r.item.id); // queda seleccionado automáticamente
      setQuery("");
      setModalOpen(false);
      toast.success("Laboratorio creado correctamente.");
    } catch {
      setModalError("No se pudo crear el laboratorio. Intenta nuevamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Label>Laboratorio</Label>
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <input
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-label="Buscar laboratorio"
            className="h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-sm placeholder:text-black/40 focus:border-[color:var(--brand-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-primary)]/20 disabled:opacity-60"
            placeholder="Buscar laboratorio..."
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
              role="listbox"
              className="absolute z-30 mt-1 max-h-[360px] w-full min-w-[420px] max-w-[90vw] overflow-auto rounded-lg border border-black/10 bg-white py-1 text-sm shadow-xl"
            >
              <li
                role="option"
                aria-selected={value === ""}
                className="cursor-pointer px-3 py-2 text-black/50 hover:bg-black/5"
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectOption("");
                }}
              >
                — Sin laboratorio —
              </li>
              {filtered.map((l) => (
                <li
                  key={l.id}
                  role="option"
                  aria-selected={l.id === value}
                  className="cursor-pointer px-3 py-2 hover:bg-[color:var(--brand-primary)]/10"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectOption(l.id);
                  }}
                >
                  <div className="font-medium leading-tight">{l.name}</div>
                  <div className="text-xs leading-tight text-black/55">
                    {labSubtitle(l)}
                  </div>
                </li>
              ))}
              {nq !== "" && filtered.length === 0 && (
                <li className="px-3 py-2 text-black/60">Sin resultados</li>
              )}
              {nq !== "" && !exactExists && (
                <li
                  role="option"
                  aria-selected={false}
                  className="flex cursor-pointer items-center gap-2 border-t border-black/5 px-3 py-2 font-medium text-[color:var(--brand-accent)] hover:bg-[color:var(--brand-primary)]/10"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    openCreate();
                  }}
                >
                  <Plus className="h-4 w-4" /> Crear laboratorio “{query.trim()}”
                </li>
              )}
            </ul>
          )}
        </div>
        <Button
          type="button"
          variant="primary"
          size="icon"
          title="Crear laboratorio"
          aria-label="Crear laboratorio"
          disabled={disabled}
          onClick={openCreate}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {selected && (
        <div className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full bg-[color:var(--brand-primary)]/10 px-3 py-1 text-xs">
          <FlaskConical className="h-3.5 w-3.5 text-[color:var(--brand-accent)]" />
          <span className="truncate font-medium">{selected.name}</span>
          <span className="truncate text-black/50">· {labSubtitle(selected)}</span>
          {!disabled && (
            <button
              type="button"
              aria-label="Quitar laboratorio"
              className="ml-1 rounded-full p-0.5 hover:bg-black/10"
              onClick={() => {
                onChange("");
                setQuery("");
              }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      <Modal
        open={modalOpen}
        title="Nuevo laboratorio"
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
            <Label htmlFor="lab-create-name">Nombre *</Label>
            <Input
              id="lab-create-name"
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="lab-create-country">País</Label>
              <Input
                id="lab-create-country"
                value={createCountry}
                placeholder="República Dominicana"
                onChange={(e) => setCreateCountry(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="lab-create-type">Tipo</Label>
              <Input
                id="lab-create-type"
                value={createType}
                placeholder="Dermocosmética, Farmacéutica…"
                onChange={(e) => setCreateType(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="lab-create-note">Nota</Label>
            <Textarea
              id="lab-create-note"
              value={createNote}
              placeholder="Opcional"
              onChange={(e) => setCreateNote(e.target.value)}
            />
          </div>
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
