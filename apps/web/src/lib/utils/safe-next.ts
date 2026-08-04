// A dónde se puede mandar a alguien después de entrar.
//
// DL-12. `startsWith("/")` **no basta**: `//evil.com` empieza por barra y el
// navegador la resuelve como URL protocol-relative a otro dominio; `/\evil.com`
// también, porque el navegador normaliza la barra invertida a `//`.
//
// Vive aquí y no dentro de una página porque estaba escrito dos veces: bien en
// `/login` y mal en `/login/mfa`. Y la copia mala era la peligrosa, porque esa
// página redirige AL MONTAR cuando el usuario no tiene factor TOTP — o sea, sin
// sesión, sin código y sin un solo clic. Bastaba mandarle el enlace a alguien
// para sacarlo del dominio de la tienda con la barra de direcciones diciendo
// dermaland.
//
// Dos copias de una regla de seguridad siempre acaban discrepando, y discrepan
// justo en la que nadie mira.

export function safeNext(valor: unknown, porDefecto = "/"): string {
  if (typeof valor !== "string") return porDefecto;
  if (!valor.startsWith("/")) return porDefecto;
  if (valor.startsWith("//") || valor.startsWith("/\\")) return porDefecto;
  return valor;
}
