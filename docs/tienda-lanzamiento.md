# Tienda en línea — cómo se enciende

> Complementa [`tienda-en-linea.md`](./tienda-en-linea.md), que explica **por qué**
> está construida así. Esto es el **procedimiento**: qué está listo, qué hace
> falta, cómo se enciende, cómo se comprueba y cómo se apaga si algo sale mal.

**Estado al 2026-08-03:** todo preparado. Falta desplegar el código a producción
y pulsar un botón.

---

## 1. Lo que ya está hecho

| | Estado |
|---|---|
| Código (E0–E7) | Listo, en la rama `feat/tienda-fase-1-2` · v0.113.0 |
| Fichas publicadas en la base | **638** (`product_web_meta.visible = true`) |
| Interruptor de la tienda | **APAGADO** (`business_web_settings.storefront_enabled = false`) |
| Sucursales visibles | 2 — "E. León Jiménez" y "Cutis" (nombre comercial) |
| WhatsApp de la tienda | +1 809-226-5252 — **confirmado con WhatsApp** |
| Frase de presentación | "Dermocosmética y cuidado de la piel en Santiago" |
| Pruebas | 2 099 en verde · build limpio |

Con el interruptor apagado, `/tienda` devuelve **404 para todo el mundo**, aunque
las 638 fichas ya estén marcadas como publicadas. Esa es la red de seguridad:
desplegar el código **no** enciende la tienda.

---

## 2. Lo que falta decidir (no es código)

1. **Contenido de las fichas.** Hoy salen con el nombre del catálogo, la marca,
   la presentación, el precio y la foto — que es una ficha correcta, pero sin
   resumen, descripción ni beneficios. Esos campos **nunca existieron en la
   base** (ver `tienda-en-linea.md` §2.1) y hay que redactarlos a mano desde
   *Productos → Catálogo web*. No se generan solos: son afirmaciones sobre
   productos dermatológicos reales.
2. **Con cuántos productos se lanza.** 638 de 1 355. Los otros 717 no pueden
   publicarse, casi siempre por no tener foto propia; el admin dice el motivo
   producto por producto.
3. **Imagen para compartir de la tienda.** Ya hay una tarjeta generada
   automáticamente (logo + frase + sucursales). Si se quiere una foto propia, se
   configura en `og_image_url`.

---

## 3. Encender la tienda

1. **Desplegar el código a producción.** La rama `feat/tienda-fase-1-2` tiene
   que llegar a `main`; el push a `main` despliega solo. Mientras la tienda esté
   apagada, esto no cambia nada visible: `/tienda` seguirá dando 404.
2. Entrar al ERP como **administrador** (encender la tienda exige rol admin;
   publicar productos basta con encargado).
3. Ir a **Productos → Catálogo web**.
4. Revisar arriba el nombre, la frase, el WhatsApp y el correo de contacto.
5. Pulsar **Encender tienda**. Pide confirmación y avisa de cuántos productos
   quedarán visibles.

El cambio se ve **al instante**: cada guardado invalida la caché de la tienda.

---

## 4. Comprobar que quedó bien

Con la tienda encendida, en `https://dermaland.vercel.app`:

| Comprobación | Qué se espera |
|---|---|
| `/tienda` | Catálogo con el número de productos publicados |
| Buscar `avene` (sin tilde) | Encuentra los AVÈNE |
| Abrir una ficha | Precio, "En existencia" o "Agotado" y el botón de WhatsApp |
| Pulsar el botón de WhatsApp | Abre el chat del 809-226-5252 con el producto ya escrito |
| `/robots.txt` | `Allow: /tienda` y el resto cerrado |
| `/sitemap.xml` | Una URL por producto publicado, más el catálogo |
| Pegar el enlace en WhatsApp | Tarjeta con logo, frase y las dos sucursales |

Y lo que **no** debe aparecer nunca: costo, margen, SKU, código de barras,
cantidad exacta de existencias ni datos de lotes. Hay pruebas automáticas que
fallan si alguno se cuela, pero la comprobación a ojo en producción no sobra.

---

## 5. Apagar (marcha atrás)

**Productos → Catálogo web → Apagar tienda.** Efecto inmediato: `/tienda` vuelve
a devolver 404 para todo el mundo. No borra nada —las fichas publicadas siguen
publicadas— y se puede volver a encender cuando se quiera.

No hace falta desplegar, ni revertir código, ni tocar la base de datos.

Si lo que hay que quitar es **un producto concreto**, no toda la tienda: el
mismo panel, botón del ojo en su fila.

---

## 6. Lo que esta fase NO hace

Carrito, checkout, pagos en línea, envíos, cuentas de cliente y chatbot **no
están implementados**. Están previstos en el diseño y nada de lo construido los
estorba, pero hoy la tienda es un **catálogo**: el cliente ve, pregunta por
WhatsApp y compra en la sucursal o coordina la entrega.

Tampoco toca e-CF, secuencias fiscales ni la Fase G de DGII. Un pedido web, el
día que exista, generará **proforma**, igual que el POS.
