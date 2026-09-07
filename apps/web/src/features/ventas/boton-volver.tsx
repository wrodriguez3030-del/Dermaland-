"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * Botón «Volver» que regresa a la página anterior del historial del
 * navegador — para cuando la factura migrada no tiene `clientId` y por
 * tanto no hay a qué cliente enlazar (ver `page.tsx` de
 * `/ventas/alegra/[id]`).
 */
export function BotonVolver() {
  const router = useRouter();
  return (
    <Button variant="outline" size="sm" onClick={() => router.back()}>
      <ArrowLeft className="h-4 w-4" />
      Volver
    </Button>
  );
}
