import json
import asyncio
import websockets
from .forwarder import forward_to_agent


async def run_connector(key, agent_url, project, agent_type, assistant_id, saas_url):
    ws_url = f"{saas_url}/api/ws-relay"
    backoff = 1

    while True:
        try:
            # ping_interval/ping_timeout enable WebSocket-level keepalive so the
            # connector detects a dead server (e.g. dashboard redeploy) and the
            # reconnect loop below fires. Without this the socket can hang as a
            # zombie until the OS TCP keepalive (~2h) trips.
            async with websockets.connect(ws_url, close_timeout=10, ping_interval=20, ping_timeout=20) as ws:
                # Send auth frame
                await ws.send(json.dumps({
                    "type": "auth",
                    "key": key,
                    "project": project,
                    "agentUrl": agent_url,
                    "agentType": agent_type,
                    "assistantId": assistant_id,
                }))

                # Wait for auth response
                auth_raw = await asyncio.wait_for(ws.recv(), timeout=5)
                auth_response = json.loads(auth_raw)

                if auth_response.get("type") != "auth_ok":
                    error = auth_response.get("error", "Unknown error")
                    print(f"✗ Auth failed: {error}")
                    return

                print(f"✓ Connected to SaaS")
                print(f"✓ Project: {auth_response.get('project', project)}")
                print(f"✓ Agent: {agent_url} ({agent_type})")
                print(f"⏳ Waiting for requests...")
                print("")
                backoff = 1  # Reset on successful connection

                # Message loop
                async for raw in ws:
                    msg = json.loads(raw)

                    if msg.get("type") == "ping":
                        await ws.send(json.dumps({"type": "pong"}))
                        continue

                    if msg.get("type") != "chat":
                        continue

                    # Handle chat request in background
                    asyncio.create_task(
                        handle_request(ws, msg, agent_url, agent_type, assistant_id)
                    )

        except websockets.ConnectionClosed as e:
            print(f"⚠ Connection closed: {e}. Reconnecting in {backoff}s...")
        except (ConnectionRefusedError, OSError) as e:
            print(f"⚠ Cannot connect: {e}. Retrying in {backoff}s...")
        except asyncio.TimeoutError:
            print(f"⚠ Auth timeout. Retrying in {backoff}s...")
        except Exception as e:
            print(f"⚠ Unexpected error: {e}. Retrying in {backoff}s...")

        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, 5)


async def handle_request(ws, req, agent_url, agent_type, assistant_id):
    request_id = req.get("requestId", "unknown")
    print(f"→ Request {request_id}: {len(req.get('messages', []))} messages")

    try:
        async for chunk in forward_to_agent(req, agent_url, agent_type, assistant_id):
            await ws.send(json.dumps({"requestId": request_id, **chunk}))

        print(f"✓ Request {request_id} completed")
    except Exception as e:
        print(f"✗ Request {request_id} failed: {e}")
        try:
            await ws.send(json.dumps({
                "requestId": request_id,
                "event": "error",
                "data": {"message": str(e)},
            }))
        except Exception:
            pass
