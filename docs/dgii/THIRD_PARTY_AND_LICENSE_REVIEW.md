# Revisión de terceros y licencia — `l10n_do_edi`

> **Fecha:** 2026-08-04 · **Rama:** `feat/dgii-reformulacion`
>
> **Esto no es una opinión legal.** Identifica el riesgo para que lo revise el
> propietario con su abogado, que es lo que pide el §6 del pliego.

---

## 1. Qué declara el módulo

| Campo | Valor |
|---|---|
| Nombre | República Dominicana - Facturación Electrónica (DGII) |
| Versión | 19.0.1.2.9 |
| Autor | **Overload Solutions** |
| Sitio | `https://www.overloadsolutions.com.do` |
| Licencia declarada | **AGPL-3** |

La licencia se declara **solo en `__manifest__.py`**. No hay archivo `LICENSE`,
ni `COPYING`, ni encabezados de copyright en los `.py`. Un módulo que se declara
AGPL-3 sin incluir el texto de la licencia ya es una irregularidad del propio
paquete.

---

## 2. Por qué la AGPL-3 importa aquí y no en otras licencias

La GPL obliga a liberar el código cuando **distribuyes** el programa. La **AGPL
añade el caso de la red**: si los usuarios interactúan con el software **a través
de una red**, hay que ofrecerles el código fuente correspondiente — aunque nunca
les entregues un binario.

DermaLand es exactamente eso: una aplicación web en `dermaland.vercel.app`.

Traducido: **si DermaLand incorporara obra derivada de este módulo, el
argumento de que "no lo distribuimos, es un SaaS" no aplica.** Ese hueco es el
que la AGPL cierra a propósito.

---

## 3. Qué se ha usado, exactamente

**Hasta hoy: nada de código.**

- El ZIP se extrajo en una **carpeta temporal fuera del repositorio**.
- **Ni un archivo del ZIP entra** en `apps/`, `supabase/`, `docs/` ni en el
  historial de git.
- Lo único que sale de él son **observaciones**: qué endpoints existen, qué
  tipos de comprobante trata, dónde está el umbral del RFCE, qué le falta.

---

## 4. La línea que no conviene cruzar

Hay una diferencia práctica entre dos cosas que se parecen:

**Hechos y reglas — no son del proveedor.** El umbral del RFCE es RD$250 000
porque lo dice la DGII. Los endpoints son los de la DGII. El orden de los nodos
del XML lo fija el XSD oficial. Que un e-CF 34 sea una nota de crédito es
normativa. **Nada de eso es obra de Overload Solutions**, y saberlo por haber
leído su módulo no lo convierte en suyo.

**Expresión — sí es del proveedor.** Su forma de estructurar el builder, sus
nombres de método, su secuencia de llamadas, su manejo de errores, sus plantillas
XML tal como están escritas.

La regla de trabajo para DermaLand:

> **Del módulo se toman preguntas, no respuestas.** «¿Qué campos lleva un E45?»
> se contesta con el XSD oficial y la documentación de la DGII, no copiando el
> método que los arma.

---

## 5. Riesgo residual, sin adornos

| Escenario | Riesgo |
|---|---|
| Usarlo solo como inventario funcional, implementando desde cero contra fuentes oficiales | **Bajo.** Es lo que se ha hecho |
| Copiar plantillas XML, orden de campos o métodos tal cual | **Alto.** Obra derivada → obligación AGPL sobre DermaLand |
| Adaptar su lógica cambiando nombres de variables | **Alto.** Cambiar nombres no deshace una obra derivada |
| Reutilizar su servicio de licencia | **Alto**, y además técnicamente insensato (§2 del `SOURCE_MODULE_AUDIT`) |

Y una fuera de la licencia, que puede pesar más: **el ZIP contiene credenciales
de producción del proveedor** (ver `SOURCE_MODULE_AUDIT.md` §1). Poseerlas y
usarlas no son la misma cosa. Aquí no se han usado ni se usarán.

---

## 6. Recomendaciones al propietario

1. **Confirmar la procedencia del ZIP.** ¿Se compró, se recibió de un tercero,
   se descargó? La AGPL permite redistribuir, así que tenerlo no es en sí un
   problema — pero conviene saberlo antes de construir encima.
2. **Avisar a Overload Solutions de las credenciales incrustadas.** Es su
   servidor el que está expuesto, y quien tenga el ZIP tiene acceso. Se avise o
   no, DermaLand no las usa.
3. **Mantener la regla del §4** por escrito en el equipo: preguntas sí,
   respuestas no.
4. **Registrar en este archivo cualquier fragmento que algún día se reutilice
   de verdad**, con su atribución. Hoy la lista está vacía y lo suyo es que siga
   así.
5. **Consultar con un abogado antes de reutilizar código**, no después.

---

## 7. Registro de código reutilizado

| Fragmento | Origen | Licencia | Atribución | Fecha |
|---|---|---|---|---|
| _(ninguno)_ | — | — | — | — |

**Si esta tabla deja de estar vacía, DermaLand pasa a tener una obligación AGPL
que hoy no tiene.** Que se llene es una decisión, no un accidente.
