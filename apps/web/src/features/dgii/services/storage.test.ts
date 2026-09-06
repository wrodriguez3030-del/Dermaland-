import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  construirRuta,
  ErrorAlmacenamientoDgii,
  BUCKET_DGII,
  MAX_BYTES,
  guardarXmlFirmado,
  leerXml,
  borrarXml,
} from "./storage";
import * as supabaseServer from "@/lib/supabase/server";

const ctx = { businessId: "00000000-0000-0000-0000-00000000d001" };

describe("almacenamiento privado de XML fiscales", () => {
  it("el path canónico es el mismo que el de agendapp: por negocio, por comprobante", () => {
    // Que sea idéntico importa: si algún día hay que auditar los dos sistemas,
    // los documentos están en el mismo sitio relativo.
    expect(construirRuta(ctx, { tipo: "signed_xml", invoiceId: "f-1" }))
      .toBe("dgii/00000000-0000-0000-0000-00000000d001/invoices/f-1/signed.xml");
    expect(construirRuta(ctx, { tipo: "rfce_xml", invoiceId: "f-1" }))
      .toBe("dgii/00000000-0000-0000-0000-00000000d001/invoices/f-1/rfce.xml");
  });

  it("un id con barras o puntos suspensivos NO puede salirse de su carpeta", () => {
    // Sin esto, un id manipulado escribiría sobre el comprobante de otra empresa.
    for (const malo of ["../otro", "a/b", "..", "a\\b", ""]) {
      expect(() => construirRuta(ctx, { tipo: "signed_xml", invoiceId: malo }), malo)
        .toThrow(ErrorAlmacenamientoDgii);
    }
  });

  it("un UUID con guiones SÍ pasa (válidos en identificadores)", () => {
    // Los UUIDs contienen guiones: 00000000-0000-0000-0000-00000000d001
    // Deben ser aceptados sin problema.
    expect(construirRuta(ctx, { tipo: "signed_xml", invoiceId: "550e8400-e29b-41d4-a716-446655440000" }))
      .toMatch(/550e8400-e29b-41d4-a716-446655440000/);
  });

  it("un id con caracteres de control (\\n, \\0, \\t) NO pasa", () => {
    // Los caracteres de control (0x00–0x1f) son peligrosos en filenames y auditoría.
    // Deben rechazarse incluso si el resto del id es válido.
    for (const malo of ["f-1\n", "f-1\0", "f-1\t"]) {
      expect(() => construirRuta(ctx, { tipo: "signed_xml", invoiceId: malo }))
        .toThrow(ErrorAlmacenamientoDgii);
    }
  });

  it("el businessId también se valida, aunque venga del servidor", () => {
    expect(() => construirRuta({ businessId: "../x" }, { tipo: "signed_xml", invoiceId: "f-1" }))
      .toThrow(ErrorAlmacenamientoDgii);
  });

  it("el bucket es el privado de DermaLand, no el de agendapp", () => {
    expect(BUCKET_DGII).toBe("dgii-xml");
  });

  it("el tope de tamaño es el mismo que el de agendapp", () => {
    expect(MAX_BYTES).toBe(5 * 1024 * 1024);
  });

  it("el error dice qué pasó, para poder distinguirlo arriba", () => {
    try {
      construirRuta(ctx, { tipo: "signed_xml", invoiceId: "../x" });
      throw new Error("debió lanzar");
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorAlmacenamientoDgii);
      expect((e as ErrorAlmacenamientoDgii).codigo).toBe("path_invalid");
    }
  });

  it("un espacio en el segmento SÍ pasa (permitido en IDs)", () => {
    // agendapp acepta espacios. No divergir.
    const rutaConEspacio = construirRuta(ctx, { tipo: "signed_xml", invoiceId: "f 1" });
    expect(rutaConEspacio).toContain("f 1");
  });
});

describe("guardarXmlFirmado: almacenamiento con validación de tamaño", () => {
  let mockUpload: ReturnType<typeof vi.fn>;
  let mockClient: any;

  beforeEach(() => {
    mockUpload = vi.fn().mockResolvedValue({ error: null });
    mockClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          upload: mockUpload,
        }),
      },
    };
    vi.spyOn(supabaseServer, "createServiceRoleClient").mockReturnValue(mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("guarda un XML firmado y devuelve exactamente la ruta de construirRuta", async () => {
    const xml = "<comprobante>test</comprobante>";
    const ruta = await guardarXmlFirmado(ctx, { tipo: "signed_xml", invoiceId: "f-1", xml });
    const rutaEsperada = construirRuta(ctx, { tipo: "signed_xml", invoiceId: "f-1" });
    expect(ruta).toBe(rutaEsperada);
  });

  it("llama al upload con el bucket correcto y content-type XML", async () => {
    const xml = "<comprobante>test</comprobante>";
    await guardarXmlFirmado(ctx, { tipo: "signed_xml", invoiceId: "f-1", xml });
    expect(mockUpload).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Buffer),
      expect.objectContaining({
        contentType: "application/xml",
      }),
    );
  });

  it("rechaza contenido vacío sin llamar a upload", async () => {
    await expect(guardarXmlFirmado(ctx, { tipo: "signed_xml", invoiceId: "f-1", xml: "" })).rejects.toThrow(
      ErrorAlmacenamientoDgii,
    );
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("rechaza contenido > 5 MB con codigo too_large sin llamar a upload", async () => {
    const xmlGrande = "x".repeat(MAX_BYTES + 1);
    try {
      await guardarXmlFirmado(ctx, { tipo: "signed_xml", invoiceId: "f-1", xml: xmlGrande });
      throw new Error("debió lanzar");
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorAlmacenamientoDgii);
      expect((e as ErrorAlmacenamientoDgii).codigo).toBe("too_large");
      expect(mockUpload).not.toHaveBeenCalled();
    }
  });

  it("propaga el error del upload con codigo upload_failed", async () => {
    mockUpload.mockResolvedValue({ error: { message: "Permission denied" } });
    try {
      await guardarXmlFirmado(ctx, { tipo: "signed_xml", invoiceId: "f-1", xml: "<test/>" });
      throw new Error("debió lanzar");
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorAlmacenamientoDgii);
      expect((e as ErrorAlmacenamientoDgii).codigo).toBe("upload_failed");
    }
  });
});

describe("leerXml: lectura con ownership check", () => {
  let mockDownload: ReturnType<typeof vi.fn>;
  let mockClient: any;

  beforeEach(() => {
    const mockBlob = {
      text: vi.fn().mockResolvedValue("<comprobante>test</comprobante>"),
    };
    mockDownload = vi.fn().mockResolvedValue({ data: mockBlob, error: null });
    mockClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          download: mockDownload,
        }),
      },
    };
    vi.spyOn(supabaseServer, "createServiceRoleClient").mockReturnValue(mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("devuelve el contenido del archivo", async () => {
    const ruta = construirRuta(ctx, { tipo: "signed_xml", invoiceId: "f-1" });
    const contenido = await leerXml(ctx, ruta);
    expect(contenido).toBe("<comprobante>test</comprobante>");
  });

  it("rechaza un path que no pertenece al business actual", async () => {
    const rutaOtroNegocio = "dgii/otro-business-id/invoices/f-1/signed.xml";
    try {
      await leerXml(ctx, rutaOtroNegocio);
      throw new Error("debió lanzar");
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorAlmacenamientoDgii);
      expect((e as ErrorAlmacenamientoDgii).codigo).toBe("path_invalid");
      expect(mockDownload).not.toHaveBeenCalled();
    }
  });

  it("devuelve not_found cuando el archivo no existe", async () => {
    mockDownload.mockResolvedValue({ data: null, error: { message: "Not found" } });
    const ruta = construirRuta(ctx, { tipo: "signed_xml", invoiceId: "noexiste" });
    try {
      await leerXml(ctx, ruta);
      throw new Error("debió lanzar");
    } catch (e) {
      expect(e).toBeInstanceOf(ErrorAlmacenamientoDgii);
      expect((e as ErrorAlmacenamientoDgii).codigo).toBe("not_found");
    }
  });
});

describe("borrarXml: limpieza best-effort", () => {
  let mockRemove: ReturnType<typeof vi.fn>;
  let mockClient: any;

  beforeEach(() => {
    mockRemove = vi.fn().mockResolvedValue({ error: null });
    mockClient = {
      storage: {
        from: vi.fn().mockReturnValue({
          remove: mockRemove,
        }),
      },
    };
    vi.spyOn(supabaseServer, "createServiceRoleClient").mockReturnValue(mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("borra el archivo silenciosamente", async () => {
    const ruta = construirRuta(ctx, { tipo: "signed_xml", invoiceId: "f-1" });
    await expect(borrarXml(ctx, ruta)).resolves.toBeUndefined();
    expect(mockRemove).toHaveBeenCalledWith([ruta]);
  });

  it("no lanza aunque el borrado falle (best-effort)", async () => {
    mockRemove.mockRejectedValue(new Error("Network error"));
    const ruta = construirRuta(ctx, { tipo: "signed_xml", invoiceId: "f-1" });
    await expect(borrarXml(ctx, ruta)).resolves.toBeUndefined();
  });

  it("rechaza paths inválidos silenciosamente (ownership check)", async () => {
    const rutaOtroNegocio = "dgii/otro-business/invoices/f-1/signed.xml";
    await expect(borrarXml(ctx, rutaOtroNegocio)).resolves.toBeUndefined();
    expect(mockRemove).not.toHaveBeenCalled();
  });
});
