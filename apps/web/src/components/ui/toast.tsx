"use client";

import * as React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type ToastTone = "success" | "error" | "info";

interface ToastState {
  open: boolean;
  message: string;
  tone: ToastTone;
}

interface ToastApi {
  show: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

/**
 * Toast minimalista controlado por hook. Una instancia por componente.
 *
 * Uso:
 *   const toast = useToast();
 *   toast.success("Cliente eliminado correctamente.");
 *   <toast.Toast />  // dentro del JSX
 */
export function useToast(): ToastApi & {
  Toast: React.FC;
} {
  const [state, setState] = React.useState<ToastState>({
    open: false,
    message: "",
    tone: "success",
  });
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = React.useCallback((message: string, tone: ToastTone = "success") => {
    setState({ open: true, message, tone });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState((s) => ({ ...s, open: false })), 2800);
  }, []);

  const Toast: React.FC = () => {
    if (!state.open) return null;
    const Icon = state.tone === "error" ? XCircle : CheckCircle2;
    return (
      <div
        className={cn(
          "fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-2 text-sm shadow-lg",
          state.tone === "success" && "bg-emerald-600 text-white",
          state.tone === "error" && "bg-rose-600 text-white",
          state.tone === "info" && "bg-[color:var(--brand-fg)] text-white",
        )}
      >
        <Icon className="h-4 w-4" />
        {state.message}
      </div>
    );
  };

  return {
    show,
    success: (m) => show(m, "success"),
    error: (m) => show(m, "error"),
    Toast,
  };
}
