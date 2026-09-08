"use client";

import * as React from "react";
import { Eye, EyeOff, RefreshCw, Copy, Check } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { generarClaveLegible, esClaveAceptable } from "@/lib/auth/password-generator";
import { PASSWORD_RULES } from "@/lib/auth/password-policy";

/**
 * El campo donde se escribe (o se genera) la clave de un usuario, con el ojo
 * para verla.
 *
 * Vive aparte porque hacen falta DOS: al crear la persona y al cambiarle la
 * clave después. Tenerlo escrito dos veces acabaría con uno de los dos
 * validando distinto que el otro — y el que valide de menos deja pasar una
 * clave que el servidor rechaza, con el usuario ya creado.
 *
 * 🔴 Empieza OCULTA. El ojo la enseña, pero por defecto no: quien crea un
 * usuario suele tener a alguien al lado, y una clave a la vista en pantalla es
 * una clave que ya vio otra persona.
 */
export function CampoClave({
  valor,
  onChange,
  etiqueta = "Clave de acceso",
  ayuda,
  id = "clave",
}: {
  valor: string;
  onChange: (v: string) => void;
  etiqueta?: string;
  ayuda?: string;
  id?: string;
}) {
  const [visible, setVisible] = React.useState(false);
  const [copiada, setCopiada] = React.useState(false);
  const valida = esClaveAceptable(valor);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiada(true);
    } catch {
      // Sin portapapeles se selecciona a mano; no vale la pena un error rojo.
    }
  }

  return (
    <div>
      <Label htmlFor={id}>{etiqueta}</Label>
      <div className="mt-1 flex gap-2">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          autoComplete="new-password"
          spellCheck={false}
          className="font-mono"
          value={valor}
          onChange={(e) => {
            onChange(e.target.value);
            setCopiada(false);
          }}
          placeholder="Kx7m-Rt4p-Wq9s"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar la clave" : "Ver la clave"}
          title={visible ? "Ocultar la clave" : "Ver la clave"}
        >
          {visible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            onChange(generarClaveLegible());
            // Se enseña al generarla: hay que poder dictarla o copiarla.
            setVisible(true);
            setCopiada(false);
          }}
          aria-label="Generar una clave"
          title="Generar una clave"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!valor}
          onClick={() => void copiar()}
          aria-label="Copiar la clave"
          title="Copiar la clave"
        >
          {copiada ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {ayuda && <p className="mt-1 text-[11px] opacity-60">{ayuda}</p>}

      {valor !== "" && !valida && (
        <ul className="mt-1 list-inside list-disc text-[11px] text-amber-800">
          {PASSWORD_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
