import "server-only";
import type {
  CashRegisterRepository,
  ProformaRepository,
  RepoContext,
} from "../types";
import type {
  CashMovement,
  CashMovementType,
  CashRegisterSession,
  PaymentMethod,
  Payment,
  Proforma,
  SaleItem,
} from "@/types";
import {
  SupabaseRepositoryError,
  UserFacingRepositoryError,
  failRepo,
  getClient,
  pgErrorCode,
} from "./client";
import {
  cashSessionRowToTs,
  proformaItemRowToTs,
  proformaPaymentRowToTs,
  proformaRowToTs,
} from "./mappers";
import {
  isUuid,
  mapPaymentMethod,
  nullableUuid,
  requireUuid,
  toDbInt,
  toDbMoney,
  toDbMoneyNullable,
} from "./sanitize";
import {
  recalcInvoice,
  lineFromSaleItem,
  isSafeEditStatus,
} from "@/features/sales/invoice-edit";
import { saleBelongsToCustomer } from "@/features/customers/customer-purchases";
import {
  normalizeDocument,
  normalizePhone,
} from "@/features/customers/customer-normalization";

// ─── Helpers ────────────────────────────────────────────────────────────────

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

function yyyymmdd(date = new Date()): string {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function generateProformaNumber(): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PRO-${yyyymmdd()}-${pad4(rand)}`;
}

function generateSessionNumber(): string {
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `SES-${yyyymmdd()}-${pad4(rand)}`;
}

// ─── Proforma ───────────────────────────────────────────────────────────────

async function fetchItemsForProformas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  businessId: string,
  proformaIds: string[],
): Promise<Map<string, SaleItem[]>> {
  const out = new Map<string, SaleItem[]>();
  if (proformaIds.length === 0) return out;
  const { data, error } = await sb
    .from("proforma_items")
    .select("*")
    .eq("business_id", businessId)
    .in("proforma_id", proformaIds)
    .order("line_no", { ascending: true });
  if (error) throw new SupabaseRepositoryError("proforma.items:fetch", error);
  for (const row of data ?? []) {
    const list = out.get(row.proforma_id) ?? [];
    list.push(proformaItemRowToTs(row));
    out.set(row.proforma_id, list);
  }
  return out;
}

async function fetchPaymentsForProformas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  businessId: string,
  proformaIds: string[],
): Promise<Map<string, Payment[]>> {
  const out = new Map<string, Payment[]>();
  if (proformaIds.length === 0) return out;
  const { data, error } = await sb
    .from("proforma_payments")
    .select("*")
    .eq("business_id", businessId)
    .in("proforma_id", proformaIds)
    .order("created_at", { ascending: true });
  if (error)
    throw new SupabaseRepositoryError("proforma.payments:fetch", error);
  for (const row of data ?? []) {
    const list = out.get(row.proforma_id) ?? [];
    list.push(proformaPaymentRowToTs(row));
    out.set(row.proforma_id, list);
  }
  return out;
}

export const proformaRepository: ProformaRepository = {
  async list(ctx: RepoContext) {
    const sb = await getClient("proforma.list");
    const { data, error } = await sb
      .from("proformas")
      .select("*")
      .eq("business_id", ctx.businessId)
      .order("created_at", { ascending: false });
    if (error) throw new SupabaseRepositoryError("proforma.list", error);
    const rows = data ?? [];
    const ids = rows.map((r: { id: string }) => r.id);
    const itemsByProforma = await fetchItemsForProformas(
      sb,
      ctx.businessId,
      ids,
    );
    const paymentsByProforma = await fetchPaymentsForProformas(
      sb,
      ctx.businessId,
      ids,
    );
    return rows.map((r: { id: string } & Record<string, unknown>) =>
      proformaRowToTs(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        r as any,
        itemsByProforma.get(r.id) ?? [],
        paymentsByProforma.get(r.id) ?? [],
      ),
    );
  },

  async byId(ctx: RepoContext, id: string) {
    const sb = await getClient("proforma.byId");
    const { data, error } = await sb
      .from("proformas")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("proforma.byId", error);
    if (!data) return null;
    const itemsByProforma = await fetchItemsForProformas(sb, ctx.businessId, [
      id,
    ]);
    const paymentsByProforma = await fetchPaymentsForProformas(
      sb,
      ctx.businessId,
      [id],
    );
    return proformaRowToTs(
      data,
      itemsByProforma.get(id) ?? [],
      paymentsByProforma.get(id) ?? [],
    );
  },

  async listForCustomer(ctx: RepoContext, customer) {
    const sb = await getClient("proforma.listForCustomer");

    // 1) Relación principal: customer_id (usa proformas_business_customer_idx).
    const byIdQuery = isUuid(customer.id)
      ? sb
          .from("proformas")
          .select("*")
          .eq("business_id", ctx.businessId)
          .eq("customer_id", customer.id)
      : null;

    // 2) Fallback legacy: ventas SIN customer_id cuyo snapshot de documento o
    //    teléfono coincide. Se consultan variantes exactas (raw + normalizada)
    //    y el filtro fino lo hace la MISMA lógica pura del perfil.
    const docVariants = [
      ...new Set(
        [customer.documentNumber, normalizeDocument(customer.documentNumber)]
          .map((v) => (v ?? "").trim())
          .filter(Boolean),
      ),
    ];
    const normPhone = normalizePhone(customer.phone);
    const phoneVariants = [
      ...new Set(
        [customer.phone, normPhone, normPhone ? `1${normPhone}` : "", normPhone ? `+1${normPhone}` : ""]
          .map((v) => (v ?? "").trim())
          .filter(Boolean),
      ),
    ];
    const orParts: string[] = [];
    if (docVariants.length)
      orParts.push(`customer_document.in.("${docVariants.join('","')}")`);
    if (phoneVariants.length)
      orParts.push(`customer_phone.in.("${phoneVariants.join('","')}")`);

    const legacyQuery = orParts.length
      ? sb
          .from("proformas")
          .select("*")
          .eq("business_id", ctx.businessId)
          .is("customer_id", null)
          .or(orParts.join(","))
      : null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let idRows: any[] = [];
    if (byIdQuery) {
      const { data, error } = await byIdQuery;
      if (error)
        throw new SupabaseRepositoryError("proforma.listForCustomer:id", error);
      idRows = data ?? [];
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let legacyRows: any[] = [];
    if (legacyQuery) {
      const { data, error } = await legacyQuery;
      if (error)
        throw new SupabaseRepositoryError(
          "proforma.listForCustomer:legacy",
          error,
        );
      legacyRows = data ?? [];
    }

    // Dedup + filtro fino con la lógica pura compartida (id → doc/teléfono).
    const seen = new Set<string>();
    const rows = [...idRows, ...legacyRows].filter((r: { id: string }) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
    const headers = rows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r) => proformaRowToTs(r as any))
      .filter((p) => saleBelongsToCustomer(p, customer))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

    // Ítems y pagos SOLO de las ventas del cliente.
    const ids = headers.map((p) => p.id);
    const [itemsByProforma, paymentsByProforma] = await Promise.all([
      fetchItemsForProformas(sb, ctx.businessId, ids),
      fetchPaymentsForProformas(sb, ctx.businessId, ids),
    ]);
    return headers.map((p) => ({
      ...p,
      items: itemsByProforma.get(p.id) ?? [],
      payments: paymentsByProforma.get(p.id) ?? [],
    }));
  },

  async listHeaders(ctx: RepoContext, opts) {
    const sb = await getClient("proforma.listHeaders");
    // select("*") en vez de lista de columnas: tolera que la mig 0022
    // (source_proforma_id) aún no esté aplicada. Lo pesado NO son las
    // columnas de cabecera sino los hijos (ítems/pagos), que aquí no se piden.
    let q = sb
      .from("proformas")
      .select("*")
      .eq("business_id", ctx.businessId)
      .order("created_at", { ascending: false });
    if (opts?.branchId) q = q.eq("branch_id", opts.branchId);
    if (opts?.from) q = q.gte("created_at", opts.from);
    if (opts?.to) {
      // Inclusivo hasta el fin del día.
      const end = new Date(Date.parse(opts.to) + 24 * 60 * 60 * 1000 - 1);
      q = q.lte("created_at", end.toISOString());
    }
    const { data, error } = await q;
    if (error) throw new SupabaseRepositoryError("proforma.listHeaders", error);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ((data ?? []) as any[]).map((r) => proformaRowToTs(r));
  },

  async create(
    ctx: RepoContext,
    proforma: Omit<Proforma, "id" | "createdAt" | "updatedAt">,
  ) {
    const sb = await getClient("proforma.create");

    // SEC-011: idempotencia. Si el cobro trae una clave y ya existe una venta con
    // ella (reintento/doble-submit), devolvemos la existente en vez de crear otra
    // (evita doble factura + doble NCF). `hydrate` re-arma el agregado completo.
    const idemKey = proforma.idempotencyKey ? String(proforma.idempotencyKey).slice(0, 100) : null;
    const hydrate = async (row: Parameters<typeof proformaRowToTs>[0]) => {
      const rid = (row as { id: string }).id;
      const its = await fetchItemsForProformas(sb, ctx.businessId, [rid]);
      const pays = await fetchPaymentsForProformas(sb, ctx.businessId, [rid]);
      return proformaRowToTs(row, its.get(rid) ?? [], pays.get(rid) ?? []);
    };
    if (idemKey) {
      const { data: dup } = await sb
        .from("proformas").select("*")
        .eq("business_id", ctx.businessId).eq("idempotency_key", idemKey).maybeSingle();
      if (dup) return hydrate(dup);
    }

    const number =
      proforma.number && proforma.number.trim().length > 0
        ? proforma.number
        : generateProformaNumber();

    // Identidad SIEMPRE del contexto autenticado (JWT), nunca del body: el POS
    // envía valores placeholder ("usr_cashier_1") que no son UUID y rompían el
    // insert con `invalid input syntax for type uuid` (22P02). cashier_id /
    // user_id deben ser el usuario real de la sesión.
    const cashierId = requireUuid(
      ctx.userId,
      "Tu sesión de usuario",
    );
    // branch_id es `uuid not null`: usa el del body si es UUID válido; si no, el
    // de la sesión; si ninguno sirve, error claro (sin jerga técnica).
    const branchId = isUuid(proforma.branchId)
      ? String(proforma.branchId)
      : requireUuid(ctx.branchId, "La sucursal");

    // SEGURIDAD (SEC-002): el servidor es la ÚNICA fuente de verdad de los
    // montos también al EMITIR (antes solo la edición recalculaba). Recalculamos
    // subtotal/descuento/ITBIS/total/pagado/balance y los ítems con el MISMO
    // motor que la vista previa del cliente. Así un POST con `total: 0.01` (o
    // cantidades/precios negativos) no puede persistirse: los montos se derivan
    // de las líneas, y `recalcInvoice` clampa negativos a 0.
    const recomputed = recalcInvoice({
      customerName: proforma.customerName ?? "",
      customerPhone: proforma.customerPhone ?? null,
      customerDocument: proforma.customerDocument ?? null,
      notes: proforma.notes ?? null,
      items: (proforma.items ?? []).map(lineFromSaleItem),
      globalDiscountPercent: proforma.discountPercent ?? 0,
      payments: (proforma.payments ?? []).map((p) => ({
        method: p.method,
        amount: p.amount,
        reference: p.reference,
        last4: p.last4,
      })),
    });

    const proformaRow = {
      business_id: ctx.businessId,
      branch_id: branchId,
      number,
      customer_id: nullableUuid(proforma.customerId),
      customer_name: proforma.customerName,
      cashier_id: cashierId,
      // Identidad de auditoría del cajero: SIEMPRE de la sesión (JWT), no del
      // body. El POS enviaba un nombre placeholder hardcodeado ("Rosa Peralta")
      // que se persistía en cada factura sin importar quién estuviera logueado.
      cashier_name: ctx.userName ?? proforma.cashierName,
      subtotal: toDbMoney(recomputed.subtotal, "subtotal"),
      discount: toDbMoney(recomputed.discount, "descuento"),
      itbis: toDbMoney(recomputed.itbis, "ITBIS"),
      total: toDbMoney(recomputed.total, "total"),
      status: proforma.status,
      paid: toDbMoney(recomputed.paid, "monto pagado"),
      balance: toDbMoney(recomputed.balance, "balance"),
      notes: proforma.notes ?? null,
      ecf_number: proforma.ecfNumber ?? null,
      cash_register_session_id: nullableUuid(proforma.cashRegisterSessionId),
      discount_percent: toDbMoneyNullable(recomputed.discountPercent, "% de descuento"),
      discount_amount: toDbMoneyNullable(proforma.discountAmount, "descuento"),
      billing_type: proforma.billingType ?? null,
      customer_phone: proforma.customerPhone ?? null,
      customer_document: proforma.customerDocument ?? null,
      amount_received: toDbMoneyNullable(proforma.amountReceived, "monto recibido"),
      change_amount: toDbMoneyNullable(proforma.changeAmount, "cambio"),
      document_kind: proforma.documentKind ?? "proforma",
      ecf_type: proforma.ecfType ?? null,
      sequence_type: proforma.sequenceType ?? null,
      numbering_id: nullableUuid(proforma.numberingId),
      sequence_environment: proforma.sequenceEnvironment ?? null,
      seller_id: nullableUuid(proforma.sellerId),
      seller_name: proforma.sellerName ?? null,
      // Enlace proforma→factura (anti doble conteo, mig 0022). Solo se envía
      // cuando viene seteado: así el insert no referencia la columna si la
      // migración aún no está aplicada.
      ...(proforma.sourceProformaId
        ? { source_proforma_id: nullableUuid(proforma.sourceProformaId) }
        : {}),
      // SEC-011: clave de idempotencia (índice único por empresa).
      ...(proforma.idempotencyKey
        ? { idempotency_key: String(proforma.idempotencyKey).slice(0, 100) }
        : {}),
    };

    // B-02: EMISIÓN ATÓMICA. Si el POS envía un plan de descuento de stock,
    // creamos venta + ítems + pagos + descuento de lotes en UNA transacción
    // (RPC `emit_sale_atomic`). Si algún lote no alcanza, la venta COMPLETA se
    // revierte — nunca queda una venta persistida sin su descuento de inventario.
    const decrements = (proforma.stockDecrements ?? [])
      .filter((d) => d && isUuid(d.lotId) && Number.isFinite(d.qty) && d.qty > 0)
      .map((d) => ({ lot_id: String(d.lotId), qty: Math.round(d.qty), reason: d.reason }));
    if (decrements.length > 0) {
      const itemsPayload = recomputed.items.map((it, idx) => ({
        business_id: ctx.businessId,
        line_no: idx + 1,
        product_id: nullableUuid(it.productId),
        product_sku: it.productSku,
        product_name: it.productName,
        product_lot_id: nullableUuid(it.lotId),
        lot_number: it.lotNumber ?? null,
        quantity: toDbInt(it.quantity, "cantidad"),
        unit_price: toDbMoney(it.unitPrice, "precio unitario"),
        itbis_rate: toDbMoney(it.itbisRate, "tasa de ITBIS"),
        discount: toDbMoney(it.discount, "descuento"),
        subtotal: toDbMoney(it.subtotal, "subtotal"),
        itbis: toDbMoney(it.itbis, "ITBIS"),
        total: toDbMoney(it.total, "total"),
        kind: "bien",
      }));
      const paymentsPayload = (proforma.payments ?? []).map((p) => ({
        method_code: mapPaymentMethod(p.method),
        amount: toDbMoney(p.amount, "monto del pago"),
        reference: p.reference ?? null,
        user_id: cashierId,
        user_name: p.userName ?? ctx.userName ?? null,
      }));
      const { data: emit, error: emitErr } = await sb.rpc("emit_sale_atomic", {
        p_sale: proformaRow,
        p_items: itemsPayload,
        p_payments: paymentsPayload,
        p_decrements: decrements,
      });
      if (emitErr) {
        if (/STOCK_INSUFICIENTE/i.test(emitErr.message)) {
          throw new UserFacingRepositoryError(
            "No se pudo emitir la venta: stock insuficiente en uno o más lotes. Refresca el inventario e intenta de nuevo.",
          );
        }
        throw new SupabaseRepositoryError("proforma.create:emit_atomic", emitErr);
      }
      const newId = (emit as { id: string; reused?: boolean }).id;
      const { data: row } = await sb
        .from("proformas").select("*")
        .eq("business_id", ctx.businessId).eq("id", newId).single();
      return hydrate(row as Parameters<typeof proformaRowToTs>[0]);
    }

    const { data: inserted, error } = await sb
      .from("proformas")
      .insert(proformaRow)
      .select("*")
      .single();
    if (error) {
      // SEC-011: colisión con la clave de idempotencia por carrera (dos POST
      // simultáneos) → devolver la venta ya creada, no un error.
      if (idemKey && (error.code === "23505" || /idempotency/i.test(error.message))) {
        const { data: dup } = await sb
          .from("proformas").select("*")
          .eq("business_id", ctx.businessId).eq("idempotency_key", idemKey).maybeSingle();
        if (dup) return hydrate(dup);
      }
      throw new SupabaseRepositoryError("proforma.create", error);
    }

    const proformaId = inserted.id as string;

    // C2: compensating cleanup — si falla la inserción de items o payments,
    // borramos la proforma recién creada para no dejarla huérfana.
    // Esto NO es una transacción real (no hay rollback atómico); es compensación
    // best-effort. Para atomicidad real se requeriría una RPC/función Postgres.
    const rollbackProforma = async () => {
      await sb
        .from("proformas")
        .delete()
        .eq("id", proformaId)
        .eq("business_id", ctx.businessId);
    };

    // Items — usamos los ítems RECALCULADos (montos por línea autoritativos del
    // servidor, SEC-002), no los del cliente. Conservan sku/lote/producto.
    if (recomputed.items.length) {
      const itemRows = recomputed.items.map((it, idx) => ({
        business_id: ctx.businessId,
        proforma_id: proformaId,
        line_no: idx + 1,
        // product_id / product_lot_id son uuid nullable: un id de mock o vacío
        // se convierte a null (se conserva sku/nombre/lote como texto) en vez de
        // romper el insert con uuid inválido.
        product_id: nullableUuid(it.productId),
        product_sku: it.productSku,
        product_name: it.productName,
        product_lot_id: nullableUuid(it.lotId),
        lot_number: it.lotNumber ?? null,
        quantity: toDbInt(it.quantity, "cantidad"),
        unit_price: toDbMoney(it.unitPrice, "precio unitario"),
        itbis_rate: toDbMoney(it.itbisRate, "tasa de ITBIS"),
        discount: toDbMoney(it.discount, "descuento"),
        subtotal: toDbMoney(it.subtotal, "subtotal"),
        itbis: toDbMoney(it.itbis, "ITBIS"),
        total: toDbMoney(it.total, "total"),
        // DGII: los productos son "bien" (servicios = "servicio"). El valor
        // "product" violaba el check `kind in ('bien','servicio')` → el insert
        // de items fallaba y rompía TODO el cobro (causa raíz).
        kind: "bien",
      }));
      const { error: iErr } = await sb.from("proforma_items").insert(itemRows);
      if (iErr) {
        await rollbackProforma();
        throw new SupabaseRepositoryError("proforma.create:items", iErr);
      }
    }

    // Payments
    if (proforma.payments?.length) {
      const payRows = proforma.payments.map((p) => ({
        business_id: ctx.businessId,
        proforma_id: proformaId,
        // method_code mapeado al enum del schema (efectivo→cash, etc.); valor
        // desconocido cae en "other" para no violar el check.
        method_code: mapPaymentMethod(p.method),
        amount: toDbMoney(p.amount, "monto del pago"),
        reference: p.reference ?? null,
        // user_id es uuid not null → siempre el usuario autenticado, no el
        // placeholder del body.
        user_id: cashierId,
        user_name: p.userName,
      }));
      const { error: pErr } = await sb
        .from("proforma_payments")
        .insert(payRows);
      if (pErr) {
        await rollbackProforma();
        throw new SupabaseRepositoryError("proforma.create:payments", pErr);
      }
    }

    // Re-hidratamos para devolver el agregado completo con IDs reales.
    const itemsByProforma = await fetchItemsForProformas(sb, ctx.businessId, [
      proformaId,
    ]);
    const paymentsByProforma = await fetchPaymentsForProformas(
      sb,
      ctx.businessId,
      [proformaId],
    );
    return proformaRowToTs(
      inserted,
      itemsByProforma.get(proformaId) ?? [],
      paymentsByProforma.get(proformaId) ?? [],
    );
  },

  async update(ctx: RepoContext, id: string, patch) {
    const sb = await getClient("proforma.update");
    // Solo columnas NO fiscales. Nunca tocamos número, ncf/ecf, montos, ítems.
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (patch.customerName !== undefined) row.customer_name = patch.customerName;
    if (patch.customerPhone !== undefined) row.customer_phone = patch.customerPhone ?? null;
    if (patch.customerDocument !== undefined)
      row.customer_document = patch.customerDocument ?? null;
    if (patch.notes !== undefined) row.notes = patch.notes ?? null;

    const { data, error } = await sb
      .from("proformas")
      .update(row)
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("proforma.update", error);
    if (!data) throw new Error("Documento no encontrado o no pertenece al negocio");

    const itemsByProforma = await fetchItemsForProformas(sb, ctx.businessId, [id]);
    const paymentsByProforma = await fetchPaymentsForProformas(sb, ctx.businessId, [id]);
    return proformaRowToTs(
      data,
      itemsByProforma.get(id) ?? [],
      paymentsByProforma.get(id) ?? [],
    );
  },

  async updateFull(ctx: RepoContext, id: string, patch) {
    const sb = await getClient("proforma.updateFull");

    // El servidor es la ÚNICA fuente de verdad de los montos: recalculamos
    // desde los ítems con el MISMO motor que la vista previa del cliente.
    const recomputed = recalcInvoice({
      customerName: patch.customerName ?? "",
      customerPhone: patch.customerPhone ?? null,
      customerDocument: patch.customerDocument ?? null,
      notes: patch.notes ?? null,
      items: patch.items.map(lineFromSaleItem),
      globalDiscountPercent: patch.discountPercent ?? 0,
      payments: patch.payments.map((p) => ({
        method: p.method,
        amount: p.amount,
        reference: p.reference,
        last4: p.last4,
      })),
    });

    // Snapshot de hijos actuales para restaurar si falla el reemplazo. NO es una
    // transacción real (compensación best-effort, igual que en create).
    const oldItemsByProforma = await fetchItemsForProformas(sb, ctx.businessId, [id]);
    const oldPaymentsByProforma = await fetchPaymentsForProformas(sb, ctx.businessId, [id]);
    const oldItems = oldItemsByProforma.get(id) ?? [];
    const oldPayments = oldPaymentsByProforma.get(id) ?? [];

    const userId = requireUuid(ctx.userId, "Tu sesión de usuario");
    // Nombre del usuario que edita (para los pagos re-creados).
    const { data: u } = await sb
      .from("users")
      .select("full_name")
      .eq("id", ctx.userId)
      .maybeSingle();
    const editorName: string = u?.full_name ?? "Usuario";

    // 1) Cabecera: montos + cliente + notas. NUNCA número, ncf/ecf ni tipo.
    const headerRow: Record<string, unknown> = {
      subtotal: toDbMoney(recomputed.subtotal, "subtotal"),
      discount: toDbMoney(recomputed.discount, "descuento"),
      itbis: toDbMoney(recomputed.itbis, "ITBIS"),
      total: toDbMoney(recomputed.total, "total"),
      discount_percent: toDbMoneyNullable(recomputed.discountPercent, "% de descuento"),
      paid: toDbMoney(recomputed.paid, "monto pagado"),
      balance: toDbMoney(recomputed.balance, "balance"),
      updated_at: new Date().toISOString(),
    };
    if (patch.customerName !== undefined) headerRow.customer_name = patch.customerName;
    if (patch.customerPhone !== undefined) headerRow.customer_phone = patch.customerPhone ?? null;
    if (patch.customerDocument !== undefined)
      headerRow.customer_document = patch.customerDocument ?? null;
    if (patch.notes !== undefined) headerRow.notes = patch.notes ?? null;
    // Datos operativos. `status` solo estados NO fiscales (blindaje: la
    // conversión e-CF y la anulación tienen sus propios flujos).
    if (patch.cashierName !== undefined) headerRow.cashier_name = patch.cashierName;
    if (patch.status !== undefined && isSafeEditStatus(patch.status)) {
      headerRow.status = patch.status;
    }
    if (patch.emittedAt !== undefined && patch.emittedAt) {
      const t = new Date(patch.emittedAt).getTime();
      if (!Number.isNaN(t)) headerRow.created_at = new Date(t).toISOString();
    }
    if (patch.billingType !== undefined) headerRow.billing_type = patch.billingType ?? null;

    const { data: header, error: hErr } = await sb
      .from("proformas")
      .update(headerRow)
      .eq("business_id", ctx.businessId)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (hErr) throw new SupabaseRepositoryError("proforma.updateFull:header", hErr);
    if (!header) throw new Error("Documento no encontrado o no pertenece al negocio");

    // Builders (mismo mapeo que create).
    const buildItemRow = (it: SaleItem, idx: number) => ({
      business_id: ctx.businessId,
      proforma_id: id,
      line_no: idx + 1,
      product_id: nullableUuid(it.productId),
      product_sku: it.productSku,
      product_name: it.productName,
      product_lot_id: nullableUuid(it.lotId),
      lot_number: it.lotNumber ?? null,
      quantity: toDbInt(it.quantity, "cantidad"),
      unit_price: toDbMoney(it.unitPrice, "precio unitario"),
      itbis_rate: toDbMoney(it.itbisRate, "tasa de ITBIS"),
      discount: toDbMoney(it.discount, "descuento"),
      subtotal: toDbMoney(it.subtotal, "subtotal"),
      itbis: toDbMoney(it.itbis, "ITBIS"),
      total: toDbMoney(it.total, "total"),
      kind: "bien",
    });
    // proforma_payments no tiene columna last4 → se conserva en `reference`.
    const buildPayRow = (p: Payment) => {
      const ref = [p.reference, p.last4 ? `····${p.last4}` : ""]
        .filter(Boolean)
        .join(" ")
        .trim();
      return {
        business_id: ctx.businessId,
        proforma_id: id,
        method_code: mapPaymentMethod(p.method),
        amount: toDbMoney(p.amount, "monto del pago"),
        reference: ref || null,
        user_id: userId,
        user_name: p.userName || editorName,
      };
    };

    // 2) Reemplazar ítems (borrar + insertar; restaurar viejos si falla).
    const { error: delItemsErr } = await sb
      .from("proforma_items")
      .delete()
      .eq("business_id", ctx.businessId)
      .eq("proforma_id", id);
    if (delItemsErr)
      throw new SupabaseRepositoryError("proforma.updateFull:items:del", delItemsErr);
    if (recomputed.items.length) {
      const { error: insErr } = await sb
        .from("proforma_items")
        .insert(recomputed.items.map(buildItemRow));
      if (insErr) {
        // Restaurar los ítems originales (best-effort).
        if (oldItems.length) {
          await sb.from("proforma_items").insert(oldItems.map(buildItemRow));
        }
        throw new SupabaseRepositoryError("proforma.updateFull:items:ins", insErr);
      }
    }

    // 3) Reemplazar pagos (borrar + insertar; restaurar viejos si falla).
    const { error: delPayErr } = await sb
      .from("proforma_payments")
      .delete()
      .eq("business_id", ctx.businessId)
      .eq("proforma_id", id);
    if (delPayErr)
      throw new SupabaseRepositoryError("proforma.updateFull:pay:del", delPayErr);
    if (patch.payments.length) {
      const { error: insPayErr } = await sb
        .from("proforma_payments")
        .insert(patch.payments.map(buildPayRow));
      if (insPayErr) {
        if (oldPayments.length) {
          await sb.from("proforma_payments").insert(oldPayments.map(buildPayRow));
        }
        throw new SupabaseRepositoryError("proforma.updateFull:pay:ins", insPayErr);
      }
    }

    // Re-hidratar el agregado completo.
    const itemsByProforma = await fetchItemsForProformas(sb, ctx.businessId, [id]);
    const paymentsByProforma = await fetchPaymentsForProformas(sb, ctx.businessId, [id]);
    return proformaRowToTs(
      header,
      itemsByProforma.get(id) ?? [],
      paymentsByProforma.get(id) ?? [],
    );
  },

  async cancel(ctx: RepoContext, id: string, reason: string) {
    const sb = await getClient("proforma.cancel");
    // B-03: ANULACIÓN ATÓMICA. El RPC marca la venta como cancelada Y reingresa
    // el stock de sus movimientos `exit_sale` (registrando `return_in`), todo en
    // una transacción e idempotente (si ya estaba anulada, no reingresa dos veces).
    // Antes, cancelar solo cambiaba el estado y el inventario quedaba descontado.
    const { data, error } = await sb.rpc("void_sale_atomic", {
      p_proforma_id: id,
      p_reason: reason,
    });
    if (error) {
      // P0002 = no encontrada / no pertenece al tenant (mensaje claro al usuario).
      if (/no encontrada|P0002/i.test(error.message)) {
        throw new UserFacingRepositoryError("Proforma no encontrada o no pertenece al negocio");
      }
      throw new SupabaseRepositoryError("proforma.cancel", error);
    }
    if (!data) throw new Error("Proforma no encontrada o no pertenece al negocio");
  },

  async convertToEcf(_ctx: RepoContext, _id: string) {
    // Fase G no autorizada — devolvemos mock placeholder. La conversión
    // real a e-CF (firmar XML, llamar DGII, persistir trackId) se hará en
    // la Fase G cuando los certificados y endpoints estén configurados.
    return { ecfNumber: "mock", trackId: "mock" };
  },
};

// ─── Cash register ──────────────────────────────────────────────────────────

async function fetchProformaIdsForSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  businessId: string,
  sessionId: string,
): Promise<string[]> {
  const { data, error } = await sb
    .from("proformas")
    .select("id")
    .eq("business_id", businessId)
    .eq("cash_register_session_id", sessionId);
  if (error)
    throw new SupabaseRepositoryError(
      "cashRegister.proformaIds:fetch",
      error,
    );
  return (data ?? []).map((r: { id: string }) => r.id);
}

/**
 * Garantiza que una sucursal tenga su caja registradora interna y devuelve su
 * `id`. El usuario NUNCA configura cajas: si la sucursal no tiene una, se crea
 * automáticamente (code determinista `auto-<branchId>`, `is_active`), de forma
 * idempotente y segura ante carreras (unique business_id+code → 23505).
 */
export async function ensureCashRegisterForBranch(
  sb: Awaited<ReturnType<typeof getClient>>,
  businessId: string,
  branchId: string,
): Promise<string> {
  const { data: existing, error: selErr } = await sb
    .from("cash_registers")
    .select("id")
    .eq("business_id", businessId)
    .eq("branch_id", branchId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (selErr) failRepo("cashRegister.ensure:select", selErr);
  if (existing) return existing.id as string;

  const code = `auto-${branchId}`;
  const { data: created, error: insErr } = await sb
    .from("cash_registers")
    .insert({
      business_id: businessId,
      branch_id: branchId,
      code,
      name: "Caja",
      is_active: true,
    })
    .select("id")
    .single();
  if (!insErr) return created.id as string;

  // Carrera: otro request la creó primero (unique business_id+code).
  if (pgErrorCode(insErr) === "23505") {
    const { data: again, error: againErr } = await sb
      .from("cash_registers")
      .select("id")
      .eq("business_id", businessId)
      .eq("code", code)
      .maybeSingle();
    if (againErr) failRepo("cashRegister.ensure:reselect", againErr);
    if (again) return again.id as string;
  }
  failRepo("cashRegister.ensure:insert", insErr);
}

export const cashRegisterRepository: CashRegisterRepository = {
  async current(ctx: RepoContext) {
    const sb = await getClient("cashRegister.current");
    const { data, error } = await sb
      .from("cash_register_sessions")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("cashRegister.current", error);
    if (!data) return null;
    const proformaIds = await fetchProformaIdsForSession(
      sb,
      ctx.businessId,
      data.id,
    );
    return cashSessionRowToTs(data, proformaIds);
  },

  async history(ctx: RepoContext, limit = 20) {
    const sb = await getClient("cashRegister.history");
    const { data, error } = await sb
      .from("cash_register_sessions")
      .select("*")
      .eq("business_id", ctx.businessId)
      .order("opened_at", { ascending: false })
      .limit(limit);
    if (error) throw new SupabaseRepositoryError("cashRegister.history", error);
    const sessions: CashRegisterSession[] = [];
    for (const row of data ?? []) {
      const ids = await fetchProformaIdsForSession(
        sb,
        ctx.businessId,
        row.id,
      );
      sessions.push(cashSessionRowToTs(row, ids));
    }
    return sessions;
  },

  async open(ctx: RepoContext, openingAmount: number) {
    const sb = await getClient("cashRegister.open");

    // Validaciones con mensaje amigable (nunca técnico).
    if (!ctx.branchId) {
      throw new UserFacingRepositoryError(
        "No se pudo abrir la caja. Verifica la sucursal seleccionada.",
      );
    }
    if (!ctx.userId) {
      throw new UserFacingRepositoryError(
        "No se pudo abrir la caja. Tu usuario no tiene permisos suficientes.",
      );
    }

    // Una sola caja abierta por sucursal: si ya hay una, mensaje accionable.
    const { data: openSes, error: openErr } = await sb
      .from("cash_register_sessions")
      .select("id")
      .eq("business_id", ctx.businessId)
      .eq("branch_id", ctx.branchId)
      .eq("status", "open")
      .limit(1)
      .maybeSingle();
    if (openErr) failRepo("cashRegister.open:check", openErr);
    if (openSes) {
      throw new UserFacingRepositoryError(
        "Ya existe una caja abierta para esta sucursal.",
      );
    }

    // La caja registradora es interna: el usuario NUNCA la configura. Si la
    // sucursal no tiene una, se crea automáticamente (idempotente). Esta era la
    // causa del error al abrir caja: no existía `cash_registers` para la sucursal.
    const cashRegisterId = await ensureCashRegisterForBranch(
      sb,
      ctx.businessId,
      ctx.branchId,
    );

    // Nombre del cajero (rellenar via tabla users).
    const { data: u } = await sb
      .from("users")
      .select("full_name")
      .eq("id", ctx.userId)
      .maybeSingle();
    const cashierName: string = u?.full_name ?? "Cajero";

    const row = {
      business_id: ctx.businessId,
      branch_id: ctx.branchId,
      cash_register_id: cashRegisterId,
      session_number: generateSessionNumber(),
      opened_by: ctx.userId,
      opened_by_name: cashierName,
      opening_amount: openingAmount,
      expected_cash: openingAmount,
      status: "open" as const,
      totals: {},
    };

    const { data, error } = await sb
      .from("cash_register_sessions")
      .insert(row)
      .select("*")
      .single();
    if (error) failRepo("cashRegister.open", error);
    return cashSessionRowToTs(data, []);
  },

  async close(ctx: RepoContext, sessionId: string, countedCash: number) {
    const sb = await getClient("cashRegister.close");

    // Necesitamos la sesión actual para calcular expected_cash y difference.
    const { data: current, error: e1 } = await sb
      .from("cash_register_sessions")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("id", sessionId)
      .maybeSingle();
    if (e1) throw new SupabaseRepositoryError("cashRegister.close:fetch", e1);
    if (!current)
      throw new SupabaseRepositoryError(
        "cashRegister.close: sesión no encontrada",
      );

    const expected = Number(current.expected_cash ?? 0);
    const difference = countedCash - expected;

    const { data, error } = await sb
      .from("cash_register_sessions")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        closed_by: ctx.userId ?? null,
        counted_cash: countedCash,
        difference_amount: difference,
        updated_at: new Date().toISOString(),
      })
      .eq("business_id", ctx.businessId)
      .eq("id", sessionId)
      .eq("status", "open")
      .select("*")
      .maybeSingle();
    if (error) throw new SupabaseRepositoryError("cashRegister.close", error);
    if (!data)
      throw new SupabaseRepositoryError(
        "cashRegister.close: la sesión no existe o ya fue cerrada",
      );
    const proformaIds = await fetchProformaIdsForSession(
      sb,
      ctx.businessId,
      sessionId,
    );
    return cashSessionRowToTs(data, proformaIds);
  },

  async movements(ctx: RepoContext, sessionId: string) {
    const sb = await getClient("cashRegister.movements");
    const { data, error } = await sb
      .from("cash_movements")
      .select("*")
      .eq("business_id", ctx.businessId)
      .eq("cash_register_session_id", sessionId)
      .order("created_at", { ascending: false });
    if (error) throw new SupabaseRepositoryError("cashRegister.movements", error);
    return (data ?? []).map(cashMovementRowToTs);
  },

  async addMovement(
    ctx: RepoContext,
    input: {
      sessionId: string;
      type: CashMovementType;
      amount: number;
      method?: PaymentMethod;
      reason?: string;
    },
  ) {
    const sb = await getClient("cashRegister.addMovement");
    if (!ctx.branchId) {
      throw new UserFacingRepositoryError(
        "No se pudo registrar el movimiento. Verifica la sucursal seleccionada.",
      );
    }
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new UserFacingRepositoryError(
        "El monto del movimiento debe ser mayor a cero.",
      );
    }
    let createdByName: string | null = null;
    if (ctx.userId) {
      const { data: u } = await sb
        .from("users")
        .select("full_name")
        .eq("id", ctx.userId)
        .maybeSingle();
      createdByName = u?.full_name ?? null;
    }
    const row = {
      business_id: ctx.businessId,
      branch_id: ctx.branchId,
      cash_register_session_id: input.sessionId,
      type: input.type,
      method: input.method ?? "cash",
      amount: toDbMoney(input.amount),
      reason: input.reason?.trim() || null,
      created_by: ctx.userId ?? null,
      created_by_name: createdByName,
    };
    const { data, error } = await sb
      .from("cash_movements")
      .insert(row)
      .select("*")
      .single();
    if (error) failRepo("cashRegister.addMovement", error);
    return cashMovementRowToTs(data);
  },
};

/** Mapea una fila `cash_movements` al tipo de dominio. */
function cashMovementRowToTs(row: Record<string, unknown>): CashMovement {
  return {
    id: String(row.id),
    businessId: String(row.business_id),
    branchId: String(row.branch_id),
    cashRegisterSessionId: String(row.cash_register_session_id),
    type: row.type as CashMovementType,
    method: (row.method as PaymentMethod) ?? "cash",
    amount: Number(row.amount ?? 0),
    reason: (row.reason as string | null) ?? undefined,
    createdById: (row.created_by as string | null) ?? undefined,
    createdByName: (row.created_by_name as string | null) ?? undefined,
    createdAt: String(row.created_at),
  };
}

