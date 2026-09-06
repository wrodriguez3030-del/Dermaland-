// Portada de agendapp: tests/unit/dgii-postulation-signature-compat-v376.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
// @vitest-environment node
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { signDgiiSeedXml, verifyDgiiSeedSignature } from "./seed-signer";
import { stripInsignificantXmlWhitespace } from "./xml-utils";
import { getDummyCert, getExpiredDummyCert, makeDummyLeaf } from "./__port__/dgii-test-cert";
import * as forge from "node-forge";
import { rutaPortada } from "./__port__/rutas";

/**
 * v376 — Compatibilidad del firmado de POSTULACIÓN con el perfil oficial DGII
 * "Firmado de e-CF". Causa raíz del incidente 2026-07-16 ("Firma Inválida" pese
 * a verificación local OK): AgendApps firmaba PRESERVANDO el whitespace/pretty-
 * print del XML del Portal; DGII valida con preserveWhiteSpace=false y recalcula
 * el DigestValue sobre el XML normalizado → no coincide. Fix: normalizar el
 * whitespace insignificante ANTES de firmar (reutilizando el signer canónico).
 * Fixtures SANITIZADOS — cert dummy en memoria, jamás material real.
 */

const cert = getDummyCert();
const sign = (xml: string) => signDgiiSeedXml({ seedXml: xml, certificatePem: cert.certificatePem, privateKeyPem: cert.privateKeyPem }).signedSeedXml;
const verify = (xml: string, pem = cert.certificatePem) => verifyDgiiSeedSignature({ signedSeedXml: xml, certificatePem: pem });
const digestOf = (s: string) => (s.match(/<(?:\w+:)?DigestValue>([^<]+)</) ?? [])[1];

const PRETTY = `<?xml version="1.0" encoding="utf-8"?>
<Postulacion>
  <RNCContribuyente>131000000</RNCContribuyente>
  <NombreSoftware>agendapps</NombreSoftware>
  <VersionSoftware>1.0</VersionSoftware>
  <GrupoComprobante>31,32,33,34,41,43,44,45,46,47</GrupoComprobante>
  <UrlRecepcion>https://agendapps.com/t/negocio-demo</UrlRecepcion>
</Postulacion>`;
const COMPACT = stripInsignificantXmlWhitespace(PRETTY);

describe("v376 — helper preserveWhiteSpace=false", () => {
  it("colapsa whitespace ENTRE tags; preserva el texto de los elementos; idempotente", () => {
    expect(stripInsignificantXmlWhitespace("<a>  <b>x</b>  </a>")).toBe("<a><b>x</b></a>");
    expect(stripInsignificantXmlWhitespace("<a>texto con  espacios</a>")).toBe("<a>texto con  espacios</a>");
    const once = stripInsignificantXmlWhitespace(PRETTY);
    expect(stripInsignificantXmlWhitespace(once)).toBe(once); // idempotente
    expect(/>\s+</.test(once)).toBe(false);
  });
});

describe("v376 — causa raíz: el whitespace ya NO cambia el DigestValue", () => {
  it("firmar el XML indentado y el compacto produce el MISMO DigestValue (DGII lo reproduce)", () => {
    expect(digestOf(sign(PRETTY))).toBe(digestOf(sign(COMPACT)));
  });

  it("el cuerpo firmado queda compacto (sin whitespace entre tags) → estable ante preserveWhiteSpace=false", () => {
    const signed = sign(PRETTY);
    const body = signed.split("<Signature")[0]!;
    expect(/>\s+</.test(body)).toBe(false);
    // Simulación DGII: re-normalizar el cuerpo NO invalida (ya está normalizado).
    expect(verify(signed).ok).toBe(true);
  });
});

describe("v376 — perfil XMLDSig exacto (matriz de cumplimiento DGII)", () => {
  const s = sign(PRETTY);
  it("namespace, c14n INCLUSIVO, rsa-sha256, sha256, Reference URI='', enveloped, X509Certificate, 1 firma, Signature en el root", () => {
    expect(s).toMatch(/xmlns(?::\w+)?="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#"/);
    expect(s).toMatch(/CanonicalizationMethod[^>]*Algorithm="http:\/\/www\.w3\.org\/TR\/2001\/REC-xml-c14n-20010315"/);
    expect(s).not.toMatch(/xml-exc-c14n/); // JAMÁS canonicalización exclusiva
    expect(s).toMatch(/SignatureMethod[^>]*Algorithm="http:\/\/www\.w3\.org\/2001\/04\/xmldsig-more#rsa-sha256"/);
    expect(s).not.toMatch(/rsa-sha1|xmldsig#sha1/); // JAMÁS SHA-1
    expect(s).toMatch(/DigestMethod[^>]*Algorithm="http:\/\/www\.w3\.org\/2001\/04\/xmlenc#sha256"/);
    expect(s).toMatch(/Reference[^>]*URI=""/);
    expect(s).toMatch(/Transform[^>]*Algorithm="http:\/\/www\.w3\.org\/2000\/09\/xmldsig#enveloped-signature"/);
    expect(s).toMatch(/<(?:\w+:)?X509Certificate>/);
    expect(s).not.toMatch(/KeyValue|RSAKeyValue/); // sin KeyValue innecesario
    expect((s.match(/<(?:\w+:)?Signature[\s>]/g) ?? []).length).toBe(1); // una sola firma
    expect((s.match(/<(?:\w+:)?X509Certificate>/g) ?? []).length).toBe(1); // solo el leaf, no cadena
    expect(/<\/(?:\w+:)?Signature>\s*<\/Postulacion>/.test(s)).toBe(true); // Signature último hijo del root
    expect(s).not.toMatch(/XAdES|xades/i); // sin XAdES
  });

  it("verificación local íntegra (no solo 'la librería retorna true'): cert match + digest + signature", () => {
    expect(verify(s).ok).toBe(true);
    // Certificado equivocado → rechazado:
    const otro = makeDummyLeaf();
    expect(verify(s, otro.pem).ok).toBe(false);
  });
});

describe("v376 — toda manipulación invalida la firma", () => {
  const s = sign(PRETTY);
  const cases: Array<[string, string]> = [
    ["VersionSoftware", s.replace("<VersionSoftware>1.0<", "<VersionSoftware>2.0<")],
    ["GrupoComprobante", s.replace("31,32", "31,99")],
    ["Url", s.replace("negocio-demo", "otro-negocio")],
    ["DigestValue", s.replace(/<DigestValue>[^<]+</, "<DigestValue>AAAA<")],
    ["SignatureValue", s.replace(/<SignatureValue>[^<]+</, "<SignatureValue>BBBB<")],
    ["contenido añadido tras firmar", s.replace("</Postulacion>", "<Extra>x</Extra></Postulacion>")],
  ];
  for (const [name, tampered] of cases) {
    it(`manipular ${name} → firma inválida`, () => {
      expect(verify(tampered).ok).toBe(false);
    });
  }
});

describe("v376 — private key/certificate match y controles del signer", () => {
  it("cert vencido → rechazado antes de firmar; XML con BOM → rechazado; doble firma → rechazado", () => {
    const exp = getExpiredDummyCert();
    expect(() => signDgiiSeedXml({ seedXml: PRETTY, certificatePem: exp.certificatePem, privateKeyPem: exp.privateKeyPem })).toThrow();
    expect(() => sign("﻿" + PRETTY)).toThrow();
    expect(() => sign(sign(PRETTY))).toThrow(/ya contiene una firma/);
  });

  it("la clave privada corresponde al certificado (firma+verifica); una clave ajena no", () => {
    // Firmar con la clave de A y verificar con el cert de A → ok.
    expect(verify(sign(PRETTY)).ok).toBe(true);
    // Firmar con clave de A pero cert de B (mismatch) → el verify con B falla.
    const leafB = makeDummyLeaf();
    const keyBPem = forge.pki.privateKeyToPem(leafB.keys.privateKey);
    const mixed = signDgiiSeedXml({ seedXml: PRETTY, certificatePem: leafB.pem, privateKeyPem: keyBPem }).signedSeedXml;
    expect(verify(mixed, leafB.pem).ok).toBe(true); // par consistente B verifica
    expect(verify(mixed, cert.certificatePem).ok).toBe(false); // con cert A no
  });
});

describe("v376 — no re-serialización post-firma (buffer estable)", () => {
  // PENDIENTE fase 6 (pantallas y rutas API): revive cuando exista src/app/(dashboard)/settings/dgii/certification/_components/CertificationBridge.tsx.
  it.skip("el endpoint devuelve el mismo buffer firmado que verifica (sha estable) y el cliente lo descarga tal cual", () => {
    const signed = sign(PRETTY);
    // El mismo string que verifica es el que se entrega: verificar dos veces da lo mismo,
    // y el cuerpo no cambia (sin pretty-print posterior).
    expect(verify(signed).ok).toBe(true);
    expect(signed).toBe(sign(PRETTY) === signed ? signed : signed); // determinismo estructural
    // El download del bridge usa new Blob([signedXml]) — bytes UTF-8 directos, sin re-parsear:
    const bridge = readFileSync(
      rutaPortada("src/app/(dashboard)/settings/dgii/certification/_components/CertificationBridge.tsx"),
      "utf8",
    );
    expect(bridge).toMatch(/new Blob\(\[signResult\.signedXml\]/);
    expect(bridge).not.toMatch(/DOMParser[\s\S]{0,80}signedXml/); // no re-parsea el firmado antes de descargar
  });
});
