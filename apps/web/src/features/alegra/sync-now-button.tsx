"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Button, Select } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

/**
 * Pide a GitHub Actions que corra la sincronización. No sincroniza aquí: la
 * corrida es la misma que la de las 6:00 a. m., con su registro y su reporte.
 */
export function SyncNowButton({ canTrigger }: { canTrigger: boolean }) {
  const toast = useToast();
  const [modo, setModo] = React.useState<"incremental" | "full">("incremental");
  const [enviando, setEnviando] = React.useState(false);

  if (!canTrigger) {
    return (
      <p className="text-xs opacity-60">
        Para lanzarla desde aquí falta configurar el token de GitHub Actions. Mientras tanto corre
        sola todos los días a las 6:00 a. m.
      </p>
    );
  }

  const lanzar = async () => {
    if (enviando) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/alegra/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modo }),
      });
      const json = (await res.json()) as { error?: string; mensaje?: string };
      if (!res.ok) {
        toast.error(json.error ?? "No se pudo lanzar la sincronización.");
        return;
      }
      toast.success(json.mensaje ?? "Sincronización lanzada.");
    } catch {
      toast.error("No se pudo contactar con el servidor.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        value={modo}
        onChange={(e) => setModo(e.target.value === "full" ? "full" : "incremental")}
        className="w-auto"
        aria-label="Alcance de la sincronización"
      >
        <option value="incremental">Solo lo nuevo</option>
        <option value="full">Todo el histórico</option>
      </Select>
      <Button type="button" onClick={() => void lanzar()} disabled={enviando}>
        <RefreshCw className={`h-4 w-4 ${enviando ? "animate-spin" : ""}`} />
        {enviando ? "Lanzando…" : "Sincronizar ahora"}
      </Button>
      <span className="text-xs opacity-60">
        Tarda unos minutos. Recarga esta página para ver el resultado.
      </span>
    </div>
  );
}
