import { AlertTriangle } from "lucide-react";

/**
 * Advertencia superior estándar del módulo DGII / Facturación.
 * Recordatorio permanente de que mock/demo no consume secuencia fiscal real.
 */
export function BillingDgiiWarning() {
  return (
    <div className="mb-5 rounded-2xl border border-amber-300 bg-amber-50 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <p className="text-sm text-amber-900">
          Las numeraciones e-CF reales no se emiten sin autorización DGII. Los
          ambientes <strong>testecf / certecf / producción</strong> requieren
          postulación DGII, certificado y rango autorizado. Los ambientes{" "}
          <strong>mock / demo</strong> nunca consumen secuencia fiscal real.
        </p>
      </div>
    </div>
  );
}
