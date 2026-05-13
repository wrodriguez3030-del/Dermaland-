export default function BrandingPage() {
  const tokens = [
    { key: "--brand-primary", value: "#2DB4A8", label: "Primario" },
    { key: "--brand-accent", value: "#1A7F8E", label: "Acento" },
    { key: "--brand-fg", value: "#0F2933", label: "Texto" },
    { key: "--brand-bg", value: "#F7FBFB", label: "Fondo" },
    { key: "--brand-success", value: "#16A34A", label: "Éxito" },
    { key: "--brand-warn", value: "#F59E0B", label: "Advertencia" },
    { key: "--brand-danger", value: "#DC2626", label: "Peligro" },
  ];
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Branding por negocio</h1>
        <p className="mt-1 text-sm text-violet-300">
          Tokens CSS centralizados. Un solo cambio aplica en toda la app del business.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tokens.map((t) => (
          <div
            key={t.key}
            className="rounded-2xl border border-violet-800 bg-violet-900/40 p-4"
          >
            <div className="flex items-center gap-3">
              <div
                className="h-12 w-12 rounded-xl border border-white/10"
                style={{ background: t.value }}
              />
              <div>
                <div className="text-sm font-semibold">{t.label}</div>
                <div className="font-mono text-[10px] text-violet-300">{t.value}</div>
                <div className="font-mono text-[10px] text-violet-400">{t.key}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-violet-800 bg-violet-900/40 p-5">
        <h2 className="text-sm font-semibold">Logos y favicons</h2>
        <p className="mt-1 text-sm text-violet-300">
          Subir PNG/SVG en{" "}
          <code className="rounded bg-violet-800 px-1 text-xs">apps/web/public/brand/</code>.
          Tamaños sugeridos: 192×192, 512×512, favicon 32×32 + 64×64.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <button className="rounded-md bg-violet-700 px-3 py-1.5 text-xs hover:bg-violet-600">
            Subir logo
          </button>
          <span className="text-xs text-violet-400">Pendiente del cliente</span>
        </div>
      </div>
    </>
  );
}
