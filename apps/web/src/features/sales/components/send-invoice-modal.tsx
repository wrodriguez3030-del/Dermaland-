"use client";

import * as React from "react";
import { MessageCircle, Mail, Copy, ExternalLink } from "lucide-react";
import { Button, Input, Label, Textarea } from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import type { Proforma } from "@/types";
import { mockBusiness } from "@/lib/mock-data/tenancy";
import { documentRouteBase, getDocumentDisplayInfo } from "@/features/sales/document-label";
import {
  buildWhatsappShareMessage,
  buildEmailShareMessage,
  buildEmailSubject,
  normalizeWhatsappPhone,
} from "@/features/sales/proforma-share";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Modal común "Enviar factura" por WhatsApp o Correo. Todo cliente-side:
 *  - WhatsApp: normaliza el teléfono (RD → 1XXXXXXXXXX) y abre wa.me con el
 *    mensaje. Si el cliente no tiene teléfono, el usuario lo escribe aquí.
 *  - Correo: abre el cliente de correo (mailto:) con asunto + cuerpo, o copia el
 *    enlace. No requiere provider (si más adelante hay backend, se conecta aquí).
 *
 * El enlace apunta a la vista imprimible, que lee el documento desde Supabase
 * (no localStorage) y respeta el tipo (B0x NCF sin e-CF, e-CF con e-CF, proforma).
 */
export function SendInvoiceModal({
  proforma,
  open,
  onClose,
  initialTab = "whatsapp",
}: {
  proforma: Proforma | null;
  open: boolean;
  onClose: () => void;
  initialTab?: "whatsapp" | "email";
}) {
  const toast = useToast();
  const [tab, setTab] = React.useState<"whatsapp" | "email">(initialTab);
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [phoneErr, setPhoneErr] = React.useState(false);
  const [emailErr, setEmailErr] = React.useState(false);

  const link =
    typeof window !== "undefined" && proforma
      ? `${window.location.origin}${documentRouteBase(proforma)}/${proforma.id}/print`
      : "";

  // Precargar datos cuando se abre para un documento.
  React.useEffect(() => {
    if (!open || !proforma) return;
    setTab(initialTab);
    setPhone(proforma.customerPhone ?? "");
    setEmail("");
    setPhoneErr(false);
    setEmailErr(false);
    setSubject(buildEmailSubject(proforma, mockBusiness));
    setMessage(buildEmailShareMessage(proforma, mockBusiness, { pdfUrl: link }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, proforma?.id]);

  if (!open || !proforma) return null;

  const doc = getDocumentDisplayInfo(proforma);
  const waMessage = buildWhatsappShareMessage(proforma, mockBusiness, { pdfUrl: link });

  const openWhatsapp = () => {
    const normalized = normalizeWhatsappPhone(phone);
    if (!normalized) {
      setPhoneErr(true);
      toast.error("Ingresa un teléfono/WhatsApp válido.");
      return;
    }
    setPhoneErr(false);
    const url = `https://wa.me/${normalized}?text=${encodeURIComponent(waMessage)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    toast.show("Abriendo WhatsApp…", "info");
    onClose();
  };

  const openEmail = () => {
    if (!EMAIL_RE.test(email.trim())) {
      setEmailErr(true);
      toast.error("Ingresa un correo válido.");
      return;
    }
    setEmailErr(false);
    const url = `mailto:${email.trim()}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(message)}`;
    window.location.href = url;
    toast.success("Abriendo tu correo con la factura…");
    onClose();
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Enlace de la factura copiado.");
    } catch {
      toast.error("No se pudo copiar. Selecciona y copia el enlace manualmente.");
    }
  };

  return (
    <Modal
      open={open}
      title={`Enviar ${doc.title.toLowerCase()} · ${doc.number}`}
      onClose={onClose}
      footer={
        <Button type="button" variant="outline" onClick={onClose}>
          Cerrar
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("whatsapp")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
              tab === "whatsapp"
                ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-accent)]"
                : "border-slate-200"
            }`}
          >
            <MessageCircle className="h-4 w-4" /> WhatsApp
          </button>
          <button
            type="button"
            onClick={() => setTab("email")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
              tab === "email"
                ? "border-[color:var(--brand-primary)] bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-accent)]"
                : "border-slate-200"
            }`}
          >
            <Mail className="h-4 w-4" /> Correo
          </button>
        </div>

        {tab === "whatsapp" ? (
          <div className="space-y-3">
            <div>
              <Label>Teléfono / WhatsApp del cliente</Label>
              <Input
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setPhoneErr(false);
                }}
                placeholder="829-714-1975"
                className={phoneErr ? "border-rose-500 bg-rose-50/60" : undefined}
              />
              {phoneErr && (
                <p className="mt-1 text-xs text-rose-600">Ingresa un teléfono válido.</p>
              )}
            </div>
            <div>
              <Label>Vista previa del mensaje</Label>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-black/[0.02] p-2 text-xs">
                {waMessage}
              </pre>
            </div>
            <Button type="button" className="w-full justify-center" onClick={openWhatsapp}>
              <MessageCircle className="h-4 w-4" /> Abrir WhatsApp
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <Label>Correo del cliente</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailErr(false);
                }}
                placeholder="cliente@correo.com"
                className={emailErr ? "border-rose-500 bg-rose-50/60" : undefined}
              />
              {emailErr && (
                <p className="mt-1 text-xs text-rose-600">Ingresa un correo válido.</p>
              )}
            </div>
            <div>
              <Label>Asunto</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <Label>Mensaje</Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-32 text-xs"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="flex-1 justify-center" onClick={openEmail}>
                <ExternalLink className="h-4 w-4" /> Abrir correo
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1 justify-center"
                onClick={copyLink}
              >
                <Copy className="h-4 w-4" /> Copiar enlace
              </Button>
            </div>
            <p className="text-[11px] opacity-60">
              El envío automático por correo aún no está configurado; se abre tu
              cliente de correo con la factura lista, o puedes copiar el enlace.
            </p>
          </div>
        )}
      </div>
      <toast.Toast />
    </Modal>
  );
}
