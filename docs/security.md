# Seguridad — DermaLand

> Documento vivo de seguridad del proyecto. Riesgos aceptados, controles
> compensatorios y checklists. Léelo junto con `docs/riesgos.md` y
> `docs/rls-policy.md`.

**Última actualización:** 2026-08-06

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

## Break-glass de 2FA

Salida de emergencia para cuando el segundo factor deja fuera a quien tiene que
entrar. Retira el factor TOTP de **un** usuario nombrado, desde fuera de la
aplicación, y deja rastro en la auditoría.

```bash
node scripts/mfa-break-glass.mjs <correo>
```

### Cuándo se usa

Cuando alguien con 2FA obligatorio (`admin`, `super_admin`, o cualquiera con
`is_platform_admin`) **perdió el acceso a su app de autenticación** —teléfono
perdido, robado, formateado o restaurado sin el código— y por lo tanto no puede
completar el desafío ni llegar a `/perfil/seguridad` a desactivarlo por su
cuenta.

Es lo único que separa un teléfono perdido de un sistema cerrado: DermaLand no
tiene un administrador de reserva, así que **no hay a quién pedirle que lo
abra**.

No se usa para nada más. No es una forma de "quitar el 2FA molesto": deja la
cuenta protegida sólo por contraseña hasta que su dueño vuelva a enrolarse.

### Por qué NO hay códigos de recuperación

Fabricar un sistema de códigos de un solo uso significa generarlos, cifrarlos,
guardarlos en una tabla propia, mostrarlos una vez, verificarlos y revocarlos:
criptografía casera con almacenamiento propio, **más superficie de ataque de la
que elimina**, y una copia impresa que se pierde con la misma facilidad que el
teléfono. La alternativa elegida no guarda ningún secreto nuevo en ningún lado.

### Qué exige

- La `SUPABASE_SERVICE_ROLE_KEY`, que **no vive en la aplicación**: sólo la
  tiene el dueño, en `apps/web/.env.local` o en su gestor de secretos. Quien no
  la tenga no puede correr esto ni aunque tenga el repositorio.
- Que el usuario exista y esté nombrado por su correo **completo**. El guion
  rechaza patrones (`%`, `*`), listas y más de un correo: nunca opera sobre
  varias cuentas.
- **Confirmación interactiva**: hay que teclear el correo completo otra vez.
- Un negocio al que atribuir el registro de auditoría. Se resuelve de los claims
  del usuario o de su ficha; si no aparece en ninguno, el guion **aborta antes
  de retirar el factor** y pide `--business-id <uuid>`. Un break-glass sin
  registro es peor que uno que no se pudo hacer.

> ⚠️ **La confirmación interactiva es una salvaguarda contra equivocaciones, no
> una barrera de autorización.** Se salta con una tubería —
> `echo correo | node scripts/mfa-break-glass.mjs correo` — y el propio arnés de
> pruebas lo hace así a propósito. Está para que nadie retire el factor
> equivocado por inercia, no para detener a quien quiera retirarlo.
>
> **El único control real es poseer la `SUPABASE_SERVICE_ROLE_KEY`.** Quien la
> tenga puede retirar el segundo factor de cualquiera, con confirmación o sin
> ella, y también puede hacerlo directamente contra la Admin API sin pasar por
> este guion. Trátala como lo que es: la llave que anula el 2FA de todo el
> sistema. Si se filtra, el 2FA obligatorio deja de significar nada — rotarla es
> la respuesta, no endurecer este guion.

Opciones útiles:

| Opción | Para qué |
|---|---|
| `--dry-run` | Ver qué haría sin cambiar nada. |
| `--motivo "<texto>"` | Dejar el motivo real en la auditoría. |
| `--business-id <uuid>` | Sólo si el usuario no tiene negocio en claims ni ficha. |

### Queda registrado

Al terminar inserta en `audit_logs` la acción `user.mfa_break_glass`, que la
pantalla de Auditoría muestra como **«Segundo factor retirado (emergencia)»**
(`apps/web/src/features/admin/audit-labels.ts`), con el correo, el motivo y
cuántos factores se retiraron. **La operación es visible, no silenciosa.**

Si el registro fallara después de haber retirado el factor, el guion lo avisa a
gritos, imprime la fila exacta para anotarla a mano y **sale con código
distinto de 0**. Ese aviso no se ignora.

Si la tanda se corta a la mitad —varios factores y falla el segundo— también
queda registro de **lo que sí se retiró**, con `resultado: INCOMPLETO: se
retiraron N de M…` y el mensaje del fallo. Antes, ese camino salía con código 1
**antes** de auditar: quedaban factores retirados y cero rastro, justo el estado
que menos se espera y el que más falta hace explicar.

### Después de usarlo

1. La persona entra **sólo con contraseña**; la puerta de 2FA la manda a
   `/perfil/seguridad`.
2. Vuelve a enrolar el segundo factor **en el momento**, no "cuando pueda": la
   cuenta está a un solo factor mientras tanto.
3. Si el teléfono fue **robado** (no sólo perdido), rotar también la contraseña:
   un dispositivo ajeno pudo tener sesiones o gestores de contraseñas abiertos.

### Cómo se verifica que sigue funcionando

```bash
DERMALAND_BREAK_GLASS_TEST_CONFIRM=<ref-del-proyecto> \
  node scripts/test/mfa-break-glass-test.mjs
```

Crea usuarios desechables, les enrola un TOTP real, corre el guion como lo
correría una persona y comprueba lo que quedó en la base; borra todo al final.
Correrlo antes de cualquier cambio en el enforcement de 2FA.

> ⚠️ **Escribe en la base a la que apunte `apps/web/.env.local`, que hoy es
> producción.** No toca ninguna cuenta real —usa las suyas—, pero eso no es lo
> mismo que "no escribe": durante la corrida inserta un negocio en
> `businesses`, 3 usuarios en `auth.users` y `public.users`, **3 factores en
> `auth.mfa_factors`** y filas en `audit_logs`; al final borra todo eso (el
> `DELETE` de `audit_logs` va acotado al negocio que él mismo creó).
>
> Por eso exige confirmación **nombrando el proyecto** (`ref` de la URL de
> Supabase): sin ella se niega y no escribe nada. Es la misma disciplina
> deny-by-default de `dr-drill.mjs` y `restore-from-json.mjs`
> (`DERMALAND_DR_CONFIRM`). Si `auth.mfa_factors` tiene que seguir vacía —el
> estado previo al despliegue del 2FA obligatorio— **no lo corras contra
> producción**: apunta un `.env.local` a un proyecto desechable.

### Orden de activación del 2FA obligatorio (spec §6.2)

Es el paso que la gente se salta, y saltárselo es exactamente lo que deja a los
administradores encerrados fuera a la vez y sin red. Con `auth.mfa_factors`
vacía, desplegar el enforcement obliga a todos los admins a enrolarse en el
mismo instante y sin nadie que pueda abrirles.

1. Desplegar `/perfil/seguridad` accesible (ya lo está).
2. Un admin enrola su 2FA y **se verifica que puede entrar** con el código.
3. Correr `node scripts/mfa-break-glass.mjs <ese-correo>` y **confirmar que
   recupera el acceso** con sólo la contraseña; luego vuelve a enrolarse.
4. **Sólo entonces** desplegar el enforcement (`lib/auth/mfa-gate.ts` +
   `middleware.ts`).

## Relación con otros documentos

- `docs/riesgos.md` — registro de riesgos (incluye R-SEC-01).
- `docs/estado-actual.md` — snapshot del estado (migración 0008/0009 de Security
  Advisor ya aplicada; este warning quedó como único pendiente de Auth).
- `docs/rls-policy.md` — aislamiento multi-tenant por `business_id` (RLS).
- `docs/dgii/checklist-implementacion-saas-dgii.md` — checklist SaaS/DGII.
