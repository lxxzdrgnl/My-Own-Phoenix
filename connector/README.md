# Phoenix Connector

Connect your local AI agents to [My Own Phoenix](https://phoenix.rheon.kr) SaaS.

## Install

```bash
pip install phoenix-connector
```

## Usage

```bash
phoenix-connector \
  --key=pc_your_connector_key \
  --agent=http://localhost:2024 \
  --project=your-project-slug \
  --type=langgraph
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `--key` | Connector key (pc_*) | required |
| `--agent` | Local agent URL | required |
| `--project` | Project slug | required |
| `--type` | Agent type (langgraph/rest) | langgraph |
| `--assistant-id` | LangGraph assistant ID | agent |
| `--saas-url` | SaaS WebSocket URL | wss://phoenix.rheon.kr |

## Get Your Connector Key

1. Go to [phoenix.rheon.kr](https://phoenix.rheon.kr)
2. Sign in → Global Settings → Profile & Key
3. Generate a connector key
