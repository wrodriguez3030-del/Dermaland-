import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import { AlertTriangle, FileCheck, FileText, ShieldAlert } from "lucide-react";
import {
  mockDgiiSequences,
  mockElectronicInvoices,
} from "@/lib/mock-data/integrations";

export default function DgiiOverview() {
  const accepted = mockElectronicInvoices.filter((i) => i.status === "accepted").length;
  const submitted = mockElectronicInvoices.filter((i) => i.status === "submitted").length;
  const rejected = mockElectronicInvoices.filter((i) => i.status === "rejected").length;
  const expiring = mockDgiiSequences.filter((s) => s.status === "expiring").length;

  return (
    <>
      <PageHeader
        title="DGII e-CF"
        description="Facturación electrónica RD. Implementación propia con XAdES-BES + cliente HTTPS al endpoint de la DGII."
        breadcrumbs={[{ label: "DGII" }]}
        actions={
          <>
            <Link href="/dgii/reportes">
              <Button variant="outline" size="sm">
                Reportes fiscales
              </Button>
            </Link>
            <Link href="/dgii/configuracion">
              <Button size="sm">Configuración fiscal</Button>
            </Link>
          </>
        }
      />

      <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
          <div>
            <h3 className="text-sm font-semibold text-amber-900">
              Módulo DGII inactivo (`dgii_enabled = false`)
            </h3>
            <p className="mt-1 text-sm text-amber-900">
              El cliente todavía no tiene certificado digital `.p12`. POS opera
              con proformas + comprobantes no fiscales. Súper admin debe subir
              el certificado y activar el módulo cuando llegue.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="e-CF aceptados" value={accepted} icon={FileCheck} tone="success" />
        <StatCard label="En proceso" value={submitted} icon={FileText} tone="primary" />
        <StatCard label="Rechazados" value={rejected} icon={ShieldAlert} tone="danger" />
        <StatCard label="Secuencias por vencer" value={expiring} icon={AlertTriangle} tone="warning" />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Tipos e-CF habilitados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 text-xs">
            <Badge tone="primary">31 — Crédito Fiscal</Badge>
            <Badge tone="info">32 — Consumo</Badge>
            <Badge tone="info">33 — Nota de Débito</Badge>
            <Badge tone="info">34 — Nota de Crédito</Badge>
            <Badge tone="neutral">41 — Compras</Badge>
            <Badge tone="neutral">43 — Gastos Menores</Badge>
            <Badge tone="neutral">44 — Regímenes Especiales</Badge>
            <Badge tone="neutral">45 — Gubernamental</Badge>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
