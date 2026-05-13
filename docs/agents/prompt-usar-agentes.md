# Prompt para activar el flujo de agentes — DermaLand

Pega este bloque al inicio de la conversación con tu asistente IA
(Claude / Codex / Cursor / Copilot) antes de hacer el pedido.

---

## Prompt corto (copiar y pegar)

```
Activa el flujo de agentes de DermaLand.

Para este cambio:

1. Usa el Agente Arquitecto Principal para revisar impacto y elegir
   el agente del módulo correspondiente.
2. El agente del módulo ejecuta el cambio.
3. Agente QA/Testing valida (typecheck, build, test, smoke, hydration).
4. Agente Corrector de Errores corrige si QA detecta fallos.
5. Agente Documentación actualiza decisiones, riesgos y README.
6. Agente QA vuelve a validar.
7. Entrega un resumen final con qué cambió, cómo probarlo y pendientes.

No me preguntes por pasos normales (pnpm install, dev, typecheck, build,
borrar .next, reiniciar el dev server, crear rutas, mover archivos).

Trabaja únicamente dentro de C:\dev\dermaland.

Sólo pregunta antes de:
- borrar archivos de código fuente,
- eliminar datos reales,
- tocar credenciales / certificados / API keys / contraseñas,
- trabajar fuera de C:\dev\dermaland,
- desplegar a producción,
- modificar Google Drive,
- acciones destructivas irreversibles,
- cambiar una decisión de negocio aprobada.

Para todo lo demás: decide, ejecuta, valida, corrige, continúa.
Declara cada cambio de agente con `# Cambio a agente: <nombre>`.

Documentación de referencia:
- AGENTS.md
- docs/agents/workflow.md
- docs/agents/checklist-validacion-rapida.md
- docs/decisiones.md
- docs/riesgos.md
```

---

## Variantes

### Variante: una conversación por agente

Si la tarea es larga y el contexto se va a llenar:

```
Actúa exclusivamente como agente: <nombre>.
Lee primero docs/agents/<nombre>.md para tu alcance, archivos y checklist.
Sigue las reglas globales de AGENTS.md.
No tomes tareas fuera de tu agente — si aplica otro, devuelve el control.
```

Reemplaza `<nombre>` por uno de:
- `arquitecto`
- `frontend-ui`
- `pos-ventas`
- `inventario`
- `clientes-crm`
- `qa-testing`
- `seguridad-saas`
- `documentacion`
- `imagenes-productos`
- `corrector-errores`

### Variante: validación rápida sin cambio

Para una vuelta rápida de QA sin que se haya tocado código (p. ej. tras
un pull):

```
Actúa como agente QA/Testing de DermaLand.
Ejecuta el checklist de validación rápida (docs/agents/checklist-validacion-rapida.md).
Reporta lo que falle. Si encuentras un fallo trivial, pásalo al
agente Corrector de Errores y vuelve a validar.
```

### Variante: corrección de bug puntual

```
Activa el flujo de agentes de DermaLand para el siguiente bug:

<descripción del bug, URL afectada, mensaje de error si lo hay>

Empieza por el Agente Corrector de Errores (reproducir + fix mínimo),
luego Agente QA, luego Agente Documentación si aplica.
Si el fix introduce una decisión técnica, escala al Arquitecto antes
de implementar.
```

---

## Tips

1. **Siempre** declara cambios de agente en línea
   (`# Cambio a agente: pos-ventas`). Hace el log auditable.
2. Si pides un cambio que toca dos módulos, deja que el Arquitecto trocee
   — no le pidas al agente del primer módulo que toque también el otro.
3. Si el asistente empieza a preguntar por pasos rutinarios
   (`¿corro typecheck?`), recuérdale el prompt — está pre-autorizado.
4. Cuando una tarea cierre, pídele al Agente Documentación que confirme
   con un diff de `docs/decisiones.md` y `docs/riesgos.md`.
