# Auditoría de marca DermaLand — base para la tienda en línea

**Fecha:** 2026-08-02
**Alcance:** identidad visual y de voz para `/tienda`, derivada del sistema que ya
existe en producción y del perfil público de Instagram.
**Regla que gobierna todo este documento:** cuando el sistema DermaLand y
Instagram digan cosas distintas, **manda DermaLand**.

---

## 1. Resumen de identidad

DermaLand es una **venta especializada de productos dermatológicos** en Santiago,
República Dominicana, con dos puntos de venta y presencia comercial activa en
Instagram (7 670 seguidores). No es una farmacia general ni una clínica: vende
dermocosmética de marcas reconocidas y ofrece **dermoconsejería** como servicio
diferenciador.

Eso define el tono de la tienda: **asesoría antes que catálogo**. El cliente
típico no busca "un protector solar", busca "un protector solar para piel grasa
que no deje blanco". La tienda debe responder a eso, y es también la razón de ser
del chatbot comercial.

## 2. Paleta

**La paleta de la tienda es la que ya está en producción**, no una nueva. Sale de
`apps/web/src/app/globals.css`:

| Token | HEX | Uso |
|---|---|---|
| `--brand-primary` | `#00685f` | Teal profundo. Botones principales, navegación activa |
| `--brand-accent` | `#0d9488` | Teal vivo. Enlaces, hover, valores destacados |
| `--brand-fg` | `#0b1c30` | Navy. Texto principal |
| `--brand-bg` | `#f8f9ff` | Superficie base, "clínica" |
| `--brand-success` | `#16a34a` | Confirmaciones, "en existencia" |
| `--brand-warn` | `#f59e0b` | Avisos, "últimas unidades" |
| `--brand-danger` | `#dc2626` | Errores, "agotado" |

**Decisión registrada:** el generador de sistemas de diseño (UI UX Pro Max)
propuso una paleta de *verde farmacia* (`#15803D`) con tipografías Rubik/Nunito
Sans. **Se descarta.** La especificación exige que la tienda sea coherente con
DermaLand, y DermaLand es teal, no verde. Del generador se conservan el patrón de
comercio electrónico, la lista de anti-patrones y la checklist de accesibilidad,
que sí aplican.

**Verificación de contraste (sobre `#f8f9ff`):**
- `--brand-fg` `#0b1c30` → **16.9:1** ✅ AAA
- `--brand-primary` `#00685f` → **6.4:1** ✅ AA (texto normal y grande)
- `--brand-accent` `#0d9488` → **3.4:1** ⚠️ **solo para texto grande (≥24 px) o
  elementos no textuales.** No usarlo para precios pequeños ni texto corrido.
- Blanco sobre `--brand-primary` → **6.4:1** ✅ AA

## 3. Tipografía

**Inter** (interfaz) y **JetBrains Mono** (SKU, códigos de barra, números de lote),
ya cargadas vía `next/font/google` en `apps/web/src/app/layout.tsx`. La tienda las
reutiliza: no se añaden fuentes nuevas, que costarían peso y romperían la
coherencia.

Escala mínima para la tienda: cuerpo 16 px, nunca menos de 14 px en texto
secundario, interlineado 1.5.

## 4. Estilo fotográfico

De lo observable en el perfil: fotografía de producto sobre fondo claro y limpio,
envases al frente, y piezas promocionales con texto sobrepuesto para ofertas.

Para la tienda: **imagen de producto sobre fondo neutro, relación 1:1**, sin
texto quemado en la imagen. Los descuentos y etiquetas van como componentes de la
interfaz, no dentro del JPG — así se traducen, se leen con lector de pantalla y se
actualizan sin reeditar la foto.

## 5. Voz de marca

Cercana y profesional, en español dominicano neutro. Trata al cliente de "tú".
Explica el producto por lo que resuelve, no por su química.

**Límite no negociable:** DermaLand vende productos, **no diagnostica**. Ni las
fichas de producto ni el chatbot pueden prometer resultados médicos, sugerir
tratamientos para condiciones diagnosticadas, ni sustituir a un dermatólogo. La
dermoconsejería orienta sobre productos; no es consulta médica, y así debe
decirlo la interfaz.

## 6. Llamados a la acción

Observados en Instagram: consulta por WhatsApp y visita a sucursal. La tienda
añade el que falta: **comprar en línea**.

Jerarquía propuesta: `Agregar al carrito` (primario, teal) › `Consultar al
asesor` (secundario, abre el chatbot) › `Ver en sucursal`. WhatsApp se mantiene
visible como salida humana, no como camino principal.

## 7. Patrones visuales repetidos

- Producto único, centrado, fondo claro.
- Etiqueta de oferta sobre la imagen.
- Marca del laboratorio como sello de confianza.
- Agrupación por necesidad (protección solar, antimanchas, acné) por encima de la
  agrupación por marca.

Ese último punto es el más útil: **la navegación de la tienda debe ofrecer
"necesidad" además de "categoría" y "marca"**, porque así es como el negocio ya
comunica.

## 8. Qué conservar

- La paleta teal y el navy. Son la marca.
- Inter + JetBrains Mono.
- La agrupación por necesidad.
- La dermoconsejería como diferenciador visible.
- Las dos sucursales como opción real de retiro.

## 9. Qué mejorar

- **Los precios.** Hoy **1 339 de 1 355 productos tienen `price = 0`** y el POS
  bloquea vender con precio 0. Sin precios no hay tienda: es el bloqueante número
  uno, anterior a cualquier diseño.
- **Las fotos.** El catálogo no tiene imágenes cargadas de forma sistemática
  (`products.image_url` mayormente vacío). Una tienda sin fotos no convierte.
- **Las descripciones.** Existen, pero son de uso interno; hacen falta textos
  comerciales orientados al beneficio.
- **El contraste de `--brand-accent`** en texto pequeño (ver §2).

## 10. Propuesta visual para la tienda

Sobria y clínica, apoyada en la paleta existente: fondo `--brand-bg`, tarjetas
blancas con borde de 1 px, teal reservado para acciones. Sin degradados, sin
sombras pesadas, sin carruseles automáticos. La foto del producto es el elemento
con más peso visual de cada tarjeta.

Rejilla de 2 columnas en móvil, 3 en tableta y 4 en escritorio, con la ficha de
producto a dos columnas (imagen / decisión de compra) a partir de 1024 px.

## 11. Accesibilidad

- Contraste 4.5:1 en todo texto; `--brand-accent` solo en tamaños grandes.
- Objetivos táctiles de 44×44 px como mínimo.
- Foco visible siempre; nunca se elimina el anillo de foco.
- `prefers-reduced-motion` respetado.
- Transiciones de 150-300 ms; ninguna animación puramente decorativa.
- Iconos SVG de Lucide, ya instalado. **Nunca emojis como iconos.**
- Probado en 375, 768, 1024 y 1440 px.
- La disponibilidad **nunca se comunica solo con color**: siempre lleva texto
  ("En existencia", "Agotado").

## 12. Lo que NO pude validar

Honestidad sobre los límites de esta auditoría:

- **No extraje el logotipo ni fotografías de Instagram.** Solo leí el perfil
  público. Bajar imágenes para reutilizarlas comercialmente requiere autorización
  explícita del dueño o la Graph API con permisos; queda pendiente que entregues
  los archivos o autorices la conexión.
- **No hay códigos de color tomados de las piezas de Instagram.** La paleta de
  este documento sale del código en producción, que es la fuente autorizada.
- **No verifiqué las historias destacadas, las preguntas frecuentes ni el
  contenido del Linktree** (`linktr.ee/dermaland`).
- **Las tipografías del contenido de Instagram** no son determinables desde el
  perfil.

## 13. Datos de contacto observados

Del perfil público, **a confirmar contigo antes de publicarlos** en la tienda:

- Sucursal E. León Jiménez, segundo nivel — **809-226-5252**
- Sucursal Cutis — **809-246-5252**
- Horario: lunes a sábado, 8:30 a. m. a 6:00 p. m.
- Enlace en biografía: `linktr.ee/dermaland`
- También en Threads: `@dermalandrd`

Nota: el sistema tiene registradas las sucursales como **"DermaLand Principal"** y
**"Dermaland Cutis"**. Instagram llama a la primera "E. León Jiménez". Hay que
unificar el nombre comercial que verá el cliente.
