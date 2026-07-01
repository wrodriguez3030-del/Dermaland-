import {
  DatabaseZap,
  FlaskConical,
  Boxes,
  Calculator,
  FileDown,
  Trash2,
  ShieldCheck,
} from "lucide-react";
import { SAHeader, SACard } from "@/components/layout/super-admin-ui";

const TOOLS = [
  { icon: DatabaseZap, title: "Verificar datos base", desc: "Chequeo read-only de integridad de negocios, sucursales y usuarios." },
  { icon: FlaskConical, title: "Verificar productos/laboratorios", desc: "Detecta productos vendidos sin laboratorio asignado." },
  { icon: Boxes, title: "Verificar stock / lotes", desc: "Revisa lotes vencidos, cantidades negativas y consistencia." },
  { icon: Calculator, title: "Recalcular KPIs", desc: "Recalcula indicadores del dashboard (no altera datos)." },
  { icon: FileDown, title: "Exportar diagnóstico", desc: "Descarga un resumen del estado del sistema (sin secretos)." },
  { icon: Trash2, title: "Limpiar caché local del navegador", desc: "Borra datos de demo en localStorage de este equipo." },
];

export default function SuperAdminHerramientas() {
  return (
    <>
      <SAHeader
        title="Herramientas"
        description="Utilidades administrativas seguras. Sin acciones destructivas ni SQL arbitrario."
      />

      <div className="mb-4 flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 text-emerald-300" />
        <span className="text-violet-100">
          Todas las herramientas son de solo lectura o seguras. No se permite borrar/reset/truncate
          la base, ejecutar SQL desde la UI, ni mostrar la <code>service_role</code>.
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <SACard key={t.title}>
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-violet-800 text-violet-200">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <div className="text-sm font-semibold">{t.title}</div>
                  <p className="mt-1 text-xs text-violet-300">{t.desc}</p>
                  <span className="mt-2 inline-block rounded bg-violet-800/60 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-violet-300">
                    Seguro · read-only
                  </span>
                </div>
              </div>
            </SACard>
          );
        })}
      </div>
    </>
  );
}
