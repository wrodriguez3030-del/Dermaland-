"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";

/**
 * Panel de cuentas bancarias.
 *
 * La lista se guarda **entera y reemplazando**: quitar una cuenta que ya no se
 * usa tiene que ser tan fácil como borrarla de aquí. Dejar activa una cuenta
 * vieja significa dinero de clientes yendo a donde no debe.
 */

interface Cuenta {
  bankName: string;
  accountType: "ahorros" | "corriente";
  accountNumber: string;
  holderName: string;
  holderDocument?: string;
  active: boolean;
}

const VACIA: Cuenta = {
  bankName: "",
  accountType: "ahorros",
  accountNumber: "",
  holderName: "",
  holderDocument: "",
  active: true,
};

export function BankAccountsForm({ initial }: { initial: Cuenta[] }) {
  const router = useRouter();
  const [cuentas, setCuentas] = React.useState<Cuenta[]>(
    initial.length > 0 ? initial : [VACIA],
  );
  const [guardando, setGuardando] = React.useState(false);
  const [mensaje, setMensaje] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const activas = cuentas.filter((c) => c.active && c.accountNumber.trim()).length;

  function cambiar(i: number, cambios: Partial<Cuenta>) {
    setCuentas((prev) =>
      prev.map((c, j) => (j === i ? { ...c, ...cambios } : c)),
    );
    setMensaje(null);
  }

  async function guardar() {
    setGuardando(true);
    setError(null);
    setMensaje(null);
    try {
      // Las filas en blanco no se mandan: una fila vacía que alguien añadió y
      // no rellenó no debería impedir guardar el resto.
      const utiles = cuentas.filter(
        (c) => c.bankName.trim() && c.accountNumber.trim() && c.holderName.trim(),
      );
      const resp = await fetch("/api/cuentas-bancarias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accounts: utiles }),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => null);
        setError(d?.error ?? "No se pudieron guardar las cuentas.");
        return;
      }
      setMensaje(
        activas === 0
          ? "Guardado. Sin cuentas activas, la tienda no ofrece transferencia."
          : `Guardado. La tienda ofrece ${activas} ${activas === 1 ? "cuenta" : "cuentas"}.`,
      );
      router.refresh();
    } catch {
      setError("No se pudieron guardar las cuentas.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="space-y-4">
      {mensaje ? (
        <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {mensaje}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <ul className="space-y-4">
        {cuentas.map((c, i) => (
          <li key={i} className="rounded-2xl border border-black/5 bg-white p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium text-[color:var(--brand-fg)]">
                  Banco
                  <input
                    value={c.bankName}
                    onChange={(e) => cambiar(i, { bankName: e.target.value })}
                    maxLength={80}
                    placeholder="Banco Popular"
                    className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal"
                  />
                </label>
              </div>

              <div>
                <label className="text-sm font-medium text-[color:var(--brand-fg)]">
                  Tipo de cuenta
                  <select
                    value={c.accountType}
                    onChange={(e) =>
                      cambiar(i, {
                        accountType: e.target.value as Cuenta["accountType"],
                      })
                    }
                    className="mt-1 min-h-11 w-full cursor-pointer rounded-xl border border-black/10 bg-white px-3 text-sm font-normal"
                  >
                    <option value="ahorros">Ahorros</option>
                    <option value="corriente">Corriente</option>
                  </select>
                </label>
              </div>

              <div>
                <label className="text-sm font-medium text-[color:var(--brand-fg)]">
                  Número de cuenta
                  <input
                    value={c.accountNumber}
                    onChange={(e) =>
                      cambiar(i, { accountNumber: e.target.value })
                    }
                    inputMode="numeric"
                    maxLength={30}
                    className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 font-mono text-sm font-normal"
                  />
                </label>
              </div>

              <div>
                <label className="text-sm font-medium text-[color:var(--brand-fg)]">
                  Titular
                  <input
                    value={c.holderName}
                    onChange={(e) => cambiar(i, { holderName: e.target.value })}
                    maxLength={120}
                    className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal"
                  />
                </label>
              </div>

              <div>
                <label className="text-sm font-medium text-[color:var(--brand-fg)]">
                  Cédula o RNC <span className="font-normal">(opcional)</span>
                  <input
                    value={c.holderDocument ?? ""}
                    onChange={(e) =>
                      cambiar(i, { holderDocument: e.target.value })
                    }
                    maxLength={30}
                    className="mt-1 min-h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm font-normal"
                  />
                </label>
              </div>

              <div className="flex items-end justify-between gap-3">
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-[color:var(--brand-fg)]">
                  <input
                    type="checkbox"
                    checked={c.active}
                    onChange={(e) => cambiar(i, { active: e.target.checked })}
                    className="h-5 w-5 cursor-pointer rounded border-black/20"
                  />
                  La ofrecemos en la tienda
                </label>

                {cuentas.length > 1 ? (
                  <button
                    type="button"
                    onClick={() =>
                      setCuentas((prev) => prev.filter((_, j) => j !== i))
                    }
                    className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-lg px-2 text-sm text-[color:var(--brand-fg)]/60 hover:text-red-700"
                  >
                    <Trash2 aria-hidden className="h-4 w-4" />
                    Quitar
                  </button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => setCuentas((prev) => [...prev, { ...VACIA }])}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-black/10 bg-white px-5 text-sm font-medium text-[color:var(--brand-fg)] hover:border-[color:var(--brand-primary)]"
        >
          <Plus aria-hidden className="h-4 w-4" />
          Añadir cuenta
        </button>

        <button
          type="button"
          onClick={guardar}
          disabled={guardando}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-[color:var(--brand-primary)] px-5 text-sm font-semibold text-white hover:bg-[color:var(--brand-accent)] disabled:cursor-default disabled:opacity-50"
        >
          {guardando ? (
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          ) : null}
          Guardar cuentas
        </button>
      </div>

      <p className="text-sm text-[color:var(--brand-fg)]/60">
        El cliente ve estas cuentas al elegir transferencia y sube su comprobante
        después. Un pedido solo queda pagado cuando alguien del negocio acepta
        ese comprobante.
      </p>
    </div>
  );
}
