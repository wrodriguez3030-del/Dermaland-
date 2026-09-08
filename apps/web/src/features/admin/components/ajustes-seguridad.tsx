"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
import { Button, Label, Select } from "@/components/ui";

/**
 * «Cuántos días una computadora queda de confianza tras el doble factor.»
 *
 * El dueño lo pidió con estas palabras: «en el panel quiero que el admin ponga
 * los días». Nace en 0 —la función apagada— para que aplicar la migración no
 * cambie por sorpresa cómo entra nadie.
 *
 * El texto de abajo dice lo que la casilla NO exime, y no es un detalle: la
 * diferencia entre «no me pide el código al entrar» y «no me pide el código
 * para ver la clave de alguien» es justamente lo que hace que esto sea
 * aceptable.
 */
const OPCIONES = [
  { valor: 0, texto: "Pedir el código siempre (desactivado)" },
  { valor: 7, texto: "7 días" },
  { valor: 14, texto: "14 días" },
  { valor: 30, texto: "30 días" },
  { valor: 60, texto: "60 días" },
  { valor: 90, texto: "90 días" },
];

export function AjustesSeguridad() {
  const [dias, setDias] = React.useState<number | null>(null);
  const [guardando, setGuardando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [exito, setExito] = React.useState<string | null>(null);

  React.useEffect(() => {
    let vigente = true;
    fetch("/api/settings/seguridad")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no se pudo cargar"))))
      .then((d: { trustedDeviceDays?: number }) => {
        if (vigente) setDias(Number(d.trustedDeviceDays) || 0);
      })
      .catch(() => {
        if (vigente) setError("No se pudieron cargar los ajustes de seguridad.");
      });
    return () => {
      vigente = false;
    };
  }, []);

  async function guardar(nuevo: number) {
    setGuardando(true);
    setError(null);
    setExito(null);
    try {
      const res = await fetch("/api/settings/seguridad", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trustedDeviceDays: nuevo }),
      });
      const cuerpo = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
      if (!res.ok) {
        if (cuerpo.code === "segundo_factor_requerido" && typeof window !== "undefined") {
          window.location.href = `/login/mfa?next=${encodeURIComponent(window.location.pathname)}`;
          return;
        }
        setError(cuerpo.error ?? "No se pudo guardar.");
        return;
      }
      setDias(nuevo);
      setExito(
        nuevo === 0
          ? "Listo: el código se pedirá siempre."
          : `Listo: una computadora quedará de confianza ${nuevo} días.`,
      );
    } catch {
      setError("Sin conexión con el servidor.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-black/10 p-4">
      <div className="mb-1 flex items-center gap-2 text-sm font-medium">
        <ShieldCheck className="h-4 w-4" />
        Computadoras de confianza
      </div>
      <p className="mb-3 text-xs opacity-70">
        Tras escribir el código del segundo factor, quien marque «recordar esta
        computadora» no volverá a teclearlo al entrar durante los días que fijes
        aquí. Seguirá pidiéndose para ver o cambiar claves, cambiar roles y
        tocar este mismo ajuste.
      </p>

      <Label htmlFor="dias-confianza">Días de confianza</Label>
      <div className="mt-1 flex items-center gap-2">
        <Select
          id="dias-confianza"
          className="max-w-xs"
          value={dias === null ? "" : String(dias)}
          disabled={dias === null || guardando}
          onChange={(e) => void guardar(Number(e.target.value))}
        >
          {dias === null && <option value="">Cargando…</option>}
          {OPCIONES.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.texto}
            </option>
          ))}
        </Select>
        {guardando && <span className="text-xs opacity-60">Guardando…</span>}
      </div>

      {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
      {exito && <p className="mt-2 text-xs font-medium text-emerald-800">{exito}</p>}
    </div>
  );
}

/** Reexportado para la pantalla de usuarios, que la pinta arriba de la tabla. */
export default AjustesSeguridad;
