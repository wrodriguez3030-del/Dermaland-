import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { mockAIAgents } from "@/lib/mock-data/integrations";

export default function AgentesPage() {
  return (
    <>
      <PageHeader
        title="Agentes IA"
        description="Cada agente lleva system prompt + lista de tools permitidas."
        breadcrumbs={[{ label: "IA", href: "/ia" }, { label: "Agentes" }]}
      />
      <div className="grid gap-4 lg:grid-cols-2">
        {mockAIAgents.map((a) => {
          const pct = (a.monthlyCallsUsed / a.monthlyCallsLimit) * 100;
          return (
            <Card key={a.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>{a.name}</CardTitle>
                    <p className="mt-1 text-xs opacity-60 font-mono">
                      modelo: {a.model}
                    </p>
                  </div>
                  <Badge tone={a.active ? "success" : "neutral"}>
                    {a.active ? "Activo" : "Pausado"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="rounded-lg bg-[color:var(--brand-bg)] p-3 text-xs italic">
                  “{a.systemPrompt}”
                </p>
                <div>
                  <div className="text-xs font-medium opacity-70">Tools permitidas</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {a.toolsAllowed.map((t) => (
                      <Badge key={t} tone="info" outlined>
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="opacity-70">Uso mensual</span>
                    <span className="tabular-nums">
                      {a.monthlyCallsUsed} / {a.monthlyCallsLimit}
                    </span>
                  </div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-black/5">
                    <div
                      className="h-full bg-[color:var(--brand-primary)]"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
