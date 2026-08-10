import { generateProformaNumber } from "./proforma-store";

/**
 * Reserva el siguiente número de proforma.
 *
 * En Supabase lo decide la BASE (`next_proforma_number`), que es el único sitio
 * donde la unicidad se puede garantizar: la tabla tiene un índice único
 * (business_id, number) y el contador del `localStorage` es por navegador, así
 * que dos cajas acaban pidiendo el mismo número. Cuando ocurre, el insert falla
 * con 23505 y el cajero lee «Ya existe un registro con esos datos» justo al
 * cobrar — un mensaje que no dice qué dato ni qué hacer.
 *
 * En modo mock se sigue usando el contador local: no hay servidor al que
 * pedírselo, y ahí sólo hay una persona con una pestaña.
 *
 * Si el servidor no contesta se ABORTA la venta en vez de caer al contador
 * local. Volver al local sería volver justo al fallo que esto arregla, y con
 * peor pinta: el cajero creería que cobró.
 */
export type ProformaNumberResult =
  | { ok: true; number: string }
  | { ok: false; error: string };

export async function reserveProformaNumber(): Promise<ProformaNumberResult> {
  if (process.env.NEXT_PUBLIC_DATA_SOURCE !== "supabase") {
    return { ok: true, number: generateProformaNumber() };
  }
  try {
    const res = await fetch("/api/proformas/next-number", { method: "POST" });
    const cuerpo = (await res.json().catch(() => ({}))) as {
      number?: string;
      error?: string;
    };
    if (!res.ok || !cuerpo.number) {
      return {
        ok: false,
        error:
          cuerpo.error ??
          "No se pudo reservar el número de la proforma. Intenta de nuevo.",
      };
    }
    return { ok: true, number: cuerpo.number };
  } catch {
    return {
      ok: false,
      error:
        "No se pudo reservar el número de la proforma. Revisa la conexión e intenta de nuevo.",
    };
  }
}
