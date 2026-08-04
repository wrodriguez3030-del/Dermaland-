import * as React from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { getSession } from "@/server/auth/context";
import { env } from "@/lib/env";
import { canAccessSuperAdmin } from "@/features/admin/super-admin-access";
import { countNewWebOrders } from "@/server/services/storefront/orders";

export async function AppShell({ children }: { children: React.ReactNode }) {
  // Mismo criterio que el guard de la ruta (super-admin)/layout: en demo (mock)
  // se permite; en producción solo platform admin o rol super_admin. Se usa para
  // ocultar el enlace "Súper Admin" del menú a quien no tiene permiso.
  const session = await getSession();
  const showSuperAdmin = canAccessSuperAdmin({
    isMock: env.DATA_SOURCE === "mock",
    isPlatformAdmin: session?.isPlatformAdmin,
    role: session?.user.role,
  });

  // Pedidos web sin atender, para el aviso del menú. Un fallo aquí no puede
  // tumbar el ERP entero: si no se puede contar, no se enseña el número.
  let pedidosNuevos = 0;
  if (session) {
    try {
      pedidosNuevos = await countNewWebOrders(session.businessId);
    } catch {
      pedidosNuevos = 0;
    }
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        className="hidden lg:flex sticky top-0"
        showSuperAdmin={showSuperAdmin}
        badges={{ "/pedidos-web": pedidosNuevos }}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header showSuperAdmin={showSuperAdmin} />
        <main className="flex-1 px-4 py-4 md:px-6 md:py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
