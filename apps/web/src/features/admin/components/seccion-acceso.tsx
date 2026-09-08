"use client";

import * as React from "react";
import { KeyRound, ShieldCheck, ShieldAlert, UserX, Copy, Check, RefreshCw } from "lucide-react";
import { Button, Input, Label } from "@/components/ui";
import { generarClaveLegible, esClaveAceptable } from "@/lib/auth/password-generator";
import { PASSWORD_RULES } from "@/lib/auth/password-policy";
import { asignarClave, type UsuarioDelPanel } from "../user-store";
import { ClaveReveal } from "./clave-reveal";
import { formatDateTime } from "@/lib/utils/format";

/**
 * Acceso al sistema de una persona: si puede entrar, con qué clave y con qué
 * segundo factor.
 *
 * Es la sección que el dueño pidió: «el admin y el super admin deben asignar
 * clave a cada user y poderla ver con el ojo». Antes esta pantalla decía
 * literalmente que el acceso «se gestiona por separado», y de las ocho fichas
 * solo dos tenían cuenta: las cinco vendedoras y el propio Dario no podían
 * entrar al sistema que estaban usando.
 *
 * La clave nueva se genera y se ENSEÑA mientras se escribe: es lo que el
 * administrador tiene que dictarle o copiarle a la persona. Lo que no se
 * enseña sin pulsar es la clave YA guardada — para eso está el ojo, que además
 * deja registro.
 */
export function SeccionAcceso({
  usuario,
  onCambio,
}: {
  usuario: UsuarioDelPanel;
  /** Se llama tras fijar la clave, para refrescar la lista. */
  onCambio?: () => void;
}) {
  const [clave, setClave] = React.useState("");
  const [guardando, setGuardando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [exito, setExito] = React.useState<string | null>(null);
  const [copiada, setCopiada] = React.useState(false);

  const tieneCuenta = usuario.tieneCuenta === true;
  const valida = esClaveAceptable(clave);

  function generar() {
    setClave(generarClaveLegible());
    setCopiada(false);
    setError(null);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(clave);
      setCopiada(true);
    } catch {
      setError("No se pudo copiar. Selecciónala y cópiala a mano.");
    }
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    setExito(null);
    const r = await asignarClave(usuario.id, clave);
    setGuardando(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setExito(
      r.cuentaCreada
        ? `${usuario.fullName} ya puede entrar al sistema. Entrégale la clave antes de cerrar.`
        : "Clave cambiada. Entrégasela antes de cerrar.",
    );
    onCambio?.();
  }

  return (
    <div className="mt-4 rounded-lg border border-black/10 p-3">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4" />
        Acceso al sistema
      </div>

      {/* Estado actual, con lo que dice Auth de verdad — no la columna
          `two_factor_enabled` de la ficha, que está en `false` para todos
          incluido quien sí tiene el segundo factor puesto. */}
      <div className="mb-3 grid gap-1 text-xs">
        {tieneCuenta ? (
          <>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
              <span>
                Puede entrar
                {usuario.bloqueado ? " (cuenta bloqueada)" : ""}
                {usuario.ultimoAcceso
                  ? ` · último acceso ${formatDateTime(usuario.ultimoAcceso)}`
                  : " · todavía no ha entrado"}
              </span>
            </div>
            <div className="opacity-70">
              Segundo factor:{" "}
              {(usuario.totpVerificados ?? 0) > 0 ? "activo" : "sin configurar"}
              {(usuario.dispositivosActivos ?? 0) > 0
                ? ` · ${usuario.dispositivosActivos} computadora(s) de confianza`
                : ""}
            </div>
            {usuario.claveDesincronizada ? (
              <div className="flex items-center gap-1.5 font-medium text-amber-800">
                <ShieldAlert className="h-3.5 w-3.5" />
                La clave se cambió por fuera del panel: lo guardado ya no abre su
                cuenta. Asígnale una nueva.
              </div>
            ) : usuario.claveGestionada ? (
              <div className="opacity-70">
                Clave asignada desde el panel
                {usuario.claveAsignadaEl ? ` el ${formatDateTime(usuario.claveAsignadaEl)}` : ""}.
              </div>
            ) : (
              <div className="opacity-70">
                La clave de esta persona no se fijó desde el panel, así que no hay
                nada que mostrar. Puedes asignarle una nueva.
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center gap-1.5 font-medium text-amber-800">
            <UserX className="h-3.5 w-3.5" />
            Sin cuenta: hoy NO puede entrar al sistema. Asígnale una clave para
            darle acceso.
          </div>
        )}
      </div>

      {/* El ojo, solo cuando hay algo guardado que enseñar. */}
      {tieneCuenta && usuario.claveGestionada && !usuario.claveDesincronizada && (
        <div className="mb-3">
          <ClaveReveal userId={usuario.id} nombre={usuario.fullName} />
        </div>
      )}

      <Label htmlFor="clave-nueva">
        {tieneCuenta ? "Cambiar la clave" : "Clave para darle acceso"}
      </Label>
      <div className="mt-1 flex gap-2">
        <Input
          id="clave-nueva"
          // Se ve mientras se escribe a propósito: es la clave que el
          // administrador tiene que dictar o copiar en ese momento.
          type="text"
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
          value={clave}
          onChange={(e) => {
            setClave(e.target.value);
            setCopiada(false);
          }}
          placeholder="Kx7m-Rt4p-Wq9s"
        />
        <Button variant="outline" size="sm" onClick={generar} aria-label="Generar una clave">
          <RefreshCw className="h-3.5 w-3.5" />
          Generar
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void copiar()}
          disabled={!clave}
          aria-label="Copiar la clave"
        >
          {copiada ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {clave !== "" && !valida && (
        <ul className="mt-1 list-inside list-disc text-[11px] text-amber-800">
          {PASSWORD_RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex items-center gap-2">
        <Button size="sm" disabled={!valida || guardando} onClick={() => void guardar()}>
          {guardando ? "…" : tieneCuenta ? "Cambiar la clave" : "Dar acceso"}
        </Button>
        {(usuario.totpVerificados ?? 0) === 0 &&
          (usuario.role === "admin" || usuario.role === "super_admin") && (
            <span className="text-[11px] opacity-70">
              Al ser administrador, tendrá que activar el segundo factor en su
              primer acceso.
            </span>
          )}
      </div>

      {error && <p className="mt-2 text-xs font-medium text-red-700">{error}</p>}
      {exito && <p className="mt-2 text-xs font-medium text-emerald-800">{exito}</p>}
    </div>
  );
}
