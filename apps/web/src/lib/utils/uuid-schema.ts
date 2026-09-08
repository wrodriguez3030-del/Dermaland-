import { z } from "zod";

/**
 * Un identificador de la base, validado como lo valida POSTGRES y no como lo
 * valida el RFC.
 *
 * 🔴 POR QUÉ EXISTE: `z.string().uuid()` exige un uuid con versión y variante
 * correctas (RFC 4122). Postgres NO: acepta cualquier grupo de 32 dígitos
 * hexadecimales con guiones. Y esta base tiene identificadores así, puestos por
 * las semillas: la sucursal «DermaLand Principal» es
 * `00000000-0000-0000-0000-00000000b001`, y el negocio entero es
 * `...-00000000d001`.
 *
 * El resultado fue un fallo que se veía como un parpadeo: el panel cargaba
 * ANTES de que llegaran las sucursales —sin filtro, y funcionaba—, y en cuanto
 * llegaban, la petición con esos ids se rechazaba con un 400 y las tarjetas
 * pasaban a «—». «Aparece y se va», dijo el dueño, y era exactamente eso.
 *
 * Validar más estricto que la base no protege de nada: rechaza datos que la
 * base sí tiene.
 */
export const idDeLaBase = z
  .string()
  .regex(
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    "No parece un identificador de la base.",
  );
