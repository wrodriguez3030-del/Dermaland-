"use client";

import * as React from "react";
import {
  PROVINCIAS,
  getMunicipiosOfProvince,
  findLocationByCode,
} from "@/lib/dgii/dr-locations";

/**
 * Selector cascada Provincia → Municipio con códigos oficiales DGII.
 *
 * Devuelve el código DGII de 6 dígitos (e.g. `250100` = Santiago de los
 * Caballeros) listo para emitir como `<Municipio>` / `<Provincia>` en el
 * XML e-CF.
 *
 * Datos provienen del XSD oficial (582 entradas). Ver `dr-locations.ts`
 * y `scripts/extract-dgii-locations.sh`.
 */

export interface DgiiLocationSelectProps {
  /** Código DGII actual del municipio (o provincia si no se eligió municipio). */
  value?: string;
  onChange: (input: {
    provinceCode: string | null;
    municipioCode: string | null;
    /** Código final a emitir en el XML (municipio si existe, sino provincia). */
    code: string | null;
  }) => void;
  /** Etiqueta del fieldset (default "Ubicación"). */
  label?: string;
  /** Si true, no permite seleccionar — para vista de solo lectura. */
  disabled?: boolean;
}

export function DgiiLocationSelect({
  value,
  onChange,
  label = "Ubicación",
  disabled = false,
}: DgiiLocationSelectProps) {
  const initialMatch = value ? findLocationByCode(value) : undefined;
  const [provinceCode, setProvinceCode] = React.useState<string>(
    initialMatch?.provinceCode ?? "",
  );
  const [municipioCode, setMunicipioCode] = React.useState<string>(
    initialMatch && initialMatch.type === "municipio" ? initialMatch.code : "",
  );

  const municipios = React.useMemo(
    () => (provinceCode ? getMunicipiosOfProvince(provinceCode) : []),
    [provinceCode],
  );

  const emit = (p: string, m: string) => {
    onChange({
      provinceCode: p || null,
      municipioCode: m || null,
      code: m || p || null,
    });
  };

  return (
    <fieldset className="space-y-2">
      <legend className="text-[11px] font-medium opacity-70">{label}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <label className="block text-[10px] uppercase tracking-wider opacity-60">
            Provincia
          </label>
          <select
            disabled={disabled}
            value={provinceCode}
            onChange={(e) => {
              const p = e.target.value;
              setProvinceCode(p);
              setMunicipioCode("");
              emit(p, "");
            }}
            className="mt-1 h-9 w-full rounded-md border border-black/15 bg-white px-2 text-sm"
          >
            <option value="">— Seleccionar provincia —</option>
            {PROVINCIAS.map((p) => (
              <option key={p.code} value={p.code}>
                {humanize(p.name)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-wider opacity-60">
            Municipio
          </label>
          <select
            disabled={disabled || !provinceCode || municipios.length === 0}
            value={municipioCode}
            onChange={(e) => {
              const m = e.target.value;
              setMunicipioCode(m);
              emit(provinceCode, m);
            }}
            className="mt-1 h-9 w-full rounded-md border border-black/15 bg-white px-2 text-sm disabled:opacity-50"
          >
            <option value="">— Sin municipio específico —</option>
            {municipios.map((m) => (
              <option key={m.code} value={m.code}>
                {humanize(m.name)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {(provinceCode || municipioCode) && (
        <p className="text-[10px] font-mono opacity-60">
          Código DGII a emitir:{" "}
          <span className="font-semibold">
            {municipioCode || provinceCode}
          </span>
        </p>
      )}
      <p className="text-[10px] opacity-60">
        Códigos oficiales del XSD DGII e-CF v.1.0 (582 entradas). Validar
        contra catálogo publicado por DGII si los nombres difieren del
        portal oficial.
      </p>
    </fieldset>
  );
}

/**
 * Convierte "MUNICIPIO SANTO DOMINGO DE GUZMÁN" → "Municipio Santo Domingo
 * de Guzmán" para mostrar en la UI. Mantiene el código en uppercase
 * cuando se envía al XML.
 */
function humanize(name: string): string {
  return name
    .toLocaleLowerCase("es-DO")
    .replace(/\b\w/g, (c) => c.toLocaleUpperCase("es-DO"))
    .replace(/\(D\. M\.\)\./i, "(D.M.)")
    .replace(/\(d\. m\.\)\./i, "(D.M.)");
}
