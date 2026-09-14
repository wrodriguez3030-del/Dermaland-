"use client";

import { Input, Label } from "@/components/ui";

/** Los dos campos de fecha (Desde/Hasta) del panel de filtros. */
export function RangoDeFechas({
  desde,
  hasta,
  onChange,
}: {
  desde: string;
  hasta: string;
  onChange: (rango: { from: string; to: string }) => void;
}) {
  return (
    <>
      <div className="min-w-0">
        <Label className="text-xs text-slate-500">Desde</Label>
        <Input
          type="date"
          value={desde}
          onChange={(e) => onChange({ from: e.target.value, to: hasta })}
        />
      </div>
      <div className="min-w-0">
        <Label className="text-xs text-slate-500">Hasta</Label>
        <Input
          type="date"
          value={hasta}
          onChange={(e) => onChange({ from: desde, to: e.target.value })}
        />
      </div>
    </>
  );
}
