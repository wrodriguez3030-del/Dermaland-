// El checkout pide "Nombre y apellido" en UNA casilla, porque pedir dos hace
// que la gente abandone. `clients` los guarda en dos columnas, las dos NOT NULL.
// Esta función traduce entre las dos cosas.
//
// Se parte por el PRIMER espacio y nada más: "María Trinidad Sánchez de los
// Santos" es un nombre dominicano perfectamente normal, y trocearlo en cuatro
// columnas produciría fichas peores que dejar el apellido completo junto.

export interface SplitName {
  firstName: string;
  lastName: string;
}

/** Nombre visible cuando alguien deja la casilla en blanco pese al `required`. */
const SIN_NOMBRE = "Cliente";

export function splitFullName(full: string | null | undefined): SplitName {
  const limpio = (full ?? "").trim().replace(/\s+/g, " ");
  if (!limpio) return { firstName: SIN_NOMBRE, lastName: "" };

  const espacio = limpio.indexOf(" ");
  if (espacio < 0) {
    // Apellido vacío y no el nombre repetido: "Ana Ana" en la ficha del cliente
    // se lee como un error del sistema, no como un dato que faltaba.
    return { firstName: limpio, lastName: "" };
  }
  return {
    firstName: limpio.slice(0, espacio),
    lastName: limpio.slice(espacio + 1),
  };
}
