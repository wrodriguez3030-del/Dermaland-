/**
 * Extrae de un archivo .sql los objetos que DECLARA, para poder preguntarle a
 * la base si existen. El historial de migraciones de DermaLand no es fiable
 * (ver docs/superpowers/specs/2026-08-05-cierre-pendientes-produccion-design.md
 * §5), así que la fuente de verdad es la base, no el registro.
 *
 * Es un extractor por expresiones regulares, no un parser de SQL: suficiente
 * para una lista de comprobación, insuficiente para ejecutar nada. Por eso el
 * resultado se PRESENTA para autorización humana y nunca se aplica solo.
 */

/** Quita comentarios `--` de línea y `/* *\/` de bloque. */
export function stripSqlComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");
}

/**
 * `public.` se recorta del nombre (el resto del modulo y los reportes
 * asumen public como default implicito). Cualquier OTRO esquema explicito
 * (p.ej. `storage`, por las policies de buckets de Storage — ver
 * 0046_dgii_xml_storage.sql / product_images_storage_bucket) se CONSERVA en
 * el nombre en vez de perderse: antes, `on storage.objects` capturaba
 * "storage" como si fuera el nombre de tabla y perdia ".objects" — el
 * `fingerprint()` de `scripts/audit-migrations.mjs` nunca podia encontrar esa
 * clave y la migracion salia NO_APLICADA/PARCIAL aunque SI estuviera
 * aplicada (falso negativo: le dice a un humano "esto no se aplico" cuando
 * si se aplico, invitando a reaplicarlo).
 */
function qualify(schema, name) {
  return schema && schema !== "public" ? `${schema}.${name}` : name;
}

const PATTERNS = [
  {
    kind: "table",
    re: /\bcreate\s+table\s+(?:if\s+not\s+exists\s+)?(?:([a-z0-9_]+)\.)?"?([a-z0-9_]+)"?/gi,
    name: (m) => qualify(m[1], m[2]),
  },
  // `function`, `index` y las columnas de ALTER TABLE (mas abajo) se
  // dejaron SOLO conscientes de `public` a proposito: ninguna migracion real
  // crea una funcion/indice/columna en otro esquema hoy (solo tocamos
  // `storage` con buckets + policies, que ya cubren `table` y `policy`
  // arriba). Si algun dia una migracion declara uno de estos en un esquema
  // no-public, va a repetir la MISMA clase de falso negativo que tenia
  // `policy` — aplicar aqui el mismo patron `qualify()`.
  {
    kind: "function",
    re: /\bcreate\s+(?:or\s+replace\s+)?function\s+(?:public\.)?"?([a-z0-9_]+)"?/gi,
    name: (m) => m[1],
  },
  {
    kind: "policy",
    re: /\bcreate\s+policy\s+"?([^"\n]+?)"?\s+on\s+(?:([a-z0-9_]+)\.)?"?([a-z0-9_]+)"?/gi,
    name: (m) => `${qualify(m[2], m[3])}.${m[1]}`,
  },
  {
    kind: "index",
    re: /\bcreate\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?\s+on\b/gi,
    name: (m) => m[1],
  },
];

/**
 * Las columnas se extraen en dos etapas porque un `alter table` real trae
 * varias cláusulas `add column` separadas por comas en la misma sentencia
 * (ver 0014_billing_settings_ecf.sql, 0019_sale_seller.sql). Un patrón de una
 * sola pasada solo capturaba la primera cláusula y perdía el resto.
 */
const ALTER_TABLE_RE =
  /\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?(?:public\.)?"?([a-z0-9_]+)"?\s+([\s\S]*?)(?:;|$)/gid;
const ADD_COLUMN_RE = /\badd\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/gi;

/** Objetos declarados por el SQL, en orden de aparición y sin repetidos. */
export function extractObjects(sql) {
  const limpio = stripSqlComments(sql);
  const hallazgos = [];
  for (const { kind, re, name } of PATTERNS) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(limpio)) !== null) {
      hallazgos.push({ kind, name: name(m), at: m.index });
    }
  }

  ALTER_TABLE_RE.lastIndex = 0;
  let stmt;
  while ((stmt = ALTER_TABLE_RE.exec(limpio)) !== null) {
    const tabla = stmt[1];
    const cuerpo = stmt[2];
    const [cuerpoInicio] = stmt.indices[2];
    ADD_COLUMN_RE.lastIndex = 0;
    let col;
    while ((col = ADD_COLUMN_RE.exec(cuerpo)) !== null) {
      hallazgos.push({
        kind: "column",
        name: `${tabla}.${col[1]}`,
        at: cuerpoInicio + col.index,
      });
    }
  }

  hallazgos.sort((a, b) => a.at - b.at);
  const vistos = new Set();
  const salida = [];
  for (const { kind, name } of hallazgos) {
    const clave = `${kind}:${name}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push({ kind, name });
  }
  return salida;
}

/**
 * PARCIAL es el veredicto que justifica todo este ejercicio: marcar como
 * "aplicada" una migración a medias convierte un problema visible en invisible.
 */
export function classify(objects, existing) {
  if (objects.length === 0) return "INDETERMINADA";
  const presentes = objects.filter((o) => existing.has(`${o.kind}:${o.name}`)).length;
  if (presentes === objects.length) return "APLICADA";
  if (presentes === 0) return "NO_APLICADA";
  return "PARCIAL";
}
