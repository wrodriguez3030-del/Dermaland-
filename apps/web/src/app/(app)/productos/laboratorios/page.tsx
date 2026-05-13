"use client";

import { Plus } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import {
  Button,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui";
import { RowActions } from "@/components/ui/row-actions";
import { useLocalSoftDelete } from "@/components/ui/use-local-soft-delete";
import { useToast } from "@/components/ui/toast";
import { mockLaboratories } from "@/lib/mock-data/catalog";

export default function LaboratoriosPage() {
  const { visible, hide } = useLocalSoftDelete(mockLaboratories);
  const toast = useToast();
  return (
    <>
      <PageHeader
        title="Laboratorios"
        description="Fabricantes y procedencia. Útil para reportes regulatorios."
        breadcrumbs={[
          { label: "Productos", href: "/productos" },
          { label: "Laboratorios" },
        ]}
        actions={
          <Button size="sm">
            <Plus className="h-4 w-4" />
            Nuevo laboratorio
          </Button>
        }
      />
      <Table>
        <THead>
          <TR>
            <TH>Laboratorio</TH>
            <TH>País</TH>
            <TH className="text-right pr-4">Acciones</TH>
          </TR>
        </THead>
        <TBody>
          {visible.map((l) => (
            <TR key={l.id}>
              <TD className="font-medium">{l.name}</TD>
              <TD className="text-sm opacity-70">{l.country ?? "—"}</TD>
              <TD className="pr-4">
                <RowActions
                  viewHref={`/productos?laboratory=${l.id}`}
                  editHref={`/productos/laboratorios/${l.id}/editar`}
                  onDelete={() => {
                    hide(l.id);
                    toast.success("Laboratorio eliminado correctamente.");
                  }}
                  entityName={l.name}
                />
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <toast.Toast />
    </>
  );
}
