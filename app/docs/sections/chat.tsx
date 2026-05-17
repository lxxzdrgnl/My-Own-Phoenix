"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Callout } from "../code-block";

/** Scaled-down markdown components for the docs preview (smaller text) */
const miniMarkdownComponents = {
  p: ({ className, ...props }: any) => (
    <p className={cn("mt-2 mb-2 text-xs leading-5 first:mt-0 last:mb-0", className)} {...props} />
  ),
  strong: ({ className, ...props }: any) => (
    <strong className={cn("font-semibold", className)} {...props} />
  ),
  ul: ({ className, ...props }: any) => (
    <ul className={cn("my-2 ml-4 list-disc [&>li]:mt-1", className)} {...props} />
  ),
  ol: ({ className, ...props }: any) => (
    <ol className={cn("my-2 ml-4 list-decimal [&>li]:mt-1", className)} {...props} />
  ),
  li: ({ className, ...props }: any) => (
    <li className={cn("text-xs leading-5", className)} {...props} />
  ),
  h1: ({ className, ...props }: any) => (
    <h1 className={cn("mb-2 font-bold text-sm", className)} {...props} />
  ),
  h2: ({ className, ...props }: any) => (
    <h2 className={cn("mt-3 mb-1 font-semibold text-sm", className)} {...props} />
  ),
  h3: ({ className, ...props }: any) => (
    <h3 className={cn("mt-2 mb-1 font-semibold text-xs", className)} {...props} />
  ),
  code: ({ className, ...props }: any) => (
    <code className={cn("rounded border bg-muted px-1 text-[10px] font-semibold", className)} {...props} />
  ),
  blockquote: ({ className, ...props }: any) => (
    <blockquote className={cn("border-l-2 pl-3 italic text-xs text-muted-foreground", className)} {...props} />
  ),
};

const MOCK_MESSAGES = [
  {
    role: "user" as const,
    content: "What are the penalties for copyright infringement in Korea?",
  },
  {
    role: "assistant" as const,
    content:
      "Under Korean Copyright Act Article 136, criminal penalties for copyright infringement include:\n\n1. **Imprisonment** for up to 5 years\n2. **Fines** up to 50 million won\n3. Both penalties can be imposed simultaneously\n\nFor commercial-scale infringement, penalties are more severe under Article 136(2), with imprisonment up to 5 years or fines up to 50 million won.\n\nCivil remedies include damages, injunctions, and seizure of infringing materials.",
  },
  {
    role: "user" as const,
    content: "Does fair use apply to educational materials?",
  },
  {
    role: "assistant" as const,
    content:
      'Yes, Korean copyright law provides fair use provisions for educational purposes under Article 25 and the general fair use clause in Article 35-5.\n\n**Article 25 (Education):**\n- Schools and educational institutions may reproduce published works for classroom use\n- Must be within the scope necessary for education\n- Proper attribution required\n\n**Article 35-5 (General fair use):**\n- Considers purpose, nature, amount used, and market impact\n- Educational use is a favorable factor but not automatic\n\n**Limitations:**\n- Cannot reproduce entire textbooks\n- Online distribution requires compensation through a collecting society',
  },
];

function ChatPreview() {
  const [inputValue, setInputValue] = useState("");

  return (
    <div className="flex flex-col rounded-xl border overflow-hidden bg-background" style={{ height: 520 }}>
      {/* Chat header */}
      <div className="shrink-0 border-b px-4 py-2.5 flex items-center gap-2">
        <div className="h-2 w-2 rounded-full bg-[#10b981]" />
        <span className="text-xs font-semibold">legal-rag-agent</span>
        <span className="text-[10px] text-muted-foreground">online</span>
        <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
          gpt-4o
        </span>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-2">
        <div className="mx-auto w-full max-w-lg flex flex-col gap-3">
          {MOCK_MESSAGES.map((msg, i) =>
            msg.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl bg-muted px-4 py-2.5 text-foreground text-xs">
                  {msg.content}
                </div>
              </div>
            ) : (
              <div key={i} className="max-w-[90%]">
                <div className="rounded-2xl bg-accent/40 px-4 py-3 text-foreground text-xs leading-relaxed">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={miniMarkdownComponents}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            ),
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t px-4 py-3">
        <div className="mx-auto max-w-lg flex w-full flex-col rounded-2xl border border-input bg-background px-1 pt-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Send a message..."
            className="mb-1 w-full resize-none bg-transparent px-4 pt-1 pb-2 text-xs outline-none placeholder:text-muted-foreground"
            readOnly
          />
          <div className="relative mx-2 mb-2 flex items-center justify-end">
            <button
              className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background"
              aria-label="Send message"
            >
              <ArrowUpIcon className="size-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Chat() {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground mb-3">
        Features
      </p>
      <h1 className="text-2xl font-bold tracking-tight mb-2">Chat</h1>
      <p className="text-sm text-muted-foreground mb-10">
        Chat with your agent directly in the browser. Messages are relayed to
        your local agent via the Connector — no deployment required.
      </p>

      <div className="space-y-10">
        {/* Preview */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Chat interface</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Real-time conversation with your connected agent.
          </p>
          <ChatPreview />
        </div>

        {/* Features */}
        <div>
          <h3 className="text-sm font-semibold mb-3">Features</h3>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {[
              "Real-time streaming responses via WebSocket relay",
              "Automatic online/offline agent status detection",
              "Thread management — create new conversations or continue existing ones",
              "Model selector for agents with multiple model support",
              "All conversations are traced and appear in your project traces",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-foreground/20" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        <Callout title="Connector required">
          Chat requires a connected agent via the Connector. See{" "}
          <strong>Connector Setup</strong> to get started.
          All chat messages are automatically traced — you can view them
          in the project&apos;s trace viewer with full span details.
        </Callout>
      </div>
    </div>
  );
}
