const SMOKE_ROUTES = [
  { href: "/clientes", phase: "Fase 1", label: "Clientes / CRM" },
  { href: "/productos", phase: "Fase 2", label: "Productos / catálogo" },
  { href: "/inventario", phase: "Fase 2", label: "Inventario por lote" },
  { href: "/conteo-fisico", phase: "Fase 2", label: "Conteo físico (PWA)" },
  { href: "/pos", phase: "Fase 4", label: "POS" },
  { href: "/proformas", phase: "Fase 4", label: "Proformas" },
  { href: "/ventas", phase: "Fase 4", label: "Ventas" },
  { href: "/dgii", phase: "Fase 5", label: "DGII e-CF" },
  { href: "/super-admin", phase: "Fase 10", label: "Súper admin" },
  { href: "/api/health", phase: "Fase 0", label: "Health endpoint" },
];

export default function HomePage() {
  return (
    <main
      style={{
        maxWidth: 880,
        margin: "0 auto",
        padding: "48px 24px 96px",
      }}
    >
      <header style={{ marginBottom: 32 }}>
        <div
          style={{
            display: "inline-block",
            padding: "4px 10px",
            borderRadius: 999,
            background: "var(--brand-primary)",
            color: "white",
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
          }}
        >
          Fase 0 · scaffold corriendo
        </div>
        <h1
          style={{
            fontSize: 40,
            margin: "16px 0 6px",
            color: "var(--brand-accent)",
            letterSpacing: -0.5,
          }}
        >
          DermaLand
        </h1>
        <p style={{ margin: 0, color: "var(--brand-muted)", fontSize: 16 }}>
          SaaS multiempresa para farmacia, dermocosmética y cuidado
          dermatológico (RD). Marca oficial: <strong>DermaLand</strong>.
        </p>
      </header>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 32,
        }}
      >
        <Card title="Puerto local" value="3031" />
        <Card title="Stack" value="Next.js 15 · React 19" />
        <Card title="Workspace" value="C:\\dev\\dermaland\\" />
        <Card title="Drive (docs)" value="H:\\Mi unidad\\PROYECTO DERMALAND\\" />
      </section>

      <section style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>Estado</h2>
        <ul style={{ margin: 0, paddingLeft: 20, color: "var(--brand-muted)" }}>
          <li>
            Monorepo (<code>apps/web</code>, <code>apps/mobile</code>,{" "}
            <code>packages/db</code>, <code>packages/shared</code>,{" "}
            <code>packages/ui</code>) clonado y dependencias instaladas.
          </li>
          <li>
            <code>.env.local</code> con placeholders Supabase — completar al
            arrancar Fase 1.
          </li>
          <li>
            Las rutas de módulos abajo aún devuelven 404 — se construyen en
            Fase 1+ según <code>plan-maestro.md</code>.
          </li>
          <li>
            <strong>Regla:</strong> nunca correr <code>pnpm install</code>{" "}
            dentro de <code>H:\Mi unidad\…</code> — solo en{" "}
            <code>C:\dev\dermaland\</code>.
          </li>
        </ul>
      </section>

      <section>
        <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>
          Rutas de smoke test
        </h2>
        <div
          style={{
            background: "var(--brand-card)",
            border: "1px solid var(--brand-border)",
            borderRadius: 12,
            padding: 4,
          }}
        >
          {SMOKE_ROUTES.map((r) => (
            <a
              key={r.href}
              href={r.href}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "12px 16px",
                borderRadius: 8,
                color: "var(--brand-fg)",
              }}
            >
              <span>
                <strong style={{ fontFamily: "monospace" }}>{r.href}</strong>{" "}
                <span style={{ color: "var(--brand-muted)", marginLeft: 8 }}>
                  {r.label}
                </span>
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: "var(--brand-accent)",
                }}
              >
                {r.phase}
              </span>
            </a>
          ))}
        </div>
      </section>

      <footer
        style={{
          marginTop: 64,
          paddingTop: 16,
          borderTop: "1px solid var(--brand-border)",
          color: "var(--brand-muted)",
          fontSize: 13,
        }}
      >
        DermaLand SRL · RNC 1-32-59077-5 · Calle E. León Jiménez No. 47, Esq.
        Mayagüez, Reparto del Este, Santiago · Tel/WhatsApp 809-226-5252 ·{" "}
        <a href="https://www.instagram.com/dermalandrd">@dermalandrd</a>
      </footer>
    </main>
  );
}

function Card({ title, value }: { title: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--brand-card)",
        border: "1px solid var(--brand-border)",
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          color: "var(--brand-muted)",
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 16,
          marginTop: 4,
          fontFamily: "monospace",
          color: "var(--brand-fg)",
        }}
      >
        {value}
      </div>
    </div>
  );
}
