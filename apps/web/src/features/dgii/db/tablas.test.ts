import { describe, it, expect } from "vitest";
import { TABLAS_NUEVAS, TABLAS_LEGACY, SUFIJO_LEGACY, nombreLegacy } from "./tablas";

describe("listas canónicas de tablas fiscales", () => {
  it("entran las 18 del esquema nuevo: 17 de agendapp más `ecf_document_events`", () => {
    expect(TABLAS_NUEVAS).toHaveLength(18);
    // La decimoctava no viene de agendapp: es de esta casa (0045) y hoy la
    // escribe código vivo. Ver C2 de la revisión final.
    expect(TABLAS_NUEVAS).toContain("ecf_document_events");
    // Las cuatro que sostienen la emisión: si falta una, no se factura.
    for (const t of ["ecf_sequences", "electronic_invoices", "electronic_invoice_items", "dgii_submissions"]) {
      expect(TABLAS_NUEVAS, `falta ${t}`).toContain(t);
    }
  });

  it("se retiran las 13 del módulo viejo, y `dgii_certificates` es la única con datos", () => {
    expect(TABLAS_LEGACY).toHaveLength(13);
    expect(TABLAS_LEGACY).toContain("dgii_certificates");
    expect(TABLAS_LEGACY).toContain("ecf_document_events");
  });

  it("las que comparten nombre son las que obligan a renombrar antes de crear", () => {
    const chocan = TABLAS_NUEVAS.filter((t) => (TABLAS_LEGACY as readonly string[]).includes(t));
    expect(chocan.sort()).toEqual([
      "dgii_certificates", "dgii_settings", "dgii_status_logs", "dgii_submissions",
      "ecf_document_events", "ecf_sequences", "electronic_invoice_items",
      "electronic_invoices",
    ]);
  });

  it("el sufijo lleva la fecha: un renombrado sin fecha no se sabe de cuándo es", () => {
    expect(SUFIJO_LEGACY).toBe("_legacy_20260906");
    expect(nombreLegacy("ecf_sequences")).toBe("ecf_sequences_legacy_20260906");
  });

  it("ninguna tabla intocable está en ninguna de las dos listas", () => {
    const intocables = ["invoice_numberings", "proformas", "proforma_items", "proforma_payments",
      "cash_closings", "cash_closing_sales", "billing_settings", "proforma_counters",
      "payment_methods", "cash_registers", "cash_register_sessions"];
    for (const t of intocables) {
      expect(TABLAS_NUEVAS, `${t} es intocable`).not.toContain(t);
      expect(TABLAS_LEGACY, `${t} es intocable`).not.toContain(t);
    }
  });

  it("TABLAS_NUEVAS contiene exactamente las 18 tablas esperadas, en el orden correcto", () => {
    // La lista se define aquí y en tablas.ts para que un cambio silencioso en una
    // se vea como fallo ruidoso en la otra. Si alguien cambia un nombre (ej: mal
    // transcrito de agendapp) sin actualizar también aquí, la prueba falla.
    expect(TABLAS_NUEVAS).toEqual([
      "dgii_settings",
      "dgii_certificates",
      "ecf_sequences",
      "electronic_invoices",
      "electronic_invoice_items",
      "dgii_submissions",
      "dgii_status_logs",
      "dgii_enablement_progress",
      "dgii_representative_attestations",
      "received_ecf",
      "received_commercial_approvals",
      "dgii_certification_datasets",
      "dgii_certification_cases",
      "dgii_simulation_ranges",
      "dgii_certification_applications",
      "dgii_certification_events",
      "dgii_certification_evidence",
      "ecf_document_events",
    ]);
  });

  it("TABLAS_LEGACY contiene exactamente las 13 tablas esperadas, en el orden correcto", () => {
    // La lista se define aquí y en tablas.ts para que un cambio silencioso en una
    // se vea como fallo ruidoso en la otra. Si alguien cambia un nombre (ej: mal
    // transcrito de agendapp) sin actualizar también aquí, la prueba falla.
    expect(TABLAS_LEGACY).toEqual([
      "dgii_settings",
      "dgii_certificates",
      "ecf_sequences",
      "electronic_invoices",
      "electronic_invoice_items",
      "dgii_submissions",
      "dgii_status_logs",
      "dgii_received_ecf",
      "dgii_commercial_approvals",
      "proforma_to_ecf_logs",
      "dgii_logs",
      "ecf_document_events",
      "cash_closing_ecf_items",
    ]);
  });
});
