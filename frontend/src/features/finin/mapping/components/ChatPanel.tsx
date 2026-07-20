import { useState, useRef, useEffect } from "react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "error";
  content: string;
}

interface Props {
  jobId: string;
  disabled?: boolean;
  apiBase: string;
}

const WELCOME_MESSAGE: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content:
    "Hi! I can explain how columns were mapped, what the confidence scores mean, suggest alternative source columns, and explain why a column is unmatched. I can't change any mappings myself — use the dropdowns on the left for that.",
};

export default function ChatPanel({ jobId, disabled, apiBase }: Props) {
  const [collapsed, setCollapsed] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (collapsed) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, collapsed]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading || disabled) return;

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", content: text };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const history = nextMessages
        .filter((m) => m.id !== "welcome" && m.role !== "error")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch(`${apiBase}/api/chat/${jobId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.detail || "The assistant couldn't respond. Please try again.");
      }

      const data = await res.json();
      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", content: data.reply || "(No response)" },
      ]);
    } catch (e: any) {
      const msg = e?.message || "Something went wrong. Please try again.";
      setError(msg);
      setMessages((prev) => [...prev, { id: `e-${Date.now()}`, role: "error", content: msg }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (collapsed) {
    return (
      <button className="chat-fab" onClick={() => setCollapsed(false)} title="Open mapping assistant">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="chat-panel chat-panel--floating">
      <div className="chat-panel-header">
        <div className="chat-panel-title">
          <span>Mapping Assistant</span>
          <span className="chat-panel-sub">Read-only · explains, doesn't change mappings</span>
        </div>
        <button className="chat-toggle" onClick={() => setCollapsed(true)} title="Collapse">✕</button>
      </div>
      <div className="chat-messages" ref={scrollRef}>
        {messages.map((m) => (
          <div key={m.id} className={`chat-msg chat-msg--${m.role}`}>
            <div className="chat-bubble">{m.content}</div>
          </div>
        ))}
        {loading && (
          <div className="chat-msg chat-msg--assistant">
            <div className="chat-bubble chat-bubble--loading">
              <span className="chat-typing">
                <span className="chat-dot" /><span className="chat-dot" /><span className="chat-dot" />
              </span>
            </div>
          </div>
        )}
      </div>
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          placeholder={disabled ? "Assistant unavailable" : "Ask about a mapping, a score, or an unmatched column…"}
          value={input}
          disabled={disabled || loading}
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="chat-send-btn" disabled={disabled || loading || !input.trim()} onClick={sendMessage}>
          {loading ? "…" : "Send"}
        </button>
      </div>
      {error && (
        <div className="chat-error-bar">
          <span>{error}</span>
          <button className="chat-retry-btn" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}
    </div>
  );
}