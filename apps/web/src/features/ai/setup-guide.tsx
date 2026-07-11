"use client";

import * as React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui";
import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { useAiStatus } from "./ai-client";

/**
 * Guía de primeros pasos del módulo IA. Muestra el avance real (1-2-3) y qué
 * falta, en lenguaje no técnico. Se oculta sola cuando todo está listo.
 */
export function AiSetupGuide() {
  const { status, unavailable } = useAiStatus();
  if (unavailable || !status) return null;

  const steps = [
    {
      done: status.providersConnected > 0,
      label: "Conecta un proveedor (OpenAI) y prueba la conexión",
      hint: "Botón «Conectar proveedor» arriba a la derecha.",
    },
    {
      done: status.agentsConfigured > 0,
      label: "Asigna el proveedor y un modelo a cada agente",
      hint: (
        <>En <Link href="/ia" className="underline">Agentes IA</Link>, sección «Proveedor y modelo por agente».</>
      ),
    },
    {
      done: status.agentsConfigured >= status.agentsTotal && status.agentsTotal > 0,
      label: "Prueba cada agente y actívalo",
      hint: "Botón «Probar agente» en cada tarjeta.",
    },
  ];
  const allDone = steps.every((s) => s.done);
  if (allDone && status.encryptionConfigured) return null;

  return (
    <Card className="mb-4 border-[color:var(--brand-accent)]/30">
      <CardContent className="p-4">
        {!status.encryptionConfigured && (
          <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Falta la clave de cifrado del servidor (<code className="font-mono text-xs">AI_CREDENTIALS_ENCRYPTION_KEY</code>).
              Hasta que el administrador del sistema la configure, no se pueden guardar API keys.
            </span>
          </div>
        )}
        <div className="text-sm font-semibold">Primeros pasos</div>
        <ol className="mt-2 space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              {s.done ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <Circle className="mt-0.5 h-4 w-4 shrink-0 opacity-30" />
              )}
              <span className={s.done ? "opacity-60 line-through" : ""}>
                {s.label}
                {!s.done && <span className="block text-xs opacity-60">{s.hint}</span>}
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
