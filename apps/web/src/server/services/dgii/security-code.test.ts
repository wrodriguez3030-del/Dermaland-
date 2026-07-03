import { describe, it, expect } from "vitest";
import {
  computeSecurityCode,
  DgiiSecurityCodeError,
  SECURITY_CODE_LENGTH,
} from "./security-code";

const SIGNED_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<ECF>
  <Encabezado/>
  <DetallesItems/>
  <FechaHoraFirma>17-05-2026 14:30:45</FechaHoraFirma>
  <Signature>
    <SignedInfo/>
    <SignatureValue>aBcD1234EfGh5678ijkl9012MnOp/+abcd==</SignatureValue>
    <KeyInfo/>
  </Signature>
</ECF>`;

describe("computeSecurityCode", () => {
  it("extrae los primeros 6 caracteres del SignatureValue tal cual (regla DGII)", () => {
    const code = computeSecurityCode(SIGNED_FIXTURE);
    expect(code).toBe("aBcD12");
    expect(code).toHaveLength(SECURITY_CODE_LENGTH);
  });

  it("NO filtra caracteres base64 (+, /, =) — se toman tal cual", () => {
    const xml = `<Signature><SignatureValue>+/=abcDEF123</SignatureValue></Signature>`;
    expect(computeSecurityCode(xml)).toBe("+/=abc");
  });

  it("ignora whitespace de formato XML dentro del SignatureValue", () => {
    const xml = `<Signature><SignatureValue>
      aBcD12
      34EfGh
    </SignatureValue></Signature>`;
    expect(computeSecurityCode(xml)).toBe("aBcD12");
  });

  it("es reproducible para el mismo XML", () => {
    const a = computeSecurityCode(SIGNED_FIXTURE);
    const b = computeSecurityCode(SIGNED_FIXTURE);
    expect(a).toBe(b);
  });

  it("permite longitud configurable", () => {
    const code8 = computeSecurityCode(SIGNED_FIXTURE, { length: 8 });
    const code10 = computeSecurityCode(SIGNED_FIXTURE, { length: 10 });
    expect(code8).toBe("aBcD1234");
    expect(code10).toHaveLength(10);
  });

  it("acepta SignatureValue con prefijo de namespace (ds:)", () => {
    const xmlNs = SIGNED_FIXTURE.replace(
      /<SignatureValue>/g,
      "<ds:SignatureValue>",
    ).replace(/<\/SignatureValue>/g, "</ds:SignatureValue>");
    const code = computeSecurityCode(xmlNs);
    expect(code).toBe("aBcD12");
  });

  it("lanza si no hay SignatureValue", () => {
    expect(() =>
      computeSecurityCode("<ECF><FechaHoraFirma/></ECF>"),
    ).toThrow(DgiiSecurityCodeError);
  });

  it("lanza si SignatureValue es demasiado corto", () => {
    const xmlCorto = `<Signature><SignatureValue>a==</SignatureValue></Signature>`;
    expect(() => computeSecurityCode(xmlCorto)).toThrow(
      DgiiSecurityCodeError,
    );
  });
});
