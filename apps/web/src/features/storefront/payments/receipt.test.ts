import { describe, expect, it } from "vitest";
import {
  MAX_RECEIPT_BYTES,
  buildReceiptPath,
  formatAccountNumber,
  validateReceiptUpload,
} from "./receipt";

describe("validateReceiptUpload", () => {
  const OK = { mimeType: "image/jpeg", sizeBytes: 500_000, fileName: "foto.jpg" };

  it("acepta un PDF que el movil declara como octet-stream", () => {
    // Android manda esto al elegir un PDF desde el gestor de archivos. Antes se
    // rechazaba, y el cliente leia "sube una foto o un PDF" mientras subia
    // exactamente un PDF.
    const r = validateReceiptUpload({
      ...OK,
      mimeType: "application/octet-stream",
      fileName: "comprobante.pdf",
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.extension).toBe("pdf");
      // El MIME servido es el canonico, NUNCA el que declaro el cliente.
      expect(r.mimeType).toBe("application/pdf");
    }
  });

  it("acepta un tipo vacio si la extension esta en la lista", () => {
    const r = validateReceiptUpload({ ...OK, mimeType: "", fileName: "a.PNG" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mimeType).toBe("image/png");
  });

  it("la extension NO abre la puerta a lo que la lista rechaza", () => {
    // El respaldo usa la MISMA lista blanca: un SVG no entra por el nombre.
    expect(
      validateReceiptUpload({ ...OK, mimeType: "", fileName: "x.svg" }).ok,
    ).toBe(false);
    expect(
      validateReceiptUpload({ ...OK, mimeType: "", fileName: "x.html" }).ok,
    ).toBe(false);
    expect(
      validateReceiptUpload({ ...OK, mimeType: "", fileName: "sin-punto" }).ok,
    ).toBe(false);
  });

  it("acepta las fotos y el PDF que manda la gente de verdad", () => {
    for (const mime of [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "application/pdf",
    ]) {
      expect(validateReceiptUpload({ ...OK, mimeType: mime }).ok).toBe(true);
    }
  });

  it("rechaza cualquier otro tipo: esto no es un subidor de archivos", () => {
    // Un comprobante es una foto o un PDF. Todo lo demás es alguien probando.
    // El tipo VACÍO ya no está en esta lista: significa «el navegador no sabe
    // qué es», no «es peligroso», y rechazarlo dejaba tirado a quien sube un
    // PDF desde un Android. Con el tipo vacío manda la extensión, contra esta
    // misma lista blanca (ver las pruebas del respaldo, arriba).
    for (const mime of [
      "application/zip",
      "text/html",
      "image/svg+xml",
      "application/x-msdownload",
    ]) {
      expect(validateReceiptUpload({ ...OK, mimeType: mime }).ok).toBe(false);
    }
  });

  it("SVG queda fuera aunque sea imagen: puede llevar script dentro", () => {
    expect(validateReceiptUpload({ ...OK, mimeType: "image/svg+xml" }).ok).toBe(
      false,
    );
  });

  it("rechaza lo que pase del tope y lo vacío", () => {
    expect(
      validateReceiptUpload({ ...OK, sizeBytes: MAX_RECEIPT_BYTES + 1 }).ok,
    ).toBe(false);
    expect(validateReceiptUpload({ ...OK, sizeBytes: 0 }).ok).toBe(false);
    expect(validateReceiptUpload({ ...OK, sizeBytes: -1 }).ok).toBe(false);
  });

  it("los mensajes le dicen a una persona qué hacer", () => {
    const r = validateReceiptUpload({ ...OK, mimeType: "application/zip" });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/foto|PDF/i);
  });
});

describe("buildReceiptPath", () => {
  it("mete el negocio y el pedido en la ruta: nada cuelga de la raíz", () => {
    const p = buildReceiptPath("biz-1", "ord-9", "recibo.PNG", 1700000000000);
    expect(p.startsWith("biz-1/ord-9/")).toBe(true);
  });

  it("NO conserva el nombre que puso el cliente", () => {
    // Un nombre de archivo lo escribe un desconocido: "../../etc/passwd",
    // "%00.png", 400 caracteres de emoji. No se usa para construir la ruta.
    const p = buildReceiptPath("b", "o", "../../../etc/passwd", 1);
    expect(p).not.toContain("..");
    expect(p).not.toContain("passwd");
    expect(p).toMatch(/^b\/o\/[0-9]+\.bin$|^b\/o\/[0-9]+\.[a-z0-9]+$/);
  });

  it("conserva SOLO una extensión conocida, en minúsculas", () => {
    expect(buildReceiptPath("b", "o", "x.PNG", 5)).toBe("b/o/5.png");
    expect(buildReceiptPath("b", "o", "x.pdf", 5)).toBe("b/o/5.pdf");
    expect(buildReceiptPath("b", "o", "x.exe", 5)).toBe("b/o/5.bin");
    expect(buildReceiptPath("b", "o", "sin-extension", 5)).toBe("b/o/5.bin");
  });

  it("dos subidas del mismo pedido no se pisan", () => {
    expect(buildReceiptPath("b", "o", "a.png", 1)).not.toBe(
      buildReceiptPath("b", "o", "a.png", 2),
    );
  });
});

describe("formatAccountNumber", () => {
  it("agrupa de cuatro para poder dictarlo por teléfono sin equivocarse", () => {
    expect(formatAccountNumber("1234567890")).toBe("1234 5678 90");
  });

  it("no inventa dígitos ni los esconde: el cliente necesita el número entero", () => {
    expect(formatAccountNumber("123").replace(/\s/g, "")).toBe("123");
    expect(formatAccountNumber("")).toBe("");
  });

  it("limpia lo que venga escrito con guiones", () => {
    expect(formatAccountNumber("1234-5678-90")).toBe("1234 5678 90");
  });
});
