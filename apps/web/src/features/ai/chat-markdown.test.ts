import { describe, it, expect } from "vitest";
import { inlineSegments, parseBlocks } from "./chat-markdown";

describe("chat-markdown", () => {
  it("inlineSegments separa **negritas** y `código` del texto", () => {
    expect(inlineSegments("Para **piojos** usa `permetrina` hoy")).toEqual([
      { text: "Para " },
      { text: "piojos", bold: true },
      { text: " usa " },
      { text: "permetrina", code: true },
      { text: " hoy" },
    ]);
  });

  it("inlineSegments deja el texto plano intacto", () => {
    expect(inlineSegments("sin formato")).toEqual([{ text: "sin formato" }]);
  });

  it("parseBlocks reconoce títulos, bullets, numeradas y líneas en blanco", () => {
    const md = "## Resumen\nHay **8 lotes**.\n\n- lote A\n* lote B\n1. primero\n2) segundo";
    expect(parseBlocks(md)).toEqual([
      { kind: "heading", text: "Resumen" },
      { kind: "text", text: "Hay **8 lotes**." },
      { kind: "blank" },
      { kind: "bullet", text: "lote A" },
      { kind: "bullet", text: "lote B" },
      { kind: "ordered", num: "1", text: "primero" },
      { kind: "ordered", num: "2", text: "segundo" },
    ]);
  });
});
