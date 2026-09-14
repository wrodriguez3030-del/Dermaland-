"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { PanelDeFiltros } from "@/features/filtros/panel-de-filtros";
import type { OpcionSucursal } from "@/features/filtros/sucursales-seleccion";

/**
 * Isla cliente sobre una página SERVIDOR: no usa `useSearchParams` (por eso
 * no necesita `<Suspense>`) — cada cambio hace `router.replace` con los
 * parámetros nuevos, la página vuelve a correr en el servidor con
 * `searchParams` actualizados, y esta isla recibe sus props ya frescas.
 *
 * Sin "Todo": este reporte trae 14 965 facturas y sus renglones en tandas de
 * 200 (`lineasDeFacturas`); un rango sin límite es medio minuto de consultas
 * que ninguna otra pantalla de DermaLand pide.
 */
export function FiltrosAlegra({
  desde,
  hasta,
  sucursal,
  sucursales,
}: {
  desde: string;
  hasta: string;
  sucursal: string;
  sucursales: OpcionSucursal[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pendiente, startTransition] = React.useTransition();

  const navegar = (siguiente: { desde: string; hasta: string; sucursal: string }) => {
    const p = new URLSearchParams();
    if (siguiente.desde) p.set("desde", siguiente.desde);
    if (siguiente.hasta) p.set("hasta", siguiente.hasta);
    if (siguiente.sucursal) p.set("sucursal", siguiente.sucursal);
    const qs = p.toString();
    startTransition(() => {
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  };

  return (
    <PanelDeFiltros
      desde={desde}
      hasta={hasta}
      onRango={(r) => navegar({ desde: r.from, hasta: r.to, sucursal })}
      atajos={["today", "yesterday", "last7", "thisMonth", "lastMonth"]}
      sucursales={sucursal ? [sucursal] : []}
      onSucursales={(ids) => navegar({ desde, hasta, sucursal: ids[0] ?? "" })}
      opcionesSucursales={sucursales}
      multipleSucursales={false}
      className={pendiente ? "mb-4 opacity-60 transition-opacity" : "mb-4"}
    />
  );
}
