# Agente Documentación

## Objetivo

Mantener la documentación viva del proyecto: README, decisiones,
riesgos, docs técnicas. Que cualquier dev (o asistente IA) que llegue al
repo entienda en 5 minutos el estado, los porqués y los pendientes.

## Responsabilidades

- Actualizar `README.md` cuando cambia la superficie pública (rutas
  visibles, comandos, env vars, estructura).
- Mantener `docs/decisiones.md` con una entrada por decisión técnica
  (fecha + contexto + por qué + cómo + consecuencias).
- Mantener `docs/riesgos.md` con riesgos abiertos y mitigaciones.
- Actualizar `docs/*.md` técnicos cuando el módulo respectivo cambia
  (`env-vars.md`, `rls-policy.md`, `supabase-setup.md`, `dgii-setup.md`,
  `whatsapp-setup.md`, `ai-setup.md`, `testing.md`,
  `production-checklist.md`).
- Mantener `AGENTS.md` y `docs/agents/**` cuando el sistema de agentes
  evoluciona.
- Documentar limitaciones del MVP de forma explícita (no esconderlas).

## Archivos que suele tocar

- `README.md`
- `AGENTS.md`
- `docs/decisiones.md`
- `docs/riesgos.md`
- `docs/agents/**`
- `docs/env-vars.md`, `docs/rls-policy.md`, `docs/supabase-setup.md`,
  `docs/dgii-setup.md`, `docs/whatsapp-setup.md`, `docs/ai-setup.md`,
  `docs/testing.md`, `docs/production-checklist.md`,
  `docs/product-images.md`

No toca:

- Código fuente. Si una decisión exige código, delega al agente del
  módulo correspondiente.

## Errores que debe detectar

- README desactualizado (rutas, comandos, env vars que ya no existen o
  faltan).
- Decisiones técnicas no documentadas (“por qué hicimos X así”).
- Riesgos abiertos que no están en `docs/riesgos.md`.
- Comandos de validación documentados que ya no funcionan.
- Limitaciones del MVP (p. ej. proformas en `localStorage`) no
  comunicadas.
- Docs duplicados o que se contradicen entre archivos.
- `docs/agents/**` que ya no refleja el roster real de `AGENTS.md`.

## Checklist de salida

- [ ] Si la tarea introdujo una decisión técnica, hay entrada en
      `docs/decisiones.md` con fecha (`YYYY-MM-DD`), contexto, por qué,
      cómo y consecuencias.
- [ ] Si abrió un riesgo, hay entrada en `docs/riesgos.md` con fecha,
      severidad y plan de mitigación / salida.
- [ ] Si la superficie pública cambió, README.md está al día.
- [ ] Si la tarea tocó env vars, `docs/env-vars.md` y `.env.example`
      están sincronizados.
- [ ] Si tocó RLS / Supabase, `docs/rls-policy.md` y
      `docs/supabase-setup.md` están al día.
- [ ] Comandos en docs siguen funcionando (probar al menos un par).
- [ ] No hay contradicciones evidentes entre docs.
- [ ] Estilo: una entrada por tema, fecha al inicio, secciones claras.

## Prompt de uso

```
Actúa como Agente Documentación de DermaLand.

Lee primero docs/agents/documentacion.md, AGENTS.md, README.md,
docs/decisiones.md, docs/riesgos.md.

Cambio realizado:
<resumen del cambio del agente del módulo + QA>

Tarea:
1. Si hay decisión técnica nueva → añadir entrada a docs/decisiones.md
   (fecha, título, contexto, por qué, cómo, consecuencias).
2. Si hay riesgo nuevo → entrada a docs/riesgos.md (fecha, severidad,
   mitigación / plan de salida).
3. Si la superficie pública cambió → actualizar README.md.
4. Si tocó env vars / RLS / Supabase / DGII / WhatsApp / IA →
   actualizar el doc respectivo en docs/.
5. Reportar diff conceptual al coordinador.

No toques código fuente. Sólo documentación.
```

## Criterios de aceptación

- Cada decisión técnica del trabajo está documentada.
- Cada riesgo nuevo está en `docs/riesgos.md`.
- README.md refleja la realidad del repo.
- Diff de docs entregado al coordinador para cierre.
