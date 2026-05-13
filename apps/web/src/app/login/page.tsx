import Link from "next/link";
import { HeartPulse, ShieldCheck } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { signIn } from "@/server/auth/actions";

export default function LoginPage() {
  async function action(formData: FormData): Promise<void> {
    "use server";
    await signIn(formData);
    // En implementación real: redirect("/") en éxito,
    // o setear cookie con error y volver a /login.
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
          <h1 className="text-lg font-semibold">Iniciar sesión</h1>
          <p className="mt-1 text-sm opacity-60">
            Accede a tu cuenta. 2FA obligatorio para administradores.
          </p>

          <form action={action} className="mt-6 space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="tu@correo.com"
                autoComplete="email"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Contraseña</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </div>
            <Button type="submit" className="w-full" size="lg">
              Entrar
            </Button>
          </form>

          <div className="mt-4 text-center text-xs opacity-60">
            <Link href="/" className="hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
          <div className="flex items-center gap-1 font-medium">
            <ShieldCheck className="h-3 w-3" />
            Modo demo activo
          </div>
          <p className="mt-1 opacity-80">
            <code className="font-mono">DATA_SOURCE=mock</code> — cualquier email
            entra. Configura Supabase en `.env` para auth real.
          </p>
        </div>
      </div>
    </div>
  );
}
