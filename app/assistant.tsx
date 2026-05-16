"use client";
import { apiFetch } from "@/lib/api-client";

import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { PanelLeftClose, PanelLeft, X, Plus, LogOut } from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Thread } from "@/components/assistant-ui/thread";

import { useAuth } from "@/lib/auth-context";
import { ProjectSelector } from "@/components/project-selector";
import { Sidebar, SidebarItemDiv } from "@/components/ui/sidebar";


interface DbThread {
  id: string;
  title: string;
  langGraphThreadId: string;
  createdAt: string;
}

interface HistoryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  feedbackValue?: "up" | "down" | null;
}

interface AssistantProps {
  project?: string;
  projects?: { id: string; name: string }[];
  onProjectChange?: (project: string) => void;
  onProjectAdd?: (name: string) => void;
  relayUserId?: string | null;
  relayProjectId?: string | null;
}

export function Assistant({ project = "default", projects = [], onProjectChange, onProjectAdd, relayUserId, relayProjectId }: AssistantProps) {
  const { user } = useAuth();
  const threadIdRef = useRef<string | null>(null);
  const activeDbIdRef = useRef<string | null>(null);
  const relayUserIdRef = useRef(relayUserId);
  const relayProjectIdRef = useRef(relayProjectId);
  relayUserIdRef.current = relayUserId;
  relayProjectIdRef.current = relayProjectId;

  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem("sidebar_open");
    return saved !== null ? saved === "true" : true;
  });
  const [threads, setThreads] = useState<DbThread[]>([]);
  const [activeThreadDbId, setActiveThreadDbId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryMessage[]>([]);
  const historySentRef = useRef(false);
  const [runtimeKey, setRuntimeKey] = useState(0);
  const [isFadingOut, setIsFadingOut] = useState(false);

  // Keep ref in sync with state
  useEffect(() => {
    activeDbIdRef.current = activeThreadDbId;
  }, [activeThreadDbId]);

  const refreshThreads = useCallback(async () => {
    if (!user) return;
    try {
      const res = await apiFetch(`/api/user-threads?project=${encodeURIComponent(project)}`);
      if (res.ok) {
        const data = await res.json();
        setThreads(data.threads ?? []);
      }
    } catch (e) { console.error(e); }
  }, [user, project]);

  useEffect(() => {
    if (user) {
      refreshThreads();
    } else {
      setThreads([]);
    }
  }, [user, refreshThreads]);


  // Reset chat state when project changes
  const prevProjectRef = useRef(project);
  if (prevProjectRef.current !== project) {
    prevProjectRef.current = project;
    threadIdRef.current = null;
    activeDbIdRef.current = null;
  }

  // Save a message to Prisma
  const saveMessage = useCallback(async (threadDbId: string, role: string, content: string) => {
    try {
      await apiFetch(`/api/user-threads/${threadDbId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, content }),
      });
    } catch (e) { console.error(e); }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chatAdapter: ChatModelAdapter = useMemo(() => ({
    async *run({ messages, abortSignal }) {

      if (!user) {
        yield { content: [{ type: "text" as const, text: "Please sign in to use the chat." }] };
        return;
      }

      // Create thread on first message
      if (!threadIdRef.current) {
        threadIdRef.current = `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const lastMsg = messages[messages.length - 1];
        const title = (typeof lastMsg?.content === "string" ? lastMsg.content : "New Chat").slice(0, 30);
        try {
          const res = await apiFetch("/api/user-threads", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ langGraphThreadId: threadIdRef.current, title, project }),
          });
          const data = await res.json();
          if (data.thread?.id) {
            activeDbIdRef.current = data.thread.id;
            setActiveThreadDbId(data.thread.id);
            setThreads((prev) => [data.thread, ...prev]);
          }
        } catch (e) { console.error(e); }
      }

      // Save user message
      const lastMsg = messages[messages.length - 1];
      const userText = typeof lastMsg?.content === "string" ? lastMsg.content : "";
      if (activeDbIdRef.current && userText) saveMessage(activeDbIdRef.current, "user", userText);

      // Build message list with history
      const historyMsgs = historySentRef.current ? [] : history.map((m) => ({ role: m.role, content: m.content }));
      // Extract text from ContentPart[] or string
      const getTextContent = (content: any): string => {
        if (typeof content === "string") return content;
        if (Array.isArray(content)) {
          return content
            .filter((p: any) => p.type === "text")
            .map((p: any) => p.text)
            .join(" ");
        }
        return "";
      };
      const allMsgs = [
        ...historyMsgs,
        ...messages.slice(-1).map((m) => ({ role: "user" as const, content: getTextContent(m.content) })),
      ];
      historySentRef.current = true;

      // Send via relay
      if (!relayUserIdRef.current || !relayProjectIdRef.current) {
        yield { content: [{ type: "text" as const, text: "No agent connected. Connect an agent in Project Settings." }] };
        return;
      }

      const relayRes = await apiFetch("/api/chat-relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: relayProjectIdRef.current,
          targetUserId: relayUserIdRef.current,
          messages: allMsgs,
          threadId: threadIdRef.current,
        }),
        signal: abortSignal,
      });

      if (!relayRes.ok) {
        const err = await relayRes.json().catch(() => ({ error: "Agent not connected" }));
        yield { content: [{ type: "text" as const, text: `Error: ${err.error || err.message || "Failed"}` }] };
        return;
      }

      // Stream SSE response
      const reader = relayRes.body?.getReader();
      if (!reader) return;
      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          try {
            const parsed = JSON.parse(raw);
            if (parsed.event === "messages/partial" && Array.isArray(parsed.data)) {
              const last = parsed.data[parsed.data.length - 1];
              if (last?.content) {
                fullContent = typeof last.content === "string" ? last.content : JSON.stringify(last.content);
                yield { content: [{ type: "text" as const, text: fullContent }] };
              }
            }
          } catch { /* skip malformed JSON line */ }
        }
      }

      // Save assistant response
      if (activeDbIdRef.current && fullContent) {
        saveMessage(activeDbIdRef.current, "assistant", fullContent);
      }
    },
  }), []);

  const initialMessages = useMemo(() =>
    history.map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runtimeKey]
  );

  const runtime = useLocalRuntime(chatAdapter, { initialMessages });

  const handleSelectThread = useCallback(async (thread: DbThread) => {
    setIsFadingOut(true);

    // fade-out 애니메이션과 메시지 로딩을 병렬 처리
    const messagesPromise = apiFetch(`/api/user-threads/${thread.id}/messages`)
      .then((res) => (res.ok ? res.json() : { messages: [] }))
      .catch(() => ({ messages: [] }));

    const [data] = await Promise.all([
      messagesPromise,
      new Promise((resolve) => setTimeout(resolve, 150)),
    ]);

    const loadedMessages = (data.messages ?? []).map((m: any) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: m.content,
      feedbackValue: m.feedbackValue ?? null,
    }));

    threadIdRef.current = thread.langGraphThreadId;
    setActiveThreadDbId(thread.id);
    setHistory(loadedMessages);
    historySentRef.current = false;
    setRuntimeKey((k) => k + 1);
    setIsFadingOut(false);
  }, []);

  const handleNewChat = useCallback(() => {
    setIsFadingOut(true);
    setTimeout(() => {
      threadIdRef.current = null;
      setActiveThreadDbId(null);
      setHistory([]);
      historySentRef.current = false;
      setRuntimeKey((k) => k + 1);
      setIsFadingOut(false);
    }, 150);
  }, []);

  const handleDeleteThread = useCallback(
    async (id: string) => {
      try {
        await apiFetch(`/api/user-threads/${id}`, { method: "DELETE" });
        setThreads((prev) => prev.filter((t) => t.id !== id));
        if (activeThreadDbId === id) {
          threadIdRef.current = null;
          setActiveThreadDbId(null);
          setHistory([]);
        }
      } catch (e) { console.error(e); }
    },
    [activeThreadDbId],
  );

  return (
    <AssistantRuntimeProvider key={`${project}-${runtimeKey}`} runtime={runtime}>
      <div className="flex h-full flex-col">
        <div className="flex flex-1 min-h-0">
          {/* Sidebar */}
          {user && sidebarOpen && (
            <Sidebar>
              <div className="flex items-center justify-between px-3 py-2 border-b">
                <span className="text-sm font-semibold">Chat History</span>
                <button
                  onClick={() => { setSidebarOpen(false); localStorage.setItem("sidebar_open", "false"); }}
                  className="rounded p-1 hover:bg-muted transition-colors"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </button>
              </div>
              <div className="px-2 pt-2 flex items-center gap-1">
                {projects.length > 0 && (
                <div className="flex-1">
                  <ProjectSelector
                    project={project}
                    projects={projects}
                    onChange={(name) => onProjectChange?.(name)}
                    onAdd={onProjectAdd}
                    size="sm"
                  />
                </div>
                )}
              </div>
              <div className="px-2 py-2">
                <button
                  onClick={handleNewChat}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  New Chat
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
                {threads.length === 0 && (
                  <p className="px-3 py-2 text-sm text-muted-foreground">
                    No conversations yet.
                  </p>
                )}
                {threads.map((thread) => (
                  <SidebarItemDiv
                    key={thread.id}
                    active={activeThreadDbId === thread.id}
                    className="justify-between"
                    onClick={() => handleSelectThread(thread)}
                  >
                    <span className="truncate flex-1 pr-1">{thread.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteThread(thread.id);
                      }}
                      className="shrink-0 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive transition-all"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </SidebarItemDiv>
                ))}
              </div>

              {/* Logout */}
              <div className="border-t px-2 py-2">
                <button
                  onClick={() => signOut(auth)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                >
                  <LogOut className="h-4 w-4" />
                  Sign out
                </button>
              </div>
            </Sidebar>
          )}

          {user && !sidebarOpen && (
            <div className="shrink-0 border-r p-2">
              <button
                onClick={() => { setSidebarOpen(true); localStorage.setItem("sidebar_open", "true"); }}
                className="rounded-md p-1.5 hover:bg-muted transition-colors"
                title="Show chat history"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Main chat area */}
          <div className="flex-1 min-h-0">
            <Thread showWelcome={history.length === 0} historyMessages={history} isFadingOut={isFadingOut} project={project} />
          </div>
        </div>
      </div>
    </AssistantRuntimeProvider>
  );
}
