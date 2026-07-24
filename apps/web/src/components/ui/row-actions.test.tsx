// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Printer } from "lucide-react";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { RowActions } from "./row-actions";

afterEach(cleanup);

describe("RowActions", () => {
  it("acciones solo-ícono con aria-label/tooltip; href interno y externo; deshabilitada con motivo", () => {
    render(
      <RowActions
        viewHref="/x"
        editHref="/y"
        canDelete={false}
        customActions={[
          { label: "Imprimir", icon: Printer, onClick: () => {}, href: "/x/print" },
          {
            label: "Enviar WhatsApp",
            onClick: () => {},
            href: "https://wa.me/?text=hola",
            external: true,
          },
          {
            label: "Eliminar",
            onClick: () => {},
            disabled: true,
            disabledReason: "No se puede eliminar una venta emitida.",
          },
        ]}
      />,
    );
    expect(screen.getByLabelText("Ver")).toHaveAttribute("href", "/x");
    expect(screen.getByLabelText("Editar")).toHaveAttribute("href", "/y");
    expect(screen.getByLabelText("Imprimir")).toHaveAttribute("href", "/x/print");
    const wa = screen.getByLabelText("Enviar WhatsApp");
    expect(wa).toHaveAttribute("target", "_blank");
    expect(wa.getAttribute("href")).toMatch(/^https:\/\/wa\.me\//);
    const del = screen.getByLabelText("Eliminar");
    expect(del).toBeDisabled();
    expect(del).toHaveAttribute("title", "No se puede eliminar una venta emitida.");
  });

  it("acciones de conveniencia (activar/imprimir/enviar/duplicar) con aria-label", () => {
    render(
      <RowActions
        canView={false}
        canEdit={false}
        canDelete={false}
        onActivate={() => {}}
        onPrint={() => {}}
        onSend={() => {}}
        onDuplicate={() => {}}
      />,
    );
    expect(screen.getByLabelText("Activar")).toBeInTheDocument();
    expect(screen.getByLabelText("Imprimir")).toBeInTheDocument();
    expect(screen.getByLabelText("Enviar")).toBeInTheDocument();
    expect(screen.getByLabelText("Duplicar")).toBeInTheDocument();
  });

  it("confirmDelete=false elimina sin diálogo", () => {
    const onDelete = vi.fn();
    render(<RowActions onDelete={onDelete} confirmDelete={false} entityName="X" />);
    fireEvent.click(screen.getByLabelText("Eliminar"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("Eliminar pide confirmación antes de ejecutar el borrado", () => {
    const onDelete = vi.fn();
    render(<RowActions onDelete={onDelete} entityName="Venta 001" />);
    fireEvent.click(screen.getByLabelText("Eliminar"));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText(/Confirmar eliminar/i)).toBeInTheDocument();
    // Botón de confirmación (texto) dentro del diálogo.
    fireEvent.click(screen.getByText("Eliminar"));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  describe("variant=menu (dropdown)", () => {
    it("acción con href navega (enlace interno), href externo abre en pestaña nueva, deshabilitada no ejecuta, y onClick se dispara", () => {
      const onWhats = vi.fn();
      render(
        <RowActions
          variant="menu"
          customActions={[
            { label: "Ver detalle", icon: Printer, href: "/reportes/ventas/1" },
            {
              label: "Descargar PDF",
              icon: Printer,
              href: "/api/proformas/1/pdf",
              external: true,
            },
            {
              label: "Editar",
              icon: Printer,
              disabled: true,
              disabledReason: "Este documento no se puede editar.",
            },
            { label: "Enviar WhatsApp", icon: Printer, onClick: onWhats },
          ]}
        />,
      );
      // Abrir el menú de tres puntos.
      fireEvent.click(screen.getByLabelText("Acciones"));

      // href interno → enlace navegable
      const ver = screen.getByText("Ver detalle").closest("a");
      expect(ver).toHaveAttribute("href", "/reportes/ventas/1");

      // href externo → nueva pestaña
      const pdf = screen.getByText("Descargar PDF").closest("a");
      expect(pdf).toHaveAttribute("href", "/api/proformas/1/pdf");
      expect(pdf).toHaveAttribute("target", "_blank");

      // deshabilitada → botón disabled con motivo, no navega
      const editar = screen.getByText("Editar").closest("button");
      expect(editar).toBeDisabled();
      expect(editar).toHaveAttribute("title", "Este documento no se puede editar.");

      // onClick → se ejecuta
      fireEvent.click(screen.getByText("Enviar WhatsApp"));
      expect(onWhats).toHaveBeenCalledTimes(1);
    });
  });
});
