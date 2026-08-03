"use client";

import * as React from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Button, Card, CardContent, Table, THead, TBody, TR, TH, TD } from "@/components/ui";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { AlertTriangle, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { readAlegraWorkbook } from "@/features/inventory/alegra-workbook";
import type { AlegraRow, ImportPlan } from "@/features/inventory/alegra-import";

interface Branches {
  principal: string;
  cutis: string;
}

interface ApplyResult {
  appliedPrincipal: number;
  appliedCutis: number;
  lotsUpdated: number;
  lotsCreated: number;
  movements: number;
  failures: Array<{ productName: string; error: string; stockAplicado: boolean }>;
  reference: string;
  durationMs?: number;
}

/** Máximo de filas de detalle que se pintan; el resto se resume. */
const MAX_FILAS_VISIBLES = 100;

export default function ImportarInventarioPage() {
  const { success, error: toastError, Toast } = useToast();

  const [rows, setRows] = React.useState<AlegraRow[] | null>(null);
  const [fileName, setFileName] = React.useState("");
  const [plan, setPlan] = React.useState<ImportPlan | null>(null);
  const [branches, setBranches] = React.useState<Branches | null>(null);
  const [zeroMissing, setZeroMissing] = React.useState(false);
  const [analizando, setAnalizando] = React.useState(false);
  const [aplicando, setAplicando] = React.useState(false);
  const [aviso, setAviso] = React.useState<string | null>(null);
  const [resultado, setResultado] = React.useState<ApplyResult | null>(null);

  const ocupado = analizando || aplicando;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPlan(null);
    setResultado(null);
    setAviso(null);
    setAnalizando(true);
    try {
      const parsed = await readAlegraWorkbook(file);
      setRows(parsed);
      setFileName(file.name);
      success(`${parsed.length} filas leídas de ${file.name}`);
    } catch (err) {
      setRows(null);
      setFileName("");
      toastError(err instanceof Error ? err.message : "No se pudo leer el archivo.");
    } finally {
      setAnalizando(false);
      // Permite volver a elegir el MISMO archivo tras corregirlo.
      e.target.value = "";
    }
  }

  const analizar = React.useCallback(
    async (filas: AlegraRow[], cero: boolean) => {
      setAnalizando(true);
      setAviso(null);
      try {
        const res = await fetch("/api/inventory-import/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rows: filas, zeroMissing: cero }),
        });
        const json = await res.json();
        if (!res.ok) {
          setPlan(null);
          setAviso(String(json.error ?? "No se pudo analizar el archivo."));
          return;
        }
        setPlan(json.plan as ImportPlan);
        setBranches(json.branches as Branches);
      } catch {
        setPlan(null);
        setAviso("No se pudo contactar el servidor. Revisa tu conexión e intenta de nuevo.");
      } finally {
        setAnalizando(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    if (rows) void analizar(rows, zeroMissing);
  }, [rows, zeroMissing, analizar]);

  async function aplicar() {
    if (!rows || !plan) return;
    setAplicando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/inventory-import/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, zeroMissing }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAviso(String(json.error ?? "No se pudo aplicar la importación."));
        return;
      }
      const result = json.result as ApplyResult;
      setResultado(result);
      setPlan(null);
      setRows(null);
      setFileName("");
      if (result.failures.length === 0) {
        success(`Inventario actualizado · referencia ${result.reference}`);
      } else {
        toastError(`Se aplicó con ${result.failures.length} producto(s) con problema.`);
      }
    } catch {
      setAviso(
        "Se perdió la conexión durante la importación. Revisa Inventario → Movimientos antes de reintentar.",
      );
    } finally {
      setAplicando(false);
    }
  }

  const cambios = plan ? plan.principal.length + plan.cutis.length : 0;
  const filas = plan
    ? [
        ...plan.principal.map((a) => ({ ...a, sucursal: branches?.principal ?? "Principal" })),
        ...plan.cutis.map((a) => ({ ...a, sucursal: branches?.cutis ?? "Cutis" })),
      ]
    : [];

  return (
    <div className="space-y-6">
      <Toast />
      <PageHeader
        title="Importar desde Alegra"
        description="Actualiza el stock de las dos sucursales con el reporte de inventario de Alegra. Nada se guarda hasta que confirmes."
      />

      <Card>
        <CardContent className="space-y-4">
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-black/15 p-6 transition-colors hover:bg-black/[0.02] ${
              ocupado ? "pointer-events-none opacity-60" : ""
            }`}
          >
            {analizando ? (
              <Loader2 className="h-5 w-5 animate-spin opacity-60" aria-hidden />
            ) : (
              <Upload className="h-5 w-5 opacity-60" aria-hidden />
            )}
            <span className="text-sm">
              {fileName || "Elige el archivo .xlsx exportado de Alegra"}
            </span>
            <input
              type="file"
              accept=".xlsx"
              className="sr-only"
              onChange={onFile}
              disabled={ocupado}
            />
          </label>

          <p className="text-xs opacity-60">
            Se usa la columna <strong>Cantidad en Principal</strong> para{" "}
            {branches?.principal ?? "la sucursal principal"}, y su diferencia contra{" "}
            <strong>Cantidad total</strong> para {branches?.cutis ?? "la segunda sucursal"}. No se
            tocan precios, costos ni códigos de barra.
          </p>

          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={zeroMissing}
              onChange={(e) => setZeroMissing(e.target.checked)}
              disabled={ocupado}
            />
            <span>
              Poner en cero los productos que no aparezcan en el archivo
              <span className="block text-xs opacity-60">
                Trata el archivo como el inventario completo. Úsalo solo si el reporte cubre todo
                el catálogo.
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      {aviso && (
        <Card>
          <CardContent className="flex items-start gap-2 text-sm text-rose-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" aria-hidden />
            <span>{aviso}</span>
          </CardContent>
        </Card>
      )}

      {resultado && (
        <Card>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">Importación aplicada</p>
            <p className="opacity-70">
              {resultado.appliedPrincipal + resultado.appliedCutis} productos ajustados ·{" "}
              {resultado.lotsUpdated} lotes actualizados · {resultado.lotsCreated} lotes creados ·{" "}
              {resultado.movements} movimientos registrados.
            </p>
            <p className="opacity-70">
              Referencia de auditoría <strong>{resultado.reference}</strong>. Puedes revisar cada
              ajuste en Inventario → Movimientos.
            </p>
            {resultado.failures.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="font-medium text-amber-900">
                  {resultado.failures.length} producto(s) con problema
                </p>
                <ul className="mt-1 space-y-1 text-xs text-amber-900">
                  {resultado.failures.slice(0, 20).map((f) => (
                    <li key={f.productName}>
                      <strong>{f.productName}</strong> — {f.error}{" "}
                      {f.stockAplicado
                        ? "(el stock SÍ quedó aplicado; revísalo)"
                        : "(el stock no se modificó)"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {plan && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                [
                  branches?.principal ?? "Principal",
                  plan.totals.principalBefore,
                  plan.totals.principalAfter,
                  plan.principal.length,
                ],
                [
                  branches?.cutis ?? "Cutis",
                  plan.totals.cutisBefore,
                  plan.totals.cutisAfter,
                  plan.cutis.length,
                ],
              ] as const
            ).map(([label, antes, despues, n]) => (
              <Card key={label}>
                <CardContent>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums">
                    {antes} → {despues}{" "}
                    <span className="text-sm font-normal opacity-60">unidades</span>
                  </p>
                  <p className="text-xs opacity-60">{n} productos cambian</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {(plan.unmatched.length > 0 ||
            plan.skipped.length > 0 ||
            plan.collisions.length > 0) && (
            <Card>
              <CardContent className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden /> Filas que no se
                  aplican
                </p>
                <ul className="list-disc space-y-1 pl-5 text-sm opacity-75">
                  {plan.unmatched.length > 0 && (
                    <li>
                      {plan.unmatched.length} no coinciden con ningún producto del catálogo.
                    </li>
                  )}
                  {plan.skipped.length > 0 && (
                    <li>{plan.skipped.length} se omiten por datos que hay que revisar.</li>
                  )}
                  {plan.collisions.length > 0 && (
                    <li>
                      {plan.collisions.length} productos reciben varias filas del archivo (se
                      suman).
                    </li>
                  )}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="space-y-4">
              {cambios === 0 ? (
                <p className="text-sm opacity-70">
                  El archivo coincide con el inventario actual: no hay nada que cambiar.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <THead>
                        <TR>
                          <TH>Producto</TH>
                          <TH>Sucursal</TH>
                          <TH className="text-right">Actual</TH>
                          <TH className="text-right">Nuevo</TH>
                          <TH className="text-right">Cambio</TH>
                        </TR>
                      </THead>
                      <TBody>
                        {filas.slice(0, MAX_FILAS_VISIBLES).map((a) => (
                          <TR key={`${a.sucursal}-${a.productId}`}>
                            <TD>{a.productName}</TD>
                            <TD>{a.sucursal}</TD>
                            <TD className="text-right tabular-nums">{a.current}</TD>
                            <TD className="text-right tabular-nums">{a.target}</TD>
                            <TD className="text-right tabular-nums">
                              {a.delta > 0 ? `+${a.delta}` : a.delta}
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                  {cambios > MAX_FILAS_VISIBLES && (
                    <p className="text-xs opacity-60">
                      Mostrando los primeros {MAX_FILAS_VISIBLES} de {cambios} cambios.
                    </p>
                  )}
                </>
              )}

              <Button onClick={aplicar} disabled={ocupado || cambios === 0} size="lg">
                {aplicando ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <FileSpreadsheet className="mr-2 h-4 w-4" aria-hidden />
                )}
                {aplicando ? "Aplicando…" : `Aplicar ${cambios} cambios`}
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {!plan && !resultado && !rows && !aviso && (
        <EmptyState
          icon={FileSpreadsheet}
          title="Sin archivo cargado"
          description="Sube el reporte de inventario de Alegra para ver qué cambiaría antes de aplicarlo."
        />
      )}
    </div>
  );
}
