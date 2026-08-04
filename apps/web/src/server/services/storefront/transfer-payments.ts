import "server-only";
import {
  buildReceiptPath,
  validateReceiptUpload,
} from "@/features/storefront/payments/receipt";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { verifyDocumentShareToken } from "@/server/services/sales/share-token";

/**
 * Pago por transferencia: a qué cuenta y con qué comprobante.
 *
 * El comprobante lo sube alguien SIN sesión, autorizado solo por el token
 * firmado de su pedido —el mismo mecanismo de `/factura/[token]`—. Por eso todo
 * lo que llega se trata como hostil, y la subida cruza el servidor: el navegador
 * nunca toca el bucket ni ve una credencial.
 *
 * El bucket `payment-receipts` es **privado**. Un comprobante lleva el nombre
 * del titular, su banco y a veces su número de cuenta: servirlo en una URL
 * pública adivinable sería publicar eso.
 */

const BUCKET = "payment-receipts";

type Admin = NonNullable<ReturnType<typeof createServiceRoleClient>>;

export interface BankAccount {
  id: string;
  bankName: string;
  accountType: "ahorros" | "corriente";
  accountNumber: string;
  holderName: string;
  holderDocument?: string;
}

/** Cuentas activas del negocio, para que el cliente sepa a dónde transferir. */
export async function listActiveBankAccounts(
  businessId: string,
): Promise<BankAccount[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data } = await admin
    .from("payment_bank_accounts")
    .select("id, bank_name, account_type, account_number, holder_name, holder_document")
    .eq("business_id", businessId)
    .eq("active", true)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id,
    bankName: r.bank_name,
    accountType: r.account_type === "corriente" ? "corriente" : "ahorros",
    accountNumber: r.account_number,
    holderName: r.holder_name,
    holderDocument: r.holder_document ?? undefined,
  }));
}

/** ¿Se puede pagar por transferencia? Solo si hay al menos una cuenta activa. */
export async function transferPaymentsAvailable(
  businessId: string,
): Promise<boolean> {
  return (await listActiveBankAccounts(businessId)).length > 0;
}

export interface UploadReceiptResult {
  ok: boolean;
  error?: string;
}

/**
 * Guarda el comprobante de un pedido, autorizado por su token.
 *
 * El token lleva dentro el `business_id` y el id del pedido y va firmado: sin
 * él no se puede subir nada, y con el de otro pedido tampoco.
 */
export async function uploadOrderReceipt(
  token: string,
  archivo: { bytes: ArrayBuffer; mimeType: string; fileName: string },
): Promise<UploadReceiptResult> {
  const claims = verifyDocumentShareToken(token);
  if (!claims) return { ok: false, error: "Enlace no válido." };

  const validacion = validateReceiptUpload({
    mimeType: archivo.mimeType,
    sizeBytes: archivo.bytes.byteLength,
    fileName: archivo.fileName,
  });
  if (!validacion.ok) return { ok: false, error: validacion.error };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "No disponible." };

  // El pedido tiene que existir, ser de ese negocio y admitir todavía el pago.
  const { data: pedido } = await admin
    .from("web_orders")
    .select("id, status, payment_status")
    .eq("id", claims.id)
    .eq("business_id", claims.businessId)
    .maybeSingle();
  if (!pedido) return { ok: false, error: "Enlace no válido." };
  if (pedido.status === "cancelado") {
    return { ok: false, error: "Este pedido está cancelado." };
  }
  if (pedido.payment_status === "pagado") {
    return { ok: false, error: "Este pedido ya figura como pagado." };
  }

  const ruta = buildReceiptPath(
    claims.businessId,
    pedido.id,
    archivo.fileName,
    Date.now(),
  );

  const { error: errorSubida } = await admin.storage
    .from(BUCKET)
    .upload(ruta, archivo.bytes, {
      contentType: archivo.mimeType,
      upsert: false,
    });
  if (errorSubida) {
    return { ok: false, error: "No pudimos guardar el comprobante." };
  }

  const { error: errorFila } = await admin.from("web_order_receipts").insert({
    order_id: pedido.id,
    business_id: claims.businessId,
    storage_path: ruta,
    mime_type: archivo.mimeType,
    size_bytes: archivo.bytes.byteLength,
  });
  if (errorFila) {
    // Un archivo huérfano en el bucket no le sirve a nadie y ocupa sitio.
    await admin.storage.from(BUCKET).remove([ruta]);
    return { ok: false, error: "No pudimos guardar el comprobante." };
  }

  return { ok: true };
}

export interface OrderReceipt {
  id: string;
  status: "pendiente" | "aceptado" | "rechazado";
  mimeType: string;
  uploadedAt: string;
  reviewNote?: string;
  /** Enlace firmado y temporal. El bucket es privado: no hay URL pública. */
  signedUrl?: string;
}

/** Comprobantes de un pedido. `withUrls` solo para el personal del negocio. */
export async function listOrderReceipts(
  businessId: string,
  orderId: string,
  withUrls = false,
): Promise<OrderReceipt[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data } = await admin
    .from("web_order_receipts")
    .select("id, status, mime_type, uploaded_at, review_note, storage_path")
    .eq("business_id", businessId)
    .eq("order_id", orderId)
    .order("uploaded_at", { ascending: false });
  if (!data) return [];

  return Promise.all(
    data.map(async (r) => ({
      id: r.id,
      status: (r.status as OrderReceipt["status"]) ?? "pendiente",
      mimeType: r.mime_type,
      uploadedAt: r.uploaded_at,
      reviewNote: r.review_note ?? undefined,
      // 10 minutos: lo que tarda alguien en mirarlo. Un enlace eterno a un
      // documento con datos bancarios es un enlace que acaba reenviado.
      signedUrl: withUrls
        ? ((await admin.storage.from(BUCKET).createSignedUrl(r.storage_path, 600))
            .data?.signedUrl ?? undefined)
        : undefined,
    })),
  );
}

/**
 * El personal acepta o rechaza un comprobante.
 *
 * Aceptar marca el pedido como pagado. **No hay forma de marcar un pedido como
 * pagado sin un comprobante detrás**: es lo que hace que el estado de pago
 * signifique algo.
 */
export async function reviewReceipt(
  businessId: string,
  receiptId: string,
  decision: "aceptado" | "rechazado",
  userId: string | undefined,
  note?: string,
): Promise<{ ok: boolean; error?: string; orderId?: string }> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "No disponible." };

  const { data: comprobante } = await admin
    .from("web_order_receipts")
    .select("id, order_id, status")
    .eq("id", receiptId)
    .eq("business_id", businessId)
    .maybeSingle();
  if (!comprobante) return { ok: false, error: "Comprobante no encontrado." };
  if (comprobante.status !== "pendiente") {
    return { ok: false, error: "Ese comprobante ya fue revisado." };
  }

  const { error } = await admin
    .from("web_order_receipts")
    .update({
      status: decision,
      review_note: note ?? null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: userId ?? null,
    })
    .eq("id", receiptId)
    .eq("business_id", businessId);
  if (error) return { ok: false, error: "No se pudo guardar la revisión." };

  if (decision === "aceptado") {
    await admin
      .from("web_orders")
      .update({ payment_status: "pagado", paid_at: new Date().toISOString() })
      .eq("id", comprobante.order_id)
      .eq("business_id", businessId);
  }

  return { ok: true, orderId: comprobante.order_id };
}

export interface SaveBankAccountInput {
  id?: string;
  bankName: string;
  accountType: "ahorros" | "corriente";
  accountNumber: string;
  holderName: string;
  holderDocument?: string;
  active: boolean;
}

/**
 * Guarda las cuentas del negocio, reemplazando la lista entera.
 *
 * Reemplazo completo y no fila a fila: quitar una cuenta que ya no se usa tiene
 * que ser tan fácil como borrarla de la lista. Que quede activa una cuenta vieja
 * significa dinero de clientes yendo a donde no debe.
 */
export async function saveBankAccounts(
  businessId: string,
  cuentas: SaveBankAccountInput[],
): Promise<{ ok: boolean; error?: string; saved?: number; active?: number }> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "No disponible." };

  const { error: errorBorrado } = await admin
    .from("payment_bank_accounts")
    .delete()
    .eq("business_id", businessId);
  if (errorBorrado) return { ok: false, error: "No se pudieron guardar." };

  if (cuentas.length === 0) return { ok: true, saved: 0, active: 0 };

  const { error } = await admin.from("payment_bank_accounts").insert(
    cuentas.map((c, i) => ({
      business_id: businessId,
      bank_name: c.bankName,
      account_type: c.accountType,
      account_number: c.accountNumber,
      holder_name: c.holderName,
      holder_document: c.holderDocument ?? null,
      active: c.active,
      sort_order: i,
    })),
  );
  if (error) return { ok: false, error: "No se pudieron guardar." };

  return {
    ok: true,
    saved: cuentas.length,
    active: cuentas.filter((c) => c.active).length,
  };
}

/** Todas las cuentas, activas o no, para el panel. */
export async function listAllBankAccounts(
  businessId: string,
): Promise<(BankAccount & { active: boolean })[]> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  const { data } = await admin
    .from("payment_bank_accounts")
    .select("id, bank_name, account_type, account_number, holder_name, holder_document, active")
    .eq("business_id", businessId)
    .order("sort_order", { ascending: true });
  return (data ?? []).map((r) => ({
    id: r.id,
    bankName: r.bank_name,
    accountType: r.account_type === "corriente" ? "corriente" : "ahorros",
    accountNumber: r.account_number,
    holderName: r.holder_name,
    holderDocument: r.holder_document ?? undefined,
    active: r.active,
  }));
}
