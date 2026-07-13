"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
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
import { useToast } from "@/components/ui/toast";
import {
  CheckCircle,
  AlertCircle,
  Plus as PlusIcon,
  ShieldAlert,
} from "lucide-react";
import { buildPhysicalCountReport } from "@/features/inventory/physical-count-report";
import { PhysicalCountExcelButtons } from "@/features/inventory/components/physical-count-excel-button";
import { useCount, submitCount, approveCount } from "@/features/inventory-counts/counts-store";
import { useProducts } from "@/features/products/product-store";
import {
  useBrandsList,
  useCategoriesList,
  useLaboratoriesList,
} from "@/features/products/catalog-store";
import { useBranches } from "@/features/tenancy/branch-store";
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

const typeLabel = (t: string) =>
  t === "full" ? "Total" : t === "partial" ? "Parcial" : "Spot";

export default function ConteoDetalle() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const toast = useToast();

  const { count, items, scans, loading, source, notFound } = useCount(id);
  const products = useProducts();
  const brands = useBrandsList();
  const categories = useCategoriesList();
  const laboratories = useLaboratoriesList();
  const branches = useBranches();
  const [pending, setPending] = useState(false);

  const byId = <T extends { id: string }>(list: T[]) => {
    const m = new Map<string, T>();
    for (const x of list) m.set(x.id, x);
    return m;
  };
  const productMap = useMemo(() => byId(products), [products]);
  const brandMap = useMemo(() => byId(brands), [brands]);
  const categoryMap = useMemo(() => byId(categories), [categories]);
  const labMap = useMemo(() => byId(laboratories), [laboratories]);
  const branchMap = useMemo(() => byId(branches), [branches]);

  const branchName = count ? branchMap.get(count.branchId)?.name ?? "" : "";

  const report = useMemo(() => {
    if (!count) return null;
    return buildPhysicalCountReport({
      count,
      items,
      scans,
      movements: [],
      businessName: "DermaLand",
      generatedAt: new Date().toISOString(),
      lookups: {
        product: (pid) => productMap.get(pid),
        lotUnitCost: () => undefined,
        brandName: (bid) => (bid ? brandMap.get(bid)?.name ?? "" : ""),
        categoryName: (cid) => (cid ? categoryMap.get(cid)?.name ?? "" : ""),
        labName: (lid) => (lid ? labMap.get(lid)?.name ?? "" : ""),
        branchName: (brid) => (brid ? branchMap.get(brid)?.name ?? "" : ""),
        userName: () => "",
      },
    });
  }, [count, items, scans, productMap, brandMap, categoryMap, labMap, branchMap]);

  async function doAction(action: "submit" | "approve") {
    if (!id) return;
    setPending(true);
    const res = action === "approve" ? await approveCount(id) : await submitCount(id);
    setPending(false);
    if (res.ok) {
      toast.success(
        action === "approve"
          ? "Conteo aprobado. Se ajustó el stock según las diferencias."
          : "Conteo enviado a revisión.",
      );
    } else {
      toast.error(res.error);
    }
  }

  if (loading) {
    return (
      <div className="py-16 text-center text-sm opacity-60">Cargando conteo…</div>
    );
  }
  if (notFound || !count) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm opacity-60">Conteo no encontrado.</p>
        <Link href="/conteo-fisico" className="mt-2 inline-block text-xs underline">
          Volver a inventarios
        </Link>
      </div>
    );
  }

  const matches = items.filter((i) => i.status === "match").length;
  const shortages = items.filter((i) => i.status === "shortage").length;
  const overages = items.filter((i) => i.status === "overage").length;
  const expired = items.filter((i) => i.status === "expired").length;

  return (
    <>
      <Link
        href="/conteo-fisico"
        className="mb-4 inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100"
      >
        <ArrowLeft className="h-3 w-3" /> Volver a inventarios
      </Link>

      {source === "mock" && (
        <div className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Datos de demostración (backend de conteos en modo local).
        </div>
      )}

      <PageHeader
        title={count.countNumber}
        description={`${branchName} · ${typeLabel(count.countType)}`}
        breadcrumbs={[
          { label: "Inventario físico", href: "/conteo-fisico" },
          { label: count.countNumber },
        ]}
        actions={
          <>
            {report && <PhysicalCountExcelButtons report={report} />}
            <Link href={`/conteo-fisico/${count.id}/escanear`}>
              <Button variant="outline" size="sm">
                <ScanBarcode className="h-4 w-4" />
                Escanear
              </Button>
            </Link>
            {count.status === "submitted" || count.status === "reviewed" ? (
              <Button size="sm" disabled={pending} onClick={() => doAction("approve")}>
                {pending ? "Aprobando…" : "Aprobar ajustes"}
              </Button>
            ) : count.status === "in_progress" ? (
              <Button size="sm" disabled={pending} onClick={() => doAction("submit")}>
                {pending ? "Enviando…" : "Enviar a revisión"}
              </Button>
            ) : count.status === "draft" ? (
              <Link href={`/conteo-fisico/${count.id}/escanear`}>
                <Button size="sm">Iniciar inventario</Button>
              </Link>
            ) : null}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Escaneos" value={count.scanCount} icon={ScanBarcode} />
        <StatCard label="Items contados" value={count.itemCount} icon={CheckCircle} />
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
                          <div className="font-mono text-xs opacity-60">{it.productSku}</div>
                        </TD>
                        <TD>
                          <div className="font-mono text-xs">{it.lotNumber}</div>
                          {it.expiresAt && (
                            <div className="text-[10px] opacity-60">{formatDate(it.expiresAt)}</div>
                          )}
                        </TD>
                        <TD className="text-right tabular-nums">{it.expectedQuantity}</TD>
                        <TD className="text-right tabular-nums font-medium">{it.countedQuantity}</TD>
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
                    <div key={it.id} className="rounded-lg border border-black/5 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-medium">{it.productName}</div>
                          <div className="mt-0.5 text-xs opacity-60">
                            Lote {it.lotNumber} · esperado <strong>{it.expectedQuantity}</strong>,
                            contado <strong>{it.countedQuantity}</strong>
                          </div>
                        </div>
                        <Badge tone={itemStatusMeta[it.status]!.tone}>
                          {itemStatusMeta[it.status]!.label}{" "}
                          {it.differenceQuantity > 0 ? "+" : ""}
                          {it.differenceQuantity}
                        </Badge>
                      </div>
                      <p className="mt-2 text-[11px] opacity-60">
                        El ajuste se aplica al <strong>aprobar el conteo completo</strong>{" "}
                        (botón «Aprobar ajustes»): suma la diferencia al stock del lote y registra
                        el movimiento.
                      </p>
                    </div>
                  ))}
                {items.filter((i) => i.status !== "match").length === 0 && (
                  <p className="py-8 text-center text-sm opacity-60">Sin diferencias.</p>
                )}
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
                      <TD className="font-mono text-[10px] opacity-60">{s.deviceId}</TD>
                    </TR>
                  ))}
                  {scans.length === 0 && (
                    <TR>
                      <TD colSpan={6} className="py-8 text-center text-sm opacity-60">
                        Sin escaneos registrados.
                      </TD>
                    </TR>
                  )}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="evidence">
          <Card>
            <CardContent className="py-12 text-center text-sm opacity-60">
              Adjuntos de evidencia (fotos del producto/lote/góndola, notas de voz) llegan en el
              módulo móvil. Sin evidencia capturada en este inventario.
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
