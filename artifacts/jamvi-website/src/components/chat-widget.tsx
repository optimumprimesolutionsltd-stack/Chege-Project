import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { WhatsAppIcon, whatsAppLink } from "./whatsapp-button";
import { JAMVI_APP_PATH } from "@/lib/site-links";

/**
 * The assistant, and WhatsApp, offered together in the corner of every page.
 *
 * Both channels, because they answer different preferences and neither
 * substitutes for the other: the panel answers immediately but only while the
 * tab is open, and WhatsApp survives the visitor closing the laptop and keeps
 * the thread on their phone. One tab opens the panel; WhatsApp is the first
 * thing inside it.
 *
 * `product: "jamvi"` tells the shared assistant which brand it is speaking for.
 * Without it the service would have to infer that from the visitor's wording,
 * and somebody opening the chat here to ask "how much is it?" would be
 * answered about a different product entirely.
 */
const CHAT_ENDPOINT =
  import.meta.env.VITE_CHAT_ENDPOINT || "https://optimum-prime-lead-notifier.onrender.com/chat";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Habari 👋 I'm the Jamvi assistant. Ask me anything about budgeting, running a chama, or what it costs.",
};

export function ChatWidget() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view as the conversation grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, sending]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;

    // The greeting is ours, not part of the conversation — sending it back
    // would have the assistant answering itself.
    const history = [...messages.slice(1), { role: "user" as const, content: text }];
    setMessages((m) => [...m, { role: "user", content: text }]);
    setDraft("");
    setSending(true);
    setFailed(false);

    try {
      const res = await fetch(CHAT_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, product: "jamvi" }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { reply?: string };
      setMessages((m) => [
        ...m,
        { role: "assistant", content: data.reply || "Sorry — I didn't catch that. Could you say it another way?" },
      ]);
    } catch {
      // Never leave the question looking swallowed. WhatsApp does not depend
      // on this service being up.
      setFailed(true);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "Sorry — I can't reach my brain right now. Message us on WhatsApp instead and a person will pick it up.",
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      {open && (
        <div
          className="fixed bottom-20 right-4 sm:right-6 z-50 w-[calc(100vw-2rem)] sm:w-96 max-w-[24rem] rounded-[4px] border-2 border-foreground bg-background flex flex-col overflow-hidden"
          style={{ height: "min(30rem, calc(100vh - 8rem))", boxShadow: "6px 6px 0 hsl(var(--jade))" }}
          role="dialog"
          aria-label="Chat with Jamvi"
        >
          <div className="flex items-center justify-between gap-3 px-4 py-3 bg-primary text-primary-foreground shrink-0">
            <div className="min-w-0">
              <p className="font-serif font-bold truncate">Ask Jamvi</p>
              <p className="text-xs opacity-80">Answers straight away</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="p-1 rounded-sm hover:bg-black/15 transition-colors shrink-0"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* WhatsApp is offered up front, not only on failure: it survives
              the visitor closing the tab and keeps the thread on their phone. */}
          <a
            href={whatsAppLink(location)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 text-sm font-bold bg-accent text-accent-foreground shrink-0 hover:underline"
          >
            <WhatsAppIcon className="h-4 w-4" />
            Prefer WhatsApp? A person replies there.
          </a>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className={
                    "max-w-[85%] px-3.5 py-2 text-sm whitespace-pre-wrap " +
                    (m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-[12px_12px_2px_12px]"
                      : "bg-muted text-foreground rounded-[12px_12px_12px_2px]")
                  }
                >
                  {m.content}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-[12px_12px_12px_2px] px-3.5 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>

          {failed && (
            <a
              href={whatsAppLink(location)}
              target="_blank"
              rel="noopener noreferrer"
              className="mx-4 mb-2 inline-flex items-center justify-center gap-2 rounded-[3px] bg-[#25D366] px-4 py-2 text-sm font-bold text-white shrink-0"
            >
              <WhatsAppIcon className="h-4 w-4" />
              Continue on WhatsApp
            </a>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); void send(); }}
            className="flex items-center gap-2 border-t-2 border-foreground/10 p-3 shrink-0"
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type a message…"
              aria-label="Your message"
              className="flex-1 min-w-0 h-10 px-3 rounded-[3px] border-2 border-input bg-card text-sm outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={!draft.trim() || sending}
              aria-label="Send message"
              className="h-10 w-10 shrink-0 rounded-[3px] bg-primary text-primary-foreground grid place-items-center disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>

          <a
            href={JAMVI_APP_PATH}
            className="border-t-2 border-foreground/10 px-4 py-2.5 text-center text-sm font-bold text-primary hover:underline shrink-0"
          >
            Start free for 14 days
          </a>
        </div>
      )}

      {/* One tab in the corner, not a pair of floating circles. WhatsApp
          lives inside the panel, one tap away. */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close chat" : "Ask Jamvi a question"}
        aria-expanded={open}
        style={{ boxShadow: "3px 3px 0 hsl(var(--jade))" }}
        className="btn-mat fixed !bg-accent !text-accent-foreground bottom-5 right-4 sm:right-6 z-40 h-11 px-4 text-sm"
      >
        {open ? <X className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />}
        {open ? "Close" : "Maswali? Ask us"}
      </button>
    </>
  );
}
