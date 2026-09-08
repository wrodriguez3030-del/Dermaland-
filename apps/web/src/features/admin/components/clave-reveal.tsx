"use client";

import * as React from "react";
import { Eye, EyeOff, Copy, Check, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui";
import { verClave } from "../user-store";

/**
 * El ojo: enseña la clave guardada de un usuario.
 *
 * El dueño lo pidió así —«poderla ver con el ojo»— sabiendo lo que significa
 * guardar claves legibles. Lo que hace este componente para que sea lo menos
 * dañino posible:
 *
 *  - No pide la clave hasta que alguien PULSA. Pintar la pantalla no destapa
 *    ocho claves de golpe ni deja ocho registros en auditoría.
 *  - La clave vive en el estado de este componente y en ningún sitio más: ni
 *    en la lista de usuarios, ni en `localStorage`, ni en la URL.
 *  - Se borra sola a los 30 segundos, y también al desmontar. Una clave
 *    olvidada en pantalla es una clave a la vista de quien pase por detrás.
 *  - Avisa de que la consulta queda registrada ANTES de pedirla, no después.
 */

const SEGUNDOS = 30;

export function ClaveReveal({
  userId,
  nombre,
}: {
  userId: string;
  /** Para el aviso; nunca se manda al servidor. */
  nombre: string;
}) {
  const [clave, setClave] = React.useState<string | null>(null);
  const [restante, setRestante] = React.useState(0);
  const [cargando, setCargando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [copiada, setCopiada] = React.useState(false);

  const ocultar = React.useCallback(() => {
    setClave(null);
    setRestante(0);
    setCopiada(false);
  }, []);

  // Cuenta atrás. El intervalo se limpia al desmontar, así que la clave no
  // sobrevive a cerrar el modal ni a navegar.
  React.useEffect(() => {
    if (clave === null) return;
    if (restante <= 0) {
      ocultar();
      return;
    }
    const t = setTimeout(() => setRestante((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [clave, restante, ocultar]);

  React.useEffect(() => ocultar, [ocultar]);

  async function pedir() {
    setCargando(true);
    setError(null);
    const r = await verClave(userId);
    setCargando(false);
    if (!r.ok) {
      // Si falta el segundo factor, `verClave` ya está navegando al desafío;
      // el mensaje se enseña igual por si la navegación no ocurre.
      setError(r.error);
      return;
    }
    setClave(r.clave);
    setRestante(SEGUNDOS);
  }

  async function copiar() {
    if (!clave) return;
    try {
      await navigator.clipboard.writeText(clave);
      setCopiada(true);
    } catch {
      setError("No se pudo copiar. Selecciónala y cópiala a mano.");
    }
  }

  if (clave !== null) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <code className="select-all font-mono text-sm text-amber-950">{clave}</code>
          <div className="flex shrink-0 items-center gap-1">
            <Button variant="outline" size="sm" onClick={copiar} aria-label="Copiar la clave">
              {copiada ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copiada ? "Copiada" : "Copiar"}
            </Button>
            <Button variant="outline" size="sm" onClick={ocultar} aria-label="Ocultar la clave">
              <EyeOff className="h-3.5 w-3.5" />
              Ocultar
            </Button>
          </div>
        </div>
        <p className="mt-2 text-amber-900">
          Se oculta sola en {restante} s. Esta consulta quedó registrada en auditoría.
        </p>
      </div>
    );
  }

  return (
    <div className="text-xs">
      <Button variant="outline" size="sm" disabled={cargando} onClick={() => void pedir()}>
        <Eye className="h-3.5 w-3.5" />
        {cargando ? "…" : "Ver la clave"}
      </Button>
      <p className="mt-1 flex items-start gap-1 opacity-70">
        <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
        <span>
          Ver la clave de {nombre} queda registrado en auditoría, con tu nombre y la
          hora.
        </span>
      </p>
      {error && <p className="mt-1 font-medium text-red-700">{error}</p>}
    </div>
  );
}
