"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, Card, CardContent, Input, Label } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";

/**
 * B-04: Seguridad de la cuenta — activar/desactivar 2FA (TOTP).
 *
 * Flujo de enrolamiento (Supabase Auth MFA): enroll → mostrar QR → el usuario lo
 * escanea con Google Authenticator/Authy → ingresa el código de 6 dígitos →
 * challenge + verify → el factor queda verificado. En el PRÓXIMO login se le pedirá
 * el código (enforcement en middleware). Recomendado/obligatorio para administradores.
 */
type Factor = { id: string; friendly_name?: string; status: string };

export default function SeguridadPage() {
  const toast = useToast();
  const supabase = createClient();
  const [factors, setFactors] = useState<Factor[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState<{ factorId: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!supabase) { setLoading(false); return; }
    const { data } = await supabase.auth.mfa.listFactors();
    setFactors((data?.totp ?? []) as Factor[]);
    setLoading(false);
  };
  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const hasVerified = factors.some((f) => f.status === "verified");

  async function startEnroll() {
    if (!supabase) return;
    setBusy(true);
    // Limpiar factores no verificados previos (enrolamientos abandonados) para no
    // acumular; Supabase permite varios pero uno basta.
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `dermaland-${Date.now()}` });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setEnrolling({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function confirmEnroll() {
    if (!supabase || !enrolling) return;
    setBusy(true);
    const ch = await supabase.auth.mfa.challenge({ factorId: enrolling.factorId });
    if (ch.error) { setBusy(false); toast.error(ch.error.message); return; }
    const vr = await supabase.auth.mfa.verify({ factorId: enrolling.factorId, challengeId: ch.data.id, code: code.trim() });
    setBusy(false);
    if (vr.error) { toast.error("Código incorrecto. Revisá la hora del teléfono e intentá de nuevo."); return; }
    toast.success("2FA activado. Te pediremos el código en tu próximo inicio de sesión.");
    setEnrolling(null); setCode("");
    void refresh();
  }

  async function removeFactor(id: string) {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("2FA desactivado.");
    void refresh();
  }

  return (
    <>
      <PageHeader
        title="Seguridad de la cuenta"
        description="Verificación en dos pasos (2FA) con app de autenticación."
        breadcrumbs={[{ label: "Mi cuenta" }, { label: "Seguridad" }]}
      />

      <Card className="max-w-xl">
        <CardContent className="space-y-4">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm opacity-60">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : !supabase ? (
            <p className="py-6 text-sm opacity-60">2FA no disponible en modo demo.</p>
          ) : hasVerified ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
                <ShieldCheck className="h-4 w-4" />
                <span>Verificación en dos pasos <strong>activa</strong>.</span>
              </div>
              {factors.filter((f) => f.status === "verified").map((f) => (
                <div key={f.id} className="flex items-center justify-between rounded-lg border border-black/5 p-3">
                  <div className="text-sm">
                    <div className="font-medium">App de autenticación (TOTP)</div>
                    <div className="text-xs opacity-60">{f.friendly_name ?? f.id}</div>
                  </div>
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => removeFactor(f.id)}>
                    Desactivar
                  </Button>
                </div>
              ))}
            </div>
          ) : enrolling ? (
            <div className="space-y-4">
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Escaneá este QR con Google Authenticator, Authy o similar; luego ingresá el código de 6 dígitos para confirmar.</span>
              </div>
              <div className="flex justify-center">
                {/* Supabase devuelve el QR como SVG (data-uri o crudo). */}
                {enrolling.qr.startsWith("data:") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={enrolling.qr} alt="QR 2FA" className="h-48 w-48" />
                ) : (
                  <div className="h-48 w-48" dangerouslySetInnerHTML={{ __html: enrolling.qr }} />
                )}
              </div>
              <div className="text-center text-xs opacity-60">
                ¿No podés escanear? Clave manual:{" "}
                <code className="rounded bg-black/[0.04] px-1 font-mono">{enrolling.secret}</code>
              </div>
              <div>
                <Label htmlFor="code">Código de 6 dígitos</Label>
                <Input
                  id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6}
                  value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="000000"
                />
              </div>
              <div className="flex gap-2">
                <Button disabled={busy || code.length < 6} onClick={confirmEnroll}>Confirmar y activar</Button>
                <Button variant="outline" disabled={busy} onClick={() => { setEnrolling(null); setCode(""); }}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center gap-2 rounded-lg border border-black/5 bg-black/[0.02] p-3 text-sm">
                <ShieldAlert className="h-4 w-4 opacity-60" />
                <span>2FA <strong>no activo</strong>. Recomendado para administradores.</span>
              </div>
              <Button disabled={busy} onClick={startEnroll}>
                {busy ? "…" : "Activar 2FA"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
