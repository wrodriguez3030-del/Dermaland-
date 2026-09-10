"use client";

import * as React from "react";

/**
 * Vuelve a pedir los datos cuando la pestaña recupera el foco o deja de estar
 * oculta — NO al montar (eso ya lo hace el propio `useEffect` del caller).
 *
 * El caso real que esto cierra (10/09/2026): un cajero abre Cuentas por
 * cobrar, hace una venta a crédito en el POS (otra pestaña, u otra ruta y
 * "Atrás" del navegador con bfcache) y vuelve — la pestaña de Cuentas por
 * cobrar seguía enseñando la lista de ANTES de esa venta, porque el
 * `useEffect` que trae los datos solo corre al montar. Con bfcache el
 * componente ni siquiera se remonta al volver: ningún `useEffect` de montaje
 * vuelve a correr, así que la única señal fiable es "la pestaña volvió a
 * verse", no el ciclo de vida de React.
 */
export function useRefetchOnFocus(callback: () => void): void {
  const callbackRef = React.useRef(callback);
  callbackRef.current = callback;

  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") callbackRef.current();
    };
    const onFocus = () => callbackRef.current();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, []);
}
