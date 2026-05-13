import { PageHeader } from "@/components/layout/page-header";
import {
  Badge,
  Card,
  CardContent,
} from "@/components/ui";
import { MessageSquare } from "lucide-react";
import {
  mockWhatsappConversations,
  mockWhatsappMessages,
} from "@/lib/mock-data/integrations";
import { formatDateTime, relativeTime } from "@/lib/utils/format";

export default function ConversacionesPage() {
  const active = mockWhatsappConversations[0];
  const messages = mockWhatsappMessages.filter(
    (m) => m.conversationId === active?.id,
  );

  return (
    <>
      <PageHeader
        title="Conversaciones WhatsApp"
        description="Inbox unificado. Conversaciones abiertas, handoff humano y mensajes recientes."
        breadcrumbs={[{ label: "WhatsApp", href: "/whatsapp" }, { label: "Conversaciones" }]}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_2fr] h-[calc(100vh-14rem)]">
        <Card className="overflow-hidden flex flex-col">
          <div className="border-b border-black/5 p-3">
            <input
              placeholder="Buscar conversación…"
              className="h-9 w-full rounded-lg border border-black/10 px-3 text-sm focus:outline-none"
            />
          </div>
          <ul className="flex-1 overflow-y-auto divide-y divide-black/5">
            {mockWhatsappConversations.map((c) => (
              <li
                key={c.id}
                className={`cursor-pointer px-4 py-3 hover:bg-black/[0.02] ${
                  c.id === active?.id ? "bg-[color:var(--brand-primary)]/5" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {c.customerName}
                      </span>
                      {c.status === "handoff" && (
                        <Badge tone="warning" outlined>
                          handoff
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs opacity-70">
                      {c.lastMessagePreview}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] opacity-60">
                      {relativeTime(c.lastMessageAt)}
                    </span>
                    {c.unreadCount > 0 && (
                      <span className="mt-1 rounded-full bg-[color:var(--brand-primary)] px-1.5 text-[10px] font-bold text-white">
                        {c.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex flex-col">
          {active && (
            <>
              <div className="flex items-center justify-between border-b border-black/5 p-4">
                <div>
                  <div className="text-sm font-semibold">{active.customerName}</div>
                  <div className="text-xs opacity-60 font-mono">{active.phone}</div>
                </div>
                <Badge tone={active.status === "handoff" ? "warning" : active.status === "open" ? "info" : "neutral"}>
                  {active.status}
                </Badge>
              </div>
              <CardContent className="flex-1 overflow-y-auto bg-[color:var(--brand-bg)]/50 p-4">
                <div className="space-y-3">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.direction === "outbound" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[70%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                          m.direction === "outbound"
                            ? "rounded-br-sm bg-[color:var(--brand-primary)] text-white"
                            : "rounded-bl-sm bg-white"
                        }`}
                      >
                        <div>{m.body}</div>
                        <div
                          className={`mt-1 text-[10px] ${
                            m.direction === "outbound"
                              ? "text-white/70"
                              : "opacity-50"
                          }`}
                        >
                          {formatDateTime(m.createdAt)}
                          {m.direction === "outbound" && ` · ${m.status}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
              <div className="border-t border-black/5 p-3">
                <div className="flex items-center gap-2">
                  <input
                    placeholder="Mensaje al cliente…"
                    className="h-10 flex-1 rounded-lg border border-black/10 px-3 text-sm focus:border-[color:var(--brand-primary)] focus:outline-none"
                  />
                  <button className="rounded-lg bg-[color:var(--brand-primary)] px-4 py-2 text-sm text-white">
                    Enviar
                  </button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </>
  );
}
