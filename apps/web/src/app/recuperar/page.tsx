"use client";

import { useState } from "react";
import Link from "next/link";
import { HeartPulse, Mail, AlertTriangle, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * DL-18: solicitud de restablecimiento de contraseña. Envía el enlace de
 * recuperación de Supabase (tokens de un solo uso con expiración) que apunta a
 * `/restablecer`. Anti-enumeración: siempre muestra el mismo mensaje de éxito,
 * sin revelar si el correo existe.
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RecuperarPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const clean = email.trim().toLowerCase();
    if (!EMAIL_RE.test(clean)) {
      setError("Ingresa un correo válido.");
      return;
    }
    setError(null);
    setBusy(true);
    if (supabase) {
      const redirectTo = `${window.location.origin}/restablecer`;
      // Ignoramos el resultado a propósito (anti-enumeración): mostramos éxito
      // exista o no la cuenta. Supabase Auth ya aplica su propio rate-limit.
      await supabase.auth.resetPasswordForEmail(clean, { redirectTo }).catch(() => {});
    }
    setBusy(false);
    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--brand-primary)] text-white">
            <HeartPulse className="h-5 w-5" />
          </span>
          <span className="text-xl font-semibold">DermaLand</span>
        </div>

        <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-sm">
          {sent ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
              <h1 className="mt-3 text-lg font-semibold">Revisa tu correo</h1>
              <p className="mt-1 text-sm opacity-70">
                Si <span className="font-medium">{email.trim().toLowerCase()}</span> tiene una
                cuenta, te enviamos un enlace para restablecer tu contraseña. Revisa también
                spam. El enlace vence pronto.
              </p>
              <Link
                href="/login"
                className="mt-5 inline-flex items-center gap-1 text-sm text-[color:var(--brand-primary)] hover:underline"
              >
                <ArrowLeft className="h-4 w-4" /> Volver a iniciar sesión
              </Link>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-[color:var(--brand-primary)]" />
                <h1 className="text-lg font-semibold">Recuperar contraseña</h1>
              </div>
              <p className="mt-1 text-sm opacity-60">
                Escribe tu correo y te enviaremos un enlace para crear una nueva contraseña.
              </p>

              {error && (
                <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="mt-6 space-y-4">
                <div>
                  <Label htmlFor="email">Correo</Label>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submit();
                    }}
                    placeholder="tu@correo.com"
                    autoFocus
                  />
                </div>
                <Button className="w-full" size="lg" disabled={busy} onClick={submit}>
                  {busy ? "Enviando…" : "Enviar enlace"}
                </Button>
                <Link
                  href="/login"
                  className="flex items-center justify-center gap-1 text-sm opacity-70 hover:underline"
                >
                  <ArrowLeft className="h-4 w-4" /> Volver a iniciar sesión
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
