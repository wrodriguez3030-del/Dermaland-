import * as React from "react";

/**
 * Render Markdown MÍNIMO para las burbujas del chat IA (negritas, títulos,
 * listas, código inline). Sin dependencias ni HTML crudo — el contenido viene
 * del modelo y se renderiza SIEMPRE como texto (sin dangerouslySetInnerHTML).
 */

export type InlineSegment = { text: string; bold?: boolean; code?: boolean };

/** Divide una línea en segmentos texto / **negrita** / `código`. */
export function inlineSegments(text: string): InlineSegment[] {
  const out: InlineSegment[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i) });
    const token = m[0]!;
    if (token.startsWith("**")) out.push({ text: token.slice(2, -2), bold: true });
    else out.push({ text: token.slice(1, -1), code: true });
    last = i + token.length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

export type MdBlock =
  | { kind: "heading"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "ordered"; num: string; text: string }
  | { kind: "text"; text: string }
  | { kind: "blank" };

/** Parsea el markdown del modelo a bloques simples (por línea). */
export function parseBlocks(md: string): MdBlock[] {
  return md.split(/\r?\n/).map((line): MdBlock => {
    const h = line.match(/^#{2,4}\s+(.*)$/);
    if (h) return { kind: "heading", text: h[1]! };
    const b = line.match(/^\s*[-*]\s+(.*)$/);
    if (b) return { kind: "bullet", text: b[1]! };
    const o = line.match(/^\s*(\d+)[.)]\s+(.*)$/);
    if (o) return { kind: "ordered", num: o[1]!, text: o[2]! };
    if (!line.trim()) return { kind: "blank" };
    return { kind: "text", text: line };
  });
}

function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineSegments(text).map((s, i) =>
        s.bold ? (
          <strong key={i} className="font-semibold">{s.text}</strong>
        ) : s.code ? (
          <code key={i} className="rounded bg-black/[0.06] px-1 font-mono text-[0.85em]">{s.text}</code>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        ),
      )}
    </>
  );
}

export function ChatMarkdown({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  return (
    <div className="break-words">
      {blocks.map((blk, i) => {
        switch (blk.kind) {
          case "heading":
            return (
              <div key={i} className={`font-semibold ${i > 0 ? "mt-2" : ""}`}>
                <Inline text={blk.text} />
              </div>
            );
          case "bullet":
            return (
              <div key={i} className="flex gap-1.5 pl-1">
                <span className="shrink-0 opacity-60">•</span>
                <span><Inline text={blk.text} /></span>
              </div>
            );
          case "ordered":
            return (
              <div key={i} className="flex gap-1.5 pl-1">
                <span className="shrink-0 font-medium">{blk.num}.</span>
                <span><Inline text={blk.text} /></span>
              </div>
            );
          case "blank":
            return <div key={i} className="h-2" />;
          default:
            return (
              <div key={i}>
                <Inline text={blk.text} />
              </div>
            );
        }
      })}
    </div>
  );
}
