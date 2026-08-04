// ¿Están abiertas las cuentas de cliente?
//
// Hoy NO, y no por falta de código: Supabase exige confirmar el correo y su
// emisor propio se agota en unos pocos envíos por hora
// (`over_email_send_rate_limit`). Con eso, el segundo cliente que intente
// registrarse en la misma hora ve un error — y el que se queda fuera no vuelve.
//
// Una puerta que no abre es peor que ninguna puerta. Así que mientras el correo
// no funcione, la tienda no ofrece cuentas: ni enlace en el encabezado, ni
// formulario. **Se puede comprar sin cuenta**, así que esto no frena una sola
// venta.
//
// El día que haya SMTP propio en Supabase (Authentication → Emails → SMTP), se
// enciende poniendo `STOREFRONT_ACCOUNTS_ENABLED=true`. Ni una línea de código.
//
// Función pura —recibe el entorno, no lo lee— para poder probar el caso que
// importa: que nada la encienda por accidente.

export type AccountsEnv = Partial<Record<string, string>>;

export function customerAccountsEnabled(env: AccountsEnv): boolean {
  // Comparación exacta contra "true". Que un "1", un "yes" o un "TRUE" abrieran
  // el registro sería encenderlo sin querer.
  return (env.STOREFRONT_ACCOUNTS_ENABLED ?? "").trim() === "true";
}
