"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HeartPulse, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * B-04: paso de verificación 2FA en el login. Se llega aquí cuando el usuario ya
 * autenticó con contraseña (aal1) pero tiene un factor TOTP verificado — el
 * middleware exige completar el challenge (aal2) antes de las rutas privadas.
 */
function MfaChallenge() {
  const params = useSearchParams();
  const next = (() => {
    const n = params.get("next");
    return n && n.startsWith("/") ? n : "/";
  })();
  const supabase = createClient();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!supabase) { window.location.href = next; return; }
      const { data } = await supabase.auth.mfa.listFactors();
      const totp = data?.totp?.find((f) => f.status === "verified");
      if (!totp) { window.location.href = next; return; } // sin factor → nada que verificar
      setFactorId(totp.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verify() {
    if (!supabase || !factorId) return;
    setBusy(true); setError(null);
    const ch = await supabase.auth.mfa.challenge({ factorId });
    if (ch.error) { setBusy(false); setError(ch.error.message); return; }
    const vr = await supabase.auth.mfa.verify({ factorId, challengeId: ch.data.id, code: code.trim() });
    if (vr.error) {
      setBusy(false);
      setError("Código incorrecto. Revisá la hora de tu teléfono e intentá de nuevo.");
      return;
    }
    // Sesión elevada a aal2 → recarga completa para que el middleware la reconozca.
    window.location.href = next;
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
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[color:var(--brand-primary)]" />
            <h1 className="text-lg font-semibold">Verificación en dos pasos</h1>
          </div>
          <p className="mt-1 text-sm opacity-60">
            Ingresá el código de 6 dígitos de tu app de autenticación.
          </p>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-6 space-y-4">
            <div>
              <Label htmlFor="code">Código</Label>
              <Input
                id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => { if (e.key === "Enter" && code.length === 6) void verify(); }}
                placeholder="000000" autoFocus
              />
            </div>
            <Button className="w-full" size="lg" disabled={busy || code.length < 6 || !factorId} onClick={verify}>
              {busy ? "Verificando…" : "Verificar"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MfaPage() {
  return (
    <Suspense fallback={null}>
      <MfaChallenge />
    </Suspense>
  );
}
