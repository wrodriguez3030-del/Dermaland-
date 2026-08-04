import { NextResponse } from "next/server";
import { MAX_RECEIPT_BYTES } from "@/features/storefront/payments/receipt";
import { rateLimit } from "@/server/security/rate-limit";
import { resolveStorefrontTenant } from "@/server/services/storefront/tenant";
import { uploadOrderReceipt } from "@/server/services/storefront/transfer-payments";

/**
 * Subir el comprobante de una transferencia.
 *
 * Pública porque la tienda no tiene sesión, pero **no abierta**: la autorización
 * es el token firmado del pedido, el mismo mecanismo de `/factura/[token]`. Sin
 * él —o con el de otro pedido— no se sube nada.
 *
 * Es la única ruta de la tienda que **acepta un archivo**, así que lleva freno
 * de abuso: sin él, alguien con un enlace válido podría llenar el bucket.
 *
 * El archivo cruza el servidor a propósito. Subir directo desde el navegador
 * exigiría darle al cliente una credencial de escritura del bucket, y el bucket
 * guarda documentos con datos bancarios de otras personas.
 */

export const dynamic = "force-dynamic";

/** Diez por hora y por IP. Un cliente sube uno, quizá dos si se equivoca. */
const LIMITE = 10;
const VENTANA_MS = 60 * 60 * 1000;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const tenant = await resolveStorefrontTenant();
  if (!tenant) {
    return NextResponse.json({ error: "Tienda no disponible" }, { status: 404 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "desconocida";
  const rl = rateLimit(`comprobante:${ip}`, LIMITE, VENTANA_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Demasiados intentos. Prueba de nuevo en un rato." },
      { status: 429 },
    );
  }

  const { token } = await params;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Envío inválido" }, { status: 400 });
  }

  const archivo = form.get("comprobante");
  if (!(archivo instanceof File)) {
    return NextResponse.json({ error: "Adjunta el comprobante." }, { status: 422 });
  }
  // Se comprueba el tamaño ANTES de leerlo en memoria: leer primero un archivo
  // de 2 GB para después rechazarlo es dejarse tumbar el servidor.
  if (archivo.size > MAX_RECEIPT_BYTES) {
    return NextResponse.json(
      { error: "El archivo pesa demasiado." },
      { status: 413 },
    );
  }

  const res = await uploadOrderReceipt(token, {
    bytes: await archivo.arrayBuffer(),
    mimeType: archivo.type,
    fileName: archivo.name,
  });
  if (!res.ok) {
    return NextResponse.json({ error: res.error }, { status: 422 });
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
