import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Card,
  CardContent,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { AlertTriangle } from "lucide-react";
import { mockDgiiSequences } from "@/lib/mock-data/integrations";
import { formatDate } from "@/lib/utils/format";

export default function SecuenciasPage() {
  return (
    <>
      <PageHeader
        title="Secuencias e-NCF"
        description="Rangos autorizados por DGII. Alerta cuando queden < 100 disponibles."
        breadcrumbs={[{ label: "DGII", href: "/dgii" }, { label: "Secuencias" }]}
      />
      <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div className="text-sm text-amber-900">
            <strong>Secuencias MOCK / DEMO — no fiscales.</strong> Estos
            rangos son ejemplos sintéticos para validar el flujo de
            consumo y alertas. No están autorizados por DGII y no deben
            usarse para emitir comprobantes reales. La carga de
            secuencias reales se habilita en Fase C tras autorizar
            migraciones Supabase.
          </div>
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>Tipo</TH>
                <TH>Etiqueta</TH>
                <TH className="text-right">Inicio</TH>
                <TH className="text-right">Fin</TH>
                <TH className="text-right">Próximo</TH>
                <TH className="text-right">Disponibles</TH>
                <TH>Vence</TH>
                <TH>Estado</TH>
              </TR>
            </THead>
            <TBody>
              {mockDgiiSequences.map((s) => {
                const remaining = s.rangeEnd - s.nextNumber;
                return (
                  <TR key={s.type}>
                    <TD className="font-mono text-xs">{s.type}</TD>
                    <TD className="text-sm">{s.label}</TD>
                    <TD className="text-right tabular-nums">{s.rangeStart}</TD>
                    <TD className="text-right tabular-nums">{s.rangeEnd}</TD>
                    <TD className="text-right tabular-nums font-medium">
                      {s.nextNumber}
                    </TD>
                    <TD
                      className={`text-right tabular-nums ${
                        remaining < 100 ? "text-rose-700 font-bold" : ""
                      }`}
                    >
                      {remaining}
                    </TD>
                    <TD className="text-xs">{formatDate(s.expiresAt)}</TD>
                    <TD>
                      <Badge
                        tone={
                          s.status === "active"
                            ? "success"
                            : s.status === "expiring"
                              ? "warning"
                              : "danger"
                        }
                      >
                        {s.status}
                      </Badge>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
