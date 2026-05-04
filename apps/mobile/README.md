# @dermaland/mobile

PWA dedicada para conteo físico de inventario por escaneo acumulativo.

**Características clave:**
- Service worker con `next-pwa` para offline.
- IndexedDB (`dexie`) para persistir scans pendientes.
- Cámara: `BarcodeDetector` API nativa, fallback `@zxing/browser`.
- Cada scan lleva `offline_scan_id` (UUID v7) + `device_id` para idempotencia.
- Fotos de evidencia se cachean offline y se suben al reconectar.

> Estado actual: solo skeleton. La PWA real se implementa en Fase 2.
