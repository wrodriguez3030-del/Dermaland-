-- Umbral de vida útil al recibir: 90 días para todos los laboratorios.
--
-- Decisión del negocio (2026-08-06): un lote que llegue con menos de 90 días
-- hasta su vencimiento debe generar la alerta al recibirlo.
--
-- Hasta ahora solo 1 de 80 laboratorios (A-Derma, ya en 90) tenía el umbral
-- configurado, así que la regla estaba inerte en los otros 79: `null` significa
-- "sin regla" y no advertía nada. Ver la ayuda del campo en
-- `productos/laboratorios`: "Al recibir, se advierte si el lote vence en menos
-- de estos días (ej. 90). Vacío = sin regla."
--
-- Solo rellena los que están vacíos: NUNCA sobreescribe un umbral ya fijado a
-- mano, porque un valor distinto de 90 sería una decisión deliberada para ese
-- proveedor. Idempotente: re-ejecutar no cambia nada.

update laboratories
set min_shelf_life_days = 90, updated_at = now()
where min_shelf_life_days is null;
