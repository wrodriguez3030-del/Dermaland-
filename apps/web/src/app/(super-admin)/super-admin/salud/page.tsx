import { CheckCircle2, XCircle } from "lucide-react";
import {
  env,
  isSupabaseConfigured,
  isDgiiConfigured,
  isWhatsappConfigured,
  isOpenAIConfigured,
} from "@/lib/env";
import { SAHeader, SAStat, SACard } from "@/components/layout/super-admin-ui";

function Dot({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
  ) : (
    <XCircle className="h-4 w-4 text-rose-400" />
  );
}

function Row({ label, ok, value }: { label: string; ok?: boolean; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-violet-800/60 py-2 last:border-0">
      <span className="text-sm text-violet-200">{label}</span>
      <span className="flex items-center gap-2 text-sm">
        {ok !== undefined && <Dot ok={ok} />}
        <span className="text-violet-100">{value}</span>
      </span>
    </div>
  );
}

export default function SuperAdminSalud() {
  const supa = isSupabaseConfigured();
  const dgii = isDgiiConfigured();
  const dataSource = env.DATA_SOURCE;
  // Presencia de variables requeridas (NUNCA su valor).
  const required: Array<[string, boolean]> = [
    ["NEXT_PUBLIC_SUPABASE_URL", !!process.env.NEXT_PUBLIC_SUPABASE_URL],
    ["NEXT_PUBLIC_SUPABASE_ANON_KEY", !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
    ["SUPABASE_SERVICE_ROLE_KEY", !!process.env.SUPABASE_SERVICE_ROLE_KEY],
    ["DATA_SOURCE", !!process.env.DATA_SOURCE],
  ];

  return (
    <>
      <SAHeader
        title="Salud del sistema"
        description="Estado de la app y sus integraciones. Nunca se muestran valores de secretos."
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SAStat label="App" value="Operativa" tone="success" />
        <SAStat label="Data source" value={dataSource} />
        <SAStat label="Supabase" value={supa ? "Conectado" : "No config."} tone={supa ? "success" : "warning"} />
        <SAStat label="DGII real" value={dgii ? "Encendido" : "Apagado"} tone={dgii ? "warning" : "success"} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <SACard title="Servicios e integraciones">
          <Row label="Ambiente" value={env.NODE_ENV} />
          <Row label="Fuente de datos" value={dataSource} />
          <Row label="Supabase conectado" ok={supa} value={supa ? "Sí" : "No"} />
          <Row label="DGII real" ok={!dgii} value={dgii ? "Encendido" : "Apagado (seguro)"} />
          <Row label="WhatsApp" ok={isWhatsappConfigured()} value={isWhatsappConfigured() ? "Configurado" : "No"} />
          <Row label="OpenAI / IA" ok={isOpenAIConfigured()} value={isOpenAIConfigured() ? "Configurado" : "No"} />
          <Row label="Endpoint salud" value="/api/health" />
        </SACard>

        <SACard title="Variables requeridas (presencia, sin valores)">
          {required.map(([k, present]) => (
            <Row key={k} label={k} ok={present} value={present ? "Presente" : "Falta"} />
          ))}
          <p className="mt-3 text-xs text-violet-400">
            Por seguridad nunca se muestra el valor de una variable; solo si está configurada.
            La `service_role` jamás llega al navegador.
          </p>
        </SACard>
      </div>
    </>
  );
}
