// Reglas del alta de un cliente en la tienda.
//
// Aparte del servidor y sin Supabase, para poder probarlas enteras. Y con
// mensajes escritos para una persona: quien se está registrando en una tienda no
// tiene por qué leer "invalid_type: expected string, received undefined".
//
// El teléfono se normaliza a dígitos porque es la llave con la que se busca si
// esa persona YA existe como cliente del mostrador, donde se ha tecleado de
// todas las formas posibles: con guiones, con paréntesis, con espacios.

import { z } from "zod";

export interface RegistrationInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  /** Sólo dígitos, 10 posiciones (formato dominicano sin código de país). */
  phone: string;
}

/** Mínimo de Supabase Auth; subirlo aquí no sube la seguridad real. */
const MIN_CLAVE = 8;

/** Teléfono dominicano sin código de país. */
const LARGO_TELEFONO = 10;

const Esquema = z.object({
  email: z
    .string({ message: "Escribe tu correo." })
    .trim()
    .toLowerCase()
    .email("Ese correo no parece válido."),
  password: z
    .string({ message: "Escribe una contraseña." })
    .min(MIN_CLAVE, `La contraseña necesita al menos ${MIN_CLAVE} caracteres.`),
  firstName: z
    .string({ message: "Escribe tu nombre." })
    .trim()
    .min(1, "Escribe tu nombre."),
  lastName: z
    .string({ message: "Escribe tu apellido." })
    .trim()
    .min(1, "Escribe tu apellido."),
  phone: z
    .string({ message: "Escribe tu teléfono." })
    .transform((v) => v.replace(/\D/g, ""))
    .refine(
      (v) => v.length === LARGO_TELEFONO,
      "El teléfono debe tener 10 dígitos.",
    ),
});

export type RegistrationResult =
  | { ok: true; value: RegistrationInput }
  | { ok: false; error: string };

export function parseRegistration(raw: unknown): RegistrationResult {
  const r = Esquema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data };
  // El primer problema y nada más: una lista de seis errores a la vez no ayuda
  // a nadie a arreglar el formulario.
  const primero = r.error.issues[0];
  return { ok: false, error: primero?.message ?? "Revisa los datos." };
}
