"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge, Button, Select } from "@/components/ui";
import { Bot, SendHorizonal, Trash2 } from "lucide-react";
import {
  aiApi,
  useAgents,
  type AgentView,
  type ChatMessage,
} from "@/features/ai/ai-client";
import { ChatMarkdown } from "@/features/ai/chat-markdown";

/**
 * Chat IA estilo WhatsApp: burbujas, entrada abajo, selector de agente.
 * La conversación vive en el navegador (sessionStorage por agente); cada
 * respuesta pasa por el proveedor configurado y queda en Logs y costos.
 */

interface Bubble extends ChatMessage {
  at: string;
  meta?: string; // "320 ms · US$0.0002" en respuestas
  error?: boolean;
}

function storageKey(agentId: string) {
  return `dermaland_ai_chat_${agentId}`;
}

function loadChat(agentId: string): { conversationId: string; bubbles: Bubble[] } {
  if (typeof window === "undefined") return { conversationId: "", bubbles: [] };
  try {
    const raw = sessionStorage.getItem(storageKey(agentId));
    if (raw) return JSON.parse(raw);
  } catch { /* corrupto → empezar de cero */ }
  return {
    conversationId: `chat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    bubbles: [],
  };
}

function saveChat(agentId: string, conversationId: string, bubbles: Bubble[]) {
  try {
    sessionStorage.setItem(storageKey(agentId), JSON.stringify({ conversationId, bubbles }));
  } catch { /* almacenamiento lleno: seguir sin persistir */ }
}

const QUICK_PROMPTS: Record<string, string[]> = {
  agent_concierge: [
    "¿Qué protector solar me recomiendas para piel grasa?",
    "¿Tienen crema para manchas?",
    "¿Cuál es el precio del Heliocare 360?",
  ],
  agent_inventory_assistant: [
    "¿Qué productos están por vencer este mes?",
    "¿Cuáles productos están bajo stock?",
    "Resume el estado del inventario",
  ],
};

function hora(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("es-DO", { hour: "2-digit", minute: "2-digit" });
}

function ChatContent() {
  const params = useSearchParams();
  const { agents, loading } = useAgents();
  const [agentId, setAgentId] = React.useState<string>("");
  const [bubbles, setBubbles] = React.useState<Bubble[]>([]);
  const [conversationId, setConversationId] = React.useState("");
  const [text, setText] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Selección inicial: ?agent= o el primero disponible.
  React.useEffect(() => {
    if (agentId || agents.length === 0) return;
    const fromUrl = params.get("agent");
    setAgentId(fromUrl && agents.some((a) => a.id === fromUrl) ? fromUrl : agents[0]!.id);
  }, [agents, agentId, params]);

  // Cargar conversación del agente activo.
  React.useEffect(() => {
    if (!agentId) return;
    const { conversationId, bubbles } = loadChat(agentId);
    setConversationId(conversationId);
    setBubbles(bubbles);
  }, [agentId]);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [bubbles, sending]);

  const agent: AgentView | undefined = agents.find((a) => a.id === agentId);
  const configured = !!agent?.binding?.providerId;
  const paused = agent?.binding?.status === "paused";

  const send = async (raw?: string) => {
    const content = (raw ?? text).trim();
    if (!content || sending || !agentId) return;
    const mine: Bubble = { role: "user", content, at: new Date().toISOString() };
    const next = [...bubbles, mine];
    setBubbles(next);
    saveChat(agentId, conversationId, next);
    setText("");
    setSending(true);
    try {
      const history: ChatMessage[] = next
        .filter((b) => !b.error)
        .map(({ role, content }) => ({ role, content }));
      const r = await aiApi.chat(agentId, history, conversationId);
      const reply: Bubble = {
        role: "assistant",
        content: r.text || "(sin respuesta)",
        at: new Date().toISOString(),
        meta: `${r.latencyMs} ms${r.estimatedCostUsd != null ? ` · US$${r.estimatedCostUsd.toFixed(4)}` : ""}${r.usedFallback ? " · fallback" : ""}`,
      };
      const done = [...next, reply];
      setBubbles(done);
      saveChat(agentId, conversationId, done);
    } catch (e) {
      const err: Bubble = {
        role: "assistant",
        content: e instanceof Error ? e.message : "No se pudo obtener respuesta.",
        at: new Date().toISOString(),
        error: true,
      };
      const done = [...next, err];
      setBubbles(done);
      saveChat(agentId, conversationId, done);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const clear = () => {
    if (!agentId) return;
    sessionStorage.removeItem(storageKey(agentId));
    const fresh = loadChat(agentId);
    setConversationId(fresh.conversationId);
    setBubbles([]);
  };

  return (
    <div className="flex h-[calc(100dvh-7.5rem)] flex-col overflow-hidden rounded-xl border border-black/10 bg-white">
      {/* Encabezado tipo WhatsApp */}
      <div className="flex items-center gap-3 border-b border-black/5 bg-[color:var(--brand-primary)]/5 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--brand-primary)] text-white">
          <Bot className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <Select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="max-w-xs font-medium"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
          <div className="mt-0.5 text-xs opacity-60">
            {loading ? "Cargando…"
              : !configured ? "Configuración pendiente — asigna un proveedor en Agentes IA"
              : paused ? "Agente pausado"
              : "En línea · responde con IA"}
          </div>
        </div>
        {!loading && (configured && !paused
          ? <Badge tone="success">Activo</Badge>
          : <Badge tone="warning">{paused ? "Pausado" : "Pendiente"}</Badge>)}
        <Button size="sm" variant="outline" onClick={clear} aria-label="Vaciar chat">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Mensajes */}
      <div className="flex-1 space-y-2 overflow-y-auto bg-[color:var(--brand-bg)] px-4 py-4">
        {bubbles.length === 0 && (
          <div className="mx-auto mt-8 max-w-md text-center">
            <p className="text-sm opacity-60">
              {configured
                ? "Escribe tu pregunta abajo, como en WhatsApp. Sugerencias:"
                : <>Primero asigna un proveedor al agente en{" "}
                    <Link href="/ia" className="underline">Agentes IA</Link>.</>}
            </p>
            {configured && (
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {(QUICK_PROMPTS[agentId] ?? []).map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void send(q)}
                    className="rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs hover:bg-black/5"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {bubbles.map((b, i) => (
          <div key={i} className={`flex ${b.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
                b.role === "user"
                  ? "rounded-br-sm bg-[color:var(--brand-primary)] text-white"
                  : b.error
                    ? "rounded-bl-sm border border-rose-200 bg-rose-50 text-rose-900"
                    : "rounded-bl-sm border border-black/5 bg-white"
              }`}
            >
              {b.role === "assistant" && !b.error ? (
                <ChatMarkdown content={b.content} />
              ) : (
                <div className="whitespace-pre-wrap break-words">{b.content}</div>
              )}
              <div className={`mt-1 text-right text-[10px] ${b.role === "user" ? "text-white/70" : "opacity-40"}`}>
                {hora(b.at)}{b.meta ? ` · ${b.meta}` : ""}
              </div>
            </div>
          </div>
        ))}
        {sending && (
          <div className="flex justify-start">
            <div className="rounded-2xl rounded-bl-sm border border-black/5 bg-white px-4 py-2.5 shadow-sm">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/30 [animation-delay:0ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/30 [animation-delay:150ms]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-black/30 [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Barra de entrada */}
      <form
        className="flex items-center gap-2 border-t border-black/5 bg-white px-3 py-2.5"
        onSubmit={(e) => { e.preventDefault(); void send(); }}
      >
        <input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={configured ? "Escribe un mensaje…" : "Configura el agente para chatear"}
          disabled={!configured || paused || sending}
          className="h-10 flex-1 rounded-full border border-black/10 bg-[color:var(--brand-bg)] px-4 text-sm outline-none focus:border-[color:var(--brand-accent)]"
        />
        <button
          type="submit"
          disabled={!configured || paused || sending || !text.trim()}
          aria-label="Enviar"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-primary)] text-white disabled:opacity-40"
        >
          <SendHorizonal className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

export default function ChatIAPage() {
  return (
    <React.Suspense fallback={<div className="p-6 text-sm opacity-60">Cargando chat…</div>}>
      <ChatContent />
    </React.Suspense>
  );
}
