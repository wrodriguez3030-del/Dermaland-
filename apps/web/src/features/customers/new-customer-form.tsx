"use client";

import { CustomerForm } from "./customer-form";

/**
 * Wrapper para mantener la importación existente desde
 * `app/(app)/clientes/nuevo/page.tsx`. La lógica vive en `customer-form.tsx`,
 * compartida con la edición.
 */
export function NewCustomerForm() {
  return <CustomerForm mode="create" />;
}
