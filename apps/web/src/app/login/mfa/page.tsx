"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { HeartPulse, ShieldCheck, AlertTriangle } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { accionDelDesafio } from "@/lib/auth/mfa-gate";
import { createClient } from "@/lib/supabase/client";
import { safeNext } from "@/lib/utils/safe-next";

/**
 * B-04: paso de verificación 2FA en el login. Se llega aquí cuando el usuario ya
 * autenticó con contraseña (aal1) pero tiene un factor TOTP verificado — el
 * middleware exige completar el challenge (aal2) antes de las rutas privadas.
 */
function MfaChallenge() {
  const params = useSearchParams();
  // DL-12. Antes era `n.startsWith("/")` a secas, y esta página redirige AL
  // MONTAR cuando el usuario no tiene factor TOTP: bastaba mandar el enlace
  // `?next=//evil.com` para sacar a alguien del dominio sin sesión ni un clic.
  const next = safeNext(params.get("next"));
  const supabase = createClient();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [estado, setEstado] = useState<
    "cargando" | "pedir-codigo" | "sin-factor" | "no-se-pudo-comprobar"
  >("cargando");

  const comprobar = async () => {
    setEstado("cargando");
    // En modo demo no hay Supabase NI puerta —el middleware deja pasar todo con
    // `DATA_SOURCE=mock`—, así que continuar solo no puede rebotar contra nada.
    // Es el único salto automático que queda en esta página, y es seguro
    // precisamente porque no hay nadie al otro lado que lo contradiga.
    if (!supabase) { window.location.href = next; return; }

    const decision = accionDelDesafio(await supabase.auth.mfa.listFactors());
    if (decision.accion === "pedir-codigo") setFactorId(decision.factorId);
    setEstado(decision.accion);
  };

  useEffect(() => {
    void comprobar();
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

          {/*
            Ninguna de estas ramas navega sola. La página saltaba a
            `/perfil/seguridad` en cuanto no encontraba un TOTP, y con la puerta
            de 2FA al otro lado eso era un ping-pong infinito cada vez que las
            dos partes discrepaban. Un enlace exige un clic, y un salto que
            exige un clic no puede dar vueltas solo.
          */}
          {estado === "cargando" ? (
            <p className="mt-4 text-sm opacity-60">Comprobando tu segundo factor…</p>
          ) : estado === "sin-factor" ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm opacity-70">
                No encontramos un segundo factor que verificar en esta cuenta.
                Puede que se haya desactivado desde otro dispositivo.
              </p>
              {/* Enlace y no botón: es una navegación, y así funciona sin JS. */}
              <a
                href={`/perfil/seguridad?next=${encodeURIComponent(next)}`}
                className="inline-flex h-12 w-full cursor-pointer items-center justify-center rounded-lg bg-[color:var(--brand-primary)] px-6 text-base font-medium text-white transition hover:bg-[color:var(--brand-accent)]"
              >
                Ir a seguridad de la cuenta
              </a>
            </div>
          ) : estado === "no-se-pudo-comprobar" ? (
            <div className="mt-4 space-y-4">
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  No pudimos comprobar tu segundo factor. Puede ser un problema
                  de conexión: tu 2FA <strong>no</strong> se ha desactivado.
                </span>
              </div>
              <Button className="w-full" size="lg" onClick={() => void comprobar()}>
                Reintentar
              </Button>
              {/* `/login` es pública: siempre se puede llegar, pase lo que pase. */}
              <a href="/login" className="block text-center text-sm underline opacity-60">
                Volver a entrar
              </a>
            </div>
          ) : (
            <>
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
            </>
          )}
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
