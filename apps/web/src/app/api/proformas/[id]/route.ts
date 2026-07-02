import { toUserFacingMessage } from "@/server/repositories/supabase/client";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getRepositories } from "@/server/repositories";
import { getRepoContext, getSession } from "@/server/auth/context";
import {
  documentEditability,
  pickEditableProformaFields,
} from "@/features/sales/editability";
import {
  isSensitiveChange,
  diffInvoiceForAudit,
  lineFromSaleItem,
  type InvoiceEditDraft,
} from "@/features/sales/invoice-edit";
import { canEditSales, isBillingAdmin } from "@/features/billing/permissions";
import type { DefaultBillingType, Payment, ProformaStatus, SaleItem } from "@/types";

// C4: helper para mapear errores de autenticación a 401 vs errores genéricos a 400.
function errorStatus(e: unknown): 400 | 401 {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  if (
    msg.includes("auth") ||
    msg.includes("no autenticado") ||
    msg.includes("session") ||
    msg.includes("jwt")
  ) {
    return 401;
  }
  return 400;
}

/**
 * Proforma individual: GET (byId) y PATCH (cancel).
 *
 * PATCH acepta `{ action: "cancel", reason: string }` para anular.
 * NO exponemos convertToEcf aquí (queda como Fase G / gated).
 */
export const dynamic = "force-dynamic";

function notSupabase() {
  return NextResponse.json(
    {
      error:
        "Backend de proformas en modo local (DATA_SOURCE=mock). Activa Supabase para usar la API compartida.",
    },
    { status: 409 },
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const ctx = await getRepoContext();
    const proforma = await getRepositories().proforma.byId(ctx, id);
    if (!proforma) {
      return NextResponse.json({ error: "Proforma no encontrada" }, { status: 404 });
    }
    return NextResponse.json(
      { proforma },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo registrar la venta. Intenta nuevamente.") }, { status: errorStatus(e) });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  if (env.DATA_SOURCE !== "supabase") return notSupabase();
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      action?: string;
      reason?: string;
      patch?: Record<string, unknown>;
    };
    const ctx = await getRepoContext();

    if (body.action === "cancel") {
      const reason = body.reason ?? "";
      await getRepositories().proforma.cancel(ctx, id, reason);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "update") {
      // Permiso de rol (servidor): el cliente no es fuente de verdad.
      const session = await getSession();
      if (!session || !canEditSales(session.user.role)) {
        return NextResponse.json(
          { error: "No tienes permiso para editar facturas." },
          { status: 403 },
        );
      }
      const repos = getRepositories();
      const current = await repos.proforma.byId(ctx, id);
      if (!current) {
        return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
      }
      // Bloqueo de documentos ya emitidos fiscalmente / anulados / e-CF.
      const editability = documentEditability(current);
      if (!editability.editable) {
        // Auditar el intento bloqueado de editar un e-CF (no modifica nada).
        if (editability.blockedBy === "ecf") {
          try {
            await repos.audit.log(ctx, {
              businessId: ctx.businessId,
              userId: session.user.id,
              userName: session.user.fullName,
              action: "sale.edit_blocked_ecf",
              entity: "proforma",
              entityId: id,
              branchId: ctx.branchId,
              metadata: { reason: "electronic_invoice_locked" },
            });
          } catch {
            // La auditoría no debe romper la respuesta.
          }
        }
        return NextResponse.json({ error: editability.reason }, { status: 409 });
      }
      const patch = pickEditableProformaFields(body.patch ?? {});
      const updated = await repos.proforma.update(ctx, id, patch);
      // Auditoría: registra qué cambió (valor anterior → nuevo).
      const changes: Record<string, { before: unknown; after: unknown }> = {};
      const currentRec = current as unknown as Record<string, unknown>;
      for (const k of Object.keys(patch) as (keyof typeof patch)[]) {
        changes[k] = { before: currentRec[k] ?? null, after: patch[k] ?? null };
      }
      try {
        await repos.audit.log(ctx, {
          businessId: ctx.businessId,
          userId: session.user.id,
          userName: session.user.fullName,
          action: "sale.update",
          entity: "proforma",
          entityId: id,
          branchId: ctx.branchId,
          metadata: { changes, reason: body.reason ?? null },
        });
      } catch {
        // La auditoría no debe romper el guardado; ya se logueó server-side.
      }
      return NextResponse.json({ proforma: updated });
    }

    if (body.action === "update_full") {
      // Permiso de rol (servidor): el cliente no es fuente de verdad.
      const session = await getSession();
      if (!session || !canEditSales(session.user.role)) {
        return NextResponse.json(
          { error: "No tienes permiso para editar facturas." },
          { status: 403 },
        );
      }
      const repos = getRepositories();
      const current = await repos.proforma.byId(ctx, id);
      if (!current) {
        return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
      }
      // Bloqueo fiscal: e-CF / anulados / emitidos-e-CF no se editan directo.
      const editability = documentEditability(current);
      if (!editability.editable) {
        if (editability.blockedBy === "ecf") {
          try {
            await repos.audit.log(ctx, {
              businessId: ctx.businessId,
              userId: session.user.id,
              userName: session.user.fullName,
              action: "sale.edit_blocked_ecf",
              entity: "proforma",
              entityId: id,
              branchId: ctx.branchId,
              metadata: { reason: "electronic_invoice_locked" },
            });
          } catch {
            /* la auditoría no debe romper la respuesta */
          }
        }
        return NextResponse.json({ error: editability.reason }, { status: 409 });
      }

      const raw = (body.patch ?? {}) as {
        customerName?: string;
        customerPhone?: string | null;
        customerDocument?: string | null;
        notes?: string | null;
        items?: SaleItem[];
        payments?: Payment[];
        discountPercent?: number;
        cashierName?: string;
        status?: ProformaStatus;
        emittedAt?: string;
        billingType?: DefaultBillingType;
      };
      const items = Array.isArray(raw.items) ? raw.items : [];
      const payments = Array.isArray(raw.payments) ? raw.payments : [];

      // Gating de campos operativos/fiscales (servidor = fuente de verdad):
      //  - fecha de emisión y estado: solo ADMIN.
      //  - tipo de facturación (B02↔B01): solo documentos NO emitidos (proforma).
      const admin = isBillingAdmin(session.user.role);
      const emittedAt = admin ? raw.emittedAt : undefined;
      const status = admin ? raw.status : undefined;
      const isEmittedFiscal = current.documentKind === "invoice";
      const billingType = isEmittedFiscal ? undefined : raw.billingType;
      if (items.length === 0) {
        return NextResponse.json(
          { error: "La factura debe tener al menos un producto." },
          { status: 400 },
        );
      }

      // Detectar cambios sensibles → exigir motivo (auditoría).
      const draft: InvoiceEditDraft = {
        customerName: raw.customerName ?? current.customerName,
        customerPhone: raw.customerPhone ?? null,
        customerDocument: raw.customerDocument ?? null,
        notes: raw.notes ?? null,
        items: items.map(lineFromSaleItem),
        globalDiscountPercent: raw.discountPercent ?? 0,
        payments: payments.map((p) => ({
          method: p.method,
          amount: p.amount,
          reference: p.reference,
          last4: p.last4,
        })),
        cashierName: raw.cashierName,
        status,
        emittedAt,
        billingType,
      };
      const reason = (body.reason ?? "").trim();
      if (isSensitiveChange(current, draft) && !reason) {
        return NextResponse.json(
          { error: "Indica el motivo de la modificación." },
          { status: 400 },
        );
      }

      const updated = await repos.proforma.updateFull(ctx, id, {
        customerName: raw.customerName,
        customerPhone: raw.customerPhone,
        customerDocument: raw.customerDocument,
        notes: raw.notes,
        items,
        payments,
        discountPercent: raw.discountPercent,
        cashierName: raw.cashierName,
        status,
        emittedAt,
        billingType,
      });

      try {
        await repos.audit.log(ctx, {
          businessId: ctx.businessId,
          userId: session.user.id,
          userName: session.user.fullName,
          action: "sale.update_full",
          entity: "proforma",
          entityId: id,
          branchId: ctx.branchId,
          metadata: { changes: diffInvoiceForAudit(current, draft), reason: reason || null },
        });
      } catch {
        /* la auditoría no debe romper el guardado */
      }
      return NextResponse.json({ proforma: updated });
    }

    return NextResponse.json(
      { error: "Acción no soportada. Use action: 'cancel', 'update' o 'update_full'." },
      { status: 400 },
    );
  } catch (e) {
    return NextResponse.json({ error: toUserFacingMessage(e, "No se pudo registrar la venta. Intenta nuevamente.") }, { status: errorStatus(e) });
  }
}
