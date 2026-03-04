import { useState, useEffect, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";

const API_URL = "/api/v1/ai-insights/query";

const WELCOME_MSG = {
  role: "assistant",
  content:
    "Hello! I have access to this investment's financial statements, computed ratios, and valuation history. " +
    "Ask me anything — for example:\n\n" +
    "- *How is the gross margin trending?*\n" +
    "- *What is the current burn rate and runway?*\n" +
    "- *Summarize the balance sheet health.*",
};

const WELCOME_MSG_ALL = {
  role: "assistant",
  content:
    "Hello! I have access to financial data across the entire portfolio. " +
    "You can ask cross-portfolio questions like:\n\n" +
    "- *Which investment has the highest revenue growth?*\n" +
    "- *Compare the net margins across all companies.*\n" +
    "- *Which investment has the weakest balance sheet?*",
};

function Message({ msg, isStreaming }) {
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-2 text-sm">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] bg-white rounded-2xl rounded-tl-sm shadow px-4 py-3 text-sm text-gray-800">
        {isStreaming ? (
          <span className="whitespace-pre-wrap">{msg.content}</span>
        ) : (
          <ReactMarkdown
            rehypePlugins={[rehypeSanitize]}
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
              li: ({ children }) => <li className="mb-0.5">{children}</li>,
              strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
              code: ({ inline, children }) =>
                inline ? (
                  <code className="bg-gray-100 text-purple-700 px-1 rounded text-xs font-mono">
                    {children}
                  </code>
                ) : (
                  <pre className="bg-gray-100 rounded p-2 overflow-x-auto text-xs font-mono mt-1 mb-2">
                    <code>{children}</code>
                  </pre>
                ),
              h1: ({ children }) => <h1 className="text-base font-bold mb-1">{children}</h1>,
              h2: ({ children }) => <h2 className="text-sm font-bold mb-1">{children}</h2>,
              h3: ({ children }) => <h3 className="text-sm font-semibold mb-1">{children}</h3>,
            }}
          >
            {msg.content}
          </ReactMarkdown>
        )}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse rounded-sm" />
        )}
      </div>
    </div>
  );
}

export default function AIInsightsPanel({ investmentId, investmentName }) {
  const [scope, setScope] = useState("investment");
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState("");
  const scrollRef = useRef(null);
  const textareaRef = useRef(null);

  // Reset conversation when scope changes
  useEffect(() => {
    setMessages(scope === "all" ? [WELCOME_MSG_ALL] : [WELCOME_MSG]);
    setError("");
  }, [scope]);

  // Auto-scroll to bottom on new content
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const sendMessage = useCallback(async () => {
    const question = input.trim();
    if (!question || loading) return;

    const userMsg = { role: "user", content: question };
    // history = everything except welcome message that has context injected
    const history = messages.slice(1); // strip the welcome placeholder
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setStreamingContent("");
    setError("");

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          investment_id: scope === "investment" ? investmentId : null,
          scope,
          history,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail || `Server error (${res.status})`);
      }

      // Read SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // keep incomplete line in buffer

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6);
          if (payload === "[DONE]") {
            // Finalize
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: accumulated },
            ]);
            setStreamingContent("");
            setLoading(false);
            return;
          }
          try {
            const parsed = JSON.parse(payload);
            if (parsed.error) {
              throw new Error(parsed.error);
            }
            if (parsed.text) {
              accumulated += parsed.text;
              setStreamingContent(accumulated);
            }
          } catch {
            // skip malformed lines
          }
        }
      }

      // Stream ended without [DONE] — save what we have
      if (accumulated) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: accumulated },
        ]);
      }
      setStreamingContent("");
    } catch (e) {
      setError(e.message);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Sorry, an error occurred: ${e.message}` },
      ]);
      setStreamingContent("");
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, scope, investmentId]);

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }

  // Auto-resize textarea
  function handleInput(e) {
    setInput(e.target.value);
    e.target.style.height = "auto";
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  }

  const displayMessages = loading && streamingContent
    ? [...messages, { role: "assistant", content: streamingContent }]
    : messages;

  return (
    <div className="flex flex-col" style={{ height: "600px" }}>
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-200 mb-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-800">
            AI Insights
          </h3>
          <p className="text-xs text-gray-400">
            {scope === "investment" ? investmentName : "All investments"}
          </p>
        </div>

        {/* Scope toggle */}
        <div className="flex items-center bg-gray-100 rounded-full p-0.5 text-xs font-medium">
          <button
            onClick={() => setScope("investment")}
            className={`px-3 py-1 rounded-full transition ${
              scope === "investment"
                ? "bg-white shadow text-gray-800"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            This Investment
          </button>
          <button
            onClick={() => setScope("all")}
            className={`px-3 py-1 rounded-full transition ${
              scope === "all"
                ? "bg-white shadow text-gray-800"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            All Investments
          </button>
        </div>
      </div>

      {/* Message list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 pr-1"
      >
        {displayMessages.map((msg, i) => (
          <Message
            key={i}
            msg={msg}
            isStreaming={loading && i === displayMessages.length - 1 && msg.role === "assistant"}
          />
        ))}
      </div>

      {error && (
        <p className="text-xs text-red-500 px-1 pt-1">{error}</p>
      )}

      {/* Input bar */}
      <div className="pt-3 border-t border-gray-200 flex gap-2 items-end mt-3">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          disabled={loading}
          placeholder="Ask a question about this investment... (Enter to send, Shift+Enter for newline)"
          rows={1}
          className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 overflow-hidden"
          style={{ minHeight: "38px", maxHeight: "120px" }}
        />
        <button
          onClick={sendMessage}
          disabled={loading || !input.trim()}
          className="shrink-0 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2 rounded-xl transition"
        >
          {loading ? (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Stop
            </span>
          ) : (
            "Send"
          )}
        </button>
      </div>
    </div>
  );
}
