import click
import asyncio
from .client import run_connector


@click.command()
@click.option("--key", required=True, help="Connector key (pc_*)")
@click.option("--agent", required=True, help="Local agent URL (e.g. http://localhost:2024)")
@click.option("--project", required=True, help="Project slug")
@click.option("--type", "agent_type", default="langgraph", help="Agent type: langgraph or rest")
@click.option("--assistant-id", default="agent", help="LangGraph assistant ID")
@click.option("--saas-url", default="wss://phoenix.rheon.kr", help="SaaS WebSocket URL")
def main(key, agent, project, agent_type, assistant_id, saas_url):
    """Connect your local agent to My Own Phoenix SaaS."""
    click.echo(f"Phoenix Connector v0.1.0")
    click.echo(f"Agent: {agent} ({agent_type})")
    click.echo(f"Project: {project}")
    click.echo(f"SaaS: {saas_url}")
    click.echo("")
    asyncio.run(run_connector(key, agent, project, agent_type, assistant_id, saas_url))


if __name__ == "__main__":
    main()
