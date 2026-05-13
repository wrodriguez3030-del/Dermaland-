import { describe, expect, it } from "vitest";
import {
  ALLOWED_TOOLS,
  FORBIDDEN_TOOLS,
  validateToolName,
  validateToolSet,
} from "./tools";

describe("AI tools — bloqueo de agendamiento (R-AI-01)", () => {
  it("rechaza create_booking", () => {
    expect(() => validateToolName("create_booking")).toThrow(/agendamiento/i);
  });

  it("rechaza available_slots", () => {
    expect(() => validateToolName("available_slots")).toThrow(/agendamiento/i);
  });

  it.each([
    "create_appointment",
    "schedule_appointment",
    "reschedule_booking",
    "cancel_booking",
    "confirm_booking",
    "list_appointments",
    "get_calendar",
    "no_show",
    "waitlist_add",
  ])("rechaza la tool prohibida %s", (name) => {
    expect(() => validateToolName(name)).toThrow();
  });

  it("acepta search_products", () => {
    expect(() => validateToolName("search_products")).not.toThrow();
  });

  it("acepta handoff_to_human", () => {
    expect(() => validateToolName("handoff_to_human")).not.toThrow();
  });

  it("rechaza tool no registrada", () => {
    expect(() => validateToolName("hack_the_planet")).toThrow(/no registrada/i);
  });

  it("validateToolSet detecta una tool prohibida en lote", () => {
    expect(() =>
      validateToolSet([
        { name: "search_products" },
        { name: "create_booking" }, // intruso
      ]),
    ).toThrow(/agendamiento/i);
  });

  it("ninguna ALLOWED_TOOLS está en FORBIDDEN_TOOLS", () => {
    for (const t of ALLOWED_TOOLS) {
      expect(FORBIDDEN_TOOLS.has(t.name)).toBe(false);
    }
  });

  it("FORBIDDEN_TOOLS cubre los keywords críticos", () => {
    const required = [
      "create_booking",
      "available_slots",
      "cancel_booking",
      "reschedule_booking",
      "confirm_booking",
    ];
    for (const r of required) {
      expect(FORBIDDEN_TOOLS.has(r)).toBe(true);
    }
  });
});
