import { Apple, Smartphone } from "lucide-react";
import { APPS_AUTENTICACION } from "./apps-autenticacion";

/**
 * Enlaces para descargar una app de autenticación, para quien todavía no tiene
 * ninguna. Se enseñan ANTES del QR: escanear sin app instalada no lleva a
 * ninguna parte.
 *
 * `rel="noopener noreferrer"` en todos: abren una pestaña nueva hacia fuera.
 */
export function EnlacesAuthenticator() {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {APPS_AUTENTICACION.map((app) => (
        <div
          key={app.nombre}
          className="rounded-lg border border-black/10 p-3 text-xs"
        >
          <div className="mb-2 font-medium">{app.nombre}</div>
          <div className="flex gap-2">
            <a
              href={app.ios}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-black/10 px-2 py-1.5 hover:bg-black/[0.03]"
            >
              <Apple className="h-3.5 w-3.5" />
              iPhone
            </a>
            <a
              href={app.android}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-md border border-black/10 px-2 py-1.5 hover:bg-black/[0.03]"
            >
              <Smartphone className="h-3.5 w-3.5" />
              Android
            </a>
          </div>
        </div>
      ))}
    </div>
  );
}
