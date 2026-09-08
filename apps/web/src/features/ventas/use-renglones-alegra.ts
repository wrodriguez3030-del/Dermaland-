"use client";

import * as React from "react";

/** Un renglón de una factura migrada, tal como lo devuelve la API. */
export interface RenglonAlegra {
  invoiceId: string;
  productId: string | null;
  name: string;
  quantity: number;
  total: number;
}

/**
 * Renglones de VARIAS facturas migradas de una sola vez.
 *
 * La ficha del cliente enseña una tabla de compras y la columna «Ítems» decía
 * «—» en las migradas. Pedir los renglones factura por factura serían veinte
 * peticiones por pantalla; se piden en tandas.
 *
 * 🔴 `cargando` y `error` se distinguen del caso «esta factura no llevaba
 * nada»: una celda vacía por un fallo de red se ve igual que un cero legítimo,
 * y una de las dos cosas hay que arreglarla.
 */
export function useRenglonesAlegra(ids: string[]): {
  porFactura: Map<string, RenglonAlegra[]>;
  cargando: boolean;
  error: string | null;
} {
  const [porFactura, setPorFactura] = React.useState<Map<string, RenglonAlegra[]>>(new Map());
  const [cargando, setCargando] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // La lista se estabiliza por CONTENIDO: la página construye un array nuevo en
  // cada render y sin esto el efecto se dispararía en bucle.
  const clave = React.useMemo(() => [...ids].sort().join(","), [ids]);

  React.useEffect(() => {
    const lista = clave ? clave.split(",") : [];
    if (lista.length === 0) {
      setPorFactura(new Map());
      setCargando(false);
      setError(null);
      return;
    }

    const control = new AbortController();
    let vigente = true;
    setCargando(true);
    setError(null);

    // El tope de la ruta es 50 por consulta; una página del listado cabe de
    // sobra, pero se trocea por si algún día crece.
    const TANDA = 50;
    const tandas: string[][] = [];
    for (let i = 0; i < lista.length; i += TANDA) tandas.push(lista.slice(i, i + TANDA));

    Promise.all(
      tandas.map(async (tanda) => {
        const res = await fetch(
          `/api/alegra/invoices/items?invoiceIds=${tanda.join(",")}`,
          { signal: control.signal },
        );
        const cuerpo: unknown = await res.json();
        if (!res.ok) {
          const msg =
            cuerpo && typeof cuerpo === "object" && "error" in cuerpo && typeof cuerpo.error === "string"
              ? cuerpo.error
              : "No se pudo cargar el detalle de las compras.";
          throw new Error(msg);
        }
        return cuerpo && typeof cuerpo === "object" && "items" in cuerpo && Array.isArray(cuerpo.items)
          ? (cuerpo.items as RenglonAlegra[])
          : [];
      }),
    )
      .then((tandasDeItems) => {
        if (!vigente) return;
        const mapa = new Map<string, RenglonAlegra[]>();
        for (const items of tandasDeItems) {
          for (const it of items) {
            const actuales = mapa.get(it.invoiceId);
            if (actuales) actuales.push(it);
            else mapa.set(it.invoiceId, [it]);
          }
        }
        setPorFactura(mapa);
      })
      .catch((e: unknown) => {
        if (!vigente || (e instanceof DOMException && e.name === "AbortError")) return;
        setPorFactura(new Map());
        setError(e instanceof Error ? e.message : "No se pudo cargar el detalle de las compras.");
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });

    return () => {
      vigente = false;
      control.abort();
    };
  }, [clave]);

  return { porFactura, cargando, error };
}
