"use client";

import type { Proforma } from "@/types";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import { documentRouteBase } from "@/features/sales/document-label";
import {
  buildWhatsappShareUrl,
  normalizeWhatsappPhone,
} from "@/features/sales/proforma-share";
import { PROFORMA_BACKEND } from "@/features/sales/proforma-store";

/**
 * Comparte un documento de venta por WhatsApp con el PDF adjunto como enlace.
 *
 * - Modo supabase: pide al servidor (`/api/proformas/[id]/share/whatsapp`) el
 *   enlace firmado al PDF + el mensaje profesional, y abre WhatsApp Web.
 * - Modo local/demo: arma el mensaje con un enlace a la vista imprimible
 *   (Guardar como PDF) — no hay backend de PDF en modo local.
 *
 * Abre la pestaña de WhatsApp de forma síncrona (antes del await) para no ser
 * bloqueada por el navegador. Devuelve un error amigable si algo falla.
 */
export type ShareWhatsappResult = { ok: true } | { ok: false; error: string };

export async function shareProformaWhatsapp(
  p: Proforma,
): Promise<ShareWhatsappResult> {
  if (typeof window === "undefined") {
    return { ok: false, error: "No se pudo preparar el mensaje de WhatsApp." };
  }

  // Validación temprana de teléfono (mensaje claro, sin abrir pestañas).
  if (!normalizeWhatsappPhone(p.customerPhone)) {
    return { ok: false, error: "Este cliente no tiene teléfono/WhatsApp registrado." };
  }

  // Abrir la pestaña ya (gesto del usuario) y navegar luego del fetch.
  const win = window.open("", "_blank", "noopener,noreferrer");

  try {
    if (PROFORMA_BACKEND === "supabase") {
      const res = await fetch(`/api/proformas/${p.id}/share/whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = (await res.json().catch(() => ({}))) as {
        waUrl?: string;
        error?: string;
      };
      if (!res.ok || !body.waUrl) {
        win?.close();
        return {
          ok: false,
          error: body.error ?? "No se pudo preparar el mensaje de WhatsApp.",
        };
      }
      navigate(win, body.waUrl);
      return { ok: true };
    }

    // Modo local/demo: enlace a la vista imprimible (Guardar como PDF).
    const base = documentRouteBase(p);
    const pdfUrl = `${window.location.origin}${base}/${p.id}/print`;
    const waUrl = buildWhatsappShareUrl(p, mockBusiness, { pdfUrl });
    navigate(win, waUrl);
    return { ok: true };
  } catch {
    win?.close();
    return { ok: false, error: "No se pudo preparar el mensaje de WhatsApp." };
  }
}

function navigate(win: Window | null, url: string): void {
  if (win && !win.closed) {
    win.location.href = url;
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
