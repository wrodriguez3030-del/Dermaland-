# Seguridad — DermaLand

> Documento vivo de seguridad del proyecto. Riesgos aceptados, controles
> compensatorios y checklists. Léelo junto con `docs/riesgos.md` y
> `docs/rls-policy.md`.

**Última actualización:** 2026-06-18

## R-SEC-01 · Leaked Password Protection deshabilitado (plan Free)

**Warning (Supabase Security Advisor → Auth):** *Leaked password protection is
currently disabled.*

### Por qué NO se puede corregir en plan Free

Supabase ofrece **Leaked Password Protection** (cruce contra
[HaveIBeenPwned](https://haveibeenpwned.com/)) **solo en planes Pro o
superiores**. En plan **Free** la opción de Dashboard
*Authentication → Settings → Security → Leaked Password Protection* aparece
deshabilitada/bloqueada.

**Este warning NO se corrige con SQL ni migración.** No es un objeto de base de
datos: es una feature de la capa Auth gestionada por Supabase. No se debe
intentar crear migraciones, tocar tablas de `auth`, ni modificar Auth con SQL
para "apagar" este warning. Solo desaparece activando la feature en el
Dashboard tras subir a Pro.

### Impacto

Mientras el proyecto esté en Free, **Supabase Auth no bloquea automáticamente
contraseñas comprometidas** (presentes en brechas conocidas). Un usuario podría
elegir una contraseña que ya está filtrada públicamente y Auth la aceptaría.

### Mitigación temporal (controles compensatorios)

- **Exigir contraseña fuerte en la UI** (y en cualquier punto que establezca
  contraseñas). Política implementada en
  `apps/web/src/lib/auth/password-policy.ts` (`validatePassword`):
  - mínimo **12 caracteres**
  - al menos una **mayúscula**
  - al menos una **minúscula**
  - al menos un **número**
  - al menos un **símbolo**
  - **rechazo de contraseñas comunes** (`password`, `password123`, `123456`,
    `12345678`, `admin123`, `dermaland123`, `qwerty123`, …)
- **MFA** recomendado donde esté disponible.
- **Rotar** la contraseña seed/preview; **no** reutilizar contraseñas.
- **No** usar contraseñas compartidas.
- **No** usar credenciales reales en demo/preview.
- El script de bootstrap de usuario seed valida la contraseña con la misma
  política (`scripts/bootstrap-preview-supabase-user.mjs`) y **nunca imprime**
  la contraseña ni el service-role.
- Antes de producción SaaS real: **subir Supabase a Pro** y activar Leaked
  Password Protection (o implementar una mitigación equivalente, p. ej. cruce
  propio contra HaveIBeenPwned k-anonymity).

### Estado

**Riesgo aceptado temporalmente** en desarrollo/preview.
**Bloqueante para producción SaaS real** si no se sube a Pro o no se implementa
una mitigación equivalente.

### Checklist para cuando se actualice a Pro

1. Subir Supabase a plan **Pro**.
2. Ir a **Authentication → Settings → Security**.
3. Activar **Leaked Password Protection**.
4. **Guardar**.
5. Volver a **Advisors → Security**.
6. **Refrescar**.
7. Confirmar que el warning **desapareció**.

> Nota: el warning del Advisor **no** se elimina por código. Solo se elimina
> tras subir a Pro y activar la feature en el Dashboard.

## Relación con otros documentos

- `docs/riesgos.md` — registro de riesgos (incluye R-SEC-01).
- `docs/estado-actual.md` — snapshot del estado (migración 0008/0009 de Security
  Advisor ya aplicada; este warning quedó como único pendiente de Auth).
- `docs/rls-policy.md` — aislamiento multi-tenant por `business_id` (RLS).
- `docs/dgii/checklist-implementacion-saas-dgii.md` — checklist SaaS/DGII.
