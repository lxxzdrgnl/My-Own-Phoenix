import json
import httpx


async def forward_to_agent(req, agent_url, agent_type, assistant_id):
    """Forward chat request to local agent, yield response chunks."""
    messages = req.get("messages", [])

    if agent_type == "langgraph":
        async for chunk in forward_langgraph(agent_url, messages, assistant_id, req.get("threadId")):
            yield chunk
    else:
        async for chunk in forward_rest(agent_url, messages, req.get("threadId")):
            yield chunk


async def forward_langgraph(agent_url, messages, assistant_id, thread_id):
    """Forward via LangGraph SDK HTTP API."""
    async with httpx.AsyncClient(timeout=120) as client:
        # Create thread if needed
        if not thread_id or thread_id.startswith("rest-"):
            r = await client.post(f"{agent_url}/threads", json={})
            r.raise_for_status()
            thread_id = r.json()["thread_id"]

        # Stream run
        async with client.stream(
            "POST",
            f"{agent_url}/threads/{thread_id}/runs/stream",
            json={
                "assistant_id": assistant_id,
                "input": {"messages": messages},
                "stream_mode": ["messages"],
            },
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                raw = line[6:].strip()
                if not raw or raw == "[DONE]":
                    continue
                try:
                    parsed = json.loads(raw)
                    yield {
                        "event": parsed.get("event", "messages/partial"),
                        "data": parsed.get("data", parsed),
                    }
                except json.JSONDecodeError:
                    pass


async def forward_rest(agent_url, messages, thread_id):
    """Forward via REST SSE endpoint."""
    async with httpx.AsyncClient(timeout=120) as client:
        full_content = ""
        got_complete = False
        async with client.stream(
            "POST",
            f"{agent_url}/chat",
            json={"messages": messages, "thread_id": thread_id},
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.startswith("data: "):
                    continue
                raw = line[6:].strip()
                if not raw or raw == "[DONE]":
                    continue
                try:
                    parsed = json.loads(raw)
                    if not isinstance(parsed, dict):
                        continue
                    # If already in LangGraph format, pass through and track content
                    if "event" in parsed:
                        yield parsed
                        # Track content for messages/complete
                        if parsed.get("event") == "messages/partial" and isinstance(parsed.get("data"), list):
                            last = parsed["data"][-1] if parsed["data"] else None
                            if last and isinstance(last, dict) and last.get("content"):
                                full_content = last["content"]
                        if parsed.get("event") == "messages/complete":
                            got_complete = True
                        continue
                    chunk = parsed.get("content", "") or parsed.get("delta", "") or ""
                    if chunk:
                        full_content += chunk
                        yield {
                            "event": "messages/partial",
                            "data": [{"type": "ai", "content": full_content}],
                        }
                except json.JSONDecodeError:
                    if raw:
                        full_content += raw
                        yield {
                            "event": "messages/partial",
                            "data": [{"type": "ai", "content": full_content}],
                        }

        if full_content and not got_complete:
            yield {
                "event": "messages/complete",
                "data": [{"type": "ai", "content": full_content}],
            }
