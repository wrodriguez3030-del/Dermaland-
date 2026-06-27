// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  appendDgiiLog,
  appendSimulatedFlowLogs,
  clearDgiiLogs,
  listDgiiLogs,
} from "./dgii-logs-store";

beforeEach(() => {
  window.localStorage.clear();
  clearDgiiLogs();
});

describe("dgii-logs store", () => {
  it("lista el seed inicial", () => {
    expect(listDgiiLogs().length).toBeGreaterThan(0);
  });

  it("append agrega una entrada al inicio y la marca mock", () => {
    const before = listDgiiLogs().length;
    const e = appendDgiiLog({
      action: "enviar_dgii",
      environment: "mock",
      status: "info",
      message: "test",
      ecfNumber: "E320000000099",
    });
    expect(e.isMock).toBe(true);
    const after = listDgiiLogs();
    expect(after.length).toBe(before + 1);
    expect(after[0]?.message).toBe("test");
  });

  it("appendSimulatedFlowLogs agrega toda la traza", () => {
    const before = listDgiiLogs().length;
    appendSimulatedFlowLogs("E320000000100", "mock", [
      { action: "generar_xml", status: "ok", message: "xml" },
      { action: "firmar", status: "ok", message: "firma" },
      { action: "enviar_dgii", status: "info", message: "envio" },
    ]);
    expect(listDgiiLogs().length).toBe(before + 3);
  });

  it("ordena por fecha descendente", () => {
    appendDgiiLog({
      action: "firmar",
      environment: "mock",
      status: "ok",
      message: "más reciente",
    });
    const list = listDgiiLogs();
    expect(list[0]?.message).toBe("más reciente");
  });
});
