"use client";

import { PageHeader } from "@/components/layout/page-header";
import {
  Card,
  CardContent,
  Button,
  Input,
  Label,
  Select,
  Textarea,
} from "@/components/ui";
import { FormSection } from "@/components/ui/filter-bar";
import {
  listActiveBranches,
} from "@/features/tenancy/branch-store";
import { mockUsers } from "@/lib/mock-data/users";

export default function NuevoConteoPage() {
  return (
    <>
      <PageHeader
        title="Nuevo conteo físico"
        description="Crea una sesión. Tras crearla podrás escanear desde móvil con cámara o lector Bluetooth."
        breadcrumbs={[
          { label: "Conteo físico", href: "/conteo-fisico" },
          { label: "Nuevo" },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm">
              Cancelar
            </Button>
            <Button size="sm">Crear sesión</Button>
          </>
        }
      />

      <Card>
        <CardContent>
          <FormSection
            title="Alcance"
            description="Sucursal y tipo de conteo."
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label>Sucursal *</Label>
                <Select>
                  {listActiveBranches().map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              {/* warehouseId se mapea internamente a defaultWarehouseForBranch(branchId) — no visible al usuario */}
              <div>
                <Label>Tipo de conteo</Label>
                <Select defaultValue="partial">
                  <option value="full">Total — toda la sucursal</option>
                  <option value="partial">Parcial — categoría/góndola</option>
                  <option value="spot">Spot — productos específicos</option>
                </Select>
              </div>
              <div>
                <Label>Filtro (opcional)</Label>
                <Input placeholder="Categoría / marca / ubicación" />
              </div>
            </div>
          </FormSection>

          <FormSection
            title="Equipo asignado"
            description="Usuarios autorizados a escanear. Múltiples a la vez OK — duplicados se detectan por device_id + offline_scan_id."
          >
            <div className="space-y-2">
              {mockUsers
                .filter((u) =>
                  ["inventory", "supervisor", "manager", "cashier"].includes(
                    u.role,
                  ),
                )
                .map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-3 rounded-lg border border-black/10 p-3 hover:bg-black/[0.02]"
                  >
                    <input type="checkbox" defaultChecked={u.role === "inventory"} />
                    <span
                      className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ background: u.avatarColor }}
                    >
                      {u.fullName
                        .split(" ")
                        .map((n) => n[0])
                        .join("")
                        .slice(0, 2)
                        .toUpperCase()}
                    </span>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{u.fullName}</div>
                      <div className="text-xs opacity-60">{u.role}</div>
                    </div>
                  </label>
                ))}
            </div>
          </FormSection>

          <FormSection
            title="Permisos del conteo"
            description="Estas opciones se aplican solo a esta sesión."
          >
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked />
                <span className="text-sm">Permitir escaneo offline (sync al reconectar)</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" />
                <span className="text-sm">
                  Permitir <strong>entrada manual de cantidad</strong> (cajas cerradas, código dañado)
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked />
                <span className="text-sm">Capturar evidencia (foto / nota de voz)</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked />
                <span className="text-sm">
                  Aprobación obligatoria antes de aplicar ajustes
                </span>
              </label>
            </div>
          </FormSection>

          <FormSection
            title="Notas"
            description="Visible al equipo asignado."
          >
            <div>
              <Label>Notas internas</Label>
              <Textarea placeholder="Conteo parcial góndola dermocosmética facial · respetar lotes y vencimientos" />
            </div>
          </FormSection>
        </CardContent>
      </Card>
    </>
  );
}
