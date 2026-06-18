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
});
