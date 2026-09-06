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
import { describe, it, expect } from "vitest";
import { makeDummyPkcs12 } from "../core/__port__/dgii-test-cert";
import { sealBytesAesGcm, openBytesAesGcm } from "../core/certificate-encryption";
import { parsePkcs12Certificate, EcfCertificateParseError } from "../core/certificate-parser";
import { ErrorCertificado } from "./certificates";

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
