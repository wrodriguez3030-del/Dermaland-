import { describe, it, expect } from "vitest";
import {
  computeSecurityCode,
  DgiiSecurityCodeError,
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
  it("extrae 8 chars alfanum del SignatureValue", () => {
    const code = computeSecurityCode(SIGNED_FIXTURE);
    expect(code).toHaveLength(8);
    expect(code).toMatch(/^[a-zA-Z0-9]{8}$/);
  });

  it("es reproducible para el mismo XML", () => {
    const a = computeSecurityCode(SIGNED_FIXTURE);
    const b = computeSecurityCode(SIGNED_FIXTURE);
    expect(a).toBe(b);
  });

  it("permite longitud configurable", () => {
    const code6 = computeSecurityCode(SIGNED_FIXTURE, { length: 6 });
    const code10 = computeSecurityCode(SIGNED_FIXTURE, { length: 10 });
    expect(code6).toHaveLength(6);
    expect(code10).toHaveLength(10);
  });

  it("filtra caracteres no alfanuméricos del SignatureValue", () => {
    const code = computeSecurityCode(SIGNED_FIXTURE);
    // El SignatureValue del fixture tiene '/', '+', '=' que no deben
    // aparecer en el código de seguridad.
    expect(code).not.toMatch(/[\/+=]/);
  });

  it("acepta SignatureValue con prefijo de namespace (ds:)", () => {
    const xmlNs = SIGNED_FIXTURE.replace(
      /<SignatureValue>/g,
      "<ds:SignatureValue>",
    ).replace(/<\/SignatureValue>/g, "</ds:SignatureValue>");
    const code = computeSecurityCode(xmlNs);
    expect(code).toHaveLength(8);
  });

  it("lanza si no hay SignatureValue", () => {
    expect(() =>
      computeSecurityCode("<ECF><FechaHoraFirma/></ECF>"),
    ).toThrow(DgiiSecurityCodeError);
  });

  it("lanza si SignatureValue no tiene suficientes chars alfanum", () => {
    const xmlCorto = `<Signature><SignatureValue>a==</SignatureValue></Signature>`;
    expect(() => computeSecurityCode(xmlCorto)).toThrow(
      DgiiSecurityCodeError,
    );
  });
});
