import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TABLAS_LEGACY, nombreLegacy } from "./tablas";
import { TABLAS_NUEVAS } from "./tablas";
import { INVOICE_STATUSES } from "../core/submission-state-types";

const MIGRACIONES = resolve(process.cwd(), "..", "..", "supabase", "migrations");
const leer = (f: string) => readFileSync(resolve(MIGRACIONES, f), "utf8");
const RETIRADA = "20260906090000_dgii_fase2_retirada_legacy.sql";

describe("fase 2 — migración de retirada", () => {
  const sql = leer(RETIRADA);
  const codigo = sql.replace(/--.*$/gm, "");

  it("renombra las 13 tablas viejas, exactamente las de TABLAS_LEGACY, ni una más ni una menos", () => {
    // El renombrado va en un bucle con `format()`, así que el nombre nuevo no
    // aparece literal en el fichero: lo que se comprueba es que sea exactamente
    // la lista TABLAS_LEGACY, con `format()` construyendo el sufijo con fecha.
    const bloque = codigo.slice(codigo.indexOf("viejas text[]"), codigo.indexOf("end $$;"));

    // Extraer los nombres entrecomillados del arreglo `viejas text[]`
    const match = bloque.match(/array\[([\s\S]*?)\]/);
    expect(match, "no encontró array[ ]").toBeTruthy();
    const nombresEnSQL = (match![1]!)
      .split(",")
      .map(s => s.trim().replace(/^'|'$/g, ""))
      .filter(s => s.length > 0)
      .sort();

    // Comparar exactamente con TABLAS_LEGACY
    expect(nombresEnSQL).toEqual([...TABLAS_LEGACY].sort());

    expect(bloque).toMatch(/format\('alter table public\.%I rename to %I'/);
    expect(bloque).toMatch(/'_legacy_20260906'/);
    expect(nombreLegacy("dgii_logs")).toBe("dgii_logs_legacy_20260906");
  });

  it("NO borra nada: un módulo que nunca emitió puede hacer falta para explicar el pasado", () => {
    expect(codigo).not.toMatch(/drop\s+table/i);
    expect(codigo).not.toMatch(/truncate/i);
    expect(codigo).not.toMatch(/drop\s+column/i);
    expect(codigo).not.toMatch(/delete\s+from/i);
  });

  it("suelta las dos claves foráneas de tablas VIVAS: si no se sueltan quedarían apuntando a la tabla retirada en vez de a la nueva", () => {
    expect(codigo).toMatch(/alter table public\.proformas\s+drop constraint if exists proformas_electronic_invoice_fk/i);
    expect(codigo).toMatch(/alter table public\.cash_closing_sales\s+drop constraint if exists cash_closing_sales_electronic_invoice_fk/i);
  });

  it("no toca ninguna tabla intocable: las 13 del pliego no aparecen en el arreglo viejas", () => {
    // Las 13 tablas intocables del pliego de restricciones globales
    const intocables = [
      "invoice_numberings",
      "reserve_invoice_number",
      "proformas",
      "proforma_items",
      "proforma_payments",
      "cash_closings",
      "cash_closing_sales",
      "billing_settings",
      "proforma_counters",
      "next_proforma_number",
      "payment_methods",
      "cash_registers",
      "cash_register_sessions",
    ];

    // Extraer el arreglo `viejas text[]` del SQL
    const bloque = codigo.slice(codigo.indexOf("viejas text[]"), codigo.indexOf("end $$;"));
    const match = bloque.match(/array\[([\s\S]*?)\]/);
    expect(match, "no encontró array[ ] en el bloque viejas").toBeTruthy();
    const nombresEnViejas = (match![1]!)
      .split(",")
      .map(s => s.trim().replace(/^'|'$/g, ""))
      .filter(s => s.length > 0);

    // Verificar que ninguna tabla intocable está en viejas
    for (const t of intocables) {
      expect(nombresEnViejas, `tabla intocable '${t}' aparece en viejas`).not.toContain(t);
    }
  });

  it("es idempotente: correrla dos veces no puede reventar", () => {
    // Cada renombrado va dentro de un `do $$ ... if exists ... end $$`.
    const renombrados = codigo.match(/rename to/gi) ?? [];
    const guardas = codigo.match(/to_regclass/gi) ?? [];
    expect(guardas.length, "cada renombrado necesita su guarda to_regclass").toBeGreaterThanOrEqual(renombrados.length);
  });
});

describe("fase 2 — migración de tablas", () => {
  const sql = leer("20260906090100_dgii_fase2_tablas.sql");
  const codigo = sql.replace(/--.*$/gm, "");

  /** El `create table` de una tabla concreta, hasta su `);` de cierre. */
  const bloqueDeTabla = (t: string) => {
    const i = codigo.search(new RegExp(`create table if not exists public\\.${t}\\s*\\(`, "i"));
    expect(i, `no encontró el create table de ${t}`).toBeGreaterThan(-1);
    const resto = codigo.slice(i);
    const fin = resto.indexOf("\n);");
    return fin === -1 ? resto : resto.slice(0, fin);
  };

  it("crea las 17 tablas", () => {
    for (const t of TABLAS_NUEVAS) {
      expect(codigo, `falta ${t}`).toMatch(
        new RegExp(`create table if not exists public\\.${t}\\s*\\(`, "i"),
      );
    }
  });

  it("TODAS llevan RLS: una tabla fiscal sin RLS es una fuga entre empresas", () => {
    for (const t of TABLAS_NUEVAS) {
      expect(codigo, `${t} sin enable row level security`).toMatch(
        new RegExp(`alter table public\\.${t} enable row level security`, "i"),
      );
      expect(codigo, `${t} sin política`).toMatch(
        new RegExp(`create policy \\w+ on public\\.${t}`, "i"),
      );
    }
  });

  it("las políticas filtran por business_id con el ayudante de DermaLand", () => {
    const politicas = codigo.match(/create policy[\s\S]*?;/gi) ?? [];
    expect(politicas.length).toBeGreaterThanOrEqual(TABLAS_NUEVAS.length);
    for (const p of politicas) {
      expect(p, `política sin business_id: ${p.slice(0, 70)}`).toMatch(/business_id\s*=\s*auth_business_id\(\)/i);
    }
    // agendapp usa otro ayudante; si se cuela, la política no filtra nada aquí.
    expect(codigo).not.toMatch(/current_user_business_id/i);
  });

  it("el e-NCF lleva su forma en la base, no solo en el código", () => {
    expect(codigo).toMatch(/e_ncf\s+varchar\(13\)\s+not null\s+check\s*\(e_ncf ~ '\^\[A-Z\]\[0-9\]\{12\}\$'\)/i);
    expect(codigo).toMatch(/constraint electronic_invoices_encf_uniq unique \(business_id, ambiente, e_ncf\)/i);
  });

  it("el ambiente entra en la llave única: probar un e-NCF no puede impedir emitirlo", () => {
    // Sin `ambiente` en el UNIQUE, emitir E320000000001 en testecf bloquearía
    // emitirlo de verdad en ecf. Es el error que agendapp documentó.
    const uniq = codigo.match(/unique \(business_id, ambiente, e_ncf\)/i);
    expect(uniq, "la llave única de e_ncf debe incluir el ambiente").not.toBeNull();
  });

  it("los 11 tipos de e-CF son los mismos que conoce el constructor portado", () => {
    expect(codigo).toMatch(/tipo_ecf in \('31','32','33','34','41','42','43','44','45','46','47'\)/i);
  });

  it("el CHECK de `status` es exactamente INVOICE_STATUSES, sin que falte `prepared`", () => {
    // C1 de la revisión final. La máquina de estados de la fase 1 tiene 12
    // estados y `prepared` es el único camino no terminal que sale de `signed`
    // (`submission-state-machine.ts:17-18`). El CHECK traía 11: sin `prepared`,
    // el primer `update ... set status='prepared'` de la fase 3 recibe un 23514
    // y la factura se queda en `signed` con su e-NCF ya gastado — el número
    // quemado sin explicación que esta fase existe para evitar.
    // Acotado al bloque de `electronic_invoices`: hay otros `check (status in
    // (...))` antes en el fichero (`ecf_sequences`, entre ellos).
    const bloque = bloqueDeTabla("electronic_invoices");
    const m = /check \(status in \(([\s\S]*?)\)\)/i.exec(bloque);
    expect(m, "no encontró el CHECK de status de electronic_invoices").toBeTruthy();
    const enSql = [...m![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1]!);
    expect(enSql).toEqual([...INVOICE_STATUSES]);
  });

  it("no crea nada con el nombre de una tabla intocable", () => {
    for (const t of ["invoice_numberings", "proformas", "cash_closing_sales"]) {
      expect(codigo).not.toMatch(new RegExp(`create table if not exists public\\.${t}\\b`, "i"));
    }
  });
});

describe("fase 2 — reserve_next_encf", () => {
  const sql = leer("20260906090200_dgii_fase2_funciones.sql");
  const codigo = sql.replace(/--.*$/gm, "");

  it("bloquea la fila antes de tocarla: sin FOR UPDATE dos cajas sacan el mismo número", () => {
    const fn = codigo.slice(codigo.indexOf("function reserve_next_encf"));
    expect(fn.slice(0, fn.indexOf("$$;"))).toMatch(/for update/i);
  });

  it("valida ambiente y tipo antes de mirar la secuencia", () => {
    expect(codigo).toMatch(/p_ambiente not in \('testecf','certecf','ecf'\)/i);
    expect(codigo).toMatch(/p_tipo_ecf not in \('31','32'/i);
  });

  it("da error distinto para cada motivo: sin secuencia, vencida y agotada", () => {
    expect(codigo).toMatch(/errcode = 'P0002'/);  // no hay secuencia activa
    expect(codigo).toMatch(/errcode = 'P0003'/);  // vencida
    expect(codigo).toMatch(/errcode = 'P0004'/);  // rango agotado
  });

  it("marca la secuencia vencida o agotada en vez de dejarla activa mintiendo", () => {
    expect(codigo).toMatch(/set status = 'expired'/i);
    expect(codigo).toMatch(/status\s*=\s*'exhausted'/i);
  });

  it("arma el e-NCF con el formato que valida el XSD: E + tipo + 10 dígitos", () => {
    expect(codigo).toMatch(/'E' \|\| p_tipo_ecf \|\| lpad\(v_next::text, 10, '0'\)/);
  });

  it("no la puede llamar un usuario del navegador: quemar números sería un ataque trivial", () => {
    expect(codigo).toMatch(/security definer/i);
    expect(codigo).toMatch(/revoke execute on function reserve_next_encf\(uuid, text, text\) from public, anon, authenticated/i);
  });
});

describe("fase 2 — preparar sin quemar números", () => {
  const codigo = leer("20260906090200_dgii_fase2_funciones.sql").replace(/--.*$/gm, "");

  it("peek NO consume: si mirara y consumiera, firmar mal quemaría el número", () => {
    const fn = codigo.slice(codigo.indexOf("function public.peek_next_encf"));
    const cuerpo = fn.slice(0, fn.indexOf("$$;"));
    expect(cuerpo).not.toMatch(/update\s+public\.ecf_sequences/i);
    expect(cuerpo).not.toMatch(/for update/i);   // ni siquiera bloquea
  });

  it("prepare comprueba que el número sigue siendo el nuestro ANTES de consumirlo", () => {
    const fn = codigo.slice(codigo.indexOf("function public.prepare_ecf_invoice"));
    const cuerpo = fn.slice(0, fn.indexOf("$$;"));
    expect(cuerpo).toMatch(/for update/i);
    expect(cuerpo).toMatch(/p_expected_encf/);
    expect(cuerpo).toMatch(/ENCF_TOMADO/);
    // El orden manda: bloquear, comparar, y sólo entonces reservar.
    expect(cuerpo.indexOf("for update")).toBeLessThan(cuerpo.indexOf("reserve_next_encf"));
    expect(cuerpo.indexOf("p_expected_encf")).toBeLessThan(cuerpo.indexOf("reserve_next_encf"));
  });

  it("una carrera devuelve un no, no una excepción: la aplicación tiene que reintentar", () => {
    const fn = codigo.slice(codigo.indexOf("function public.prepare_ecf_invoice"));
    const cuerpo = fn.slice(0, fn.indexOf("$$;"));
    const bloque = cuerpo.slice(cuerpo.indexOf("ENCF_TOMADO") - 400, cuerpo.indexOf("ENCF_TOMADO") + 200);
    expect(bloque).toMatch(/return jsonb_build_object/i);
    expect(bloque).not.toMatch(/raise exception/i);
  });

  it("idempotencia por proforma: dos cobros de la misma proforma no sacan dos comprobantes", () => {
    const fn = codigo.slice(codigo.indexOf("function public.prepare_ecf_invoice"));
    const cuerpo = fn.slice(0, fn.indexOf("$$;"));
    expect(cuerpo).toMatch(/from public\.proformas[\s\S]{0,200}for update/i);
    expect(cuerpo).toMatch(/IDEMPOTENT_PROFORMA_YA_FACTURADA/);
    expect(cuerpo.indexOf("IDEMPOTENT_PROFORMA_YA_FACTURADA")).toBeLessThan(cuerpo.indexOf("reserve_next_encf"));
  });

  it("la factura nace en `draft` y sólo finalize la pasa a `signed`", () => {
    const prep = codigo.slice(codigo.indexOf("function public.prepare_ecf_invoice"));
    expect(prep.slice(0, prep.indexOf("$$;"))).toMatch(/'draft'/);
    const fin = codigo.slice(codigo.indexOf("function public.finalize_ecf_invoice"));
    expect(fin.slice(0, fin.indexOf("$$;"))).toMatch(/status\s*=\s*'signed'/i);
  });

  it("fail deja el motivo escrito: un comprobante que falló sin motivo no se puede resolver", () => {
    const fn = codigo.slice(codigo.indexOf("function public.fail_ecf_invoice"));
    const cuerpo = fn.slice(0, fn.indexOf("$$;"));
    expect(cuerpo).toMatch(/status\s*=\s*'error'/i);
    expect(cuerpo).toMatch(/dgii_status_message/);
  });

  it("fail comprueba row_count antes de decir que sí: un invoice_id ajeno o inexistente no puede devolver éxito", () => {
    // Hallazgo de revisión (ronda 1): el UPDATE de fail_ecf_invoice no
    // comprobaba row_count, a diferencia de finalize_ecf_invoice. Sin esto,
    // llamarla con un business_id de otra empresa (o un invoice_id que no
    // existe) devolvía {"ok":true} sin haber tocado ninguna fila: la factura
    // real se queda en 'draft' sin motivo y el número ya consumido queda sin
    // nadie que lo explique — justo lo que esta función existe para impedir.
    const fn = codigo.slice(codigo.indexOf("function public.fail_ecf_invoice"));
    const cuerpo = fn.slice(0, fn.indexOf("$$;"));

    expect(cuerpo).toMatch(/get diagnostics\s+v_\w+\s*=\s*row_count/i);
    expect(cuerpo).toMatch(/if\s+v_\w+\s*=\s*0\s+then/i);

    // Orden: el UPDATE corre, LUEGO se mira row_count, LUEGO (si fue 0) se
    // devuelve un "ok":false — antes del "ok":true final, no después.
    const idxUpdate      = cuerpo.search(/update\s+public\.electronic_invoices/i);
    const idxDiagnostics = cuerpo.search(/get diagnostics/i);
    const idxSiCero      = cuerpo.search(/if\s+v_\w+\s*=\s*0\s+then/i);
    const idxOkFalse      = cuerpo.indexOf("'ok', false");
    const idxOkTrue        = cuerpo.indexOf("'ok', true");

    expect(idxUpdate).toBeGreaterThan(-1);
    expect(idxDiagnostics).toBeGreaterThan(idxUpdate);
    expect(idxSiCero).toBeGreaterThan(idxDiagnostics);
    expect(idxOkFalse).toBeGreaterThan(idxSiCero);
    expect(idxOkFalse).toBeLessThan(idxOkTrue);
  });

  it("las cuatro filtran por business_id: ninguna puede tocar otra empresa", () => {
    for (const f of ["peek_next_encf", "prepare_ecf_invoice", "finalize_ecf_invoice", "fail_ecf_invoice"]) {
      const fn = codigo.slice(codigo.indexOf(`function public.${f}`));
      expect(fn.slice(0, fn.indexOf("$$;")), `${f} no filtra por business_id`).toMatch(/business_id\s*=\s*p_business_id/);
    }
  });

  it("ninguna es llamable desde el navegador", () => {
    for (const f of ["peek_next_encf(uuid, text, text)", "prepare_ecf_invoice(uuid, text, jsonb, jsonb)",
                     "finalize_ecf_invoice(uuid, uuid, jsonb)", "fail_ecf_invoice(uuid, uuid, text)"]) {
      expect(codigo, `falta el revoke de ${f}`).toMatch(
        new RegExp(`revoke execute on function public\\.${f.replace(/[()]/g, "\\$&")} from public, anon, authenticated`, "i"),
      );
    }
  });

  it("las dos claves foráneas vuelven, apuntando a la tabla NUEVA", () => {
    expect(codigo).toMatch(/alter table public\.proformas[\s\S]{0,200}references public\.electronic_invoices\(id\)/i);
    expect(codigo).toMatch(/alter table public\.cash_closing_sales[\s\S]{0,200}references public\.electronic_invoices\(id\)/i);
  });

  it("secuencia agotada pero todavía marcada 'active': NO inventa un ENCF_TOMADO, deja que reserve_next_encf la agote de verdad", () => {
    // Hueco del pliego (detectado antes de implementar, no en revisión): el
    // SELECT que bloquea la secuencia miraba status='active' pero no
    // range_end. Si la secuencia estuviera agotada y aun así marcada activa,
    // v_actual se habría construido con un número fuera de rango y la función
    // habría devuelto ENCF_TOMADO con un e_ncf_actual que no existe — confuso,
    // aunque inofensivo porque reserve_next_encf después habría levantado
    // P0004 igual. La corrección: traer range_end bajo el mismo FOR UPDATE y
    // sólo construir/comparar el e-NCF esperado cuando next_number sigue
    // dentro de rango; si no, cae al camino normal (reserve_next_encf, que sí
    // sabe marcar 'exhausted' y levantar P0004 con el motivo correcto).
    const fn = codigo.slice(codigo.indexOf("function public.prepare_ecf_invoice"));
    const cuerpo = fn.slice(0, fn.indexOf("$$;"));

    // range_end viaja en el mismo SELECT ... FOR UPDATE que next_number: sin
    // eso no hay forma de saber, bajo el mismo bloqueo, si next_number sigue
    // dentro de rango.
    expect(cuerpo).toMatch(/select\s+id,\s*next_number,\s*range_end\s+into\s+v_seq_id,\s*v_next,\s*v_range_end/i);
    expect(cuerpo).toMatch(/select\s+id,\s*next_number,\s*range_end\s+into\s+v_seq_id,\s*v_next,\s*v_range_end[\s\S]{0,400}for update/i);

    // La guarda contra el rango existe y decide ANTES de construir v_actual:
    // así nunca se arma un e-NCF "esperado" con un número fuera de rango.
    const idxGuarda  = cuerpo.search(/if\s+v_next\s*<=\s*v_range_end\s+then/i);
    const idxVActual = cuerpo.indexOf("v_actual := ");
    const idxTomado  = cuerpo.indexOf("ENCF_TOMADO");
    const idxReserve = cuerpo.indexOf("reserve_next_encf");
    expect(idxGuarda, "falta el `if v_next <= v_range_end then` que envuelve ENCF_TOMADO").toBeGreaterThan(-1);
    expect(idxGuarda).toBeLessThan(idxVActual);
    expect(idxVActual).toBeLessThan(idxTomado);
    expect(idxTomado).toBeLessThan(idxReserve);
  });
});
