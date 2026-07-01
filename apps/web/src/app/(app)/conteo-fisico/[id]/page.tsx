import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ScanBarcode } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { StatCard } from "@/components/ui/stat-card";
import {
  CheckCircle,
  AlertCircle,
  Plus as PlusIcon,
  Minus,
  ShieldAlert,
} from "lucide-react";
import {
  getInventoryCountById,
  getItemsForCount,
  getScansForCount,
} from "@/lib/mock-data/inventory-counts";
import { getBranchById, getWarehouseById } from "@/lib/mock-data/tenancy";
import {
  getProductById,
  getBrandById,
  getCategoryById,
  getLaboratoryById,
} from "@/lib/mock-data/catalog";
import { getUserById } from "@/lib/mock-data/users";
import { mockInventoryMovements } from "@/lib/mock-data/inventory-movements";
import { buildPhysicalCountReport } from "@/features/inventory/physical-count-report";
import { PhysicalCountExcelButtons } from "@/features/inventory/components/physical-count-excel-button";
import { formatDateTime, formatDate } from "@/lib/utils/format";

const itemStatusMeta: Record<
  string,
  { label: string; tone: "success" | "danger" | "warning" | "info" | "neutral" }
> = {
  match: { label: "Coincide", tone: "success" },
  shortage: { label: "Faltante", tone: "danger" },
  overage: { label: "Sobrante", tone: "warning" },
  expired: { label: "Vencido", tone: "danger" },
  unregistered: { label: "Sin registro", tone: "info" },
};

export default async function ConteoDetalle({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const count = getInventoryCountById(id);
  if (!count) notFound();

  const items = getItemsForCount(count.id);
  const scans = getScansForCount(count.id);
  const branch = getBranchById(count.branchId);
  const warehouse = getWarehouseById(count.warehouseId);

  const matches = items.filter((i) => i.status === "match").length;
  const shortages = items.filter((i) => i.status === "shortage").length;
  const overages = items.filter((i) => i.status === "overage").length;
  const expired = items.filter((i) => i.status === "expired").length;

  // Informe completo (datos planos, sin ids internos) para exportar a Excel.
  const report = buildPhysicalCountReport({
    count,
    items,
    scans,
    movements: mockInventoryMovements,
    businessName: "DermaLand",
    generatedAt: new Date().toISOString(),
    lookups: {
      product: (pid) => getProductById(pid),
      lotUnitCost: () => undefined,
      brandName: (bid) => getBrandById(bid)?.name ?? "",
      categoryName: (cid) => getCategoryById(cid)?.name ?? "",
      labName: (lid) => getLaboratoryById(lid)?.name ?? "",
      branchName: (brid) => (brid ? getBranchById(brid)?.name ?? "" : ""),
      userName: (uid) => (uid ? getUserById(uid)?.fullName ?? "" : ""),
    },
  });

  return (
    <>
      <Link
        href="/conteo-fisico"
        className="mb-4 inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
      >
        <ArrowLeft className="h-3 w-3" /> Volver a inventarios
      </Link>

      <PageHeader
        title={count.countNumber}
        description={`${branch?.name} · ${warehouse?.name} · ${count.countType === "full" ? "Total" : count.countType === "partial" ? "Parcial" : "Spot"}`}
        breadcrumbs={[
          { label: "Inventario físico", href: "/conteo-fisico" },
          { label: count.countNumber },
        ]}
        actions={
          <>
            <PhysicalCountExcelButtons report={report} />
            <Link href={`/conteo-fisico/${count.id}/escanear`}>
              <Button variant="outline" size="sm">
                <ScanBarcode className="h-4 w-4" />
                Escanear
              </Button>
            </Link>
            {count.status === "submitted" || count.status === "reviewed" ? (
              <Button size="sm">Aprobar ajustes</Button>
            ) : count.status === "in_progress" ? (
              <Button size="sm">Enviar a revisión</Button>
            ) : count.status === "draft" ? (
              <Button size="sm">Iniciar inventario</Button>
            ) : null}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Escaneos" value={count.scanCount} icon={ScanBarcode} />
        <StatCard
          label="Items contados"
          value={count.itemCount}
          icon={CheckCircle}
        />
        <StatCard
          label="Faltantes"
          value={shortages}
          icon={AlertCircle}
          tone={shortages > 0 ? "danger" : "default"}
        />
        <StatCard
          label="Sobrantes"
          value={overages}
          icon={PlusIcon}
          tone={overages > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Vencidos detectados"
          value={expired}
          icon={ShieldAlert}
          tone={expired > 0 ? "danger" : "default"}
        />
      </div>

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items">Items ({items.length})</TabsTrigger>
          <TabsTrigger value="differences">
            Diferencias ({shortages + overages + expired})
          </TabsTrigger>
          <TabsTrigger value="scans">Escaneos ({scans.length})</TabsTrigger>
          <TabsTrigger value="evidence">Evidencia</TabsTrigger>
        </TabsList>

        <TabsContent value="items">
          <Card>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Producto</TH>
                    <TH>Lote · Vence</TH>
                    <TH className="text-right">Esperado</TH>
                    <TH className="text-right">Contado</TH>
                    <TH className="text-right">Diferencia</TH>
                    <TH>Estado</TH>
                    <TH>Último scan</TH>
                  </TR>
                </THead>
                <TBody>
                  {items.map((it) => {
                    const meta = itemStatusMeta[it.status]!;
                    return (
                      <TR key={it.id}>
                        <TD>
                          <div className="text-sm font-medium">{it.productName}</div>
                          <div className="font-mono text-xs opacity-60">
                            {it.productSku}
                          </div>
                        </TD>
                        <TD>
                          <div className="font-mono text-xs">{it.lotNumber}</div>
                          {it.expiresAt && (
                            <div className="text-[10px] opacity-60">
                              {formatDate(it.expiresAt)}
                            </div>
                          )}
                        </TD>
                        <TD className="text-right tabular-nums">
                          {it.expectedQuantity}
                        </TD>
                        <TD className="text-right tabular-nums font-medium">
                          {it.countedQuantity}
                        </TD>
                        <TD
                          className={`text-right tabular-nums font-medium ${
                            it.differenceQuantity < 0
                              ? "text-rose-700"
                              : it.differenceQuantity > 0
                                ? "text-amber-700"
                                : "opacity-60"
                          }`}
                        >
                          {it.differenceQuantity > 0 ? "+" : ""}
                          {it.differenceQuantity}
                        </TD>
                        <TD>
                          <Badge tone={meta.tone}>{meta.label}</Badge>
                        </TD>
                        <TD className="text-xs opacity-70">
                          {it.lastScanAt ? formatDateTime(it.lastScanAt) : "—"}
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="differences">
          <Card>
            <CardContent>
              <div className="space-y-3">
                {items
                  .filter((i) => i.status !== "match")
                  .map((it) => (
                    <div
                      key={it.id}
                      className="rounded-lg border border-black/5 bg-white p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{it.productName}</div>
                          <div className="mt-0.5 text-xs opacity-60">
                            Lote {it.lotNumber} · esperado{" "}
                            <strong>{it.expectedQuantity}</strong>, contado{" "}
                            <strong>{it.countedQuantity}</strong>
                          </div>
                        </div>
                        <Badge tone={itemStatusMeta[it.status]!.tone}>
                          {itemStatusMeta[it.status]!.label}{" "}
                          {it.differenceQuantity > 0 ? "+" : ""}
                          {it.differenceQuantity}
                        </Badge>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button className="rounded-md border border-black/10 px-2 py-1 text-xs hover:bg-black/[0.02]">
                          Aprobar ajuste
                        </button>
                        <button className="rounded-md border border-black/10 px-2 py-1 text-xs hover:bg-black/[0.02]">
                          Pedir recuento
                        </button>
                        <button className="rounded-md border border-black/10 px-2 py-1 text-xs hover:bg-black/[0.02]">
                          Mover a cuarentena
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="scans">
          <Card>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Hora</TH>
                    <TH>Producto</TH>
                    <TH>Lote</TH>
                    <TH>Fuente</TH>
                    <TH>Usuario</TH>
                    <TH>Dispositivo</TH>
                  </TR>
                </THead>
                <TBody>
                  {scans.slice(0, 20).map((s) => (
                    <TR key={s.id}>
                      <TD className="text-xs">{formatDateTime(s.scannedAt)}</TD>
                      <TD className="font-mono text-xs">{s.productId}</TD>
                      <TD className="font-mono text-xs">{s.productLotId ?? "—"}</TD>
                      <TD>
                        <Badge tone="info" outlined>
                          {s.scanSource}
                        </Badge>
                      </TD>
                      <TD className="text-xs">{s.scannedByName}</TD>
                      <TD className="font-mono text-[10px] opacity-60">
                        {s.deviceId}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evidence">
          <Card>
            <CardContent className="py-12 text-center text-sm opacity-60">
              Adjuntos de evidencia (fotos del producto/lote/góndola, notas de voz)
              llegan en el módulo móvil. Sin evidencia capturada en este inventario.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
