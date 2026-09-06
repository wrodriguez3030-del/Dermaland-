// apps/web/src/features/dgii/services/prepare.test.ts
//
// Pliego: task-5-brief.md, Tarea 5, Paso 1. El cuerpo de los `it(...)` es
// literal del pliego. `dobles()` se EXTENDIÓ con dos claves que el pliego no
// traía (`configuracion`, `certificado`): sin ellas, `buildEcfXml`/`signEcfXml`
// (que SÍ corren de verdad en estas pruebas — no están en la lista de lo que
// se sustituye) no tienen con qué emisor ni con qué certificado trabajar, y
// "firma antes de consumir" no llegaría nunca a "subir". Es exactamente la
// regla global de la fase: "Ningún certificado real entra al repositorio. Las
// pruebas generan uno autofirmado en memoria con `core/__port__/dgii-test-cert.ts`."
// Ver docs/decisiones.md, entrada de esta tarea.
//
// RONDA DE CORRECCIÓN 1 (revisión externa): se añadieron las pruebas de I2
// (compensarFallo pliega el fallo de marcarFallo en el motivo), I3
// (finalizarFactura RECHAZANDO, no solo devolviendo ok:false), I4 (una
// carrera perdida borra su XML antes de reintentar y al rendirse) y los dos
// hallazgos Menores (mensaje de XSD truncado; motivo desconocido no se
// re-etiqueta como ENCF_TOMADO). Las 8 pruebas originales no se tocaron.
import { describe, it, expect, vi } from "vitest";
import { prepararComprobante } from "./prepare";
import { getDummyCert } from "../core/__port__/dgii-test-cert";
import type {
  ResultadoPreparar as ResultadoPrepararFactura,
  ResultadoFinalizar,
  ResultadoMarcarFallo,
} from "@/server/repositories/supabase/dgii-sequences";

/** Dobles: ni base, ni bucket, ni red. Solo el baile. */
function dobles(over: Partial<Record<string, unknown>> = {}) {
  const llamadas: string[] = [];
  const cert = getDummyCert();
  return {
    llamadas,
    habilitacion: { bloqueos: [], configurado: true, certificadoActivo: true, secuenciasActivas: 1 },
    // Emisor de prueba: nunca se lee de Supabase en estas pruebas (dobles()
    // no incluye ningún cliente real), así que build/sign necesitan estos
    // datos para no fallar antes de llegar a "subir".
    configuracion: {
      businessId: "b1",
      rncEmisor: "131561985",
      razonSocialEmisor: "DermaLand SRL",
      direccionEmisor: "Calle Principal 123, Santiago",
      // Provincia/Municipio usan el MISMO catálogo jerárquico de 6 dígitos del
      // XSD oficial (Santiago = 25xxxx); un "25" corto no es un elemento válido
      // del enum y el XML firmado no pasaría la validación.
      provinciaCodigo: "250000",
      municipioCodigo: "250101",
      correoEmisor: "fiscal@dermaland.test",
      // El XSD exige el patrón ###-###-####; sin guiones lo rechaza.
      telefonoEmisor: "809-555-1234",
      ambiente: "testecf",
      dgiiEnabledRealSend: false,
    },
    // Certificado autofirmado EN MEMORIA (core/__port__/dgii-test-cert.ts).
    // Nunca un .p12 real: la regla global de la fase lo prohíbe.
    certificado: { certificatePem: cert.certificatePem, privateKeyPem: cert.privateKeyPem },
    secuencias: {
      peekNextEncf: vi.fn(async () => { llamadas.push("peek"); return "E320000000007"; }),
      // Tipado explícito del retorno: varias pruebas reasignan este mock con
      // la OTRA rama de la unión (`ENCF_TOMADO` / `IDEMPOTENT_...`), y sin la
      // anotación TypeScript infiere el tipo angosto del literal de aquí.
      prepararFactura: vi.fn(async (): Promise<ResultadoPrepararFactura> => {
        llamadas.push("prepare");
        return { ok: true, invoice_id: "f-1", e_ncf: "E320000000007" };
      }),
      finalizarFactura: vi.fn(async (): Promise<ResultadoFinalizar> => {
        llamadas.push("finalize");
        return { ok: true, invoice_id: "f-1" };
      }),
      marcarFallo: vi.fn(async (): Promise<ResultadoMarcarFallo> => {
        llamadas.push("fail");
        return { ok: true, invoice_id: "f-1" };
      }),
    },
    almacenamiento: {
      guardarXmlFirmado: vi.fn(async () => { llamadas.push("subir"); return "dgii/b1/invoices/f-1/signed.xml"; }),
      borrarXml: vi.fn(async () => { llamadas.push("borrar"); }),
    },
    ...over,
  };
}

describe("preparar un comprobante", () => {
  it("firma ANTES de consumir el número: ése es todo el punto del diseño", async () => {
    // Si `prepare` ocurriera antes de firmar, un fallo de firma quemaría un
    // número fiscal que luego hay que declarar anulado ante la DGII.
    const d = dobles();
    await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(d.llamadas.indexOf("peek")).toBeLessThan(d.llamadas.indexOf("subir"));
    expect(d.llamadas.indexOf("subir")).toBeLessThan(d.llamadas.indexOf("prepare"));
  });

  it("si la firma falla, NO se consume ningún número", async () => {
    const d = dobles();
    d.almacenamiento.guardarXmlFirmado = vi.fn(async () => { throw new Error("firma rota"); });
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r.ok).toBe(false);
    expect(d.secuencias.prepararFactura).not.toHaveBeenCalled();
  });

  it("una carrera se reintenta con el número nuevo, sin fallar", async () => {
    const d = dobles();
    let n = 0;
    d.secuencias.prepararFactura = vi.fn(async (): Promise<ResultadoPrepararFactura> => {
      n++;
      return n === 1
        ? { ok: false, motivo: "ENCF_TOMADO", e_ncf_actual: "E320000000008" }
        : { ok: true, invoice_id: "f-1", e_ncf: "E320000000008" };
    });
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r).toMatchObject({ ok: true, eNcf: "E320000000008" });
    expect(n).toBe(2);
  });

  it("una carrera que no cede se rinde, no se queda en bucle", async () => {
    const d = dobles();
    d.secuencias.prepararFactura = vi.fn(async (): Promise<ResultadoPrepararFactura> => ({ ok: false, motivo: "ENCF_TOMADO", e_ncf_actual: "E320000000009" }));
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r.ok).toBe(false);
    expect(d.secuencias.prepararFactura).toHaveBeenCalledTimes(3);
    // I4 (ronda de corrección 1): los 3 intentos firmaron y subieron un XML
    // cada uno; ninguno llegó a consumir número, pero los 3 quedarían como
    // evidencia fiscal huérfana en el bucket si no se borran también al
    // agotar los intentos, no solo al reintentar.
    expect(d.almacenamiento.borrarXml).toHaveBeenCalledTimes(3);
  });

  it("una carrera perdida borra el XML antes de reintentar: no deja evidencia fiscal huérfana", async () => {
    // I4 (ronda de corrección 1): el XML del intento que perdió la carrera
    // está firmado de verdad, con un e-NCF que resultó ser de otra
    // factura. Sin borrarlo, queda guardado indefinidamente en el bucket
    // sin que ninguna fila lo apunte — el mismo precedente que cita el
    // pliego (`transfer-payments.ts`): borrar el objeto si lo que viene
    // después falla.
    const d = dobles();
    let n = 0;
    d.secuencias.prepararFactura = vi.fn(async (): Promise<ResultadoPrepararFactura> => {
      n++;
      return n === 1
        ? { ok: false, motivo: "ENCF_TOMADO", e_ncf_actual: "E320000000008" }
        : { ok: true, invoice_id: "f-1", e_ncf: "E320000000008" };
    });
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r).toMatchObject({ ok: true });
    expect(d.almacenamiento.borrarXml).toHaveBeenCalledTimes(1);
    // El borrado ocurre ANTES del segundo "subir" (el reintento), no después.
    const iBorrar = d.llamadas.indexOf("borrar");
    const iSegundoSubir = d.llamadas.indexOf("subir", d.llamadas.indexOf("subir") + 1);
    expect(iBorrar).toBeLessThan(iSegundoSubir);
  });

  it("un motivo desconocido de prepare_ecf_invoice no se reetiqueta como ENCF_TOMADO", async () => {
    // Menor (ronda de corrección 1): hoy la fase 2 solo emite ENCF_TOMADO o
    // IDEMPOTENT_PROFORMA_YA_FACTURADA, pero eso es un hecho de HOY, no una
    // garantía del compilador. Un tercer motivo no debe consumir los 3
    // intentos en silencio disfrazado de carrera.
    const d = dobles();
    d.secuencias.prepararFactura = vi.fn(
      async () => ({ ok: false, motivo: "OTRO_MOTIVO_NO_CONTEMPLADO" }) as never,
    );
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("OTRO_MOTIVO_NO_CONTEMPLADO");
    expect(d.secuencias.prepararFactura).toHaveBeenCalledTimes(1);
  });

  it("si la proforma ya tenía comprobante, devuelve ése y no emite otro", async () => {
    const d = dobles();
    d.secuencias.prepararFactura = vi.fn(async (): Promise<ResultadoPrepararFactura> => ({ ok: false, motivo: "IDEMPOTENT_PROFORMA_YA_FACTURADA", invoice_id: "f-vieja" }));
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r).toMatchObject({ ok: true, invoiceId: "f-vieja" });
    expect(d.secuencias.finalizarFactura).not.toHaveBeenCalled();
  });

  it("si finalizar falla, se marca el fallo y se borra el XML subido", async () => {
    // El número ya está consumido: lo que no puede quedar es un objeto huérfano
    // en el bucket y una factura en `draft` sin motivo escrito.
    const d = dobles();
    d.secuencias.finalizarFactura = vi.fn(async (): Promise<ResultadoFinalizar> => ({ ok: false, motivo: "NO_ESTABA_EN_DRAFT" }));
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r.ok).toBe(false);
    expect(d.secuencias.marcarFallo).toHaveBeenCalled();
    expect(d.almacenamiento.borrarXml).toHaveBeenCalled();
  });

  it("si finalizar RECHAZA (no solo devuelve ok:false), también se marca el fallo y se borra el XML", async () => {
    // I3 (ronda de corrección 1): el fallo más probable en producción es un
    // throw (timeout de PostgREST, 5xx de Supabase), no un ok:false
    // estructurado. Sin esta prueba, quitar `compensarFallo` del `catch (e)`
    // deja las demás pruebas en verde igualmente.
    const d = dobles();
    d.secuencias.finalizarFactura = vi.fn(async (): Promise<ResultadoFinalizar> => {
      throw new Error("timeout de PostgREST");
    });
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r.ok).toBe(false);
    expect(d.secuencias.marcarFallo).toHaveBeenCalled();
    expect(d.almacenamiento.borrarXml).toHaveBeenCalled();
  });

  it("si marcarFallo tampoco encuentra la factura, ese aviso se pliega en el motivo devuelto", async () => {
    // I2 (ronda de corrección 1): fail_ecf_invoice devuelve `ok:false` A
    // PROPÓSITO cuando no tocó ninguna fila (FACTURA_NO_ENCONTRADA) — su
    // propio comentario en la migración dice que un `ok:true` falso ahí es
    // justo el escenario que quiere impedir. Descartar ese valor deja un
    // e-NCF consumido, en `draft`, sin motivo escrito y sin ningún rastro
    // de que la propia compensación falló.
    const d = dobles();
    d.secuencias.finalizarFactura = vi.fn(async (): Promise<ResultadoFinalizar> => ({ ok: false, motivo: "NO_ESTABA_EN_DRAFT" }));
    d.secuencias.marcarFallo = vi.fn(async (): Promise<ResultadoMarcarFallo> => ({ ok: false, motivo: "FACTURA_NO_ENCONTRADA" }));
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("FACTURA_NO_ENCONTRADA");
  });

  it("un error de validación XSD larguísimo no se cuela entero en el motivo", async () => {
    // Menor (ronda de corrección 1): un municipio inválido produce ~4 KB de
    // enumeración completa; en un fallo real, el valor ofensor puede ser el
    // RNC o el nombre del cliente. `motivo` no es el sitio para eso.
    const d = dobles({
      validar: vi.fn(async () => ({
        ok: false,
        errors: [{ line: 1, message: "x".repeat(5000) }],
        warnings: [],
        schemaName: "e-CF-32",
      })),
    });
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo.length).toBeLessThan(400);
  });

  it("con un gate cerrado no se mira ni el primer número", async () => {
    const d = dobles({ habilitacion: { bloqueos: ["No hay certificado activo."], configurado: true, certificadoActivo: false, secuenciasActivas: 1 } });
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r).toMatchObject({ ok: false });
    expect(d.secuencias.peekNextEncf).not.toHaveBeenCalled();
  });

  it("no abre ni una conexión a la DGII", async () => {
    const fetchOriginal = globalThis.fetch;
    const espia = vi.fn(async () => { throw new Error("no debió llamar a la red"); });
    globalThis.fetch = espia as never;
    try {
      await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), dobles() as never);
      expect(espia).not.toHaveBeenCalled();
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });
});

function entradaValida() {
  return {
    tipoEcf: "32" as const,
    proformaId: "p-1",
    customer: { nombre: "Cliente de prueba" },
    items: [{ nombre: "Producto", cantidad: 1, precioUnitario: 100, itbisRate: 0.18 }],
  };
}
