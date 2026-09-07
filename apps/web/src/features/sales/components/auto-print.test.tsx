// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { AutoPrint } from "./auto-print";

afterEach(cleanup);

describe("AutoPrint", () => {
  it("no renderiza nada", () => {
    const { container } = render(<AutoPrint auto={false} />);
    expect(container.innerHTML).toBe("");
  });

  it("llama window.print() UNA vez al montar cuando auto=true", () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);

    render(<AutoPrint auto />);

    expect(print).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("NUNCA llama window.print() cuando auto=false", () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);

    render(<AutoPrint auto={false} />);

    expect(print).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
