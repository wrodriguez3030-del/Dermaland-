import { describe, it, expect } from "vitest";
import { buildPgDumpArgs } from "../../../../scripts/backup/lib/pg-dump-args.mjs";

const base = { outFile: "/tmp/x.sql.gz", dbUrl: "postgresql://u:p@h/db" };

describe("buildPgDumpArgs", () => {
  it("por defecto NO incluye --clean ni --if-exists", () => {
    const args = buildPgDumpArgs({ ...base, withDrop: false });
    expect(args).not.toContain("--clean");
    expect(args).not.toContain("--if-exists");
  });

  it("incluye --clean --if-exists solo con withDrop", () => {
    const args = buildPgDumpArgs({ ...base, withDrop: true });
    expect(args).toContain("--clean");
    expect(args).toContain("--if-exists");
  });

  it("mantiene siempre las opciones de portabilidad y compresión", () => {
    const args = buildPgDumpArgs({ ...base, withDrop: false });
    expect(args).toContain("--no-owner");
    expect(args).toContain("--no-privileges");
    expect(args).toContain("-Z");
    expect(args).toContain("9");
  });

  it("pone la URL al final y el archivo tras -f", () => {
    const args = buildPgDumpArgs({ ...base, withDrop: false });
    expect(args[args.length - 1]).toBe(base.dbUrl);
    expect(args[args.indexOf("-f") + 1]).toBe(base.outFile);
  });
});
