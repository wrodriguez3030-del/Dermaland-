import { notFound } from "next/navigation";
import { getSession } from "@/server/auth/context";
import { puedeAccionDeRiesgo } from "@/features/auth/riesgo-operativo";
import { MergeClientsView } from "@/features/customers/components/merge-clients-view";

export default async function UnificarClientesPage() {
  const session = await getSession();
  const permitido = !!session && (session.isPlatformAdmin || puedeAccionDeRiesgo(session.user.role));
  if (!permitido) notFound();

  return <MergeClientsView />;
}
