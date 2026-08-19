"use client";

import * as React from "react";
import { X } from "lucide-react";

export interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** "lg" para contenido ancho (p. ej. el asistente de cierre de caja). */
  size?: "md" | "lg";
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  size = "md",
}: ModalProps) {
  React.useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={`relative z-10 w-full rounded-2xl bg-white shadow-xl ${
          size === "lg" ? "max-w-2xl" : "max-w-md"
        }`}
      >
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-lg p-1 opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Scroll propio: un contenido alto (asistente de cierre) no puede
            empujar el pie fuera de la pantalla en un móvil. */}
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-black/5 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}
