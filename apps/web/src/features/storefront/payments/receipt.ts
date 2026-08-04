// El comprobante de transferencia que sube el cliente.
//
// Todo lo que llega aquí lo manda un desconocido sin sesión: el tipo de archivo,
// el tamaño y el nombre. Los tres se tratan como hostiles.
//
// El nombre del archivo **no se conserva**. Un nombre puede ser
// `../../../etc/passwd`, llevar un byte nulo, o traer 400 caracteres de emoji:
// usarlo para construir la ruta de guardado es la vía clásica de escribir donde
// no se debe. La ruta se construye entera aquí, con el negocio y el pedido
// delante, y del nombre original solo sobrevive una extensión de una lista
// blanca.

/** 5 MB. Una foto de un recibo cabe de sobra; un vídeo, no. */
export const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

/**
 * Tipos aceptados. **SVG queda fuera a propósito** aunque sea una imagen: puede
 * llevar `<script>` dentro y se serviría desde nuestro dominio.
 */
const MIMES_ACEPTADOS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

export interface ReceiptUploadInput {
  mimeType: string;
  sizeBytes: number;
  fileName: string;
}

export type ReceiptValidation =
  | { ok: true; extension: string }
  | { ok: false; error: string };

export function validateReceiptUpload(
  input: ReceiptUploadInput,
): ReceiptValidation {
  const extension = MIMES_ACEPTADOS[(input.mimeType ?? "").toLowerCase()];
  if (!extension) {
    return {
      ok: false,
      error: "Sube una foto (JPG, PNG, WEBP o HEIC) o un PDF del comprobante.",
    };
  }
  if (!Number.isFinite(input.sizeBytes) || input.sizeBytes <= 0) {
    return { ok: false, error: "El archivo llegó vacío. Inténtalo de nuevo." };
  }
  if (input.sizeBytes > MAX_RECEIPT_BYTES) {
    return {
      ok: false,
      error: `El archivo pesa demasiado. El máximo son ${Math.round(MAX_RECEIPT_BYTES / 1024 / 1024)} MB.`,
    };
  }
  return { ok: true, extension };
}

/** Extensión de la lista blanca, o `bin` si no la reconocemos. */
function extensionSegura(fileName: string): string {
  const punto = (fileName ?? "").lastIndexOf(".");
  if (punto < 0) return "bin";
  const cruda = fileName.slice(punto + 1).toLowerCase();
  return Object.values(MIMES_ACEPTADOS).includes(cruda) ? cruda : "bin";
}

/**
 * Dónde se guarda. `negocio/pedido/marca.ext`, construido entero aquí.
 *
 * `timestamp` entra por parámetro y no se lee del reloj para poder probarlo: el
 * único requisito es que dos subidas del mismo pedido no se pisen.
 */
export function buildReceiptPath(
  businessId: string,
  orderId: string,
  fileName: string,
  timestamp: number,
): string {
  return `${businessId}/${orderId}/${timestamp}.${extensionSegura(fileName)}`;
}

/**
 * Número de cuenta en grupos de cuatro.
 *
 * **No se enmascara**: el cliente lo necesita entero para poder transferir.
 * Agruparlo es solo para que pueda dictarlo por teléfono sin equivocarse.
 */
export function formatAccountNumber(raw: string): string {
  const digitos = (raw ?? "").replace(/\D/g, "");
  return digitos.replace(/(.{4})/g, "$1 ").trim();
}
