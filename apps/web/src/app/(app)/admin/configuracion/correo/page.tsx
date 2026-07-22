"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, Mail, ShieldCheck, Send } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  HelpText,
} from "@/components/ui";
import { useToast } from "@/components/ui/toast";

interface EmailStatus {
  gmailUser: string;
  configured: boolean;
  maskedPassword: string | null;
  updatedAt: string | null;
}

export default function ConfiguracionCorreoPage() {
  const toast = useToast();
  const [status, setStatus] = React.useState<EmailStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [gmailUser, setGmailUser] = React.useState("dermalandrd@gmail.com");
  const [appPassword, setAppPassword] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [testTo, setTestTo] = React.useState("");
  const [testing, setTesting] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/settings/email", { cache: "no-store" });
      if (res.ok) {
        const body = (await res.json()) as EmailStatus;
        setStatus(body);
        setGmailUser(body.gmailUser);
        if (!testTo) setTestTo(body.gmailUser);
      }
    } catch {
      /* silencioso */
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!appPassword.replace(/\s+/g, "")) {
      toast.error("Pega la contraseña de aplicación de Gmail.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/email", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gmailUser: gmailUser.trim(), appPassword }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        toast.success("Configuración de correo guardada.");
        setAppPassword("");
        await load();
      } else {
        toast.error(body.error ?? "No se pudo guardar.");
      }
    } catch {
      toast.error("No se pudo guardar. Intenta nuevamente.");
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(testTo.trim())) {
      toast.error("Ingresa un correo de prueba válido.");
      return;
    }
    setTesting(true);
    try {
      const res = await fetch("/api/settings/email/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: testTo.trim() }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        toast.success(`Correo de prueba enviado a ${testTo.trim()}. Revisa la bandeja.`);
      } else {
        toast.error(body.error ?? "No se pudo enviar la prueba.");
      }
    } catch {
      toast.error("No se pudo enviar la prueba.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <Link
        href="/admin/configuracion"
        className="mb-4 inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
      >
        <ArrowLeft className="h-3 w-3" /> Volver a Configuración
      </Link>

      <PageHeader
        title="Correo (envío de facturas)"
        description="Configura la cuenta de Gmail desde la que el sistema envía las facturas a los clientes."
        breadcrumbs={[
          { label: "Administración" },
          { label: "Configuración", href: "/admin/configuracion" },
          { label: "Correo" },
        ]}
      />

      <Card>
        <CardContent className="space-y-5 py-5">
          {/* Estado */}
          <div className="flex items-center gap-2">
            {loading ? (
              <span className="text-sm opacity-60">Cargando…</span>
            ) : status?.configured ? (
              <Badge tone="success">
                <ShieldCheck className="h-3.5 w-3.5" /> Configurado
              </Badge>
            ) : (
              <Badge tone="warning">Sin configurar</Badge>
            )}
            {status?.configured && status.maskedPassword && (
              <span className="font-mono text-xs opacity-60">
                {status.maskedPassword}
              </span>
            )}
          </div>

          <div>
            <Label>Cuenta de Gmail (remitente)</Label>
            <Input
              type="email"
              value={gmailUser}
              onChange={(e) => setGmailUser(e.target.value)}
              placeholder="dermalandrd@gmail.com"
            />
            <HelpText>
              Las facturas se envían desde esta cuenta; las respuestas del cliente
              llegan aquí.
            </HelpText>
          </div>

          <div>
            <Label>Contraseña de aplicación de Gmail</Label>
            <Input
              type="password"
              value={appPassword}
              onChange={(e) => setAppPassword(e.target.value)}
              placeholder={
                status?.configured
                  ? "•••••••••••• (deja vacío para no cambiarla)"
                  : "16 caracteres (ej. abcd efgh ijkl mnop)"
              }
              autoComplete="off"
            />
            <HelpText>
              No es tu contraseña normal. Créala en{" "}
              <a
                href="https://myaccount.google.com/apppasswords"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[color:var(--brand-accent)] underline"
              >
                myaccount.google.com/apppasswords
              </a>{" "}
              (requiere Verificación en 2 pasos activa). Se guarda cifrada; nadie
              puede verla luego.
            </HelpText>
          </div>

          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              <Mail className="h-4 w-4" />
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>

          {/* Prueba */}
          <div className="border-t border-black/5 pt-5">
            <Label>Enviar correo de prueba</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              <Input
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="tu@correo.com"
                className="flex-1 min-w-[200px]"
              />
              <Button variant="outline" onClick={sendTest} disabled={testing}>
                <Send className="h-4 w-4" />
                {testing ? "Enviando…" : "Enviar prueba"}
              </Button>
            </div>
            <HelpText>
              Envía un correo de prueba para confirmar que la configuración
              funciona antes de enviar facturas reales.
            </HelpText>
          </div>
        </CardContent>
      </Card>
      <toast.Toast />
    </div>
  );
}
