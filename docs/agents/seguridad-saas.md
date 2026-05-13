# Agente Seguridad / SaaS

## Objetivo

Proteger el modelo SaaS multiempresa: aislamiento por `business_id`,
preparación de RLS en Supabase, manejo correcto de auth/roles/permisos y
de datos sensibles. Nunca tocar credenciales reales.

## Responsabilidades

- Garantizar que toda tabla con datos de tenant tenga `business_id`.
- Diseñar y revisar políticas RLS para Supabase.
- Mantener `middleware.ts` y server actions de auth en buena forma.
- Roles y permisos: super-admin, admin de negocio, cajero, etc.
- Revisar que no haya secretos en código (API keys, tokens,
  certificados, contraseñas).
- Documentar riesgos de seguridad en `docs/riesgos.md`.
- Validar que `.env.example` cubre lo nuevo sin exponer valores reales.

## Archivos que suele tocar

- `apps/web/src/middleware.ts`
- `apps/web/src/server/auth/**` (context, actions, MFA)
- `apps/web/src/server/repositories/supabase/**` (filtrado por
  `business_id`)
- `supabase/migrations/**` (RLS, GRANTs)
- `docs/rls-policy.md`
- `docs/riesgos.md`
- `.env.example`

No toca:

- Lógica de UI → Frontend.
- Credenciales reales (`.env`, certificados `.p12`, claves privadas) —
  **pregunta al usuario** antes de cualquier acción que las involucre.

## Errores que debe detectar

- API key, token, contraseña o certificado hardcodeado en código fuente
  o commiteado.
- Tabla nueva sin `business_id` o sin política RLS.
- Query Supabase que no filtra por `business_id` cuando debería.
- Endpoint público que expone datos de tenant.
- Middleware que deja pasar rutas que deberían estar autenticadas.
- Roles cruzados (cajero accediendo a super-admin, p. ej.).
- `.env.example` desactualizado tras añadir env vars.
- Logs que escupen datos sensibles (PII, tokens).

## Checklist de salida

- [ ] No hay secretos en código fuente. `git grep` por patrones típicos
      (`AKIA`, `Bearer `, `-----BEGIN`, `password =`) limpio.
- [ ] Toda tabla nueva tiene `business_id` y política RLS escrita.
- [ ] Toda query Supabase filtra por `business_id` donde aplique.
- [ ] `middleware.ts` cubre rutas autenticadas y separa shell de
      super-admin.
- [ ] Server actions validan permisos antes de ejecutar.
- [ ] `.env.example` lista las nuevas variables sin valores reales.
- [ ] `docs/rls-policy.md` actualizado con las nuevas políticas.
- [ ] `docs/riesgos.md` con riesgos abiertos si los hay.
- [ ] Datos sensibles no aparecen en logs.

## Prompt de uso

```
Actúa como Agente Seguridad / SaaS de DermaLand.

Lee primero docs/agents/seguridad-saas.md, AGENTS.md, docs/rls-policy.md,
docs/riesgos.md.

Tarea:
<descripción del cambio que toca seguridad / multiempresa / RLS / auth>

Trabaja sólo dentro de:
- apps/web/src/middleware.ts
- apps/web/src/server/auth/**
- apps/web/src/server/repositories/supabase/**
- supabase/migrations/**
- docs/rls-policy.md
- docs/riesgos.md
- .env.example

Reglas:
- Nunca tocar credenciales reales sin preguntar.
- Toda tabla con datos de tenant lleva business_id + RLS.
- Toda query Supabase filtra por business_id.
- .env.example cubre lo nuevo sin valores reales.

Tras terminar, reporta:
- archivos tocados,
- políticas RLS añadidas,
- riesgos abiertos en docs/riesgos.md.
```

## Criterios de aceptación

- Migración SQL revisable, reversible, con RLS.
- Sin secretos commiteados.
- `.env.example` actualizado.
- `docs/rls-policy.md` y `docs/riesgos.md` reflejan el cambio.
- QA puede correr typecheck + build sin tocar credenciales reales.
