#!/usr/bin/env bash
# Regenera `apps/web/src/lib/dgii/dgii-locations-data.ts` desde el XSD
# oficial e-CF 32. Se ejecuta cada vez que DGII publique un XSD actualizado
# con nuevas provincias/municipios.
#
# Uso:
#   bash scripts/extract-dgii-locations.sh
#
# Pre-requisitos:
#   - docs/dgii/xsd/e-CF-32-v1.0.xsd presente.
#   - awk, grep, sed disponibles (cualquier Linux/macOS/git-bash en Windows).

set -euo pipefail

XSD="docs/dgii/xsd/e-CF-32-v1.0.xsd"
OUT="apps/web/src/lib/dgii/dgii-locations-data.ts"

if [[ ! -f "$XSD" ]]; then
  echo "❌ No se encontró $XSD. Descárgalo del portal DGII primero." >&2
  exit 1
fi

count=$(grep -E 'value= *"[0-9]{6}"' "$XSD" | wc -l)
echo "Encontradas $count entradas en $XSD"

grep -E 'value= *"[0-9]{6}"' "$XSD" \
  | sed -E 's/.*value= *"([0-9]{6})".*<!--[[:space:]]*(.*[^[:space:]])[[:space:]]*-->.*/\1\t\2/' \
  | awk -F'\t' \
    -v count="$count" \
    'BEGIN {
       print "// AUTO-GENERADO desde docs/dgii/xsd/e-CF-32-v1.0.xsd. NO editar a mano.";
       print "// Fuente: DGII (códigos territoriales). Regenerar con scripts/extract-dgii-locations.sh.";
       print "// Total: " count " entradas extraídas del XSD oficial DGII e-CF v.1.0.";
       print "";
       print "import type { DrLocation } from \"./dr-locations\";";
       print "";
       print "export const DGII_LOCATION_DATA: ReadonlyArray<DrLocation> = [";
     }
     {
       c=$1; n=$2;
       gsub(/"/, "\\\"", n);
       type = (substr(c,3,4)=="0000") ? "provincia" : (substr(c,5,2)=="00") ? "municipio" : "distrito";
       provinceCode = substr(c,1,2) "0000";
       printf "  { code: \"%s\", provinceCode: \"%s\", name: \"%s\", type: \"%s\" },\n", c, provinceCode, n, type;
     }
     END {
       print "];";
     }' \
  > "$OUT"

echo "✅ Generado: $OUT"
wc -l "$OUT"
