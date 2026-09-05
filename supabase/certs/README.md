# Certificado raíz de Supabase

`supabase-root-2021-ca.crt` es el **CA raíz público** «Supabase Root 2021 CA»
(huella SHA-256 `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`,
válido 2021-04-28 → 2031-04-26). No es un secreto: es lo que hace falta para
conectar a la base con TLS **verificado** (`scripts/db/apply-migration.mjs`).
Obtenido el 2026-09-05 de la cadena que presenta `aws-1-us-east-2.pooler.supabase.com:5432`
y cotejado por huella con una copia pública independiente.
