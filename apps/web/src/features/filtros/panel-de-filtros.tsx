"use client";

import * as React from "react";
import { Filter } from "lucide-react";
import { Button, Card, Label } from "@/components/ui";
import { cn } from "@/lib/utils/cn";
import { ATAJOS, detectarAtajo, type QuickRangeKey, rangoDeAtajo } from "./atajos-de-fecha";
import { ChipsDeAtajo } from "./chips-de-atajo";
import { RangoDeFechas } from "./rango-de-fechas";
import { SucursalesMultiSelect } from "./sucursales-multi-select";
import type { OpcionSucursal } from "./sucursales-seleccion";
import { useHoy } from "./use-hoy";

export type { QuickRangeKey };
export { rangoDeAtajo };

/** Envuelve un control del panel con su etiqueta, en la misma cuadrícula. */
export function CampoDeFiltro({
  etiqueta,
  children,
}: {
  etiqueta: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <Label className="text-xs text-slate-500">{etiqueta}</Label>
      {children}
    </div>
  );
}

/**
 * Cabecera "FILTROS" + fila de acciones, sin rango de fecha ni sucursales —
 * para pantallas cuyo período no es un rango libre (p. ej. el panel
 * principal, que sigue en Mes/Año). `PanelDeFiltros` es el caso general;
 * este es la cáscara que ambos comparten.
 */
export function MarcoFiltros({
  onLimpiar,
  children,
  className,
}: {
  onLimpiar?: () => void;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("p-4 shadow-sm", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Filter className="h-3.5 w-3.5" />
          Filtros
        </span>
        {onLimpiar && (
          <Button size="sm" variant="ghost" onClick={onLimpiar}>
            Limpiar
          </Button>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">{children}</div>
    </Card>
  );
}

export interface PanelDeFiltrosProps {
  /** `YYYY-MM-DD` o `""`. Si se omite (junto a `onRango`) no hay chips ni fechas. */
  desde?: string;
  hasta?: string;
  onRango?: (rango: { from: string; to: string }) => void;
  /** Atajos a mostrar; por defecto los 6. */
  atajos?: readonly QuickRangeKey[];
  /** Ids de sucursal elegidos (`[]` = todas). Si se omite, no hay campo de sucursal. */
  sucursales?: string[];
  onSucursales?: (ids: string[]) => void;
  opcionesSucursales?: readonly OpcionSucursal[];
  /** `false` para un selector de una sola sucursal (backends que no admiten varias). */
  multipleSucursales?: boolean;
  onLimpiar?: () => void;
  children?: React.ReactNode;
  /** Inyectable en pruebas; por defecto `useHoy()`. */
  hoy?: Date | null;
  className?: string;
}

/**
 * El panel de filtros compartido: cabecera "FILTROS" + pastillas de atajo a
 * la derecha, y una cuadrícula con Desde/Hasta, Sucursales y los campos
 * propios de cada pantalla (`children`, cada uno envuelto en
 * `CampoDeFiltro`). Look portado de agendapp
 * (`SalesDashboard.tsx:266-313`), con los tokens de DermaLand.
 */
export function PanelDeFiltros({
  desde,
  hasta,
  onRango,
  atajos = ATAJOS.map((a) => a.clave),
  sucursales,
  onSucursales,
  opcionesSucursales = [],
  multipleSucursales = true,
  onLimpiar,
  children,
  hoy: hoyProp,
  className,
}: PanelDeFiltrosProps) {
  const hoyMontado = useHoy();
  const hoy = hoyProp !== undefined ? hoyProp : hoyMontado;
  const montado = hoy !== null;
  const tieneRango = desde !== undefined && hasta !== undefined && onRango !== undefined;
  const activo = tieneRango ? detectarAtajo(desde, hasta, hoy) : null;

  return (
    <Card className={cn("p-4 shadow-sm", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
          <Filter className="h-3.5 w-3.5" />
          Filtros
        </span>
        <div className="flex flex-wrap items-center gap-1.5">
          {tieneRango && (
            <ChipsDeAtajo
              activo={activo}
              montado={montado}
              atajos={atajos}
              onElegir={(clave) => onRango(rangoDeAtajo(clave, hoy ?? new Date()))}
            />
          )}
          {onLimpiar && (
            <Button size="sm" variant="ghost" onClick={onLimpiar}>
              Limpiar
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {tieneRango && <RangoDeFechas desde={desde} hasta={hasta} onChange={onRango} />}
        {sucursales !== undefined && onSucursales && (
          <CampoDeFiltro etiqueta="Locales / Sucursales">
            <SucursalesMultiSelect
              opciones={opcionesSucursales}
              seleccionadas={sucursales}
              onChange={onSucursales}
              multiple={multipleSucursales}
            />
          </CampoDeFiltro>
        )}
        {children}
      </div>
    </Card>
  );
}
