"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ScanBarcode,
  Plus,
  Minus,
  Trash2,
  Keyboard,
  Smartphone,
  CheckCircle2,
  AlertTriangle,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Input,
  Label,
  Select,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { formatCurrency } from "@/lib/utils/format";
import { downloadBlob } from "@/lib/utils/download";
import { useProducts } from "@/features/products/product-store";
import { useAllLots, sellableStockForBranch, adjustStockAnywhere } from "@/features/inventory/lot-store";
import { useLaboratoriesList, useCategoriesList } from "@/features/products/catalog-store";
import { getBranchById } from "@/lib/mock-data/tenancy";
import {
  useScanSession,
  findProductByCode,
  applyScan,
  addManual,
  setItemQuantity,
  removeItem,
  setSessionStatus,
  sessionToCountData,
  type CountSession,
} from "@/features/inventory-counts/scan-session-store";
import {
  buildCountCreatePayload,
  persistCountToSupabase,
} from "@/features/inventory-counts/persist";
import { BarcodeScanModal } from "@/features/products/components/barcode-scan-modal";
import { buildPhysicalCountReport } from "@/features/inventory/physical-count-report";
// El módulo de exportación arrastra xlsx (~100 kB gz): se carga on-demand al exportar.

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const RESULT_LABEL: Record<string, string> = {
  found: "Encontrado",
  duplicate_sum: "Duplicado sumado",
  not_found: "No encontrado",
  manual: "Manual",
  error: "Error",
};

function diffTone(diff: number): string {
  if (diff === 0) return "text-emerald-600";
  return diff < 0 ? "text-rose-600" : "text-amber-600";
}

export default function EscanearPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const session = useScanSession(id);
  const toast = useToast();
  const products = useProducts();
  const lots = useAllLots();
  const laboratories = useLaboratoriesList();
  const categories = useCategoriesList();

  const inputRef = React.useRef<HTMLInputElement>(null);
  const [code, setCode] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [onlyDiff, setOnlyDiff] = React.useState(false);
  const [manualOpen, setManualOpen] = React.useState(false);
  const [approveOpen, setApproveOpen] = React.useState(false);
  const [lastScan, setLastScan] = React.useState<{ name: string; qty: number; ok: boolean } | null>(null);
  const [cameraOpen, setCameraOpen] = React.useState(false);

  const productById = React.useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const labById = React.useMemo(() => new Map(laboratories.map((l) => [l.id, l.name])), [laboratories]);
  const catById = React.useMemo(() => new Map(categories.map((c) => [c.id, c.name])), [categories]);

  const readonly = !session || session.status === "approved" || session.status === "cancelled";

  const systemQtyFor = React.useCallback(
    (productId: string) => (session ? sellableStockForBranch(lots, productId, session.branchId) : 0),
    [lots, session],
  );

  // Mantener el foco en el input para que el lector (teclado) siempre escriba ahí.
  React.useEffect(() => {
    if (!readonly) inputRef.current?.focus();
  }, [readonly, session?.scans.length]);

  if (!session) {
    return (
      <>
        <PageHeader title="Inventario físico" breadcrumbs={[{ label: "Inventario físico", href: "/conteo-fisico" }, { label: "Escanear" }]} />
        <Card>
          <CardContent className="py-12 text-center text-sm opacity-70">
            No encontramos este inventario físico en este dispositivo.{" "}
            <Link href="/conteo-fisico" className="text-[color:var(--brand-accent)] hover:underline">
              Volver a inventarios
            </Link>
          </CardContent>
        </Card>
      </>
    );
  }

  const branchName = getBranchById(session.branchId)?.name ?? "Sucursal";

  // Lógica ÚNICA de escaneo (lector físico + cámara del celular). Busca por
  // barcode/SKU, suma +1 (applyScan agrupa duplicados incrementando la cantidad
  // contada y registra cada scan) y avisa si no se encuentra.
  const scanCode = (raw: string, source: "reader" | "camera") => {
    const c = raw.trim();
    if (!c) return;
    const product = findProductByCode(products, c);
    const r = applyScan(session.id, { scannedCode: c, product, source });
    if (r.result === "not_found") {
      setLastScan({ name: `Código ${c}`, qty: 0, ok: false });
      toast.error("Producto no encontrado.");
    } else if (r.item) {
      setLastScan({ name: r.item.productName, qty: r.item.countedQuantity, ok: true });
      if (source === "camera") toast.success("Producto escaneado.");
    }
  };

  const submitScan = () => {
    const raw = code.trim();
    setCode("");
    scanCode(raw, "reader");
    inputRef.current?.focus();
  };

  const totalCounted = session.items.reduce((s, it) => s + it.countedQuantity, 0);
  const notFoundCount = session.scans.filter((s) => s.result === "not_found").length;

  // Filas con stock de sistema y diferencia.
  const rows = session.items
    .map((it) => {
      const sys = systemQtyFor(it.productId);
      const product = productById.get(it.productId);
      return {
        ...it,
        system: sys,
        difference: it.countedQuantity - sys,
        lab: product?.laboratoryId ? labById.get(product.laboratoryId) ?? "—" : "—",
        category: product?.categoryId ? catById.get(product.categoryId) ?? "—" : "—",
      };
    })
    .filter((r) => {
      if (onlyDiff && r.difference === 0) return false;
      if (search.trim()) {
        const t = search.trim().toLowerCase();
        if (!r.productName.toLowerCase().includes(t) && !r.sku.toLowerCase().includes(t)) return false;
      }
      return true;
    });

  const buildReport = () => {
    const { count, items, scans } = sessionToCountData(session, { systemQuantityFor: systemQtyFor });
    return buildPhysicalCountReport({
      count,
      items,
      scans,
      movements: [],
      businessName: "DermaLand",
      generatedAt: new Date().toISOString(),
      lookups: {
        product: (pid) => productById.get(pid),
        lotUnitCost: () => undefined,
        brandName: () => "",
        categoryName: (cid) => (cid ? catById.get(cid) ?? "" : ""),
        labName: (lid) => (lid ? labById.get(lid) ?? "" : ""),
        branchName: (brid) => (brid ? getBranchById(brid)?.name ?? "" : ""),
        userName: () => session.startedByName ?? "",
      },
    });
  };

  const exportExcel = async () => {
    try {
      const { physicalCountXlsxBytes, physicalCountFilename } = await import(
        "@/features/inventory/physical-count-export"
      );
      const report = buildReport();
      downloadBlob(physicalCountFilename(branchName, session.startedAt), physicalCountXlsxBytes(report), XLSX_MIME);
      toast.success("Excel del inventario físico generado.");
    } catch {
      toast.error("No se pudo generar el Excel. Intenta nuevamente.");
    }
  };

  // Resumen para aprobar.
  const summary = session.items.reduce(
    (acc, it) => {
      const diff = it.countedQuantity - systemQtyFor(it.productId);
      const cost = productById.get(it.productId)?.cost ?? 0;
      if (diff === 0) acc.match += 1;
      else if (diff < 0) {
        acc.shortage += 1;
        acc.value -= diff * cost;
      } else {
        acc.overage += 1;
        acc.value += diff * cost;
      }
      return acc;
    },
    { match: 0, shortage: 0, overage: 0, value: 0 },
  );

  const approve = async (withAdjustments: boolean) => {
    if (withAdjustments) {
      let applied = 0;
      let failed = 0;
      for (const it of session.items) {
        const diff = it.countedQuantity - systemQtyFor(it.productId);
        if (diff === 0) continue;
        // Aplica el delta al lote vendible con vencimiento más próximo (FEFO).
        const lot = lots
          .filter((l) => l.productId === it.productId && l.branchId === session.branchId && l.status === "available")
          .sort((a, b) => (a.expiresAt < b.expiresAt ? -1 : 1))[0];
        if (!lot) {
          failed += 1;
          continue;
        }
        const r = await adjustStockAnywhere({
          lotId: lot.id,
          productId: it.productId,
          warehouseId: lot.warehouseId,
          branchId: session.branchId,
          newQuantity: Math.max(0, lot.currentQuantity + diff),
          reason: `Inventario físico ${session.code}`,
        });
        if (r.ok) applied += 1;
        else failed += 1;
      }
      setSessionStatus(session.id, "approved", { approvedAt: new Date().toISOString(), approvedWithAdjustments: true, closedAt: new Date().toISOString() });
      toast.success(`Inventario aprobado. Ajustes aplicados: ${applied}${failed ? `, sin lote: ${failed}` : ""}.`);
    } else {
      setSessionStatus(session.id, "approved", { approvedAt: new Date().toISOString(), closedAt: new Date().toISOString() });
      toast.success("Inventario aprobado sin ajustar el stock.");
    }
    // Persiste la cabecera + ítems a Supabase (best-effort; no bloquea el flujo
    // local si el backend está en modo mock —409— o hay red intermitente).
    const persisted = await persistCountToSupabase(
      buildCountCreatePayload(
        session,
        systemQtyFor,
        withAdjustments ? "adjusted" : "approved",
      ),
    );
    if (!persisted.ok && persisted.reason !== "mock") {
      toast.show(
        "El conteo quedó aprobado en este dispositivo; se sincronizará a la nube cuando haya conexión.",
        "info",
      );
    }
    setApproveOpen(false);
  };

  const statusBadge: Record<string, { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" }> = {
    draft: { label: "Borrador", tone: "neutral" },
    in_progress: { label: "En progreso", tone: "info" },
    reviewing: { label: "Revisando", tone: "warning" },
    approved: { label: "Aprobado", tone: "success" },
    cancelled: { label: "Anulado", tone: "danger" },
  };
  const sb = statusBadge[session.status] ?? statusBadge.draft!;

  return (
    <>
      <Link href="/conteo-fisico" className="mb-4 inline-flex items-center gap-1 text-xs opacity-60 hover:opacity-100">
        <ArrowLeft className="h-3 w-3" /> Volver a inventarios
      </Link>

      <PageHeader
        title={session.name}
        description={`${session.code} · ${branchName}`}
        breadcrumbs={[{ label: "Inventario físico", href: "/conteo-fisico" }, { label: "Escanear productos" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={sb.tone}>{sb.label}</Badge>
            <Button size="sm" variant="outline" onClick={exportExcel}>
              Exportar Excel
            </Button>
            <Button size="sm" variant="outline" className="screen-only" onClick={() => window.print()}>
              Imprimir
            </Button>
            {!readonly && session.status === "in_progress" && (
              <Button size="sm" variant="outline" onClick={() => setSessionStatus(session.id, "reviewing")}>
                Finalizar revisión
              </Button>
            )}
            {!readonly && (
              <Button size="sm" onClick={() => setApproveOpen(true)}>
                Aprobar inventario
              </Button>
            )}
          </div>
        }
      />

      {readonly && session.status === "approved" && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <CheckCircle2 className="h-4 w-4" /> Este inventario ya fue aprobado y no puede editarse.
        </div>
      )}

      {/* Escáner */}
      {!readonly && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-end">
              <div className="flex-1">
                <Label>
                  <Keyboard className="mr-1 inline h-4 w-4" /> Escanear código de barra o escribir SKU
                </Label>
                <Input
                  ref={inputRef}
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitScan();
                    }
                  }}
                  placeholder="Escanea con el lector o escribe y presiona Enter…"
                  className="h-12 text-base"
                />
                <p className="mt-1 text-xs opacity-60">
                  El lector funciona como teclado: cada escaneo suma +1 y se mantiene el foco aquí.
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setManualOpen(true)}>
                  <Plus className="h-4 w-4" /> Agregar manual
                </Button>
                <Button type="button" variant="outline" onClick={() => setCameraOpen(true)}>
                  <Smartphone className="h-4 w-4" /> Escanear con cámara
                </Button>
              </div>
            </div>

            {/* Contadores grandes */}
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Counter label="Productos" value={session.items.length} />
              <Counter label="Unidades contadas" value={totalCounted} />
              <Counter label="Escaneos" value={session.scans.length} />
              <Counter label="No encontrados" value={notFoundCount} tone={notFoundCount ? "danger" : "neutral"} />
            </div>

            {lastScan && (
              <div
                className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                  lastScan.ok ? "bg-emerald-50 text-emerald-900" : "bg-rose-50 text-rose-900"
                }`}
              >
                {lastScan.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
                {lastScan.ok ? (
                  <span>
                    Último: <strong>{lastScan.name}</strong> · cantidad contada {lastScan.qty}
                  </span>
                ) : (
                  <span>{lastScan.name} no encontrado.</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filtros de la lista */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar en escaneados (producto o SKU)…"
          className="flex-1 min-w-[220px]"
        />
        <Button size="sm" variant={onlyDiff ? "primary" : "outline"} onClick={() => setOnlyDiff((v) => !v)}>
          Solo diferencias
        </Button>
      </div>

      {/* Tabla de escaneados */}
      <Card className="mb-6">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={ScanBarcode}
              title="Escanea un producto para comenzar"
              description="Usa el lector de código de barra, la cámara del celular o agrega manualmente."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Producto</TH>
                  <TH>SKU</TH>
                  <TH>Laboratorio</TH>
                  <TH>Categoría</TH>
                  <TH className="text-right">Stock sistema</TH>
                  <TH className="text-right">Contado</TH>
                  <TH className="text-right">Diferencia</TH>
                  <TH className="text-right pr-4">Acciones</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.productId}>
                    <TD>
                      <div className="font-medium">{r.productName}</div>
                      {r.barcode && <div className="text-xs opacity-50 font-mono">{r.barcode}</div>}
                    </TD>
                    <TD className="font-mono text-xs">{r.sku}</TD>
                    <TD className="text-xs">{r.lab}</TD>
                    <TD className="text-xs">{r.category}</TD>
                    <TD className="text-right tabular-nums">{r.system}</TD>
                    <TD className="text-right tabular-nums font-semibold">{r.countedQuantity}</TD>
                    <TD className={`text-right tabular-nums font-semibold ${diffTone(r.difference)}`}>
                      {r.difference > 0 ? "+" : ""}
                      {r.difference}
                    </TD>
                    <TD className="pr-4">
                      <div className="flex items-center justify-end gap-1">
                        {!readonly && (
                          <>
                            <button
                              type="button"
                              aria-label="Restar"
                              className="rounded-md border border-black/10 p-1 hover:bg-black/5"
                              onClick={() => setItemQuantity(session.id, r.productId, r.countedQuantity - 1)}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label="Sumar"
                              className="rounded-md border border-black/10 p-1 hover:bg-black/5"
                              onClick={() => setItemQuantity(session.id, r.productId, r.countedQuantity + 1)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              aria-label="Quitar"
                              className="rounded-md border border-black/10 p-1 text-rose-600 hover:bg-rose-50"
                              onClick={() => removeItem(session.id, r.productId)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Escaneos recientes */}
      {session.scans.length > 0 && (
        <div className="mb-10">
          <h2 className="mb-2 text-sm font-semibold">Escaneos recientes</h2>
          <Card>
            <CardContent className="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Hora</TH>
                    <TH>Código</TH>
                    <TH>Producto</TH>
                    <TH>Resultado</TH>
                    <TH className="text-right pr-4">Acumulado</TH>
                  </TR>
                </THead>
                <TBody>
                  {session.scans.slice(0, 30).map((s) => (
                    <TR key={s.id}>
                      <TD className="text-xs opacity-70">{new Date(s.at).toLocaleTimeString("es-DO")}</TD>
                      <TD className="font-mono text-xs">{s.scannedCode}</TD>
                      <TD className="text-sm">{s.productName ?? "—"}</TD>
                      <TD>
                        <Badge tone={s.result === "not_found" || s.result === "error" ? "danger" : "success"}>
                          {RESULT_LABEL[s.result] ?? s.result}
                        </Badge>
                      </TD>
                      <TD className="text-right tabular-nums">{s.accumulated || "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      {manualOpen && (
        <ManualAddModal
          session={session}
          onClose={() => setManualOpen(false)}
          onAdded={(name) => {
            toast.success(`Agregado: ${name}.`);
            setManualOpen(false);
          }}
        />
      )}

      <Modal
        open={approveOpen}
        title="Aprobar inventario físico"
        onClose={() => setApproveOpen(false)}
        footer={
          <>
            <Button variant="outline" onClick={() => setApproveOpen(false)}>
              Cancelar
            </Button>
            <Button variant="outline" onClick={() => approve(false)}>
              Aprobar sin ajustar
            </Button>
            <Button onClick={() => approve(true)}>Aprobar y generar ajustes</Button>
          </>
        }
      >
        <div className="space-y-2 text-sm">
          <Row label="Productos revisados" value={session.items.length} />
          <Row label="Total escaneos" value={session.scans.length} />
          <Row label="Productos sin diferencia" value={summary.match} />
          <Row label="Productos con faltante" value={summary.shortage} />
          <Row label="Productos con sobrante" value={summary.overage} />
          <Row label="Valor estimado de diferencia" value={formatCurrency(summary.value)} />
          <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-900">
            Al aprobar, el sistema puede generar ajustes de inventario para igualar el stock físico con el del sistema.
          </p>
        </div>
      </Modal>

      {/* Escaneo con cámara del celular: misma lógica que el lector físico. */}
      <BarcodeScanModal
        open={cameraOpen}
        continuous
        onClose={() => setCameraOpen(false)}
        onDetected={(codeScanned) => scanCode(codeScanned, "camera")}
      />

      <toast.Toast />
    </>
  );
}

function Counter({ label, value, tone = "neutral" }: { label: string; value: number; tone?: "neutral" | "danger" }) {
  return (
    <div className={`rounded-xl border p-3 text-center ${tone === "danger" && value ? "border-rose-200 bg-rose-50" : "border-black/10"}`}>
      <div className={`text-2xl font-bold tabular-nums ${tone === "danger" && value ? "text-rose-600" : ""}`}>{value}</div>
      <div className="text-xs opacity-60">{label}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="opacity-70">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function ManualAddModal({
  session,
  onClose,
  onAdded,
}: {
  session: CountSession;
  onClose: () => void;
  onAdded: (name: string) => void;
}) {
  const products = useProducts();
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState<string>("");
  const [qty, setQty] = React.useState("1");

  const matches = q.trim()
    ? products
        .filter((p) => {
          const t = q.trim().toLowerCase();
          return p.name.toLowerCase().includes(t) || p.sku.toLowerCase().includes(t) || (p.barcode ?? "").includes(q.trim());
        })
        .slice(0, 8)
    : [];

  const product = products.find((p) => p.id === selected);

  return (
    <Modal
      open
      title="Agregar manual"
      onClose={onClose}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={!product || !(Number(qty) > 0)}
            onClick={() => {
              if (!product) return;
              addManual(session.id, { product, quantity: Number(qty) });
              onAdded(product.name);
            }}
          >
            Agregar
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div>
          <Label>Buscar producto</Label>
          <Input value={q} onChange={(e) => { setQ(e.target.value); setSelected(""); }} placeholder="Nombre, SKU o código…" autoFocus />
          {matches.length > 0 && !product && (
            <ul className="mt-1 max-h-48 overflow-auto rounded-lg border border-black/10">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    className="block w-full px-3 py-2 text-left text-sm hover:bg-black/5"
                    onClick={() => { setSelected(p.id); setQ(p.name); }}
                  >
                    <span className="font-medium">{p.name}</span>{" "}
                    <span className="font-mono text-xs opacity-60">{p.sku}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {product && (
          <div className="flex items-center gap-2 rounded-lg bg-[color:var(--brand-primary)]/10 px-3 py-2 text-sm">
            <span className="flex-1 truncate font-medium">{product.name}</span>
            <button type="button" aria-label="Quitar" onClick={() => { setSelected(""); setQ(""); }}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div>
          <Label>Cantidad contada</Label>
          <Input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </div>
        <p className="text-xs opacity-60">Sucursal: {getBranchById(session.branchId)?.name ?? "—"}</p>
      </div>
    </Modal>
  );
}
