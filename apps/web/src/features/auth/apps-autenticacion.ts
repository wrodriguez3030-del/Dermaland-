/**
 * Apps de autenticación que sirven para el segundo factor, con su enlace de
 * descarga.
 *
 * Existe porque el dueño lo pidió (08/09/2026): «que sea fácil para nuevos
 * administradores descargar la app de autenticación, pon el link de
 * Authenticator para que el user haga la descarga y que salga el QR». Antes la
 * pantalla decía «escanea este QR con Google Authenticator, Authy o similar» y
 * daba por hecho que quien lo lee ya tiene una instalada — que es justo lo que
 * NO pasa con alguien a quien se le acaba de crear la cuenta.
 *
 * Cualquier app TOTP vale (el QR es estándar). Se ofrecen dos, y no cinco,
 * porque una lista larga es una decisión más que tomar delante de una pantalla
 * que ya pide teclear un código.
 */
export interface AppAutenticacion {
  readonly nombre: string;
  /** App Store (iPhone/iPad). */
  readonly ios: string;
  /** Google Play (Android). */
  readonly android: string;
}

export const APPS_AUTENTICACION: readonly AppAutenticacion[] = [
  {
    nombre: "Google Authenticator",
    ios: "https://apps.apple.com/app/google-authenticator/id388497605",
    android:
      "https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2",
  },
  {
    nombre: "Microsoft Authenticator",
    ios: "https://apps.apple.com/app/microsoft-authenticator/id983156458",
    android: "https://play.google.com/store/apps/details?id=com.azure.authenticator",
  },
] as const;
