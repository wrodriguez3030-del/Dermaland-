// apps/web/src/features/dgii/services/certificates.test.ts
//
// Adaptado del pliego de la tarea 2 (task-2-brief.md, Paso 1): el pliego
// imaginaba `cifrarSobre`/`descifrarSobre`/`leerCertificado`/
// `generarCertificadoDePrueba`, pero el núcleo portado en la fase 1 (que no
// se toca) exporta otros nombres — `sealBytesAesGcm`/`openBytesAesGcm` en
// `certificate-encryption.ts`, `parsePkcs12Certificate` en
// `certificate-parser.ts`, `makeDummyPkcs12` en `__port__/dgii-test-cert.ts`
// (ninguno de los cuatro nombres del pliego existe en ningún archivo del
// repo; confirmado con grep antes de escribir esto). Las cuatro pruebas de
// abajo verifican EXACTAMENTE lo mismo que pedía el pliego, con los nombres
// reales.
import { randomBytes } from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { makeDummyPkcs12 } from "../core/__port__/dgii-test-cert";
import {
  sealBytesAesGcm,
  sealTextAesGcm,
  openBytesAesGcm,
  getDgiiEncryptionKeyFromEnv,
} from "../core/certificate-encryption";
import { parsePkcs12Certificate, EcfCertificateParseError } from "../core/certificate-parser";
import { ErrorCertificado, obtenerCertificadoActivo, guardarCertificado } from "./certificates";
import * as supabaseServer from "@/lib/supabase/server";
import { auditRepository } from "@/server/repositories/supabase/audit";
import * as forge from "node-forge";

describe("certificado fiscal", () => {
  it("el sobre cifrado va y vuelve sin perder un byte", () => {
    // El .p12 nunca se guarda en claro: ni en la base, ni en el bucket, ni en un log.
    const { pkcs12Bytes } = makeDummyPkcs12();
    const key = randomBytes(32);
    const sobre = sealBytesAesGcm(pkcs12Bytes, key);
    // No es solo una copia con otro envoltorio: el ciphertext no es el base64 del original.
    expect(sobre.data).not.toEqual(Buffer.from(pkcs12Bytes).toString("base64"));
    expect(Buffer.from(openBytesAesGcm(sobre, key))).toEqual(Buffer.from(pkcs12Bytes));
  });

  it("un .p12 que no lo es falla con un motivo que se entiende", () => {
    expect(() =>
      parsePkcs12Certificate({ pkcs12Bytes: Buffer.from("esto no es un p12"), password: "x" }),
    ).toThrow(EcfCertificateParseError);
  });

  it("la clave equivocada no revienta con un error de criptografía a pelo", () => {
    const { pkcs12Bytes, password } = makeDummyPkcs12();
    expect(() =>
      parsePkcs12Certificate({ pkcs12Bytes, password: password + "mal" }),
    ).toThrow(EcfCertificateParseError);
  });

  it("los códigos de error cubren los cuatro casos que la pantalla tiene que distinguir", () => {
    // Sin certificado, vencido, fichero inválido y clave incorrecta piden cuatro
    // mensajes distintos al usuario: no valen todos «error al leer el certificado».
    // Se instancian de verdad (no solo se anotan como tipo) para que la prueba
    // dependa del módulo en tiempo de ejecución, no solo del tipo.
    const codigos: ErrorCertificado["codigo"][] = [
      "sin_certificado",
      "vencido",
      "p12_invalido",
      "clave_incorrecta",
    ];
    const vistos = new Set(codigos.map((codigo) => new ErrorCertificado("x", codigo).codigo));
    expect(vistos.size).toBe(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Ronda de corrección 1 — Hallazgo 1: las pruebas de arriba nunca ejecutan
// `obtenerCertificadoActivo` ni `guardarCertificado` (solo llaman al núcleo
// directamente o construyen `ErrorCertificado` a mano). Lo que quedaba sin
// red: la desambiguación p12_invalido/clave_incorrecta DENTRO del servicio,
// las dos comprobaciones de vencimiento, y el orden desactivar-antes-de-
// insertar. Aquí se prueban las dos funciones de punta a punta con un
// Supabase de mentira, mismo patrón que
// `apps/web/src/features/dgii/services/storage.test.ts` (tarea 1):
// `vi.spyOn(supabaseServer, "createServiceRoleClient")`.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Cliente de mentira con persistencia real EN MEMORIA (no respuestas
 * enlatadas): hace falta que un `insert` de una llamada aparezca en el
 * `select` de la siguiente, dentro de la misma prueba, para poder probar un
 * guardar-y-releer completo y que "tras dos guardarCertificado solo queda
 * uno activo".
 */
function crearClienteEnMemoria() {
  const tablas: Record<string, Array<Record<string, unknown>>> = {
    dgii_certificates: [],
    audit_logs: [],
  };
  let contador = 0;

  function coincide(fila: Record<string, unknown>, filtros: Array<[string, unknown]>): boolean {
    return filtros.every(([campo, valor]) => fila[campo] === valor);
  }

  function from(tabla: string) {
    if (!tablas[tabla]) tablas[tabla] = [];
    const filtros: Array<[string, unknown]> = [];
    let modo: "select" | "insert" | "update" = "select";
    let payload: Record<string, unknown> | undefined;

    async function ejecutar(): Promise<{ data: unknown; error: null }> {
      if (modo === "insert" && payload) {
        contador += 1;
        const fila = { id: `id-${contador}`, created_at: new Date().toISOString(), ...payload };
        tablas[tabla]!.push(fila);
        return { data: fila, error: null };
      }
      if (modo === "update" && payload) {
        tablas[tabla] = tablas[tabla]!.map((f) => (coincide(f, filtros) ? { ...f, ...payload } : f));
        return { data: null, error: null };
      }
      const filas = tablas[tabla]!.filter((f) => coincide(f, filtros));
      return { data: filas, error: null };
    }

    const builder = {
      select: () => builder,
      insert: (obj: Record<string, unknown>) => {
        modo = "insert";
        payload = obj;
        return builder;
      },
      update: (obj: Record<string, unknown>) => {
        modo = "update";
        payload = obj;
        return builder;
      },
      eq: (campo: string, valor: unknown) => {
        filtros.push([campo, valor]);
        return builder;
      },
      maybeSingle: async () => {
        const r = await ejecutar();
        const filas = r.data as Array<Record<string, unknown>>;
        return { data: filas[0] ?? null, error: null };
      },
      single: () => ejecutar(),
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        ejecutar().then(resolve, reject),
    };
    return builder;
  }

  return {
    from,
    /** Solo para las pruebas: mirar/insertar filas sin pasar por el repositorio. */
    leerTabla: (tabla: string) => tablas[tabla] ?? [],
    sembrar: (tabla: string, fila: Record<string, unknown>) => {
      if (!tablas[tabla]) tablas[tabla] = [];
      tablas[tabla]!.push(fila);
    },
  };
}

/**
 * Genera un `.p12` dummy AÚN NO VIGENTE (`notBefore` en el futuro).
 * `__port__/dgii-test-cert.ts` (núcleo, fase 1, "sin cambios") solo expone
 * "válido" (`makeDummyPkcs12()`) y "ya vencido"
 * (`makeDummyPkcs12(pwd, true)` / `getExpiredDummyCert`), no "todavía no
 * vigente" — así que este caso se genera aquí, local a esta prueba, con el
 * mismo procedimiento que el `makeCert`+`makeDummyPkcs12` internos de ese
 * archivo compartido, sin tocarlo.
 */
function hacerPkcs12NoVigenteAun(password: string): { pkcs12Bytes: Uint8Array; password: string } {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "0123456789ABCDEF";
  cert.validity.notBefore = new Date("2099-01-01T00:00:00Z");
  cert.validity.notAfter = new Date("2100-01-01T00:00:00Z");
  const attrs = [
    { name: "commonName", value: "DUMMY ECF TEST FUTURO" },
    { name: "organizationName", value: "Negocio Dummy SRL" },
    { shortName: "OU", value: "RNC 130000000" },
    { name: "countryName", value: "DO" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs); // self-signed
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], password, { algorithm: "3des" });
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  const pkcs12Bytes = Uint8Array.from(Buffer.from(der, "binary"));
  return { pkcs12Bytes, password };
}

describe("obtenerCertificadoActivo y guardarCertificado (con Supabase de mentira)", () => {
  let cliente: ReturnType<typeof crearClienteEnMemoria>;

  beforeEach(() => {
    process.env.DGII_CERT_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    cliente = crearClienteEnMemoria();
    vi.spyOn(supabaseServer, "createServiceRoleClient").mockReturnValue(cliente as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.DGII_CERT_ENCRYPTION_KEY;
  });

  it("ida y vuelta completa: se guarda un certificado y se lee activo con los mismos bytes", async () => {
    const { pkcs12Bytes, password } = makeDummyPkcs12("clave-1234");
    const { id } = await guardarCertificado("biz-1", {
      pkcs12: Buffer.from(pkcs12Bytes),
      password,
      alias: "Principal",
      userId: "user-1",
    });
    expect(id).toBeTruthy();

    const activo = await obtenerCertificadoActivo("biz-1");
    expect(activo).not.toBeNull();
    expect(activo!.id).toBe(id);
    expect(activo!.alias).toBe("Principal");
    // El .p12 vuelve BYTE A BYTE — no es el par PEM ni ninguna otra derivación.
    expect(activo!.p12).toEqual(Buffer.from(pkcs12Bytes));
    expect(activo!.password).toBe(password);
  });

  it("sin certificado activo, devuelve null (no lanza)", async () => {
    expect(await obtenerCertificadoActivo("negocio-sin-nada")).toBeNull();
  });

  it("guardar un .p12 que no lo es falla con p12_invalido", async () => {
    await expect(
      guardarCertificado("biz-1", {
        pkcs12: Buffer.from("esto no es un p12"),
        password: "x",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({ codigo: "p12_invalido" });
    // Y no llegó a tocar la tabla.
    expect(cliente.leerTabla("dgii_certificates")).toHaveLength(0);
  });

  it("guardar con la contraseña equivocada falla con clave_incorrecta", async () => {
    const { pkcs12Bytes, password } = makeDummyPkcs12("clave-correcta");
    await expect(
      guardarCertificado("biz-1", {
        pkcs12: Buffer.from(pkcs12Bytes),
        password: password + "-mal",
        userId: "user-1",
      }),
    ).rejects.toMatchObject({ codigo: "clave_incorrecta" });
    expect(cliente.leerTabla("dgii_certificates")).toHaveLength(0);
  });

  it("guardar un certificado ya vencido falla con vencido, sin consumir nada", async () => {
    const { pkcs12Bytes, password } = makeDummyPkcs12("clave-vieja", true);
    await expect(
      guardarCertificado("biz-1", {
        pkcs12: Buffer.from(pkcs12Bytes),
        password,
        userId: "user-1",
      }),
    ).rejects.toMatchObject({ codigo: "vencido" });
    expect(cliente.leerTabla("dgii_certificates")).toHaveLength(0);
  });

  it("leer un certificado vencido (que ya estaba en la tabla) falla con vencido", async () => {
    // guardarCertificado nunca dejaría entrar uno vencido (prueba anterior);
    // esto simula uno que SÍ era válido al subirlo y venció con el tiempo —
    // se siembra la fila directo, sin pasar por el servicio.
    const dummy = makeDummyPkcs12("clave-vieja-2", true);
    const key = getDgiiEncryptionKeyFromEnv();
    const sobreP12 = sealBytesAesGcm(dummy.pkcs12Bytes, key);
    const sobrePassword = sealTextAesGcm(dummy.password, key);
    cliente.sembrar("dgii_certificates", {
      id: "cert-vencido",
      business_id: "biz-1",
      alias: "Viejo",
      subject_dn: null,
      issuer_dn: null,
      serial_number: null,
      valid_from: "2019-01-01T00:00:00.000Z",
      valid_to: "2021-01-01T00:00:00.000Z",
      pkcs12_encrypted_blob: `\\x${Buffer.from(JSON.stringify(sobreP12), "utf8").toString("hex")}`,
      password_secret_ref: JSON.stringify(sobrePassword),
      kdf: "AES-256-GCM",
      is_active: true,
      uploaded_by: null,
      created_at: new Date().toISOString(),
      revoked_at: null,
    });

    await expect(obtenerCertificadoActivo("biz-1")).rejects.toMatchObject({ codigo: "vencido" });
  });

  it("tras dos guardarCertificado del mismo negocio, solo queda uno activo", async () => {
    const a = makeDummyPkcs12("clave-a");
    const b = makeDummyPkcs12("clave-b");
    const { id: idA } = await guardarCertificado("biz-1", {
      pkcs12: Buffer.from(a.pkcs12Bytes),
      password: a.password,
      userId: "user-1",
    });
    const { id: idB } = await guardarCertificado("biz-1", {
      pkcs12: Buffer.from(b.pkcs12Bytes),
      password: b.password,
      userId: "user-1",
    });

    const filas = cliente.leerTabla("dgii_certificates").filter((f) => f.business_id === "biz-1");
    const activos = filas.filter((f) => f.is_active === true);
    expect(activos).toHaveLength(1);
    expect(activos[0]!.id).toBe(idB);
    expect(filas.find((f) => f.id === idA)?.is_active).toBe(false);

    // Y lo que devuelve obtenerCertificadoActivo es el segundo, no el primero.
    const activo = await obtenerCertificadoActivo("biz-1");
    expect(activo!.id).toBe(idB);
  });

  it("guardarCertificado escribe uploaded_by y audita SIN material sensible", async () => {
    const { pkcs12Bytes, password } = makeDummyPkcs12("clave-audit");
    const { id } = await guardarCertificado("biz-1", {
      pkcs12: Buffer.from(pkcs12Bytes),
      password,
      alias: "Principal",
      userId: "user-42",
      userName: "Fulana de Tal",
    });

    const fila = cliente.leerTabla("dgii_certificates").find((f) => f.id === id);
    expect(fila?.uploaded_by).toBe("user-42");

    const auditorias = cliente.leerTabla("audit_logs");
    expect(auditorias).toHaveLength(1);
    const entrada = auditorias[0]!;
    expect(entrada.action).toBe("dgii_certificate_upload");
    expect(entrada.entity).toBe("dgii_certificates");
    expect(entrada.entity_id).toBe(id);
    expect(entrada.user_id).toBe("user-42");
    expect(entrada.business_id).toBe("biz-1");

    // La metadata trae SOLO alias + huella + fechas — nada más.
    expect(Object.keys(entrada.metadata as Record<string, unknown>).sort()).toEqual([
      "alias",
      "fingerprint_sha256",
      "valid_from",
      "valid_to",
    ]);

    // Ni la contraseña ni el .p12 (en ninguna codificación obvia) aparecen
    // en ningún punto de la entrada de auditoría.
    const volcado = JSON.stringify(entrada);
    expect(volcado).not.toContain(password);
    expect(volcado).not.toContain(Buffer.from(pkcs12Bytes).toString("base64"));
    expect(volcado).not.toContain(Buffer.from(pkcs12Bytes).toString("hex"));
  });

  // ───────────────────────────────────────────────────────────────────────
  // Ronda de corrección 2 — hallazgo Importante: un fallo de auditoría no
  // puede tumbar una subida que ya se guardó.
  // ───────────────────────────────────────────────────────────────────────

  it("un fallo de auditoría NO tumba la subida: el certificado queda guardado y activo igual", async () => {
    // Mismo patrón que borrarXml en storage.test.ts (tarea 1):
    // mockRejectedValue sobre la operación de "mejor esfuerzo" y comprobar
    // que la operación principal resuelve igual.
    vi.spyOn(auditRepository, "log").mockRejectedValue(new Error("network down"));

    const { pkcs12Bytes, password } = makeDummyPkcs12("clave-audit-cae");
    const resultado = await guardarCertificado("biz-1", {
      pkcs12: Buffer.from(pkcs12Bytes),
      password,
      userId: "user-1",
    });

    expect(resultado.id).toBeTruthy();
    const fila = cliente.leerTabla("dgii_certificates").find((f) => f.id === resultado.id);
    expect(fila).toBeTruthy();
    expect(fila?.is_active).toBe(true);

    // Y sigue siendo el que se lee como activo.
    const activo = await obtenerCertificadoActivo("biz-1");
    expect(activo?.id).toBe(resultado.id);
  });

  // ───────────────────────────────────────────────────────────────────────
  // Ronda de corrección 2 — huecos menores de cobertura.
  // ───────────────────────────────────────────────────────────────────────

  it("el atajo de vigencia en claro dispara con un vencido, ANTES de intentar descifrar", async () => {
    // Si se borrara el atajo (la comprobación sobre valid_from/valid_to en
    // claro, antes de descifrar) y solo quedara la reconfirmación final, el
    // código intentaría descifrar/parsear el sobre de abajo — que es
    // deliberadamente basura, no JSON — y fallaría con p12_invalido, no con
    // vencido. Por eso esta prueba SÍ distingue "el atajo existe" de "solo
    // hay reconfirmación al final": si se quita el atajo, deja de estar en
    // verde.
    cliente.sembrar("dgii_certificates", {
      id: "cert-vencido-atajo",
      business_id: "biz-1",
      alias: "Viejo",
      subject_dn: null,
      issuer_dn: null,
      serial_number: null,
      valid_from: "2019-01-01T00:00:00.000Z",
      valid_to: "2021-01-01T00:00:00.000Z",
      pkcs12_encrypted_blob: `\\x${Buffer.from("esto no es un sobre sellado", "utf8").toString("hex")}`,
      password_secret_ref: "esto tampoco es un sobre sellado",
      kdf: "AES-256-GCM",
      is_active: true,
      uploaded_by: null,
      created_at: new Date().toISOString(),
      revoked_at: null,
    });

    await expect(obtenerCertificadoActivo("biz-1")).rejects.toMatchObject({ codigo: "vencido" });
  });

  it("el atajo de vigencia en claro dispara con uno AÚN NO VIGENTE, antes de intentar descifrar", async () => {
    // Mismo razonamiento que la prueba anterior, para la otra mitad del
    // atajo (`valid_from > ahora`) — la única que agendapp también
    // contempla en `parsePkcs12Certificate` pero que ninguna prueba de esta
    // tarea ejercitaba todavía.
    cliente.sembrar("dgii_certificates", {
      id: "cert-futuro-atajo",
      business_id: "biz-1",
      alias: "Futuro",
      subject_dn: null,
      issuer_dn: null,
      serial_number: null,
      valid_from: "2099-01-01T00:00:00.000Z",
      valid_to: "2100-01-01T00:00:00.000Z",
      pkcs12_encrypted_blob: `\\x${Buffer.from("esto no es un sobre sellado", "utf8").toString("hex")}`,
      password_secret_ref: "esto tampoco es un sobre sellado",
      kdf: "AES-256-GCM",
      is_active: true,
      uploaded_by: null,
      created_at: new Date().toISOString(),
      revoked_at: null,
    });

    await expect(obtenerCertificadoActivo("biz-1")).rejects.toMatchObject({ codigo: "vencido" });
  });

  it("guardar un certificado AÚN NO VIGENTE falla con vencido, sin consumir nada", async () => {
    // El otro sentido del hueco: solo se probaba "ya vencido" al guardar,
    // nunca "todavía no vigente" (valid_from en el futuro).
    const { pkcs12Bytes, password } = hacerPkcs12NoVigenteAun("clave-futura");
    await expect(
      guardarCertificado("biz-1", {
        pkcs12: Buffer.from(pkcs12Bytes),
        password,
        userId: "user-1",
      }),
    ).rejects.toMatchObject({ codigo: "vencido" });
    expect(cliente.leerTabla("dgii_certificates")).toHaveLength(0);
  });
});
