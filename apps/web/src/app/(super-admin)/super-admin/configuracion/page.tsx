import { env } from "@/lib/env";
import { SAHeader, SACard } from "@/components/layout/super-admin-ui";

function Setting({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-violet-800/60 py-2.5 last:border-0">
      <span className="text-sm text-violet-200">{label}</span>
      <span className="text-sm font-medium text-violet-100">{value}</span>
    </div>
  );
}

export default function SuperAdminConfiguracion() {
  return (
    <>
      <SAHeader
        title="Configuración global"
        description="Ajustes de la plataforma DermaLand. El modo mantenimiento nunca bloquea a Súper Admin."
      />

      <div className="grid gap-4 md:grid-cols-2">
        <SACard title="Plataforma">
          <Setting label="Nombre de la plataforma" value="DermaLand" />
          <Setting label="Email de soporte" value="soporte@dermaland.do" />
          <Setting label="País por defecto" value="República Dominicana" />
          <Setting label="Moneda por defecto" value="RD$ (DOP)" />
          <Setting label="Zona horaria" value="America/Santo_Domingo" />
          <Setting label="ITBIS por defecto" value="18%" />
        </SACard>

        <SACard title="Ambiente y estado">
          <Setting label="Ambiente" value={env.NODE_ENV} />
          <Setting label="Data source" value={env.DATA_SOURCE} />
          <Setting label="Modo mantenimiento" value="Desactivado" />
          <Setting label="Permitir nuevos registros" value="Sí" />
          <Setting label="DGII real" value="Apagado (seguro)" />
          <p className="mt-3 text-xs text-violet-400">
            La edición de estos ajustes (y el modo mantenimiento con confirmación) se persiste
            con la tabla <code>platform_settings</code>; hoy se muestran de solo lectura.
          </p>
        </SACard>
      </div>
    </>
  );
}
