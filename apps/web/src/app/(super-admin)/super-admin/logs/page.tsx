import { SAHeader, SAStat, SAEmpty } from "@/components/layout/super-admin-ui";

export default function SuperAdminLogs() {
  return (
    <>
      <SAHeader
        title="Logs / errores"
        description="Errores del sistema (frontend, backend, integraciones). Detalle técnico controlado, nunca secretos."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <SAStat label="Errores 24h" value={0} tone="success" />
        <SAStat label="Advertencias" value={0} />
        <SAStat label="Sin revisar" value={0} />
      </div>

      <SAEmpty
        title="Sin errores registrados"
        description="No hay una tabla de logs del sistema todavía (system_logs). Se habilita con una migración no destructiva + captura de errores de servidor; entonces aquí verás nivel, módulo, empresa, mensaje y fecha con filtros y exportación. Nunca se mostrarán stack traces con secretos."
      />
    </>
  );
}
