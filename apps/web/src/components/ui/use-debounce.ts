"use client";

import * as React from "react";

/**
 * Retrasa la propagación de un valor que cambia rápido (típicamente un
 * `<input>` de búsqueda) hasta que pasan `delay` ms sin cambios nuevos.
 *
 * El `<input>` sigue controlado por su propio estado (responde al instante,
 * la tecla aparece sin demora); lo que se debounce es SOLO el valor que
 * dispara trabajo caro (filtrar cientos/miles de filas, pedir al servidor).
 * Sin esto, cada tecla vuelve a filtrar la lista completa de inmediato y el
 * navegador no llega a pintar el carácter nuevo hasta terminar — se siente
 * como que el teclado va atrás.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const handler = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debounced;
}
