"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { HeartPulse, ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";

/**
 * DL-18: pantalla de nueva contraseña. Se llega desde el enlace de recuperación
 * del correo, que establece una sesión temporal de recuperación (Supabase
 * `detectSessionInUrl` + evento PASSWORD_RECOVERY). Con esa sesión llamamos a
 * `updateUser({ password })` y redirigimos a /login.
 */
function Restablecer() {
  const supabase = createClient();
  const [ready, setReady] = useState(false);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    // Por si el evento ya ocurrió antes de montar el listener.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    if (!supabase) return;
    if (pw.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (pw !== pw2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setError(null);
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) {
      setError(
        /same/i.test(error.message)
          ? "La nueva contraseña no puede ser igual a la anterior."
          : error.message,
      );
      return;
    }
    setDone(true);
    setTimeout(() => {
      window.location.href = "/login";
    }, 1600);
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
          {done ? (
            <div className="text-center">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
              <h1 className="mt-3 text-lg font-semibold">Contraseña actualizada</h1>
              <p className="mt-1 text-sm opacity-70">
                Redirigiéndote a iniciar sesión…
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[color:var(--brand-primary)]" />
                <h1 className="text-lg font-semibold">Nueva contraseña</h1>
              </div>

              {!ready ? (
                <p className="mt-3 text-sm opacity-70">
                  Abre esta página desde el enlace que te enviamos por correo. Si ya lo
                  hiciste y ves este mensaje, el enlace pudo vencer:{" "}
                  <Link href="/recuperar" className="text-[color:var(--brand-primary)] hover:underline">
                    solicita uno nuevo
                  </Link>
                  .
                </p>
              ) : (
                <>
                  <p className="mt-1 text-sm opacity-60">
                    Elige una contraseña de al menos 8 caracteres.
                  </p>

                  {error && (
                    <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <div className="mt-6 space-y-4">
                    <div>
                      <Label htmlFor="pw">Nueva contraseña</Label>
                      <Input
                        id="pw"
                        type="password"
                        autoComplete="new-password"
                        value={pw}
                        onChange={(e) => setPw(e.target.value)}
                        placeholder="••••••••"
                        autoFocus
                      />
                    </div>
                    <div>
                      <Label htmlFor="pw2">Repetir contraseña</Label>
                      <Input
                        id="pw2"
                        type="password"
                        autoComplete="new-password"
                        value={pw2}
                        onChange={(e) => setPw2(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void submit();
                        }}
                        placeholder="••••••••"
                      />
                    </div>
                    <Button
                      className="w-full"
                      size="lg"
                      disabled={busy || pw.length < 8 || pw2.length < 8}
                      onClick={submit}
                    >
                      {busy ? "Guardando…" : "Guardar contraseña"}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RestablecerPage() {
  return (
    <Suspense fallback={null}>
      <Restablecer />
    </Suspense>
  );
}
