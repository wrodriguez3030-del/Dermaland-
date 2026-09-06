// Portada de agendapp: tests/unit/dgii-xml-utils.test.ts (2026-09-05).
// Solo se reescribieron los imports @/lib/dgii/ -> ./ ; el cuerpo es literal.
import { describe, it, expect } from "vitest";
import {
  escapeXml,
  leaf,
  group,
  serializeDocument,
  serializeElement,
  money2,
  money2str,
  XML_DECLARATION,
} from "./xml-utils";

describe("escapeXml", () => {
  it("escapa los 5 caracteres especiales", () => {
    expect(escapeXml(`& < > " '`)).toBe("&amp; &lt; &gt; &quot; &apos;");
  });
  it("escapa & primero (no doble-escapa)", () => {
    expect(escapeXml("a&lt;b")).toBe("a&amp;lt;b");
  });
});

describe("leaf", () => {
  it("omite null/undefined/'' ", () => {
    expect(leaf("x", null)).toBeNull();
    expect(leaf("x", undefined)).toBeNull();
    expect(leaf("x", "  ")).toBeNull();
  });
  it("emite número y string", () => {
    expect(leaf("x", 0)).toEqual({ tag: "x", text: "0" });
    expect(leaf("x", "v")).toEqual({ tag: "x", text: "v" });
  });
});

describe("group", () => {
  it("filtra hijos nulos", () => {
    const g = group("G", [leaf("a", "1"), null, leaf("b", null), leaf("c", "3")]);
    expect(g.children?.map((c) => c.tag)).toEqual(["a", "c"]);
  });
});

describe("serialize", () => {
  it("documento empieza con la declaración UTF-8 y sin BOM", () => {
    const xml = serializeDocument(group("ECF", [leaf("a", "1")]));
    expect(xml.startsWith(XML_DECLARATION)).toBe(true);
    expect(xml.charCodeAt(0)).not.toBe(0xfeff); // sin BOM
  });
  it("escapa el texto en la serialización", () => {
    const xml = serializeElement(leaf("a", "x&y")!);
    expect(xml).toContain("x&amp;y");
  });
});

describe("money2 / money2str", () => {
  it("redondea a 2 decimales", () => {
    expect(money2(1.005)).toBe(1.01);
    expect(money2(2.344)).toBe(2.34);
    expect(money2str(2.3)).toBe("2.30");
  });
  it("normaliza -0 a 0", () => {
    expect(Object.is(money2(-0), 0)).toBe(true);
    expect(money2str(-0)).toBe("0.00");
  });
});
