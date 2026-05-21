# QA SaaS pre-Fase G — DermaLand DGII

> Checklist funcional **end-to-end en browser** para validar que un
> cliente real puede completar el flujo de habilitación DGII hasta
> el gate de Fase G sin asistencia técnica.
>
> **NO se llama a DGII real.** **NO se envía XML.** **NO se consume
> testecf.** Este QA opera sobre el **Preview** de Vercel.

**Última actualización:** 2026-05-21

---

## 0. Pre-requisitos del QA

- [ ] Acceso al Preview de Vercel del proyecto `dermaland`
  (cuenta autenticada en https://vercel.com).
- [ ] Credenciales del seed user:
  - **Email:** `preview-admin@dermaland.do`
  - **Password:** en `apps/web/.env.local` como
    `PREVIEW_ADMIN_PASSWORD` (no la imprimas en chat ni en logs).
- [ ] Browser moderno (Chrome / Firefox / Edge). Tener DevTools
  abierto en una pestaña aparte para inspeccionar localStorage.
- [ ] Migración 0007 aplicada al Supabase Preview (ya hecho —
  verificar en este QA que `audit_logs` recibe inserts).
- [ ] Certificado `.p12` real disponible localmente para la prueba
  del paso 1 (ej.
  `C:\Users\ADMIN\Downloads\20260505-2025023-RNJYMLETC.p12`).
  Password del cert en `apps/web/.env.local` como
  `DGII_CERT_TEST_PASSWORD`.

**Preview URL canónico:** ver el último commit pusheado a la branch
`feature/dgii-module-review-adjustments` o correr
`vercel ls dermaland` para tomar la URL de Preview más reciente.

---

## 1. Login con usuario seed

**Ruta:** `<preview-url>/login`

**Acciones:**
1. Abrir el Preview en el browser autenticado en Vercel (el SSO
   gate de Vercel pide login con tu cuenta personal).
2. En la pantalla de login de DermaLand, ingresar:
   - Email: `preview-admin@dermaland.do`
   - Password: la de `PREVIEW_ADMIN_PASSWORD` (no la copies a
     ningún lado fuera del campo).
3. Click **Ingresar**.

**Estado esperado:**
- Redirect a `/` o al dashboard del business.
- Sidebar muestra los módulos (POS, DGII, Caja, etc.).

**Errores posibles:**
- `401 / no autorizado` → password incorrecta o seed user no
  bootstrapeado. Verificar `apps/web/.env.local`.
- Vercel SSO gate inicial → confirmar que estás en la cuenta de
  Vercel correcta (`wrodriguez3030@gmail.com`).
- Loop de redirect → cookie `@supabase/ssr` no se está seteando;
  abrir DevTools → Application → Cookies y verificar que existe
  `sb-sntcvyozbhrgicwmtcoh-auth-token`.

**OK cuando:** ves la home autenticada, sin redirect a /login, y
en DevTools → Application → Cookies aparece la cookie
`sb-sntcvyozbhrgicwmtcoh-auth-token` (base64-prefijada).

---

## 2. /dgii/habilitacion — wizard SaaS

**Ruta:** `<preview-url>/dgii/habilitacion`

**Acciones:**
1. Navegar al wizard desde el sidebar (DGII → Habilitación) o
   directo por URL.

**Estado esperado:**
- Header: "Habilitación Facturación Electrónica DGII".
- 3 banners en orden:
  1. Banner amber **"MOCK / DEMO / NO FISCAL"** persistente.
  2. Banner sky **"Modo SaaS · datos aislados por cliente"**
     mencionando RLS por `business_id`.
  3. Card brand-accent **"Pendiente antes de enviar a DGII
     testecf"** (panel nuevo).
- Panel "Estado de habilitación DGII" con badge global, progress
  bar, contadores (finalizados/en progreso/pendientes/bloqueados),
  "última evaluación: …".
- Card "Próximo paso recomendado" con CTA "Ver detalle" / "Ir al
  módulo".
- Lista de **10 pasos** (1..9 accionables + estado_final).

**Errores posibles:**
- Wizard vacío / sin contenido → JS bundle no cargó (revisar
  Network).
- "Loading..." infinito → middleware Supabase bloqueando; ver
  Network → check `/_next/data` request.

**OK cuando:** ves los 3 banners + el panel global + 10 cards de
pasos numeradas 1..10 con título legible.

---

## 3. Panel "Pendiente antes de enviar a DGII testecf"

**Ruta:** `<preview-url>/dgii/habilitacion` (sin scroll)

**Acciones:**
1. Localizar la Card con icono Send / título "Pendiente antes de
   enviar a DGII testecf".

**Estado esperado al inicio (todo en estado pending):**
- Badge **"N gap(s)"** en warning (no "listo para enviar").
- Lista bulleted con cada gap, ej.:
  - Cargar y validar el certificado digital (paso 1).
  - Completar la configuración fiscal (paso 2): RNC, razón
    social, dirección.
  - Confirmar 9 de 9 ítem(s) de autorización del representante
    e-CF (paso 8).
  - Aceptar la declaración formal del representante e-CF (paso 8).
  - Completar las pruebas locales de simulación e-CF (paso 4).
- Botón **"Enviar pruebas a DGII testecf"** con ícono Send,
  visualmente deshabilitado (gris/no hover).
- Tooltip texto al pie:
  > "Disponible cuando certificado, configuración fiscal,
  > representante e-CF y validaciones locales estén completas.
  > Además, el envío real a DGII permanece bloqueado hasta que se
  > autorice Fase G."
- Footnote en gris:
  > * "Listo para enviar" significa que los pasos locales están
  > completos. No se ha enviado nada a DGII. Es modo
  > pre-certificación.

**Errores posibles:**
- Badge muestra "listo para enviar" cuando nada está completo →
  bug en el evaluador o gaps mal computados.
- Botón aparece habilitado → bug crítico (no debe ser clickeable
  en este wizard).

**OK cuando:** Badge "N gap(s)" + lista visible + botón
deshabilitado + tooltip y footnote presentes.

---

## 4. Paso 1 — Certificado digital

**Ruta:** `<preview-url>/dgii/habilitacion` (paso 1 expandible) y
`<preview-url>/dgii/certificado` (módulo asociado).

**Acciones en el wizard:**
1. Click sobre el card "1. Certificado digital" para expandir.
2. Ver panel de estado del cert (amber = sin cargar / emerald =
   válido / rose = inválido).
3. Click "Ir a subir certificado" → te lleva a
   `/dgii/certificado`.

**Acciones en /dgii/certificado:**
1. Subir el `.p12` real local + password (la del cert, NO la de
   admin).
2. Confirmar que aparece la metadata extraída (subject, issuer,
   serial, fingerprint corto, vigencia, RNC).
3. Click **"Ejecutar prueba local"** (botón de la sección Real).

**Estado esperado:**
- Tras la prueba local: card de evidencia con 7+ steps verdes:
  - `cert_loaded` ✓
  - `cert_valid` ✓ (vigente hasta YYYY-MM-DD)
  - `xml_built` ✓
  - `xml_signed` ✓
  - `signature_verified` ✓ (RSA-SHA256 OK)
  - `structure_valid` ✓
  - `qr_generated` ✓
  - `xsd_valid` ✓ (e-CF tipo 32 real firmado pasa XSD oficial
    DGII)
- Evidencia persistida en localStorage
  `dermaland.dgii-local-test-evidence` (verificar en DevTools).
- Cert persistido en Supabase: chequear con DevTools → Network →
  POST `/api/dgii/certificate/test-local` → response `ok: true`.

**Errores posibles:**
- `403 feature_disabled` → `isCertificateUploadEnabled` apagado.
  Confirmar que `NEXT_PUBLIC_DGII_CERTIFICATE_UPLOAD_ENABLED=true`
  está seteado en Preview env.
- `412 no_active_certificate` → la subida funcionó pero el cert
  no quedó activo. Re-subir.
- `422 test_failed` con código `PARSE_FAILED` → password
  incorrecta. **NO la imprime nadie**, solo el code.
- `xsd_valid` en ✗ con "XSD rechazó N error(es)…" → bug en
  builder/signer/validator (no esperado con un cert real).

**OK cuando:**
- 8 steps verdes (incluyendo `xsd_valid`).
- `audit warning` NO aparece (RLS 0007 aplicada).
- Volviendo a `/dgii/habilitacion`, el paso 1 muestra badge verde
  o el panel de cert válido.

---

## 5. Paso 2 — Configuración fiscal

**Ruta:** `<preview-url>/dgii/configuracion` (vía botón "Ir al
módulo" desde el paso 2, o navegación directa).

**Acciones:**
1. Llenar form con datos del emisor (modo demo está bien — usá
   los del cert para coherencia).
2. RNC: 9 u 11 dígitos sin guiones. Si el cert es persona física
   con cédula 11 dígitos, usar la misma para coherencia.
3. Razón social, nombre comercial, dirección, provincia/municipio,
   correo, teléfono.
4. Ambiente DGII: `testecf` (default; **NO cambiar a `ecf`**).
5. Guardar.

**Datos a llenar (sugeridos para el QA):**
- RNC emisor: el del cert (ej. `03103274282`).
- Razón social: lo que dice el `CN=` del subject del cert.
- Resto: cualquier dato válido (no se envía a DGII).

**Estado esperado:**
- Toast "Configuración guardada" o equivalente.
- Server action persiste en Supabase (RLS por business_id) — ver
  Network → action POST devuelve `success: true`.
- Volviendo a `/dgii/habilitacion`, paso 2 muestra checklist con
  items marcables; cambiar estado a "completed" cuando todos los
  items estén tildados.

**Errores posibles:**
- Validation error en RNC → debe ser 9 u 11 dígitos sin guiones.
- "Sin permiso" → rol del seed user debe tener `dgii:configure`.
  Verificar en `/admin/permisos`.

**OK cuando:** form aceptado + en wizard, paso 2 ahora aparece
en `completed` (o cuando vos marcás el Select del paso a
"completed" tras tildar los 8 items del checklist del paso).

---

## 6. Paso 4 — Pruebas locales de simulación e-CF

**Ruta:** `<preview-url>/dgii/certificacion` (vía botón del paso 4
en el wizard).

**Acciones:**
1. Ejecutar el panel mock de pre-certificación para los 4 tipos:
   31 (Crédito Fiscal), 32 (Consumo), 33 (Nota Débito), 34 (Nota
   Crédito).
2. Por cada tipo:
   - Click "Generar e-CF demo".
   - Verificar que el XSD valida verde (badge `validateEcfXml ✓`).
   - Verificar que la firma demo aparece (sello dummy XAdES-BES).
   - PDF demo se descarga / renderiza.
   - QR demo es visible.

**Estado esperado:**
- 4 corridas verdes (31/32/33/34).
- Cada XML generado pasa `validateEcfXml` contra el XSD oficial
  correspondiente.
- Volver a `/dgii/habilitacion`, paso 4 con todos los items
  tildados (ecf-31, ecf-32, ecf-33, ecf-34, xsd, firma,
  evidencias). Marcar `completed`.

**Errores posibles:**
- XSD rechaza con `Schemas validity error` → bug en builder; el
  XSD oficial debería pasar con el cert demo del servicio.
- PDF no renderiza → revisar consola por error de `pdfkit`.

**OK cuando:** 4 tipos pasan + paso 4 marcado completed.

---

## 7. Paso 8 — Autorización del representante e-CF

**Ruta:** `<preview-url>/dgii/habilitacion` (paso 8 expandible).

**Acciones:**
1. Click sobre el card "8. Autorización del representante e-CF".
2. Verificar el banner sky **"Datos sugeridos extraídos del
   certificado activo"**:
   - Titular (CN): nombre del cert.
   - Cédula del titular: `IDCDO-XXXXXXXXXXX` → 11 dígitos.
   - RNC extraído del cert: 11 dígitos.
   - Entidad certificadora: ej. "VIAFIRMA" o "VIAFIRMA QUALIFIED
     CERTIFICATES".
   - Vigencia: "vigente".
3. Si el panel dice "No hay evidencia de prueba local todavía",
   volver al paso 4 / `/dgii/certificado` y correr la prueba
   local primero (sección 4 de este QA).

**Estado esperado en este punto:** los 9 ítems del checklist
visibles, todos en estado pending (gris/amber), con resumen
inferior tipo:
> "0 de 9 ítems registrados · 9 pendiente(s) · declaración
> pendiente".

**Errores posibles:**
- Panel sky NO muestra titular/cédula → el cert no se cargó.
  Volver al paso 1.
- 9 ítems no aparecen → el step catalog está mal. Inspeccionar
  React DevTools.

**OK cuando:** banner sky con datos pre-extraídos visible + 9
ítems del checklist listables.

---

## 8. Evidencia por cada ítem

**Ruta:** `<preview-url>/dgii/habilitacion` (paso 8 expandido).

**Acciones (repetir para cada uno de los 9 ítems):**

1. Click sobre el título del ítem (ej. "Titular del certificado
   anotado") para expandir.
2. Estado: tocar **"Confirmado"** (pill verde).
3. Responsable: escribir tu nombre o el del contador (ej.
   "Juan Pérez - contador").
4. Fecha de confirmación: dejar el auto-fill (hoy) o cambiar si
   la confirmación es anterior.
5. Referencia documental (opcional): ej. "Acta 2026-031",
   "Drive/contratos/cert-titular.pdf".
6. Nota: cualquier comentario auditable (ej. "Verificado vs
   designación en DGII portal el 2026-05-21").
7. Click "Cerrar ítem" → vuelve al modo colapsado mostrando un
   resumen breve.

**Estado esperado por ítem:**
- Modo colapsado: borde emerald (Confirmado) o slate (No aplica)
  o amber (Pendiente).
- Resumen colapsado muestra responsable, fecha, ref, snippet de
  nota.
- DevTools → localStorage `dermaland.dgii-enablement-progress`:
  ver que el item tiene `evidence: { status: "confirmed",
  responsible: "...", confirmedAt: "...", documentRef: "...",
  note: "..." }`.

**Casos especiales:**
- Ítem `crl-ocsp` (estado de revocación): si la CA no publica
  CRL/OCSP, marcar **"No aplica"** (pill slate). Cuenta como
  cubierto para el gate.
- Ítem `acta-firmada` (acta firmada con contador): puede dejarse
  Pendiente hasta tener el acta real; el gate exige Confirmado o
  N/A para desbloquear.

**Errores posibles:**
- localStorage no actualiza → permisos del browser bloqueando o
  modo incógnito sin persistencia.
- Estado no cambia visualmente → recargar (el `useState` del
  componente está sincronizado con el store, pero F5 confirma).

**OK cuando:** los 9 ítems están en estado Confirmado o No aplica.
El contador inferior dice "9 de 9 ítems registrados · 0
pendiente(s)".

---

## 9. Declaración formal

**Ruta:** misma vista (paso 8 expandido), al pie del form de
evidencia.

**Acciones:**
1. Leer el texto completo de la declaración:
   > "Confirmo que el titular del certificado digital está
   > designado como Usuario Administrador e-CF del contribuyente
   > o es su representante autorizado para firmar e-CF ante la
   > DGII, según el RNC declarado en la configuración fiscal.
   > Entiendo que esta confirmación es responsabilidad mía / del
   > contador y que DermaLand no certifica esta relación ante
   > DGII — la validación final corre por mi cuenta."
2. Tildar el checkbox.

**Estado esperado:**
- Caja cambia de amber a emerald.
- Aparece "Aceptada el [timestamp]".
- DevTools localStorage:
  `declarationAccepted: true, declarationAcceptedAt: "..."`.
- Banner inferior de bloqueo desaparece (si los 9 ítems están
  Confirmed/N.A.).

**Errores posibles:**
- Tilde no persiste tras F5 → bug de store (no esperado).

**OK cuando:** checkbox tildado + timestamp visible + caja
emerald + banner de bloqueo del paso 8 desaparece.

---

## 10. Bloqueo / desbloqueo de `ready_for_testecf`

**Ruta:** `<preview-url>/dgii/habilitacion`

**Acciones de verificación:**
1. **Caso bloqueado (negativo):**
   - Quitar la tilde de la declaración formal.
   - Click "Ejecutar revisión de habilitación" en el header del
     wizard.
   - Verificar que el badge global NO es `ready_for_testecf`
     (debería ser `in_preparation` o `blocked_*`).
   - Panel "Pendiente antes de enviar..." debe listar "Aceptar
     la declaración formal del representante e-CF (paso 8)".
2. **Caso degradado (anti-bypass):**
   - Re-tildar la declaración.
   - En el paso 8, intentar setear el Select "Estado del paso" a
     **"completed"** manualmente.
   - Quitar la confirmación de **1 ítem** del checklist
     (ej. `vigencia-cert` → Pendiente).
   - Click "Ejecutar revisión".
   - Verificar que el diagnóstico del paso 8 reporta
     `in_progress` (NO `completed`), aunque el Select diga
     completed. El evaluador degrada el status.
3. **Caso desbloqueado (positivo):**
   - Marcar el ítem que faltaba como Confirmado.
   - Click "Ejecutar revisión".
   - Verificar que ahora el badge global es
     `ready_for_testecf` (si cert + config fiscal están
     completos; si paso 4 también está completed, podría pasar a
     `in_certification`).
   - Panel "Pendiente antes de enviar..." muestra "✅ Todos los
     requisitos previos están cubiertos" + badge "listo para
     enviar*".

**Estado esperado:**
- Transición correcta entre los 3 casos en menos de 1s.
- Status global responde a quitar/poner condiciones.

**Errores posibles:**
- Badge se queda en `in_preparation` aunque todo esté verde →
  ejecutar revisión otra vez (botón en el header) o F5.
- Badge muestra `ready_for_testecf` con declaración deshabilitada
  → bug del gate (no esperado; tests cubren este caso).

**OK cuando:** las 3 transiciones se observan correctamente.

---

## 11. CTA "Enviar pruebas a DGII testecf"

**Ruta:** `<preview-url>/dgii/habilitacion` (panel superior).

**Acciones:**
1. Estando en el caso positivo (todo desbloqueado), localizar el
   botón **"Enviar pruebas a DGII testecf"** en la card "Pendiente
   antes de enviar...".
2. Verificar visualmente que el botón está **disabled** (gris,
   cursor `not-allowed`, no responde al click).
3. Hover sobre el botón: aparece el atributo `title` con el
   tooltip:
   > "Disponible cuando certificado, configuración fiscal,
   > representante e-CF y validaciones locales estén completas.
   > Además, el envío real a DGII permanece bloqueado hasta que
   > se autorice Fase G."
4. Click sobre el botón: NO debe pasar nada (no fetch, no
   navegación, no toast). DevTools → Network: cero requests
   nuevos.

**Estado esperado:**
- Botón visualmente disabled aún cuando todos los requisitos
  estén verdes. Es **intencional** — el envío real solo se
  habilita cuando se autorice Fase G.
- Tooltip y texto descriptivo visibles.

**Errores posibles:**
- Click dispara request → bug crítico, **detener el QA y
  reportar**.
- Botón se ve habilitado → bug visual (no funcional, pero
  confunde al cliente).

**OK cuando:** botón disabled + tooltip + cero requests al click.

---

## 12. Mensajes de no fiscal / no enviado a DGII

**Ruta:** `<preview-url>/dgii/habilitacion`

**Acciones:**
1. Verificar que los 3 banners/footers MOCK están presentes:
   - Top: banner amber "MOCK / DEMO / NO FISCAL" con texto
     explícito de "no envía postulación a DGII, no firma con
     certificado real…".
   - En el panel "Pendiente antes de enviar…": footnote
     "* Listo para enviar significa que los pasos locales están
     completos. No se ha enviado nada a DGII. Es modo
     pre-certificación."
   - En el paso 8 (banner sky datos del cert): "...Fase G
     permanece bloqueada hasta marcar todos los items del
     checklist."

**Estado esperado:** los 3 mensajes son legibles, sin parpadeo,
sin ser cerrables (deben ser persistentes).

**Errores posibles:**
- Algún banner faltante → bug de UI.
- Texto difícil de leer / corte → revisar responsive.

**OK cuando:** los 3 mensajes presentes y legibles.

---

## 13. Auditoría y persistencia

**Ruta:** múltiples (DevTools + Supabase Dashboard).

**Acciones:**
1. **DevTools → Application → Local Storage** sobre
   `<preview-url>`:
   - Llave `dermaland.dgii-enablement-progress` → JSON array con
     los pasos en progreso.
   - Llave `dermaland.dgii-local-test-evidence` → JSON con
     evidencia de la última prueba del cert.
   - Llave `dermaland.dgii-certificate-status` → estado mock del
     cert.
2. **Supabase Dashboard** (
   https://supabase.com/dashboard/project/sntcvyozbhrgicwmtcoh/editor
   ):
   - Tabla `dgii_certificates`: filas con `business_id` del seed
     user + `is_active=true` para el cert más reciente.
   - Tabla `audit_logs` (filtrar por
     `action=dgii_certificate_upload`): filas con `business_id`
     del seed user, sin error de RLS. **Esta es la verificación
     clave de la migración 0007.**
3. **Test de aislamiento (smoke):** si tenés otro seed user de
   prueba con un `business_id` diferente, iniciar sesión como
   ese user y verificar que NO ves los certificados ni los
   audit_logs del business anterior. Confirma RLS.

**Estado esperado:**
- 3 llaves de localStorage con datos coherentes.
- `dgii_certificates` con al menos 1 fila activa.
- `audit_logs` recibe inserts (filas crecen tras cada prueba
  local del cert).
- Cross-business: 0 filas visibles del otro tenant.

**Errores posibles:**
- `audit_logs` sin filas tras pruebas → migración 0007 no
  aplicada o RLS rechazando insert. Re-correr el verificador del
  tmp script.
- Cross-business ve filas ajenas → bug crítico de RLS.
  **Detener el QA y reportar.**

**OK cuando:** persistencia local + persistencia Supabase +
aislamiento por business todos correctos.

---

## Criterio exacto para decir "LISTO PARA FASE G"

El cliente está listo para que se autorice Fase G **cuando TODOS
los siguientes son `true`**:

| # | Criterio | Cómo verificar |
|---|---|---|
| 1 | Login funciona con seed user | Sección 1 OK |
| 2 | Wizard `/dgii/habilitacion` carga con los 3 banners y los 10 pasos | Sección 2 OK |
| 3 | Panel "Pendiente antes de enviar a DGII testecf" muestra gaps cuando aplica | Sección 3 OK |
| 4 | Paso 1: cert real con 8 steps verdes (incluido `xsd_valid`) en `/dgii/certificado` | Sección 4 OK |
| 5 | Paso 2: configuración fiscal completed (RNC válido + datos) | Sección 5 OK |
| 6 | Paso 4: 4 tipos e-CF (31/32/33/34) pasan XSD verde en `/dgii/certificacion` | Sección 6 OK |
| 7 | Paso 8: 9 ítems en Confirmado o No aplica | Sección 8 OK |
| 8 | Paso 8: declaración formal del responsable tildada con timestamp | Sección 9 OK |
| 9 | Estado global = `ready_for_testecf` tras "Ejecutar revisión" | Sección 10 caso positivo |
| 10 | Anti-bypass funciona: quitar 1 ítem degrada el estado del paso 8 a `in_progress` aunque Select diga completed | Sección 10 caso degradado |
| 11 | CTA "Enviar pruebas a DGII testecf" sigue disabled aún con todo verde, con tooltip | Sección 11 OK |
| 12 | Banners MOCK / NO FISCAL / no enviado a DGII visibles | Sección 12 OK |
| 13 | `audit_logs` en Supabase recibe filas con `business_id` correcto y sin RLS error | Sección 13 OK |
| 14 | Cross-business: otro tenant NO ve datos del primero (si hay 2 seed users) | Sección 13 OK |

Cuando los **14 criterios** sean verdes, el sistema cumple los
**pre-requisitos técnicos** para Fase G.

**Aún así, antes de autorizar Fase G se necesita confirmación
externa NO técnica:**

- Contador firmó / archivó el acta de designación del Usuario
  Administrador e-CF en la DGII.
- Cert vigente > 60 días.
- Validación legal del titular como representante autorizado del
  RNC.
- RNC emisor coincide *exactamente* con el del cert y con la
  designación oficial en DGII.

---

## Reportar resultados

Al terminar este QA, anotar en un comentario (no en logs, no en
commit, no en chat):

```
QA SaaS pre-Fase G — DermaLand
Fecha: 2026-MM-DD
Tester: <tu nombre>
Preview URL: <url usada>
Resultado por sección:
  1. Login: PASS / FAIL (motivo)
  2. Wizard carga: PASS / FAIL
  ...
  13. Auditoría: PASS / FAIL
Criterios LISTO PARA FASE G: 14/14 verdes? sí / no
Observaciones:
```

NO incluir password, JWT, fingerprints completos del cert,
contenido del `.p12`, ni nada sensible.

---

## Reglas durante el QA

- ✗ NO llamar DGII real.
- ✗ NO usar `testecf` ni `ecf`.
- ✗ NO enviar XML real a ningún endpoint externo.
- ✗ NO `vercel deploy --prod`.
- ✗ NO tocar Vercel Production env vars.
- ✗ NO modificar `.env.local`, `.mcp.json`, `.claude/`.
- ✗ NO subir `.p12`/`.pfx`/`.key`/`.pem`/`.crt`/`.cer` a Git.
- ✗ NO imprimir contraseñas, tokens, JWT, ni private keys.
- ✗ NO consumir secuencias e-NCF reales.
- ✗ NO cambiar DNS.

Si durante el QA encontrás un bug crítico (datos cross-business
visibles, CTA disparando red, RLS bypass, secretos leaked):
**detener el QA y reportar antes de continuar.**
