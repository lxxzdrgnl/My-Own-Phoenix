// Shared types for chat-section group components

export interface AgentConfig {
  id: string;
  projectName: string;
  alias: string | null;
  agentType: string;
  endpoint: string;
  assistantId: string;
  templateId: string | null;
  template?: { id: string; name: string; description?: string } | null;
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  agentType: string;
  endpoint: string;
  assistantId: string;
}
