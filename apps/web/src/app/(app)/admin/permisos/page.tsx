import { redirect } from "next/navigation";

/**
 * «Permisos» y «Roles» eran dos pantallas contando lo mismo, y ninguna decía la
 * verdad: las dos leían `roleDefinitions` (datos de mentira) y enseñaban una
 * matriz que el sistema no aplicaba al autorizar.
 *
 * Ahora hay una sola, derivada de las constantes reales. Esta ruta se conserva
 * —está en el menú y en enlaces guardados— y lleva allí.
 */
export default function PermisosPage() {
  redirect("/admin/roles");
}
