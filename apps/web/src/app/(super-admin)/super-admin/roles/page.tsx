import { roleDefinitions, allPermissions } from "@/lib/mock-data/users";
import { SAHeader, SAStat, SACard, SATable, SABadge } from "@/components/layout/super-admin-ui";

export default function SuperAdminRoles() {
  // Agrupa el catálogo de permisos por módulo.
  const byModule = new Map<string, typeof allPermissions>();
  for (const p of allPermissions) {
    if (!byModule.has(p.module)) byModule.set(p.module, []);
    byModule.get(p.module)!.push(p);
  }
  const modules = [...byModule.keys()].sort();

  return (
    <>
      <SAHeader
        title="Roles y permisos"
        description="Roles del sistema y catálogo de permisos por módulo. Editar requiere super_admin.manage_roles."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SAStat label="Roles" value={roleDefinitions.length} />
        <SAStat label="Permisos" value={allPermissions.length} />
        <SAStat label="Módulos" value={modules.length} />
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        {roleDefinitions.map((r) => (
          <div key={r.key} className="rounded-2xl border border-violet-800 bg-violet-900/40 p-5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">{r.label}</h2>
              <SABadge tone={r.key === "super_admin" ? "danger" : "info"}>{r.key}</SABadge>
            </div>
            <p className="mt-1 text-xs text-violet-300">{r.description}</p>
            <div className="mt-3 flex flex-wrap gap-1">
              {r.permissions.map((p) => (
                <span key={p} className="rounded bg-violet-800/60 px-1.5 py-0.5 font-mono text-[11px] text-violet-200">
                  {p}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <SACard title="Catálogo de permisos por módulo">
        <SATable
          head={
            <tr>
              <th className="px-4 py-2 text-left">Módulo</th>
              <th className="px-4 py-2 text-left">Permiso</th>
              <th className="px-4 py-2 text-left">Descripción</th>
            </tr>
          }
        >
          {modules.flatMap((mod) =>
            byModule.get(mod)!.map((p, i) => (
              <tr key={p.key} className="hover:bg-violet-900/40">
                <td className="px-4 py-2 text-violet-300">{i === 0 ? mod : ""}</td>
                <td className="px-4 py-2 font-mono text-[11px]">{p.key}</td>
                <td className="px-4 py-2 text-violet-200">{p.description}</td>
              </tr>
            )),
          )}
        </SATable>
      </SACard>
    </>
  );
}
