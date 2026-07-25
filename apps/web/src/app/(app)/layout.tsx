import { AppShell } from "@/components/layout/app-shell";
import { getSession } from "@/server/auth/context";
import { CurrentUserProvider, type CurrentUser } from "@/features/auth/current-user";
import { mockCurrentUser } from "@/lib/mock-data/users";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // DL-03: resolvemos la sesión REAL en el servidor y la inyectamos al cliente.
  // En prod middleware garantiza sesión; el fallback cubre dev/mock.
  const session = await getSession();
  const u = session?.user ?? mockCurrentUser;
  const user: CurrentUser = {
    id: u.id,
    fullName: u.fullName,
    role: u.role,
    avatarColor: u.avatarColor,
    isPlatformAdmin: session?.isPlatformAdmin ?? false,
  };

  return (
    <CurrentUserProvider user={user}>
      <AppShell>{children}</AppShell>
    </CurrentUserProvider>
  );
}
