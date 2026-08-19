"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui";

/** Botón de imprimir del ticket — lo único con JavaScript en esta página. */
export function PrintTicketButton() {
  return (
    <Button size="sm" onClick={() => window.print()}>
      <Printer className="h-4 w-4" />
      Imprimir
    </Button>
  );
}
