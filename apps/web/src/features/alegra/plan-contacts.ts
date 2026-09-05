/**
 * Decide, contacto por contacto, si se crea una ficha, se enlaza a una
 * existente o no hay nada que hacer. PURO. Reglas (spec §5.2, decisión 4):
 *  1. `alegra_id` ya guardado → enlazar; si `updated_at` no cambió → skip.
 *  2. Teléfono/WhatsApp/correo normalizados → `pickClientMatch` (gana la más antigua).
 *  3. Documento normalizado igual.
 *  4. Nada → crear. Nunca por nombre solo. Una ficha ya enlazada a OTRO alegra_id
 *     no se reutiliza (Alegra puede tener dos contactos con el mismo número), y
 *     una ficha tomada por un contacto en esta corrida no se vuelve a tomar.
 * Al enlazar solo se rellenan campos VACÍOS de la ficha (`fill`); nunca se pisa
 * lo que escribió el mostrador.
 */
import { pickClientMatch, type ClientCandidate } from "@/features/customers/identity-match";
import { normalizeEmail, normalizePhone } from "@/features/customers/customer-normalization";
import { contactToClientDraft, isClient, type ClientDraft } from "./map-contact";
import type { AlegraContact } from "./types";

export interface ExistingClient extends ClientCandidate {
  alegraId: string | null;
  alegraUpdatedAt: string | null;
  documentNormalized: string | null;
  phone: string | null;
  email: string | null;
  documentNumber: string | null;
}

export type Fill = Partial<Pick<ClientDraft, "phone" | "whatsapp" | "email" | "documentType" | "documentNumber">>;

export type ContactAction =
  | { kind: "create"; draft: ClientDraft }
  | {
      kind: "link";
      clientId: string;
      draft: ClientDraft;
      fill: Fill;
      reason: "alegra_id" | "phone" | "email" | "document";
    }
  | { kind: "skip"; clientId: string; reason: "unchanged" };

function fillFor(existing: ExistingClient, draft: ClientDraft): Fill {
  const fill: Fill = {};
  if (!existing.phone && draft.phone) {
    fill.phone = draft.phone;
    fill.whatsapp = draft.whatsapp;
  }
  if (!existing.email && draft.email) fill.email = draft.email;
  if (!existing.documentNumber && draft.documentNumber) {
    fill.documentType = draft.documentType;
    fill.documentNumber = draft.documentNumber;
  }
  return fill;
}

export function planContacts(contacts: AlegraContact[], existing: ExistingClient[]): ContactAction[] {
  const byAlegraId = new Map(existing.filter((e) => e.alegraId).map((e) => [e.alegraId!, e]));
  const libres = existing.filter((e) => !e.alegraId);
  const byDocument = new Map(libres.filter((e) => e.documentNormalized).map((e) => [e.documentNormalized!, e]));
  const tomadas = new Set<string>();

  return contacts.filter(isClient).map((c): ContactAction => {
    const draft = contactToClientDraft(c);

    const ya = byAlegraId.get(draft.alegraId);
    if (ya) {
      const sinCambios = !!ya.alegraUpdatedAt && !!draft.alegraUpdatedAt && ya.alegraUpdatedAt >= draft.alegraUpdatedAt;
      if (sinCambios) return { kind: "skip", clientId: ya.id, reason: "unchanged" };
      return { kind: "link", clientId: ya.id, draft, fill: fillFor(ya, draft), reason: "alegra_id" };
    }

    const telefono = normalizePhone(draft.phone);
    const correo = normalizeEmail(draft.email);
    if (telefono || correo) {
      const candidatas = libres.filter(
        (e) =>
          !tomadas.has(e.id) &&
          ((!!telefono && (e.phoneDigits === telefono || e.whatsappDigits === telefono)) ||
            (!!correo && e.emailNormalized === correo)),
      );
      const match = pickClientMatch(candidatas, {
        fullName: `${draft.firstName} ${draft.lastName}`.trim(),
        phone: draft.phone ?? "",
        email: draft.email,
      });
      if (match) {
        tomadas.add(match.id);
        const elegida = candidatas.find((e) => e.id === match.id)!;
        const porTelefono = !!telefono && (elegida.phoneDigits === telefono || elegida.whatsappDigits === telefono);
        return { kind: "link", clientId: elegida.id, draft, fill: fillFor(elegida, draft), reason: porTelefono ? "phone" : "email" };
      }
    }

    if (draft.documentNumber) {
      const e = byDocument.get(draft.documentNumber);
      if (e && !tomadas.has(e.id)) {
        tomadas.add(e.id);
        return { kind: "link", clientId: e.id, draft, fill: fillFor(e, draft), reason: "document" };
      }
    }

    return { kind: "create", draft };
  });
}
