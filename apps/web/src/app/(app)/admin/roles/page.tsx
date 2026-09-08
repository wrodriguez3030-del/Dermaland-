"use client";

import * as React from "react";
import { Check, Minus, ShieldCheck, AlertTriangle, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui";
import { useUsersList } from "@/features/admin/user-store";
import { CAPACIDADES, ROLES_ASIGNABLES, AREAS, tieneCapacidad } from "@/features/auth/capacidades";
import type { UserRole } from "@/types";

/**
 * Roles y perfiles.
 *
 * 🔴 Antes esta pantalla leía `mockUsers` —datos de MENTIRA— y enseñaba una
 * matriz de permisos que el sistema no aplicaba: ofrecía «Crear rol» y
 * botones de borrar que no hacían nada, y sus enlaces llevaban a un 404. Un
 * panel de administración que miente sobre quién puede qué es peor que no
 * tenerlo, porque se toman decisiones con él.
 *
 * Ahora las tarjetas cuentan a las personas REALES de cada rol, y la matriz se
 * deriva de las constantes que autorizan de verdad (`features/auth/capacidades.ts`).
 * Es de SOLO LECTURA y lo dice: los permisos de cada rol los define el sistema.
 */
export default function RolesPage() {
  const { users, loading, error } = useUsersList();

  const porRol = React.useMemo(() => {
    const mapa = new Map<UserRole, { id: string; nombre: string }[]>();
    for (const u of users) {
      const lista = mapa.get(u.role) ?? [];
      lista.push({ id: u.id, nombre: u.fullName });
      mapa.set(u.role, lista);
    }
    return mapa;
  }, [users]);

  return (
    <>
      <PageHeader
        title="Roles y perfiles"
        description="Qué puede hacer cada rol y quién lo tiene. Los permisos los define el sistema."
      />

      {error && (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
          No se pudo cargar el personal: {error}
        </div>
      )}

      {/* Tarjetas por rol, con las personas que lo tienen. */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES_ASIGNABLES.map((r) => {
          const gente = porRol.get(r.role) ?? [];
          return (
            <div key={r.role} className="rounded-xl border border-black/10 bg-white p-4">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium">{r.label}</span>
                <span className="inline-flex items-center gap-1 text-xs opacity-60">
                  <Users className="h-3.5 w-3.5" />
                  {loading ? "…" : gente.length}
                </span>
              </div>
              <p className="mb-2 text-xs opacity-70">{r.descripcion}</p>
              <div className="mb-2 flex flex-wrap gap-1">
                {r.dosFactores && (
                  <Badge tone="info">
                    <ShieldCheck className="mr-0.5 inline h-3 w-3" />
                    2FA obligatorio
                  </Badge>
                )}
                {r.riesgo && (
                  <Badge tone="warning">
                    <AlertTriangle className="mr-0.5 inline h-3 w-3" />
                    Puede borrar y anular
                  </Badge>
                )}
              </div>
              {gente.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {gente.slice(0, 6).map((p) => (
                    <span
                      key={p.id}
                      className="rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px]"
                    >
                      {p.nombre}
                    </span>
                  ))}
                  {gente.length > 6 && (
                    <span className="px-1 text-[11px] opacity-60">
                      +{gente.length - 6}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-[11px] opacity-50">Nadie tiene este rol.</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Matriz: qué puede hacer cada rol. */}
      <div className="rounded-xl border border-black/10 bg-white">
        <div className="border-b border-black/5 p-4">
          <div className="font-medium">Qué puede hacer cada rol</div>
          <p className="mt-1 text-xs opacity-70">
            Esta tabla no se edita: los permisos de cada rol los define el
            sistema, y aquí se lee exactamente lo que aplica al autorizar. Para
            cambiar lo que puede una persona, cámbiale el rol en{" "}
            <a className="underline" href="/admin/usuarios">
              Usuarios
            </a>
            .
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-black/5 text-left">
                <th className="p-3 font-medium">Capacidad</th>
                {ROLES_ASIGNABLES.map((r) => (
                  <th key={r.role} className="p-3 text-center text-xs font-medium">
                    {r.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {AREAS.map((area) => (
                <React.Fragment key={area}>
                  <tr className="bg-black/[0.02]">
                    <td
                      colSpan={ROLES_ASIGNABLES.length + 1}
                      className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide opacity-60"
                    >
                      {area}
                    </td>
                  </tr>
                  {CAPACIDADES.filter((c) => c.area === area).map((c) => (
                    <tr key={c.id} className="border-b border-black/5 last:border-0">
                      <td className="p-3 text-xs">{c.etiqueta}</td>
                      {ROLES_ASIGNABLES.map((r) => (
                        <td key={r.role} className="p-3 text-center">
                          {tieneCapacidad(c, r.role) ? (
                            <Check
                              className="mx-auto h-4 w-4 text-emerald-700"
                              aria-label={`${r.label} sí puede`}
                            />
                          ) : (
                            <Minus
                              className="mx-auto h-4 w-4 opacity-20"
                              aria-label={`${r.label} no puede`}
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
