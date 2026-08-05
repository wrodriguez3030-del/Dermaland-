# Estados de un comprobante fiscal

> Código: `features/dgii/document-state.ts` · Aplicación:
> `server/services/dgii/transitions.ts` · Historial: `ecf_document_events`

Los doce estados son los del `CHECK` de `electronic_invoices.status`, que ya
existía. **No se inventó ninguno**: cambiar el `CHECK` de una tabla fiscal para
que encaje con un documento de diseño es empezar la casa por el tejado.

```
                    ┌──────────────────────────────┐
                    ▼                              │
draft ──▶ generated ──▶ validated ──▶ signed ──▶ submitted ──▶ in_process
  │           │             │           │            │            │
  │           │             │           │            └─────┬──────┘
  │           │             │           │                  ▼
  └───────────┴─────────────┴───────────┴──▶ cancelled   accepted ──▶ voided
              │             │           │                accepted_conditional
              └─────────────┴───────────┴──▶ error ──┐   rejected  (terminal)
                                             ▲       │
                                             └───────┘
                            (error vuelve al paso donde falló)
```

## Las dos reglas

**1 · Un documento aceptado no retrocede.** Ni una respuesta repetida, ni una
consulta que llega tarde, ni un reintento devuelven a `submitted` algo que la
DGII ya autorizó. La red no entrega en orden, y si eso pudiera retroceder, la
DGII y el sistema dirían cosas distintas del mismo comprobante.

**2 · Un documento firmado no se edita.** El XML firmado *es* el documento:
cambiar un dato invalida la firma y no se nota hasta que la DGII lo rechaza.
`isMutable()` solo devuelve `true` en `draft`, `generated` y `validated`.

## Tres formas de decir que no

| Resultado | Qué es | Qué se hace |
|---|---|---|
| `duplicada` | El mismo estado otra vez | Se ignora. No es un fallo |
| `fuera-de-orden` | Llegó tarde algo que ya no aplica | Se registra en el historial y se ignora |
| `invalida` | Alguien pidió un imposible | **Esto sí lo mira una persona** |

Tratarlas las tres como error llenaría la pantalla de alarmas por cosas
normales —la DGII responde dos veces, la consulta se cruza con el acuse— y
entonces nadie miraría las alarmas.

## Error no es rechazo

- **`error`** es nuestro: se cayó la red, no cargó el certificado. El documento
  no está quemado y vuelve al paso donde falló.
- **`rejected`** es de la DGII y es **terminal**. Lo que corresponde es corregir
  y emitir otro, no reintentar el mismo.

## Anular

Se puede hasta `signed`. Desde `submitted` ya no: el documento está en manos de
la DGII y quien decide es ella.

## Concurrencia

`applyTransition` hace **compara-y-escribe**: el `UPDATE` lleva
`.eq("status", desde)`. Si otro proceso llegó primero, no se actualiza ninguna
fila y se devuelve `ignored: "pisada"` en vez de pisar su resultado.

Es lo que impide que el acuse de la DGII y la consulta por `trackId`, que
pueden llegar a la vez, se sobrescriban.

## Historial

Cada transición escribe en `ecf_document_events`, que es **append-only con un
disparador en la base**: `UPDATE` y `DELETE` fallan aunque los lance la clave de
servicio. Sin el disparador, «append-only» sería una intención escrita en un
comentario.

Un fallo al escribir el evento **no deshace** la transición. Perder una línea de
historial es malo; deshacer un cambio de estado ya escrito y quedarse sin saber
si la DGII lo aceptó, es peor.
