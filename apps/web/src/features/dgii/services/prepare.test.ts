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
//
// CIERRE (tarea 7): I4 cubría tres caminos de borrado, pero solo dos tenían
// prueba dedicada — el de IDEMPOTENT_PROFORMA_YA_FACTURADA no la tenía
// (comprobado por mutación: quitar ese borrado dejaba las 13 pruebas de
// entonces en verde), aunque `docs/decisiones.md` decía que los tres la
// tenían. Añadida aquí la prueba que faltaba; el texto de `decisiones.md`
// también se corrigió.
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

  it("si prepararFactura RECHAZA con una excepción, deja un rastro con console.error antes de perder el número", async () => {
    // C2 (revisión final, hallazgo Crítico): a diferencia de
    // `finalizarFactura` (compensada con `marcarFallo`/`borrarXml` desde la
    // ronda de corrección 1), un throw de `prepararFactura` no se puede
    // compensar de la misma manera -no llega ningún `invoice_id` con el que
    // llamar a `marcarFallo`, ni ruta de bucket que borrar: la respuesta
    // que los traería es justo la que se perdió-. Lo único que puede dejar
    // ese número reconciliable después es un registro. Antes de esta
    // corrección, este archivo no tenía un solo `console.*`.
    const d = dobles();
    d.secuencias.prepararFactura = vi.fn(async (): Promise<ResultadoPrepararFactura> => {
      throw new Error("timeout de PostgREST");
    });
    const espia = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
      expect(r.ok).toBe(false);
      // El candidato de e-NCF (el número en riesgo) tiene que quedar en el
      // registro -junto al businessId, el tipo y el intento- para que ese
      // número sea reconciliable después. Nunca el XML, el certificado ni
      // la contraseña: eso no se comprueba aquí porque no tiene que estar.
      expect(espia).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          businessId: "b1",
          tipoEcf: "32",
          eNcfCandidato: "E320000000007",
          intento: 1,
        }),
      );
    } finally {
      espia.mockRestore();
    }
  });

  it("si la proforma ya tenía comprobante, devuelve ése y no emite otro", async () => {
    const d = dobles();
    d.secuencias.prepararFactura = vi.fn(async (): Promise<ResultadoPrepararFactura> => ({ ok: false, motivo: "IDEMPOTENT_PROFORMA_YA_FACTURADA", invoice_id: "f-vieja" }));
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r).toMatchObject({ ok: true, invoiceId: "f-vieja" });
    expect(d.secuencias.finalizarFactura).not.toHaveBeenCalled();
  });

  it("si la proforma ya tenía comprobante, el XML huérfano de ESTE intento también se borra", async () => {
    // Añadida en el cierre (tarea 7). Es el tercer camino de borrado que cita
    // I4 (ronda de corrección 1) — el de "una carrera perdida" (arriba) y el
    // de "se rinde tras 3 intentos" ya tenían prueba propia; éste no, y
    // `docs/decisiones.md` decía "con pruebas dedicadas" para los tres sin
    // que fuera cierto. Mutación comprobada: comentar la línea de borrado en
    // esta rama de `prepare.ts` deja las demás 13 pruebas de este fichero en
    // verde igual — sin esta prueba, nada lo habría cachado.
    const d = dobles();
    d.secuencias.prepararFactura = vi.fn(async (): Promise<ResultadoPrepararFactura> => ({ ok: false, motivo: "IDEMPOTENT_PROFORMA_YA_FACTURADA", invoice_id: "f-vieja" }));
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r).toMatchObject({ ok: true, invoiceId: "f-vieja" });
    expect(d.almacenamiento.borrarXml).toHaveBeenCalledTimes(1);
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

  // ── Segunda tanda (revisión externa): I1, I2, I4, I5 ─────────────────────

  it("I1 — verifica la firma antes de subir: el XSD solo exige que exista <Signature>, no que sea válida", async () => {
    const d = dobles();
    const espia = vi.fn((_entrada: { signedXml: string; certificatePem?: string }) => ({
      ok: true as const,
      errors: [] as string[],
    }));
    const r = await prepararComprobante(
      { businessId: "b1", userId: "u1" },
      entradaValida(),
      { ...d, verificar: espia } as never,
    );
    expect(r.ok).toBe(true);
    expect(espia).toHaveBeenCalledTimes(1);
    // Con el MISMO certificado que firmó -no el embebido en el XML-, igual que agendapp.
    expect(espia.mock.calls[0]![0]).toMatchObject({ certificatePem: d.certificado.certificatePem });
    // Orden real de ejecución (no de líneas de código): verificar ANTES de
    // subir. Si fuera al revés, una firma que no verificara ya habría
    // subido evidencia fiscal firmada al bucket.
    const iVerificar = espia.mock.invocationCallOrder[0]!;
    const iSubir = d.almacenamiento.guardarXmlFirmado.mock.invocationCallOrder[0]!;
    expect(iVerificar).toBeLessThan(iSubir);
  });

  it("I1 — si la firma no verifica, no se sube nada ni se consume ningún número", async () => {
    const d = dobles({ verificar: vi.fn(() => ({ ok: false, errors: ["firma adulterada"] })) });
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo).toContain("firma adulterada");
    expect(d.almacenamiento.guardarXmlFirmado).not.toHaveBeenCalled();
    expect(d.secuencias.prepararFactura).not.toHaveBeenCalled();
  });

  it("I2 — subtotal_gravado guarda el subtotal de TODAS las líneas, no solo las gravadas", async () => {
    // Farmacia: un medicamento exento (itbisRate 0) + una cosmética gravada
    // al 18%. Antes, subtotal_gravado solo sumaba la línea gravada (100) y
    // la fila no cuadraba: subtotal_gravado + total_itbis (18) != total (218).
    const d = dobles();
    let facturaCapturada: { subtotal_gravado?: number; total_itbis?: number; total?: number } | undefined;
    d.secuencias.prepararFactura = vi.fn(async (...args: unknown[]): Promise<ResultadoPrepararFactura> => {
      facturaCapturada = args[1] as typeof facturaCapturada;
      return { ok: true, invoice_id: "f-1", e_ncf: "E320000000007" };
    });
    const entrada = {
      tipoEcf: "32" as const,
      customer: { nombre: "Cliente de prueba" },
      items: [
        { nombre: "Medicamento exento", cantidad: 1, precioUnitario: 100, itbisRate: 0 },
        { nombre: "Cosmética gravada", cantidad: 1, precioUnitario: 100, itbisRate: 0.18 },
      ],
    };
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entrada, d as never);
    expect(r.ok).toBe(true);
    expect(facturaCapturada?.subtotal_gravado).toBe(200);
    expect(facturaCapturada?.total_itbis).toBe(18);
    expect(facturaCapturada?.total).toBe(218);
    // La comprobación de fondo: la fila tiene que cuadrar.
    expect(facturaCapturada!.subtotal_gravado! + facturaCapturada!.total_itbis!).toBe(facturaCapturada!.total);
  });

  it("I4 — una venta a crédito se declara TipoPago 2 ante la DGII, no 1 (Contado) por defecto", async () => {
    const d = dobles();
    let xmlSubido = "";
    d.almacenamiento.guardarXmlFirmado = vi.fn(async (...args: unknown[]) => {
      xmlSubido = (args[0] as { invoiceId: string; xml: string }).xml;
      return "dgii/b1/invoices/f-1/signed.xml";
    });
    const entrada = { ...entradaValida(), tipoPago: "2" as const };
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entrada, d as never);
    expect(r.ok).toBe(true);
    expect(xmlSubido).toContain("<TipoPago>2</TipoPago>");
  });

  it("I4 — si no se indica tipoPago, se conserva el default de siempre (Contado, \"1\")", async () => {
    const d = dobles();
    let xmlSubido = "";
    d.almacenamiento.guardarXmlFirmado = vi.fn(async (...args: unknown[]) => {
      xmlSubido = (args[0] as { invoiceId: string; xml: string }).xml;
      return "dgii/b1/invoices/f-1/signed.xml";
    });
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r.ok).toBe(true);
    expect(xmlSubido).toContain("<TipoPago>1</TipoPago>");
  });

  it("I5 — si la proforma ya tenía comprobante pero no se pudo leer su e-NCF, el campo queda AUSENTE, no vacío", async () => {
    const d = dobles({ facturas: null });
    d.secuencias.prepararFactura = vi.fn(
      async (): Promise<ResultadoPrepararFactura> => ({ ok: false, motivo: "IDEMPOTENT_PROFORMA_YA_FACTURADA", invoice_id: "f-vieja" }),
    );
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r).toMatchObject({ ok: true, invoiceId: "f-vieja" });
    if (r.ok) {
      expect(r.eNcf).toBeUndefined();
      expect("eNcf" in r).toBe(false);
      expect(r.rutaXml).toBeUndefined();
    }
  });

  it("I5 — si la proforma ya tenía comprobante y SÍ se puede leer, el eNcf viene relleno (no ausente)", async () => {
    const d = dobles({
      facturas: {
        leerResumen: vi.fn(async () => ({
          id: "f-vieja",
          eNcf: "E320000000123",
          rutaXmlFirmado: "dgii/b1/invoices/f-vieja/signed.xml",
        })),
      },
    });
    d.secuencias.prepararFactura = vi.fn(
      async (): Promise<ResultadoPrepararFactura> => ({ ok: false, motivo: "IDEMPOTENT_PROFORMA_YA_FACTURADA", invoice_id: "f-vieja" }),
    );
    const r = await prepararComprobante({ businessId: "b1", userId: "u1" }, entradaValida(), d as never);
    expect(r).toMatchObject({
      ok: true,
      invoiceId: "f-vieja",
      eNcf: "E320000000123",
      rutaXml: "dgii/b1/invoices/f-vieja/signed.xml",
    });
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
