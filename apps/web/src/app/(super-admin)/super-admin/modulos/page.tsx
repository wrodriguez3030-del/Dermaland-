const modules = [
  { key: "dgii", label: "DGII e-CF", desc: "Facturación electrónica con firma XAdES y envío a DGII" },
  { key: "whatsapp", label: "WhatsApp Cloud API", desc: "Conversaciones, plantillas, envío de docs" },
  { key: "ai", label: "Agentes IA", desc: "OpenAI con tool calling — sin agendamiento" },
  { key: "api_v3", label: "API V3 pública", desc: "API REST con keys, scopes y rate limits" },
  { key: "webhooks", label: "Webhooks", desc: "Eventos out + reintentos con backoff" },
  { key: "website", label: "Sitio web público", desc: "Catálogo, sucursales, contacto WhatsApp" },
  { key: "mobile_pwa", label: "PWA conteo móvil", desc: "Conteo físico por escaneo offline-first" },
];

const businesses = [
  { id: "biz_dermaland", name: "DermaLand", plan: "Business / POS", enabled: ["mobile_pwa", "website", "whatsapp"] },
  { id: "biz_farmadream", name: "Farmadream Higüey", plan: "Pro", enabled: ["mobile_pwa", "whatsapp", "dgii"] },
  { id: "biz_alborada", name: "Farmacia La Alborada", plan: "Premium IA", enabled: ["mobile_pwa", "website", "whatsapp", "ai", "api_v3", "webhooks", "dgii"] },
  { id: "biz_purite", name: "Pur'ité Cosmética", plan: "Básico", enabled: [] },
];

export default function ModulosPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Módulos por negocio</h1>
        <p className="mt-1 text-sm text-violet-300">
          Activación granular de features. Bloqueo selectivo si tenant supera límites de plan.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-violet-800">
        <table className="w-full text-sm">
          <thead className="bg-violet-900/60 text-xs uppercase tracking-wider text-violet-300">
            <tr>
              <th className="px-4 py-3 text-left">Negocio</th>
              {modules.map((m) => (
                <th key={m.key} className="px-3 py-3 text-center">
                  {m.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-violet-800 bg-violet-900/20">
            {businesses.map((b) => (
              <tr key={b.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{b.name}</div>
                  <div className="text-xs text-violet-400">{b.plan}</div>
                </td>
                {modules.map((m) => (
                  <td key={m.key} className="px-3 py-3 text-center">
                    {b.enabled.includes(m.key) ? (
                      <span className="inline-block rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300">
                        ON
                      </span>
                    ) : (
                      <span className="inline-block rounded-full bg-violet-800 px-2 py-0.5 text-[10px] text-violet-400">
                        off
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
