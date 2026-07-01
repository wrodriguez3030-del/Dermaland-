import Link from "next/link";
import { ShieldAlert } from "lucide-react";
import { SuperAdminShell } from "@/components/layout/super-admin-shell";
import { getSession } from "@/server/auth/context";
import { env } from "@/lib/env";
import { canAccessSuperAdmin } from "@/features/admin/super-admin-access";

/**
 * Layout de Súper Admin con guard de acceso.
 *
 * Solo pueden entrar usuarios de plataforma (`is_platform_admin`) o rol
 * `super_admin`. En modo demo (`DATA_SOURCE=mock`) se permite para pruebas
 * (igual que el middleware). Un usuario normal ve un mensaje claro, no el panel.
 */
export default async function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  const allowed = canAccessSuperAdmin({
    isMock: env.DATA_SOURCE === "mock",
    isPlatformAdmin: session?.isPlatformAdmin,
    role: session?.user.role,
  });

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-violet-950 px-4 text-violet-50">
        <div className="w-full max-w-md rounded-2xl border border-violet-800 bg-violet-900/60 p-8 text-center">
          <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-violet-700">
            <ShieldAlert className="h-6 w-6" />
          </span>
          <h1 className="text-lg font-semibold">Acceso restringido</h1>
          <p className="mt-2 text-sm text-violet-200">
            No tienes permiso para acceder a Súper Admin. Este panel es solo para
            administradores de la plataforma.
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-lg bg-violet-700 px-4 py-2 text-sm font-medium text-white hover:bg-violet-600"
          >
            Volver al inicio
          </Link>
        </div>
      </div>
    );
  }

  return <SuperAdminShell>{children}</SuperAdminShell>;
}
